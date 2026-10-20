use std::{cell::UnsafeCell, ffi::c_char, sync::atomic::{AtomicBool,Ordering}, panic::{catch_unwind,AssertUnwindSafe}};
const CAP:usize=1024;
struct Storage(UnsafeCell<[u8;CAP+1]>);
// Only serialized, non-reentrant main-thread callers may use this ABI.
unsafe impl Sync for Storage {}
static OUT:Storage=Storage(UnsafeCell::new([0;CAP+1]));
static ENTERED:AtomicBool=AtomicBool::new(false);
struct Guard;
impl Drop for Guard {fn drop(&mut self){ENTERED.store(false,Ordering::Release);}}
fn err(s:&'static [u8])->*const c_char{s.as_ptr().cast()}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bridge(argc:u32,argv:*const *const c_char)->*const c_char {
 if ENTERED.swap(true,Ordering::Acquire){return err(b"ERR|reentry\0")}
 let _g=Guard;
 catch_unwind(AssertUnwindSafe(||unsafe{run(argc,argv)})).unwrap_or_else(|_|err(b"ERR|panic\0"))
}
unsafe fn run(argc:u32,argv:*const *const c_char)->*const c_char {
 if argc!=1{return err(b"ERR|argc\0")}
 if argv.is_null(){return err(b"ERR|argv\0")}
 let p=unsafe{*argv}; if p.is_null(){return err(b"ERR|null\0")}
 let mut input=[0u8;CAP]; let mut n=0;
 loop {let b=unsafe{*p.add(n)} as u8; if b==0{break} if n==CAP{return err(b"ERR|size\0")}
 if !(32..=126).contains(&b){return err(b"ERR|ascii\0")} input[n]=b;n+=1;}
 let s=&input[..n];
 let result=if s==b"1|version"{b"OK|1|echo".as_slice()}else if let Some(x)=s.strip_prefix(b"1|echo|"){x}else{return err(b"ERR|protocol\0")};
 let out=unsafe{&mut *OUT.0.get()};out[..result.len()].copy_from_slice(result);out[result.len()]=0;out.as_ptr().cast()
}
