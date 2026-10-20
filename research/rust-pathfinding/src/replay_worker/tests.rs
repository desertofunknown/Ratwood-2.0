use super::*;
use std::time::Duration;
use std::sync::mpsc::{sync_channel,Receiver,SyncSender};
const WAIT: Duration = Duration::from_secs(10);
pub(crate) struct Gate { reached:SyncSender<()>, release:Mutex<Receiver<bool>>, work_seen:std::sync::atomic::AtomicUsize }
struct Control { reached:Receiver<()>, release:SyncSender<bool> }
impl Gate {
    fn new() -> (Arc<Self>,Control) {
        let (tx,rx)=sync_channel(1); let (tx2,rx2)=sync_channel(1);
        (Arc::new(Self{reached:tx,release:Mutex::new(rx2),work_seen:std::sync::atomic::AtomicUsize::new(0)}),Control{reached:rx,release:tx2})
    }
    pub(crate) fn checkpoint(&self) {
        if self.work_seen.fetch_add(1,Ordering::AcqRel)+1 != 16 {return;}
        self.reached.try_send(()).unwrap();
        if self.release.lock().unwrap().recv_timeout(WAIT).unwrap() {panic!("injected replay panic");}
    }
}
impl Control {
    fn reached(&self) {self.reached.recv_timeout(WAIT).unwrap();}
    fn release(&self,panic:bool) {self.release.try_send(panic).unwrap();}
}
impl Drop for Control {fn drop(&mut self) {let _=self.release.try_send(false);}}
fn limits() -> Limits {Limits{jobs:3,bytes:32*1024*1024,..Limits::default()}}
fn input(n:usize) -> Input {
    Input{nodes:(0..n).map(|i| {
        let mut candidates=[None;4];if i+1<n {candidates[2]=Some(i+1);}if i>0 {candidates[3]=Some(i-1);}
        let mut allowed=vec![true;n+1];allowed[n]=false;
        dm_replay::Node{z:1,goal_distance:(n-1-i) as f32,candidates,
            distance:(0..=n).map(|j|if j==n {0.0}else{i.abs_diff(j) as f32}).collect(),allowed}
    }).collect(),start:Some(0),goal:Some(n-1),exclude:None,maxnodes:0.0,supplied_depth:0.0,mintargetdist:0.0,allow_multiz:true}
}
fn job() -> ReplayJob {
    ReplayJob{id:Identity{request:1,round:2,requester:3,requester_generation:4,scene_revision:5,target_revision:6,capability_revision:7},
        input:input(4),deadline:Instant::now()+WAIT,cancelled:Arc::new(AtomicBool::new(false)),
        current_generation:Arc::new(AtomicU64::new(4)),test_gate:None,test_expired:None}
}
fn until(mut f:impl FnMut()->bool) {let deadline=Instant::now()+WAIT;while !f(){assert!(Instant::now()<deadline);thread::yield_now();}}
fn submit(w:&Worker,mut make:impl FnMut()->ReplayJob) {until(||match w.submit_replay(make()){Ok(())=>true,Err(Reject::Contended)=>false,x=>panic!("{:?}",x)});}
fn poll(w:&Worker)->Answer {let mut answer=None;until(||match w.poll(){Ok(Some(a))=>{answer=Some(a);true},Ok(None)|Err(Access::Contended)=>false,x=>panic!("{:?}",x)});answer.unwrap()}
fn ready(w:&Worker,n:usize) {until(||w.shared.state.try_lock().map_or(false,|s|s.ready.len()==n));}
#[test] fn replay_result_and_all_identity_fields() {
    let w=Worker::new(limits()).unwrap();submit(&w,job);let a=poll(&w);
    assert_eq!(a.status,Status::ReplayComplete);assert!(a.path.is_empty());
    assert_eq!(a.replay.as_ref().unwrap().outcome,Ok((dm_replay::EndKind::Path,vec![0,1,2,3])));
    assert!(a.matches_identity(&job().id));
    for k in 0..7 {let mut id=job().id;match k {0=>id.request+=1,1=>id.round+=1,2=>id.requester+=1,3=>id.requester_generation+=1,4=>id.scene_revision+=1,5=>id.target_revision+=1,_=>id.capability_revision+=1};assert!(!a.matches_identity(&id));}
}
#[test] fn raw_false_null_and_path_remain_distinct() {
    let w=Worker::new(limits()).unwrap();
    submit(&w,||{let mut j=job();j.input.goal=j.input.start;j});
    assert_eq!(poll(&w).replay.unwrap().outcome,Ok((dm_replay::EndKind::False,vec![])));
    submit(&w,||{let mut j=job();for n in &mut j.input.nodes {n.allowed.fill(false);}j});
    assert_eq!(poll(&w).replay.unwrap().outcome,Ok((dm_replay::EndKind::Null,vec![])));
}
#[test] fn pre_cancel_expiry_generation_work_and_path_limits() {
    for mode in 0..5 {
        let mut l=limits();if mode==3 {l.work_per_job=1;}if mode==4 {l.path_nodes=2;}
        let w=Worker::new(l).unwrap();
        submit(&w,||{let mut j=job();match mode {0=>j.cancelled.store(true,Ordering::Release),1=>j.deadline=Instant::now(),2=>j.current_generation.store(5,Ordering::Release),_=>()};j});
        let a=poll(&w);assert_eq!(a.status,[Status::Cancelled,Status::Expired,Status::Superseded,Status::WorkLimit,Status::PathLimit][mode]);
        if mode<4 {assert!(a.replay.is_none());}else{assert_eq!(a.replay.unwrap().outcome,Err(Unsupported::PathLimit));}
    }
}
#[test] fn active_cancel_supersede_expire_and_queued_cancel() {
    for mode in 0..3 {
        let w=Worker::new(limits()).unwrap();let (gate,control)=Gate::new();
        let cancelled=Arc::new(AtomicBool::new(false));let generation=Arc::new(AtomicU64::new(4));
        let deadline=Instant::now()+WAIT;let expired=Arc::new(AtomicBool::new(false));
        submit(&w,||{let mut j=job();j.test_gate=Some(gate.clone());j.cancelled=cancelled.clone();j.current_generation=generation.clone();j.deadline=deadline;j.test_expired=Some(expired.clone());j});control.reached();
        submit(&w,||{let j=job();j.cancelled.store(true,Ordering::Release);j});
        match mode {0=>cancelled.store(true,Ordering::Release),1=>generation.store(5,Ordering::Release),_=>expired.store(true,Ordering::Release)};
        control.release(false);
        let a=poll(&w);assert_eq!(a.status,[Status::Cancelled,Status::Superseded,Status::Expired][mode]);assert!(a.replay.is_none());
        assert_eq!(poll(&w).status,Status::Cancelled);
        let s=w.shared.state.lock().unwrap();assert_eq!((s.admitted,s.bytes),(0,0));
    }
}
#[test] fn replay_outbox_capacity_and_byte_capacity_release() {
    let charge=validate_and_charge(&job(),limits()).unwrap();let w=Worker::new(Limits{jobs:2,bytes:charge,..limits()}).unwrap();
    submit(&w,job);ready(&w,1);
    until(||match w.submit_replay(job()){Err(Reject::Contended)=>false,other=>{assert_eq!(other,Err(Reject::Busy));true}});
    assert_eq!(poll(&w).status,Status::ReplayComplete);submit(&w,job);assert_eq!(poll(&w).status,Status::ReplayComplete);
}
#[test] fn retained_capacity_invalid_and_trace_bounds() {
    let j=job();let baseline=validate_and_charge(&j,limits()).unwrap();let mut j=job();j.input.nodes[0].distance.reserve_exact(100);
    assert!(validate_and_charge(&j,limits()).unwrap()>baseline);
    assert_eq!(validate_and_charge(&j,Limits{bytes:baseline,..limits()}),Err(Reject::TooLarge));
    let mut j=job();j.input.nodes[0].distance.pop();assert_eq!(validate_and_charge(&j,limits()),Err(Reject::InvalidGraph));
    let mut j=job();j.input=input(257);assert_eq!(validate_and_charge(&j,limits()),Err(Reject::TooLarge));
    let w=Worker::new(limits()).unwrap();submit(&w,||{let mut j=job();j.input=input(256);j});let a=poll(&w);
    assert_eq!(a.status,Status::ReplayUnsupported);let report=a.replay.unwrap();assert_eq!(report.outcome,Err(Unsupported::TraceLimit));
    assert!(report_bytes(&report).unwrap()<=RESULT_RESERVE);
}
#[test] fn replay_close_and_panic_discard_mixed_reservations() {
    for panic in [false,true] {
        let w=Worker::new(limits()).unwrap();let(gate,control)=Gate::new();
        submit(&w,job);ready(&w,1);submit(&w,||{let mut j=job();j.test_gate=Some(gate.clone());j});control.reached();submit(&w,job);
        if !panic {assert_eq!(w.close(),Ok(()));}
        control.release(panic);
        until(||w.health()==if panic{Health::Failed}else{Health::Closed});
        until(||{let s=w.shared.state.lock().unwrap_or_else(|e|e.into_inner());s.admitted==0&&s.bytes==0&&s.ready.is_empty()&&s.pending.is_empty()});
    }
}

