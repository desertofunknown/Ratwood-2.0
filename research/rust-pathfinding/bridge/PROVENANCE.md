# Bridge source and fixture provenance

License: AGPL-3.0, as retained in ../LICENSE and ../PROVENANCE.md.
Original portable research baseline: research/rust-pathfinding at 9472d11 in
private desertofunknown/Ratwood-2.0. The original crate code is unchanged;
repository attribution in the parent provenance has been corrected.

These source-only bridge modules and disposable DM harnesses were developed as an
isolated research extension. The replay kernel remains the parent crate's source;
only a generated build copy receives an explicit 2 MiB thread-stack setting.

Eight numeric fixtures derive from the previously verified sealed-floor/wall
human-NPC capture at game commit 17a113941a81968bfe58820c1e7fd2791d72a78b,
BYOND 516.1673, real_snapshot_v1 / sealed_floor_wall_human_v1.
Original raw export SHA256:
4be860a2ae380a911fea05e9ae0ecb15479834245a803a036a39584731f20068

The original capture is not bundled. It included object references/fingerprints
unnecessary for transport. Bundled requests contain only normalized node topology,
z, costs, directional permissions and parameters. No art, maps, save data, account
information, live entities, raw fingerprints or object-reference strings remain.
Two complete independent captures and original/wrapped/original outcomes matched
before fixture extraction. Initial importer verified closure, finite exact f32
values, full directional capture and candidate-to-goal consistency. The wire
parser independently validates the transport's own bounds and closure again.

Expected outcomes in cases.json come from those frozen DM controls; request
construction uses capture node data rather than expected routes or observed
callback traces. The seven exact u64 identities are harness-generated transport
probes; they do not purport to identify a live entity/revision. Fourteen separate
malformed fixtures exercise fail-closed parser boundaries.

Captured eight-scene transport parity was verified through actual BYOND call_ext,
direct Rust replay and frozen DM controls. Live exporter capture consistency,
current-world application safety, native production latency and unload/reboot
ordering are unverified and outside this checkpoint.
