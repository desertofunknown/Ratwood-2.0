//! Review-only immutable graph worker; NOT a port of gameplay AStar.
//! All byte budgets are accounted payload/scratch reservations, not OS RSS caps.
pub mod dm_replay;
mod replay_worker;
pub use replay_worker::ReplayJob;
use std::{collections::VecDeque, mem::size_of, panic::{catch_unwind, AssertUnwindSafe}, sync::{Arc, Mutex, MutexGuard, TryLockError, Condvar,
    atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering}}, thread::{self, JoinHandle}, time::Instant};

#[derive(Clone, Copy, Debug)]
pub struct Edge { pub to: u32, pub cost: u32 }

/// CSR directed graph. Node i owns edges[offsets[i]..offsets[i + 1]].
/// Boxed slices transfer ownership and expose no spare Vec capacity.
pub struct Snapshot { pub offsets: Box<[u32]>, pub edges: Box<[Edge]> }

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Identity {
    pub request: u64, pub round: u64, pub requester: u64,
    pub requester_generation: u64, pub scene_revision: u64,
    pub target_revision: u64, pub capability_revision: u64,
}

pub struct Job {
    pub id: Identity, pub graph: Snapshot, pub start: u32, pub goal: u32,
    /// Monotonic worker-host deadline; never a raw DM world.time value.
    pub deadline: Instant,
    pub cancelled: Arc<AtomicBool>,
    /// Owner changes this when superseding a request. Never reuse/wrap generations.
    pub current_generation: Arc<AtomicU64>,
    #[cfg(test)]
    test_gate: Option<Arc<lifecycle_tests::Gate>>,
}

