//! Alternate kernel dispatch using the existing worker/lifecycle, never DM calls.
use super::*;
use dm_replay::{Input, Event, Report, Unsupported};

pub struct ReplayJob {
    pub id: Identity,
    pub input: Input,
    pub deadline: Instant,
    pub cancelled: Arc<AtomicBool>,
    pub current_generation: Arc<AtomicU64>,
    #[cfg(test)]
    pub(crate) test_gate: Option<Arc<tests::Gate>>,
    #[cfg(test)]
    pub(crate) test_expired: Option<Arc<AtomicBool>>,
}

// Includes spare event-vector capacity and nested heap/record/path Vec capacity.
// The kernel's 4 MiB payload ledger plus fixed node bound limits allocation before
// this check; 2x is deliberately conservative, not a process/RSS guarantee.
const RESULT_RESERVE: usize = 2 * dm_replay::MAX_TRACE_BYTES;
fn add(total: &mut usize, count: usize, width: usize) -> Result<(), Reject> {
    *total = count.checked_mul(width).and_then(|v| total.checked_add(v)).ok_or(Reject::TooLarge)?;
    Ok(())
}
pub(super) fn validate_and_charge(job: &ReplayJob, limits: Limits) -> Result<usize, Reject> {
    let input = &job.input;
    let n = input.nodes.len();
    if n == 0 { return Err(Reject::InvalidGraph); }
    if n > dm_replay::MAX_NODES || n > limits.nodes_per_job || n.checked_mul(4).ok_or(Reject::TooLarge)? > limits.edges_per_job {
        return Err(Reject::TooLarge);
    }
    let mut charge = RESULT_RESERVE;
    add(&mut charge, 1, 8192)?;
    add(&mut charge, n, 512)?; // bounded records, heap, path and snapshot copies
    add(&mut charge, input.nodes.capacity(), size_of::<dm_replay::Node>())?;
    for node in &input.nodes {
        add(&mut charge, node.distance.capacity(), size_of::<f32>())?;
        add(&mut charge, node.allowed.capacity(), size_of::<bool>())?;
    }
    if charge > limits.bytes { return Err(Reject::TooLarge); }
    if [input.start,input.goal,input.exclude].into_iter().flatten().any(|i| i >= n)
        || ![input.maxnodes,input.supplied_depth,input.mintargetdist].iter().all(|v| v.is_finite()) {
        return Err(Reject::InvalidGraph);
    }
    for node in &input.nodes {
        if node.distance.len()!=n+1 || node.allowed.len()!=n+1
            || node.candidates.iter().flatten().any(|&i| i>=n)
            || !node.goal_distance.is_finite() || node.goal_distance < 0.0
            || node.distance.iter().any(|v| !v.is_finite() || *v < 0.0) {
            return Err(Reject::InvalidGraph);
        }
    }
    Ok(charge)
}
fn report_bytes(report: &Report) -> Option<usize> {
    let mut n = report.events.capacity().checked_mul(size_of::<Event>())?;
    if let Ok((_,path)) = &report.outcome { n = n.checked_add(path.capacity().checked_mul(size_of::<usize>())?)?; }
    for e in &report.events {
        let extra = match e {
            Event::State {heap,records,..} => heap.capacity().checked_mul(size_of::<usize>())?
                .checked_add(records.capacity().checked_mul(size_of::<dm_replay::Record>())?)?,
            Event::End {path,..} => path.capacity().checked_mul(size_of::<usize>())?,
            _ => 0,
        };
        n = n.checked_add(extra)?;
    }
    Some(n)
}
fn interrupt(job: &ReplayJob, stop: &AtomicBool) -> Option<Status> {
    #[cfg(test)]
    if job.test_expired.as_ref().map_or(false, |flag| flag.load(Ordering::Acquire)) { return Some(Status::Expired); }
    if stop.load(Ordering::Acquire) { Some(Status::Shutdown) }
    else if job.cancelled.load(Ordering::Acquire) { Some(Status::Cancelled) }
    else if job.current_generation.load(Ordering::Acquire) != job.id.requester_generation { Some(Status::Superseded) }
    else if Instant::now() >= job.deadline { Some(Status::Expired) } else { None }
}
pub(super) fn search(job: &ReplayJob, limits: Limits, stop: &AtomicBool) -> Answer {
    let empty = |status| Answer {id:job.id,status,path:Vec::new(),replay:None};
    if let Some(s) = interrupt(job,stop) { return empty(s); }
    let mut interrupted = None;
    let mut work = 0;
    let mut checkpoint = || {
        #[cfg(test)]
        if let Some(gate) = &job.test_gate { gate.checkpoint(); }
        let status = interrupt(job,stop).or_else(|| if work >= limits.work_per_job {Some(Status::WorkLimit)} else {None});
        if let Some(s) = status { interrupted=Some(s); return Err(Unsupported::Interrupted); }
        work += 1;
        Ok(())
    };
    let report = dm_replay::replay_controlled(&job.input,limits.path_nodes,&mut checkpoint);
    if let Some(status) = interrupted.or_else(|| interrupt(job,stop)) { return empty(status); }
    if report_bytes(&report).map_or(true,|bytes| bytes > RESULT_RESERVE) {
        return Answer {id:job.id,status:Status::ReplayUnsupported,path:vec![],
            replay:Some(Report {outcome:Err(Unsupported::TraceLimit),events:vec![]})};
    }
    let status = match report.outcome {
        Ok(_) => Status::ReplayComplete,
        Err(Unsupported::PathLimit) => Status::PathLimit,
        Err(_) => Status::ReplayUnsupported,
    };
    Answer {id:job.id,status,path:vec![],replay:Some(report)}
}

#[cfg(test)]
mod tests;
