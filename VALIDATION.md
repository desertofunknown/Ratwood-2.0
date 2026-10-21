# Development validation

Use separate evidence for frontend behavior, DM source checks, compilation and
live game behavior. Passing one layer does not establish the others.

## Reproducible checks without starting the game

The frontend package manager is pinned to Bun 1.2.16 in `tgui/package.json`.
With Bun, Node and Python 3 installed, run from the repository root:

```sh
cd tgui
bun install --frozen-lockfile --ignore-scripts
bun test
bun run tgui:tsc
bun run tgui:build
bun run tgui:test-lint
bun run tgui:lint
cd ..
bun test tools/build/build-dependencies.test.js
python3 -m unittest discover -s tools/ci -p 'test_*.py'
```

Installation fetches dependencies. The production build generates frontend
assets; it does **not** run typechecking, tests or lint implicitly. The lint
command reports findings without fixing files. Full lint currently has existing
findings: record its exit status and distinguish those from new findings rather
than describing the entire check set as green.

The build-dependency tests execute only the argument parser and dependency
predicates, not the build entry point. In particular, `dm-test` is not a planning
or compile-only command: it launches DreamDaemon. Do not substitute it for the
engine-free test above.

## Regression coverage

- [Changes loading and filtering](tgui/docs/changelog-loading.md): failed and stale
  requests, bounded retries, archive-shape validation and current-month search.
- [Blueprint import](tgui/docs/blueprint-import.md): malformed records/fields and
  preserving editor state when import fails.
- [List keyboard shortcuts](tgui/docs/list-input-shortcuts.md): uppercase keys,
  repeated-letter cycling, focus/search changes and exact submitted choices.
- [Text newline normalization](tgui/docs/text-input-newlines.md): all separated
  newline runs and actual modal submission payloads.
- [Number input validity](tgui/docs/number-input-validity.md): invalid drafts,
  bounds/reset recovery and submission, without changing production behavior.
- [Drag lifecycle patch](tgui/docs/drag-lifecycle-patch.md): maintained dependency
  patch and cancellation/resource-cleanup regressions.
- `tools/ci/test_*.py`: merchant paths, exact-case resource references, recipe
  ordering, navaja state and projectile embedding contracts. These are static
  source checks or narrow source-derived models, **not DM execution**. Fixture
  documentation under `tools/ci/fixtures/` records scope and upstream attribution.

Mounted frontend tests use happy-dom and synthetic events. Some suites isolate
layout/module mocks in a child process; the outer suite counts such a child as
one test. Report outer and focused child counts separately, never add them as
independent coverage. See [Writing tests](tgui/docs/writing-tests.md).

## Compile and acceptance boundaries

DreamMaker 516.1673 compiled the default-map project with `-DCBT`, zero errors
and zero warnings for the source published as
`76bd92c5fdb004c9f6f6004c03b6eede675a8243`. That compile does not
establish fresh `ALL_MAPS` or `ALL_TEMPLATES` coverage, and should not be treated
as validation of later changed DM source.

For future DM changes, record the exact source revision, compiler version,
defines, generated resources, exit status and diagnostics. Keep compilation
separate from DreamDaemon tests and DreamSeeker acceptance. Compiler success does
not prove combat, construction, cooking, persistence, networking or native UI
behavior.

No native-client or live-game acceptance is established by these checkpoints.
Runtime validation requires a disposable environment with verified filesystem
and network isolation, no live saves/databases and no exposed public listener.
If those controls cannot be verified, stop before engine launch and retain the
validation gap. Existing GitHub workflows may include runtime/database tasks;
inspect their scope before enabling or invoking them. An absent workflow run or
empty commit-status list is not a successful CI result.