#[derive(Clone, Copy, Debug)]
pub struct Limits {
    /// Includes queued, running AND completed-but-unpolled jobs.
    pub jobs: usize, pub bytes: usize, pub nodes_per_job: usize,
    pub edges_per_job: usize, pub path_nodes: usize, pub work_per_job: usize,
}
impl Default for Limits {
    fn default() -> Self {
        Self { jobs: 8, bytes: 8 * 1024 * 1024, nodes_per_job: 4096,
            edges_per_job: 16384, path_nodes: 256, work_per_job: 20_000_000 }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status { Found, NoPath, Cancelled, Superseded, Expired, WorkLimit,
    PathLimit, CostOverflow, Shutdown, ReplayComplete, ReplayUnsupported }
#[derive(Debug)]
pub struct Answer {
    pub id: Identity, pub status: Status, pub path: Vec<u32>,
    /// Present only for a completed replay; its exact false/null/path or Unsupported
    /// is distinct from Dijkstra NoPath. Interrupted work never exposes a route.
    pub replay: Option<dm_replay::Report>,
}
impl Answer {
    /// Necessary apply-time identity check: all seven fields, never generation alone.
    /// Caller must also check deadline, live entities/revisions, and route validity.
    pub fn matches_identity(&self, expected: &Identity) -> bool { self.id == *expected }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reject { InvalidLimits, InvalidGraph, TooLarge, Busy, Contended, Closed, WorkerFailed, StartFailed }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Access { Contended, Closed, WorkerFailed }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Health { Running = 0, Closed = 1, Failed = 2 }
impl From<Access> for Reject {
    fn from(a: Access) -> Self { match a { Access::Contended => Self::Contended,
        Access::Closed => Self::Closed, Access::WorkerFailed => Self::WorkerFailed } }
}

enum Work { Dijkstra(Job), Replay(ReplayJob) }
struct Envelope { job: Work, charge: usize }
struct State {
    pending: VecDeque<Envelope>, ready: VecDeque<(Answer, usize)>,
    admitted: usize, bytes: usize,
}
struct Shared {
    state: Mutex<State>, wake: Condvar, stopping: AtomicBool, health: AtomicU8,
    #[cfg(test)] fault: AtomicU8,
}
impl Shared {
    fn health(&self) -> Health {
        match self.health.load(Ordering::Acquire) { 0 => Health::Running, 1 => Health::Closed, _ => Health::Failed }
    }
    fn fail(&self) {
        self.health.store(Health::Failed as u8, Ordering::Release);
        self.stopping.store(true, Ordering::Release);
        self.wake.notify_one();
    }
    fn access(&self) -> Result<(), Access> {
        match self.health() { Health::Running => Ok(()), Health::Closed => Err(Access::Closed),
            Health::Failed => Err(Access::WorkerFailed) }
    }
    fn try_state(&self) -> Result<MutexGuard<'_, State>, Access> {
        self.access()?;
        let guard = match self.state.try_lock() {
            Ok(g) => g,
            Err(TryLockError::WouldBlock) => return Err(Access::Contended),
            Err(TryLockError::Poisoned(poison)) => {
                // Signal while holding the recovered wait mutex: no lost wake.
                // Do NOT drop queued payloads on this tick-facing call.
                let _guard = poison.into_inner();
                self.fail();
                return Err(Access::WorkerFailed);
            }
        };
        self.access()?;
        Ok(guard)
    }
}
pub struct Worker { shared: Arc<Shared>, handle: Option<JoinHandle<()>>, limits: Limits }

impl Worker {
    /// Fixed ONE worker. Creation is explicit and must happen off the game tick.
    pub fn new(limits: Limits) -> Result<Self, Reject> {
        if limits.jobs == 0 || limits.jobs > 64 || limits.bytes == 0
            || limits.nodes_per_job == 0 || limits.nodes_per_job > 65536
            || limits.edges_per_job > 262144 || limits.path_nodes == 0
            || limits.path_nodes > limits.nodes_per_job || limits.work_per_job == 0 {
            return Err(Reject::InvalidLimits);
        }
        let shared = Arc::new(Shared {
            state: Mutex::new(State { pending: VecDeque::with_capacity(limits.jobs),
                ready: VecDeque::with_capacity(limits.jobs), admitted: 0, bytes: 0 }),
            wake: Condvar::new(), stopping: AtomicBool::new(false),
            health: AtomicU8::new(Health::Running as u8),
            #[cfg(test)] fault: AtomicU8::new(0),
        });
        let worker_shared = shared.clone();
        let handle = thread::Builder::new().name("path-prototype".into()).spawn(move || {
            let outcome = catch_unwind(AssertUnwindSafe(|| {
                loop {
                    let envelope = {
                        let mut state = worker_shared.state.lock().unwrap();
                        while state.pending.is_empty() && !worker_shared.stopping.load(Ordering::Acquire) {
                            state = worker_shared.wake.wait(state).unwrap();
                        }
                        if worker_shared.stopping.load(Ordering::Acquire) { break; }
                        #[cfg(test)] if worker_shared.fault.load(Ordering::Acquire) == 2 {
                            panic!("injected worker panic holding state");
                        }
                        state.pending.pop_front().unwrap()
                    };
                    #[cfg(test)] if worker_shared.fault.load(Ordering::Acquire) == 1 {
                        panic!("injected worker panic outside state");
                    }
                    let answer = match &envelope.job {
                        Work::Dijkstra(job) => search(job, limits, &worker_shared.stopping),
                        Work::Replay(job) => replay_worker::search(job, limits, &worker_shared.stopping),
                    };
                    let charge = envelope.charge;
                    drop(envelope);
                    let mut state = worker_shared.state.lock().unwrap();
                    // Admission already reserved the result slot; never wait for outbox space.
                    state.ready.push_back((answer, charge));
                }
            }));
            if outcome.is_err() { worker_shared.fail(); }
            // Sole cleanup owner: recover poisoned state only to DISCARD it, never reuse it.
            // Unwinding dropped any in-flight graph/scratch; discard queued/results here.
            let mut state = worker_shared.state.lock().unwrap_or_else(|e| e.into_inner());
            state.pending.clear();
            state.ready.clear();
            state.admitted = 0;
            state.bytes = 0;
        }).map_err(|_| Reject::StartFailed)?;
        Ok(Self { shared, handle: Some(handle), limits })
    }

