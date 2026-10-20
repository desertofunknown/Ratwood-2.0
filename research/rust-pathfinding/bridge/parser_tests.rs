mod wire;
use std::{alloc::{GlobalAlloc,Layout,System},cell::Cell};
thread_local!{static TRACK:Cell<bool>=const{Cell::new(false)};static COUNT:Cell<usize>=const{Cell::new(0)};}
struct Meter;
unsafe impl GlobalAlloc for Meter{
 unsafe fn alloc(&self,l:Layout)->*mut u8{let _=TRACK.try_with(|t|{if t.get(){COUNT.with(|n|n.set(n.get()+1))}});unsafe{System.alloc(l)}}
 unsafe fn dealloc(&self,p:*mut u8,l:Layout){unsafe{System.dealloc(p,l)}}
 unsafe fn realloc(&self,p:*mut u8,l:Layout,n:usize)->*mut u8{let _=TRACK.try_with(|t|{if t.get(){COUNT.with(|n|n.set(n.get()+1))}});unsafe{System.realloc(p,l,n)}}
}
#[global_allocator]static ALLOC:Meter=Meter;
fn parse_checked(raw:&str,valid:bool){COUNT.with(|n|n.set(0));TRACK.with(|t|t.set(true));let parsed=wire::parse(raw);TRACK.with(|t|t.set(false));assert_eq!(COUNT.with(|n|n.get()),0,"parser heap allocation");assert_eq!(parsed.is_ok(),valid);if let Ok(p)=parsed{assert!(p.ttl<=10000);assert!(p.id.request>0);assert_eq!(p.into_input().nodes.len(),144);}}
#[test]fn all_eight_captures_parse_without_heap(){for path in std::fs::read_dir("payloads").unwrap(){let path=path.unwrap().path();if !path.file_name().unwrap().to_str().unwrap().starts_with("bad_"){parse_checked(&std::fs::read_to_string(path).unwrap(),true);}}}
#[test]fn malformed_captures_reject_without_heap(){for path in std::fs::read_dir("payloads").unwrap(){let path=path.unwrap().path();if path.file_name().unwrap().to_str().unwrap().starts_with("bad_"){parse_checked(&std::fs::read_to_string(path).unwrap(),false);}}}
#[test]fn strict_shapes_and_fields(){let raw=include_str!("payloads/human_npc_open_short.txt");for bad in [raw.replace("2|submit|","3|submit|"),raw.replacen("00000000","+0000000",1),raw.replace(";0,1",";0,1,0"),raw.replacen(";0,1",";0,+1",1),raw.replacen(";1,1,",";1,2147483648,",1)]{parse_checked(&bad,false)}}
#[test]fn no_truncation_and_owned_conversion(){let raw=std::fs::read_to_string("payloads/human_npc_open_short.txt").unwrap();let p=wire::parse(&raw).unwrap();let input=p.into_input();drop(raw);assert_eq!(input.nodes.len(),144);assert_eq!(input.nodes[13].candidates[1],Some(1));assert!(!input.nodes[13].allowed[1]);}
