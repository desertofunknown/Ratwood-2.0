mod wire;
use kernel::{Worker,Limits,Identity,ReplayJob,Health,Status};
use kernel::dm_replay;
use std::{cell::UnsafeCell,ffi::c_char,sync::{Arc,atomic::{AtomicBool,AtomicU64,Ordering}},time::{Instant,Duration},panic::{catch_unwind,AssertUnwindSafe}};
const CAP:usize=65536;
struct Record{id:Identity,deadline:Instant,cancel:Arc<AtomicBool>,generation:Arc<AtomicU64>}
struct State{worker:Option<Worker>,record:Option<Record>,failed:bool,out:[u8;8192]}
struct Global(UnsafeCell<State>);
unsafe impl Sync for Global{}
static STATE:Global=Global(UnsafeCell::new(State{worker:None,record:None,failed:false,out:[0;8192]}));
static ENTERED:AtomicBool=AtomicBool::new(false);
struct Guard;impl Drop for Guard{fn drop(&mut self){ENTERED.store(false,Ordering::Release)}}
fn ptr(s:&'static [u8])->*const c_char{s.as_ptr().cast()}
// Genuine valid BYOND pointers; serialized main-thread calls only. Never unload before JOINED.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn snapshot_bridge(argc:u32,argv:*const *const c_char)->*const c_char{
 if ENTERED.swap(true,Ordering::Acquire){return ptr(b"contention\0")} let _g=Guard;
 let r=catch_unwind(AssertUnwindSafe(||unsafe{
  if argc!=1||argv.is_null(){return "invalid".to_string()}
  let p=*argv;if p.is_null(){return "invalid".to_string()}
  let mut bytes=[0u8;CAP];let mut n=0;
  loop{let c=*p.add(n) as u8;if c==0{break}if n==CAP{return "invalid".into()}if !(32..=126).contains(&c){return "invalid".into()}bytes[n]=c;n+=1;}
  let s=std::str::from_utf8(&bytes[..n]).unwrap(); dispatch(&mut *STATE.0.get(),s)
 }));
 let state=unsafe{&mut *STATE.0.get()};
 let result=match r{Ok(s)=>s,Err(_)=>{state.failed=true;state.record=None;if let Some(w)=&state.worker{let _=w.close();}"worker-failed".into()}};
 if result.len()>=state.out.len(){state.failed=true;state.record=None;return ptr(b"worker-failed\0")}
 state.out[..result.len()].copy_from_slice(result.as_bytes());state.out[result.len()]=0;state.out.as_ptr().cast()
}
fn idtext(i:Identity)->String{format!("{}|{}|{}|{}|{}|{}|{}",i.request,i.round,i.requester,i.requester_generation,i.scene_revision,i.target_revision,i.capability_revision)}
fn dispatch(s:&mut State,req:&str)->String{
 if req.starts_with("2|submit|"){return submit_snapshot(s,req)}
 if req.len()>32{return "invalid".into()}
 let f:Vec<&str>=req.split('|').collect();if f.first()!=Some(&"2"){return "unsupported".into()}
 let cmd=f.get(1).copied().unwrap_or("");
 if cmd=="join"&&f.len()==2{s.record=None;if let Some(w)=s.worker.take(){drop(w)}s.failed=false;return "JOINED".into()}
 if s.failed{return "worker-failed".into()}
 if cmd=="init"&&f.len()==2{if s.worker.is_some(){return "busy".into()}return match Worker::new(Limits{jobs:1,bytes:24*1024*1024,nodes_per_job:144,edges_per_job:576,path_nodes:144,work_per_job:100000}){Ok(w)=>{s.worker=Some(w);"ready".into()},Err(e)=>format!("{:?}",e)}}
 let Some(w)=&s.worker else{return "stopped".into()};
 if cmd=="stop"&&f.len()==2{return match w.close(){Err(kernel::Access::Contended)=>"contended".into(),_=>{s.record=None;"stop-requested".into()}}}
 if w.health()!=Health::Running{s.record=None;return if w.health()==Health::Failed{"worker-failed"}else{"stopped"}.into()}
 if cmd=="panic"&&f.len()==2{panic!("disposable boundary fault")}
 if cmd=="cancel"&&f.len()==2{if let Some(r)=&s.record{r.cancel.store(true,Ordering::Release);"cancel-requested".into()}else{"empty".into()}}
 else if cmd=="supersede"&&f.len()==2{if let Some(r)=&s.record{r.generation.store(r.id.requester_generation^1,Ordering::Release);"supersede-requested".into()}else{"empty".into()}}
 else if cmd=="poll"&&f.len()==2{match w.poll(){Ok(None)=>"empty".into(),Err(e)=>{if !matches!(e,kernel::Access::Contended){s.record=None;}format!("{:?}",e).to_lowercase()},Ok(Some(a))=>{let Some(r)=s.record.take()else{return "invalid".into()};if a.id!=r.id{return "invalid".into()}if r.cancel.load(Ordering::Acquire){return "cancelled".into()}if r.generation.load(Ordering::Acquire)!=r.id.requester_generation{return "superseded".into()}if Instant::now()>=r.deadline{return "expired".into()}if a.status!=Status::ReplayComplete{return format!("{:?}",a.status).to_lowercase()}match a.replay.unwrap().outcome{Ok((kind,path))=>format!("result|{}|{:?}|{}",idtext(a.id),kind,path.iter().map(|n|n.to_string()).collect::<Vec<_>>().join(",")),Err(_)=>"unsupported".into()}}}}
 else{"invalid".into()}
}
fn submit_snapshot(s:&mut State,req:&str)->String{
 // Complete validation before any payload-dependent heap allocation.
 let Ok(parsed)=wire::parse(req)else{return "invalid".into()};
 if s.failed{return "worker-failed".into()}
 let Some(w)=&s.worker else{return "stopped".into()};
 if w.health()!=Health::Running{s.record=None;return if w.health()==Health::Failed{"worker-failed"}else{"stopped"}.into()}
 if s.record.is_some(){return "busy".into()}
 let id=parsed.id;let deadline=Instant::now()+Duration::from_millis(parsed.ttl);
 let input=parsed.into_input();let cancel=Arc::new(AtomicBool::new(false));let generation=Arc::new(AtomicU64::new(id.requester_generation));
 match w.submit_replay(ReplayJob{id,input,deadline,cancelled:cancel.clone(),current_generation:generation.clone()}){Ok(())=>{s.record=Some(Record{id,deadline,cancel,generation});"accepted".into()},Err(e)=>format!("{:?}",e).to_lowercase().replace("workerfailed","worker-failed").replace("closed","stopped")}
}
fn main(){for file in std::env::args().skip(1){let raw=std::fs::read_to_string(&file).unwrap();let p=wire::parse(&raw).expect("valid capture");let id=p.id;let r=dm_replay::replay(&p.into_input());println!("{}|{}|{:?}",file,idtext(id),r.outcome);}}