    /// Lock-free health observation; Failed/Closed invalidates ALL outstanding jobs.
    /// Failure is sticky. Create a fresh Worker only after controlled teardown.
    pub fn health(&self) -> Health { self.shared.health() }

    /// Request close without waiting for the mutex or joining. Worker discards all
    /// outstanding data; Drop later joins during controlled teardown.
    pub fn close(&self) -> Result<(), Access> {
        let _state = self.shared.try_state()?;
        self.shared.health.compare_exchange(Health::Running as u8, Health::Closed as u8,
            Ordering::AcqRel, Ordering::Acquire).map_err(|_| Access::WorkerFailed)?;
        self.shared.stopping.store(true, Ordering::Release);
        self.shared.wake.notify_one();
        Ok(())
    }

    /// Never waits for the state mutex: contention is distinct from capacity Busy.
    /// Validation/allocation disposal still costs caller CPU: this is NOT a hard
    /// real-time guarantee. Rejected owned jobs drop; coordinator bounds retries.
    pub fn submit(&self, job: Job) -> Result<(), Reject> {
        self.shared.access().map_err(Reject::from)?;
        let charge = validate_and_charge(&job, self.limits)?;
        self.admit(Work::Dijkstra(job), charge)
    }

    /// Explicit alternate kernel; same single worker and shared reservation ledger.
    pub fn submit_replay(&self, job: ReplayJob) -> Result<(), Reject> {
        self.shared.access().map_err(Reject::from)?;
        let charge = replay_worker::validate_and_charge(&job, self.limits)?;
        self.admit(Work::Replay(job), charge)
    }

    fn admit(&self, job: Work, charge: usize) -> Result<(), Reject> {
        let mut state = self.shared.try_state().map_err(Reject::from)?;
        let total = state.bytes.checked_add(charge).ok_or(Reject::TooLarge)?;
        if state.admitted >= self.limits.jobs || total > self.limits.bytes {
            return Err(Reject::Busy);
        }
        state.admitted += 1;
        state.bytes = total;
        state.pending.push_back(Envelope { job, charge });
        self.shared.wake.notify_one();
        Ok(())
    }

    /// Poll ONE result without waiting for the state mutex. Empty and Contended differ.
    /// Failed/Closed means discard all coordinator-side outstanding records, rather
    /// than await individual terminal answers. Caller bounds retained answers/polls.
    pub fn poll(&self) -> Result<Option<Answer>, Access> {
        let mut state = self.shared.try_state()?;
        let (answer, charge) = match state.ready.pop_front() { Some(v) => v, None => return Ok(None) };
        state.admitted -= 1;
        state.bytes -= charge;
        Ok(Some(answer))
    }

}
impl Drop for Worker {
    fn drop(&mut self) {
        {
            // Share the wait mutex to prevent a notify-before-wait shutdown race.
            let _state = self.shared.state.lock().unwrap_or_else(|e| e.into_inner());
            let _ = self.shared.health.compare_exchange(Health::Running as u8, Health::Closed as u8,
                Ordering::AcqRel, Ordering::Acquire);
            self.shared.stopping.store(true, Ordering::Release);
            self.shared.wake.notify_one();
        }
        // Synchronous join is not a game-tick API. Destroy only during controlled teardown.
        if let Some(handle) = self.handle.take() { let _ = handle.join(); }
    }
}