#[test] fn dijkstra_and_replay_share_single_ledger() {
    let w=Worker::new(Limits{jobs:2,..limits()}).unwrap();let(gate,control)=Gate::new();
    until(||{let r=job();let j=Job{id:r.id,graph:Snapshot{offsets:vec![0,1,1].into_boxed_slice(),edges:vec![Edge{to:1,cost:1}].into_boxed_slice()},start:0,goal:1,deadline:r.deadline,cancelled:r.cancelled,current_generation:r.current_generation,test_gate:None};match w.submit(j){Ok(())=>true,Err(Reject::Contended)=>false,x=>panic!("{:?}",x)}});
    ready(&w,1);submit(&w,||{let mut j=job();j.test_gate=Some(gate.clone());j});control.reached();
    assert_eq!(w.submit_replay(job()),Err(Reject::Busy));
    {let s=w.shared.state.lock().unwrap();assert_eq!(s.admitted,2);assert_eq!(s.ready.len(),1);}
    control.release(false);let first=poll(&w);assert_eq!(first.status,Status::Found);assert_eq!(first.path,vec![0,1]);assert!(first.replay.is_none());
    assert_eq!(poll(&w).status,Status::ReplayComplete);
    let s=w.shared.state.lock().unwrap();assert_eq!((s.admitted,s.bytes),(0,0));
}
