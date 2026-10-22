# Loudmouth headcover worn atlas

Ported from Sauna (Sauna38), upstream commit
[`8e4ae2648be78aba40084d2e7ab074e46d5cf15d`](https://github.com/Rotwood-Vale/Ratwood-2.0/commit/8e4ae2648be78aba40084d2e7ab074e46d5cf15d),
merged in [PR #3124](https://github.com/Rotwood-Vale/Ratwood-2.0/pull/3124).
Existing repository licensing and asset attribution are unchanged.

The Loudmouth headcover inherits both head and mask slots. Its head-slot atlas
already contains the normal, adjusted and detail sprites, but the mask-slot
fallback atlas contains none of those states. The single `mob_overlay_icon`
assignment selects the existing head atlas when worn in either slot. The nurse
veil parent is unchanged. No sprites, slots, coverage flags, armor values,
colors, adjustment logic or layer settings are changed; the worn-icon consumer
explicitly excludes this override when selecting an in-hand atlas.

Run `python3 tools/ci/test_loudmouth_overlay.py`. These standard-library tests
read the exact type assignment, the real worn-icon selection contract and the
checked-in DMI metadata. All four states must have four directions and one
frame. The unpatched source fails the assignment assertion. This is static
source/asset validation, not DM execution or a rendered character test.

Compile-only validation cannot establish native appearance. Future isolated
client acceptance should cover head → mask → head, open/closed adjustment in
both slots, all four directions, and wearing another hat simultaneously,
including the existing obscuring and layer rules.