fn validate_and_charge(job: &Job, limits: Limits) -> Result<usize, Reject> {
    let n = job.graph.offsets.len().checked_sub(1).ok_or(Reject::InvalidGraph)?;
    let m = job.graph.edges.len();
    if n == 0 || job.start as usize >= n || job.goal as usize >= n { return Err(Reject::InvalidGraph); }
    if n > limits.nodes_per_job || m > limits.edges_per_job { return Err(Reject::TooLarge); }
    if job.graph.offsets[0] != 0 || job.graph.offsets[n] as usize != m
        || job.graph.offsets.windows(2).any(|p| p[0] > p[1])
        || job.graph.edges.iter().any(|e| e.to as usize >= n) {
        return Err(Reject::InvalidGraph);
    }
    // Reserve input + all search vectors + maximum output, plus fixed envelope slack.
    // This is deliberately conservative; allocator metadata/thread stacks are separate.
    let charge = (n + 1).checked_mul(size_of::<u32>())
        .and_then(|v| m.checked_mul(size_of::<Edge>()).and_then(|e| v.checked_add(e)))
        .and_then(|v| n.checked_mul(32).and_then(|s| v.checked_add(s)))
        .and_then(|v| limits.path_nodes.checked_mul(size_of::<u32>()).and_then(|p| v.checked_add(p)))
        .and_then(|v| v.checked_add(4096)).ok_or(Reject::TooLarge)?;
    if charge > limits.bytes { return Err(Reject::TooLarge); }
    Ok(charge)
}

fn interrupt(job: &Job, stop: &AtomicBool) -> Option<Status> {
    if stop.load(Ordering::Acquire) { Some(Status::Shutdown) }
    else if job.cancelled.load(Ordering::Acquire) { Some(Status::Cancelled) }
    else if job.current_generation.load(Ordering::Acquire) != job.id.requester_generation {
        Some(Status::Superseded)
    } else if Instant::now() >= job.deadline { Some(Status::Expired) } else { None }
}

/// Bounded O(V^2 + E) Dijkstra, not AStar. Tie: (distance, node index), then first
/// strict relaxation in CSR edge order. No heap growth and no gameplay callbacks.
fn search(job: &Job, limits: Limits, stop: &AtomicBool) -> Answer {
    let empty = |status| Answer { id: job.id, status, path: Vec::new(), replay: None };
    if let Some(s) = interrupt(job, stop) { return empty(s); }
    let n = job.graph.offsets.len() - 1;
    let mut distance = vec![u64::MAX; n];
    let mut previous = vec![u32::MAX; n];
    let mut settled = vec![false; n];
    let mut work = 0usize;
    // Check control and work at EACH scanned node, edge and reconstructed path node.
    let mut step = || -> Result<(), Status> {
        if let Some(s) = interrupt(job, stop) { return Err(s); }
        if work >= limits.work_per_job { return Err(Status::WorkLimit); }
        work += 1;
        #[cfg(test)]
        if let Some(gate) = &job.test_gate { gate.checkpoint(); }
        Ok(())
    };
    distance[job.start as usize] = 0;
    loop {
        let mut best: Option<usize> = None;
        for i in 0..n {
            if let Err(s) = step() { return empty(s); }
            if !settled[i] && distance[i] != u64::MAX
                && best.map_or(true, |b| (distance[i], i) < (distance[b], b)) { best = Some(i); }
        }
        let current = match best { Some(i) => i, None => return empty(Status::NoPath) };
        if current == job.goal as usize {
            let mut path = Vec::with_capacity(limits.path_nodes);
            let mut node = current;
            loop {
                if let Err(s) = step() { return empty(s); }
                if path.len() >= limits.path_nodes { return empty(Status::PathLimit); }
                path.push(node as u32);
                if node == job.start as usize { break; }
                node = previous[node] as usize;
            }
            path.reverse();
            return Answer { id: job.id, status: Status::Found, path, replay: None };
        }
        settled[current] = true;
        let lo = job.graph.offsets[current] as usize;
        let hi = job.graph.offsets[current + 1] as usize;
        for edge in &job.graph.edges[lo..hi] {
            if let Err(s) = step() { return empty(s); }
            let target = edge.to as usize;
            if settled[target] { continue; }
            let candidate = match distance[current].checked_add(u64::from(edge.cost)) {
                Some(d) => d, None => return empty(Status::CostOverflow),
            };
            if candidate < distance[target] {
                distance[target] = candidate;
                previous[target] = current as u32;
            }
        }
    }
}

