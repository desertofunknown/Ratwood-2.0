//! Sparse fixed-direction snapshot protocol. Parse/validate uses fixed stack storage.
use kernel::{Identity,dm_replay::{Input,Node}};
const MAX:usize=144;
#[derive(Clone,Copy,Default)]
struct Candidate{target:usize,cost:u32,allowed:bool}
#[derive(Clone,Copy,Default)]
struct Row{expand:bool,z:i32,h:u32,range:u32,c:[Candidate;4]}
pub struct Parsed{pub id:Identity,pub ttl:u64,n:usize,start:usize,goal:usize,exclude:Option<usize>,max:f32,depth:f32,min:f32,multi:bool,rows:[Row;MAX]}
type Result<T>=std::result::Result<T,()>;
fn next<'a>(it:&mut impl Iterator<Item=&'a str>)->Result<&'a str>{it.next().ok_or(())}
fn uint(s:&str)->Result<u64>{if s.is_empty()||s.len()>20||!s.bytes().all(|b|b.is_ascii_digit()){return Err(())}s.parse().map_err(|_|())}
fn index(s:&str,n:usize)->Result<usize>{let v=uint(s)?;if v>=n as u64{Err(())}else{Ok(v as usize)}}
fn boolean(s:&str)->Result<bool>{match s{"0"=>Ok(false),"1"=>Ok(true),_=>Err(())}}
fn float(s:&str)->Result<u32>{if s.len()!=8||!s.bytes().all(|b|b.is_ascii_hexdigit()){return Err(())}let b=u32::from_str_radix(s,16).map_err(|_|())?;let f=f32::from_bits(b);if f.is_finite()&&f>=0.0{Ok(b)}else{Err(())}}
fn z(s:&str)->Result<i32>{let digits=s.strip_prefix('-').unwrap_or(s);if digits.is_empty()||digits.len()>10||!digits.bytes().all(|b|b.is_ascii_digit()){return Err(())}s.parse().map_err(|_|())}
pub fn parse(req:&str)->Result<Parsed>{
 if req.len()>65536||!req.bytes().all(|b|(32..=126).contains(&b)){return Err(())}
 let mut sections=req.split(';');let mut h=next(&mut sections)?.split('|');
 if next(&mut h)?!="2"||next(&mut h)?!="submit"{return Err(())}
 let mut ids=[0;7];for v in &mut ids{*v=uint(next(&mut h)?)?;}
 let ttl=uint(next(&mut h)?)?;if ttl>10000{return Err(())}
 let n=uint(next(&mut h)?)?;if n==0||n>MAX as u64{return Err(())}let n=n as usize;
 let start=index(next(&mut h)?,n)?;let goal=index(next(&mut h)?,n)?;
 let ex=next(&mut h)?;let exclude=if ex=="-"{None}else{Some(index(ex,n)?)};
 let max=f32::from_bits(float(next(&mut h)?)?);let depth=f32::from_bits(float(next(&mut h)?)?);let min=f32::from_bits(float(next(&mut h)?)?);let multi=boolean(next(&mut h)?)?;
 if h.next().is_some(){return Err(())}
 // Checked size cap even though n is already bounded; keep budget tied to adapter.
 let dense=n.checked_mul(n.checked_add(1).ok_or(())?).and_then(|v|v.checked_mul(5)).ok_or(())?;
 if dense>104400{return Err(())}
 let mut rows=[Row::default();MAX];
 for row in &mut rows[..n]{let mut f=next(&mut sections)?.split(',');row.expand=boolean(next(&mut f)?)?;row.z=z(next(&mut f)?)?;
  if row.expand{row.h=float(next(&mut f)?)?;row.range=float(next(&mut f)?)?;
   for c in &mut row.c{c.target=index(next(&mut f)?,n)?;c.cost=float(next(&mut f)?)?;c.allowed=boolean(next(&mut f)?)?;}
   for i in 0..4{let c=row.c[i];if c.target==goal&&c.cost!=row.h{return Err(())}for previous in &row.c[..i]{if previous.target==c.target&&(previous.cost!=c.cost||previous.allowed!=c.allowed){return Err(())}}}
  }
  if f.next().is_some(){return Err(())}
 }
 if sections.next().is_some()||!rows[start].expand||!rows[goal].expand{return Err(())}
 for row in &rows[..n]{if row.expand{for c in row.c{if c.allowed&&!rows[c.target].expand{return Err(())}}}}
 Ok(Parsed{id:Identity{request:ids[0],round:ids[1],requester:ids[2],requester_generation:ids[3],scene_revision:ids[4],target_revision:ids[5],capability_revision:ids[6]},ttl,n,start,goal,exclude,max,depth,min,multi,rows})
}
impl Parsed{
 // Only callable with a fully validated Parsed (private fields).
 pub fn into_input(self)->Input{
  let nodes=self.rows[..self.n].iter().map(|r|{let mut d=vec![0.0;self.n+1];let mut a=vec![false;self.n+1];let mut candidates=[None;4];if r.expand{for(i,c)in r.c.iter().enumerate(){d[c.target]=f32::from_bits(c.cost);a[c.target]=c.allowed;candidates[i]=Some(c.target);}d[self.goal]=f32::from_bits(r.h);}
   Node{z:r.z,goal_distance:f32::from_bits(r.range),candidates,distance:d,allowed:a}
  }).collect();
  Input{nodes,start:Some(self.start),goal:Some(self.goal),exclude:self.exclude,maxnodes:self.max,supplied_depth:self.depth,mintargetdist:self.min,allow_multiz:self.multi}
 }
}
