# Serialize before opening map output

`DMM.to_file()` now calls the existing `to_bytes(tgm=...)` exactly once, then
writes those bytes with the original destination-path/inode behavior. The
serializer cache, serializers, parser, and `to_bytes()` are unchanged.

## Boundary

- Presave, serialization, UTF-8 encoding, or buffer failures happen before the
  destination is opened. Existing bytes survive; an absent destination stays
  absent. This fixes the reproduced `tools/UpdatePaths` truncation on a
  parser-accepted sparse TGM fixture.
- This is **not an atomic write**. After serialization succeeds, opening the
  destination path still truncates it. Destination write, flush, or close failures
  can leave partial or complete new bytes despite an exception. There is no
  rollback, concurrent-writer protection, or crash/power-loss durability claim.
- Presave checks still run once, before opening the destination. Their in-memory
  repairs remain visible after a later failure; this does not roll back the map
  object. Serialization now precedes destination validation, so its exception
  can take precedence over a destination-opening error.
- The existing text wrapper uses UTF-8 and `newline='\n'`. Binary output writes
  those already encoded bytes without a second newline/encoding transformation.
- Normal `open` behavior is retained: symlinks are followed, hardlink aliases
  share the updated inode, existing inode ownership/permissions/metadata are not
  replaced or copied, and new-file permissions follow the current umask. Normal
  OS effects of writing still apply. No directory listing, sibling temporary,
  rename permission, `chmod`, `chown`, or platform restriction is introduced.
- `to_file` now honors a `to_bytes` subclass override. Before adding these tests,
  a whole-repository Python search found no `DMM` subclasses or `to_bytes`/
  `_presave_checks` overrides. The existing benchmark that replaces `DMM.to_file`
  to prohibit map writes remains unaffected.

### Separate limitations

`save_dmm` still catches a missing-grid `KeyError`, prints a message, and accepts
an incomplete row. Buffering cannot reject output the serializer considers
successful. This behavior is tested unchanged, not repaired here. The separate
merge-driver writer and Git index/worktree transaction ordering are also outside
this change.

## Validation

Run from the repository root with Python and `bidict==0.22.0` installed:

```sh
PYTHONPATH=tools python -B -m unittest \
  mapmerge2.test_file_write_integrity \
  mapmerge2.test_writer_callers \
  mapmerge2.test_serializer_key_cache \
  mapmerge2.test_remove_unused_keys
```

Recorded result: 55 tests passed, including 22 new write-integrity tests.

All writes in the new tests use disposable fixtures. They cover both formats,
existing/new destinations, Unicode and newline byte equality, one presave and
serialization call, presave mutation, allocation/serialization/encoding and
buffer flush/close failures, actual `UpdatePaths`, and baseline destructive
failure reproduction. They also retain and demonstrate destructive destination
write/flush/close failures rather than claiming atomicity.

Linux tests verify symlinks (including a dangling link), hardlinks, inode,
owner/group, ordinary modes, a user xattr, new-file umask, read-only destinations,
and parents with write/search-only or read/search-only access. No live maps,
servers, saves, databases, hooks, or engine runs are used. Windows-native ACLs
were not exercised; the production implementation uses the original open/write
inode semantics and introduces no Linux-only API. Some permission tests are
platform-gated, and Windows symlink tests require native symlink permission.

## Buffering cost

Measured 2026-10-22 on Linux, CPython 3.12.14, bidict 0.22.0, against the streaming
algorithm at `182d6454d7569e3a38514fed2c8d9c75aaeb27f2`. Maps were read only;
outputs were disposable. All eight map/format output comparisons were exactly
byte-equal (roguetest, rogueworld, deserttown, and dun_worldredux; TGM and DMM).

The largest checked-in `_maps/*.dmm` input by bytes was
`_maps/map_files/dun_world/dun_worldredux.dmm`, SHA-256
`a7e769a1a9cd6bb79362ed0c79c82dda74fc3476edcbd00bd51bfd50232600c2`.

| Format | Output bytes | Streaming peak | Buffered peak | Median streaming / buffered |
| --- | ---: | ---: | ---: | ---: |
| TGM | 5,369,128 | 4,022,626 B | 8,949,770 B | 544 / 829 ms |
| DMM | 4,587,162 | 3,971,033 B | 7,681,646 B | 375 / 473 ms |

Peaks are separate `tracemalloc` measurements from an already parsed map,
including presave, the serializer cache, output, and Python file buffers. They
exclude parsing and later equality/hash checks, and are not process RSS or game
memory. Timings are three alternating untraced samples per path after warmup,
not a performance guarantee. The repair intentionally spends memory proportional
to the complete encoded output and adds buffering time; it is a correctness
tradeoff, not a serialization-speed optimization.
