//! Generated from actual DM numeric observations; do not hand-edit expected bits.
//! runtime SHA256 0e5b06375c9e057ba590a8dcc739d98a32fd28f70503cd1969c137eb3d2c2fcf
//! initial SHA256 23382749167d6a383de3d57d2b1feed0b755c1ce8bbbc374e74616613af8c30f
use super::*;
#[test] fn pinned_dm_runtime_numeric_gate() {
let rows: &[[u32; 8]] = &[
[1036831949,1045220557,1065395159,1045287666,1050287276,1050287276,3184315597,1036831949],
[1065353216,1000593162,1065395159,1000646849,1065395369,1065395369,1065269330,3212752978],
[1266679808,1065353216,1065395159,1065395159,1266679809,1266679809,1266679807,3414163455],
[1266679808,1077936128,1065395159,1077999042,1266679810,1266679810,1266679805,3414163453],
[1266679807,1065353216,1065395159,1065395159,1266679808,1266679808,1266679806,3414163454],
[897988541,1203982336,1065395159,1204046336,1204046336,1204046336,3351465984,1203982336],
[1203982336,897988541,1065395159,898032521,1203982336,1203982336,1203982336,3351465984],
];
for row in rows {
let g=std::hint::black_box(f32::from_bits(row[0]));
let h=std::hint::black_box(f32::from_bits(row[1]));
let factor=1.0_f32+0.005_f32; let product=h*factor; let separate=g+product;
let got=[g.to_bits(),h.to_bits(),factor.to_bits(),product.to_bits(),separate.to_bits(),weight(g,h).unwrap().to_bits(),(g-h).to_bits(),(h-g).to_bits()];
assert_eq!(&got,row);
}
}
#[test] fn pinned_dm_half_index_round_gate() {
let expected: &[usize] = &[0, 0, 1, 1, 2, 2, 3, 3, 4, 4];
for (i,e) in expected.iter().enumerate() { assert_eq!(i/2,*e); }
}
#[test] fn pinned_dm_literal_numeric_gate() {
let observed=[1000593162u32,1065395159u32,1266679808u32,1050253722u32];
let v=std::hint::black_box(16777216.0_f32);
let got=[0.005_f32,1.0_f32+0.005_f32,v+1.0_f32,0.1_f32+0.2_f32].map(f32::to_bits);
assert_eq!(got,observed);
}