#[cfg(test)]
mod lifecycle_tests;

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    fn job() -> Job {
        Job { id: Identity { request: 1, round: 1, requester: 1, requester_generation: 1,
            scene_revision: 1, target_revision: 1, capability_revision: 1 },
            graph: Snapshot { offsets: vec![0, 2, 3, 4, 4].into_boxed_slice(),
                // Deliberately put node 2 first: index, not arrival order, breaks ties.
                edges: vec![Edge { to: 2, cost: 1 }, Edge { to: 1, cost: 1 },
                    Edge { to: 3, cost: 1 }, Edge { to: 3, cost: 1 }].into_boxed_slice() },
            start: 0, goal: 3, deadline: Instant::now() + Duration::from_secs(5),
            cancelled: Arc::new(AtomicBool::new(false)), current_generation: Arc::new(AtomicU64::new(1)),
            test_gate: None }
    }
    fn run(j: &Job, l: Limits) -> Answer {
        validate_and_charge(j, l).unwrap(); search(j, l, &AtomicBool::new(false))
    }
    #[test] fn deterministic_tie_and_endpoints() {
        let a = run(&job(), Limits::default());
        assert_eq!(a.status, Status::Found); assert_eq!(a.path, vec![0, 1, 3]);
    }
    #[test] fn cancel_generation_deadline() {
        let mut j = job(); j.cancelled.store(true, Ordering::Release);
        assert_eq!(run(&j, Limits::default()).status, Status::Cancelled);
        j.cancelled.store(false, Ordering::Release); j.current_generation.store(2, Ordering::Release);
        assert_eq!(run(&j, Limits::default()).status, Status::Superseded);
        j.current_generation.store(1, Ordering::Release); j.deadline = Instant::now();
        assert_eq!(run(&j, Limits::default()).status, Status::Expired);
    }
    #[test] fn bounds_and_malformed_graph() {
        let mut l = Limits::default(); l.work_per_job = 1;
        assert_eq!(run(&job(), l).status, Status::WorkLimit);
        l = Limits::default(); l.path_nodes = 2;
        assert_eq!(run(&job(), l).status, Status::PathLimit);
        let mut j = job(); j.graph.offsets[2] = 99;
        assert_eq!(validate_and_charge(&j, l), Err(Reject::InvalidGraph));
    }
    #[test] fn no_path_and_same_endpoint_are_explicit_prototype_semantics() {
        let mut j = job(); j.start = 3; j.goal = 0;
        assert_eq!(run(&j, Limits::default()).status, Status::NoPath);
        j.goal = 3; assert_eq!(run(&j, Limits::default()).path, vec![3]);
    }
    fn submit_after_contention(worker: &Worker) -> Result<(), Reject> {
        let until = Instant::now() + Duration::from_secs(5);
        loop {
            match worker.submit(job()) {
                Err(Reject::Contended) => (), other => return other,
            }
            assert!(Instant::now() < until); thread::yield_now();
        }
    }
    fn submit_eventually(worker: &Worker) { submit_after_contention(worker).unwrap(); }
    fn poll_after_contention(worker: &Worker) -> Result<Option<Answer>, Access> {
        let until = Instant::now() + Duration::from_secs(5);
        loop {
            match worker.poll() { Err(Access::Contended) => (), other => return other }
            assert!(Instant::now() < until); thread::yield_now();
        }
    }
    fn wait_until(mut predicate: impl FnMut() -> bool) {
        let until = Instant::now() + Duration::from_secs(5);
        while !predicate() { assert!(Instant::now() < until, "test timeout"); thread::yield_now(); }
    }
    #[test] fn full_outbox_reserves_until_poll() {
        let worker = Worker::new(Limits { jobs: 2, ..Limits::default() }).unwrap();
        submit_eventually(&worker); submit_eventually(&worker);
        wait_until(|| worker.shared.state.lock().unwrap().ready.len() == 2);
        assert_eq!(submit_after_contention(&worker), Err(Reject::Busy));
        assert_eq!(poll_after_contention(&worker).unwrap().unwrap().status, Status::Found);
        submit_eventually(&worker);
    }
    #[test] fn contention_is_distinct_and_never_waits_for_lock() {
        let worker = Worker::new(Limits::default()).unwrap();
        let guard = worker.shared.state.lock().unwrap();
        assert_eq!(worker.submit(job()), Err(Reject::Contended));
        assert!(matches!(worker.poll(), Err(Access::Contended)));
        drop(guard);
    }
    #[test] fn worker_panics_fail_closed_and_discard_reservations() {
        for fault in [1, 2] {
            let worker = Worker::new(Limits::default()).unwrap();
            worker.shared.fault.store(fault, Ordering::Release);
            submit_eventually(&worker);
            wait_until(|| worker.health() == Health::Failed);
            assert_eq!(worker.submit(job()), Err(Reject::WorkerFailed));
            assert!(matches!(worker.poll(), Err(Access::WorkerFailed)));
            wait_until(|| {
                let s = worker.shared.state.lock().unwrap_or_else(|e| e.into_inner());
                s.admitted == 0 && s.bytes == 0 && s.pending.is_empty() && s.ready.is_empty()
            });
        }
    }
    #[test] fn explicit_close_reports_closed_and_discards() {
        let worker = Worker::new(Limits::default()).unwrap();
        submit_eventually(&worker);
        wait_until(|| worker.shared.state.lock().unwrap().ready.len() == 1);
        wait_until(|| match worker.close() { Ok(()) => true,
            Err(Access::Contended) => false, other => panic!("close: {:?}", other) });
        assert_eq!(worker.health(), Health::Closed);
        assert_eq!(worker.submit(job()), Err(Reject::Closed));
        assert!(matches!(worker.poll(), Err(Access::Closed)));
        wait_until(|| {
            let s = worker.shared.state.lock().unwrap();
            s.admitted == 0 && s.bytes == 0 && s.ready.is_empty() && s.pending.is_empty()
        });
    }
    #[test] fn caller_observed_poison_fails_closed() {
        let worker = Worker::new(Limits::default()).unwrap();
        let _ = catch_unwind(AssertUnwindSafe(|| {
            let _guard = worker.shared.state.lock().unwrap();
            panic!("injected external poison");
        }));
        assert!(matches!(poll_after_contention(&worker), Err(Access::WorkerFailed)));
        assert_eq!(worker.health(), Health::Failed);
    }
    #[test] fn cancelled_submission_releases_on_poll() {
        let worker = Worker::new(Limits::default()).unwrap();
        wait_until(|| {
            let j = job(); j.cancelled.store(true, Ordering::Release);
            match worker.submit(j) { Ok(()) => true, Err(Reject::Contended) => false,
                other => panic!("submit: {:?}", other) }
        });
        wait_until(|| match worker.poll() {
            Ok(Some(a)) => { assert_eq!(a.status, Status::Cancelled); true },
            Ok(None) | Err(Access::Contended) => false, other => panic!("poll: {:?}", other),
        });
        assert_eq!(worker.shared.state.lock().unwrap().admitted, 0);
    }
    #[test] fn drop_idle_full_or_failed_worker_does_not_deadlock() {
        for fault in [0, 1, 2, 3] {
            let (tx, rx) = std::sync::mpsc::sync_channel(1);
            let handle = thread::spawn(move || {
                let worker = Worker::new(Limits { jobs: 1, ..Limits::default() }).unwrap();
                if fault != 3 {
                    worker.shared.fault.store(fault, Ordering::Release);
                    submit_eventually(&worker);
                    if fault == 0 {
                        wait_until(|| worker.shared.state.lock().unwrap().ready.len() == 1);
                    } else { wait_until(|| worker.health() == Health::Failed); }
                }
                drop(worker); tx.send(()).unwrap();
            });
            rx.recv_timeout(Duration::from_secs(6)).expect("drop deadlocked");
            handle.join().unwrap();
        }
    }
}
