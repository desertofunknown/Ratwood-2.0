//! Deterministic lifecycle tests. Execution status is recorded in TEST-RESULTS.md.
//! Gates exist only under cfg(test), after an actual search work unit. No sleeps
//! or relative thread-speed assumptions select the tested interleaving.
use super::*;
use std::sync::{atomic::AtomicUsize, mpsc::{self, Receiver, SyncSender}};
use std::time::Duration;

const WAIT: Duration = Duration::from_secs(10);
#[derive(Clone, Copy)]
enum Resume { Continue, Panic }

pub(super) struct Gate {
    work_seen: AtomicUsize,
    at_work: usize,
    reached: SyncSender<()>,
    resume: Mutex<Receiver<Resume>>,
}
struct Control { reached: Receiver<()>, resume: SyncSender<Resume> }
impl Gate {
    fn new(at_work: usize) -> (Arc<Self>, Control) {
        assert!(at_work > 0);
        let (reached_tx, reached_rx) = mpsc::sync_channel(1);
        let (resume_tx, resume_rx) = mpsc::sync_channel(1);
        (Arc::new(Self { work_seen: AtomicUsize::new(0), at_work,
            reached: reached_tx, resume: Mutex::new(resume_rx) }),
         Control { reached: reached_rx, resume: resume_tx })
    }
    pub(super) fn checkpoint(&self) {
        if self.work_seen.fetch_add(1, Ordering::AcqRel) + 1 != self.at_work { return; }
        self.reached.try_send(()).expect("one gate notification");
        // Bounded even if the test panics or loses its controller. This lock has
        // only one accessor, the one worker, and is never held by the test.
        match self.resume.lock().unwrap().recv_timeout(WAIT).expect("gate release timeout") {
            Resume::Continue => (), Resume::Panic => panic!("injected active-search panic"),
        }
    }
}
impl Control {
    fn reached(&self) { self.reached.recv_timeout(WAIT).expect("worker never reached checkpoint"); }
    fn release(&self, signal: Resume) { self.resume.try_send(signal).expect("one release"); }
}
impl Drop for Control {
    fn drop(&mut self) {
        // Declare Control after Worker in tests: unwind releases the gate before
        // Worker's joining Drop. A full/disconnected channel needs no retry.
        let _ = self.resume.try_send(Resume::Continue);
    }
}
fn until(mut condition: impl FnMut() -> bool) {
    let deadline = Instant::now() + WAIT;
    while !condition() {
        assert!(Instant::now() < deadline, "lifecycle condition timeout");
        thread::yield_now();
    }
}
fn make_job(request: u64, gate: Option<Arc<Gate>>, cancelled: Arc<AtomicBool>) -> Job {
    Job { id: Identity { request, round: 1, requester: request, requester_generation: 1,
            scene_revision: 1, target_revision: 1, capability_revision: 1 },
        graph: Snapshot { offsets: vec![0,1,2,3,4,5,5].into_boxed_slice(),
            edges: (1..6).map(|to| Edge { to, cost: 1 }).collect::<Vec<_>>().into_boxed_slice() },
        start: 0, goal: 5, deadline: Instant::now() + WAIT * 4,
        cancelled, current_generation: Arc::new(AtomicU64::new(1)), test_gate: gate }
}
fn submit(worker: &Worker, request: u64, gate: Option<Arc<Gate>>, cancelled: Arc<AtomicBool>) {
    until(|| match worker.submit(make_job(request, gate.clone(), cancelled.clone())) {
        Ok(()) => true, Err(Reject::Contended) => false, other => panic!("submit: {:?}", other),
    });
}
fn state_matches(worker: &Worker, expected: (usize, usize, usize), zero_bytes: bool) -> bool {
    let state = match worker.shared.state.try_lock() {
        Ok(s) => s, Err(TryLockError::Poisoned(p)) => p.into_inner(),
        Err(TryLockError::WouldBlock) => return false,
    };
    (state.admitted, state.pending.len(), state.ready.len()) == expected
        && if zero_bytes { state.bytes == 0 } else { state.bytes > 0 }
}
fn poll(worker: &Worker) -> Answer {
    let mut result = None;
    until(|| match worker.poll() {
        Ok(Some(a)) => { result = Some(a); true },
        Ok(None) | Err(Access::Contended) => false, other => panic!("poll: {:?}", other),
    });
    result.unwrap()
}
fn flag() -> Arc<AtomicBool> { Arc::new(AtomicBool::new(false)) }

#[test]
fn active_cancellation_retains_reservation_until_terminal_poll() {
    let worker = Worker::new(Limits { jobs: 1, ..Limits::default() }).unwrap();
    let (gate, control) = Gate::new(2);
    let cancelled = flag();
    submit(&worker, 1, Some(gate.clone()), cancelled.clone());
    control.reached();
    assert_eq!(gate.work_seen.load(Ordering::Acquire), 2);
    assert!(state_matches(&worker, (1,0,0), false)); // genuinely running
    cancelled.store(true, Ordering::Release);
    control.release(Resume::Continue);
    until(|| state_matches(&worker, (1,0,1), false));
    let answer = poll(&worker);
    assert_eq!(answer.id.request, 1);
    assert_eq!(answer.status, Status::Cancelled);
    assert!(answer.path.is_empty());
    until(|| state_matches(&worker, (0,0,0), true));
    // Prove capacity can be reused after exactly one release.
    submit(&worker, 2, None, flag());
    assert_eq!(poll(&worker).status, Status::Found);
}

#[test]
fn active_panic_discards_mixed_ready_running_pending_reservations() {
    let worker = Worker::new(Limits { jobs: 3, ..Limits::default() }).unwrap();
    let (gate, control) = Gate::new(2);
    submit(&worker, 1, None, flag());
    until(|| state_matches(&worker, (1,0,1), false));
    submit(&worker, 2, Some(gate), flag());
    control.reached();
    submit(&worker, 3, None, flag());
    assert!(state_matches(&worker, (3,1,1), false));
    control.release(Resume::Panic);
    until(|| worker.health() == Health::Failed);
    until(|| state_matches(&worker, (0,0,0), true));
    assert!(matches!(worker.poll(), Err(Access::WorkerFailed)));
    assert_eq!(worker.submit(make_job(4, None, flag())), Err(Reject::WorkerFailed));
    assert!(matches!(worker.close(), Err(Access::WorkerFailed)));
    assert_eq!(worker.health(), Health::Failed); // close cannot erase failure
}

#[test]
fn close_during_active_search_discards_mixed_reservations() {
    let worker = Worker::new(Limits { jobs: 3, ..Limits::default() }).unwrap();
    let (gate, control) = Gate::new(2);
    submit(&worker, 1, None, flag());
    until(|| state_matches(&worker, (1,0,1), false));
    submit(&worker, 2, Some(gate), flag());
    control.reached();
    submit(&worker, 3, None, flag());
    assert!(state_matches(&worker, (3,1,1), false));
    // The worker is held outside the state lock. Close must return without
    // waiting for search completion; unlike Drop it must not join this worker.
    assert_eq!(worker.close(), Ok(()));
    assert_eq!(worker.health(), Health::Closed);
    assert!(matches!(worker.poll(), Err(Access::Closed)));
    control.release(Resume::Continue);
    until(|| state_matches(&worker, (0,0,0), true));
    assert_eq!(worker.health(), Health::Closed);
}
