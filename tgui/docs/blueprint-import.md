# Blueprint import shape regression

The Paste Blueprint workflow decodes JSON supplied by the player. Its existing
cell filter now verifies that each entry is a non-null record before reading
coordinates. A null entry previously threw inside the click handler. Rejected
entries continue to be filtered out; a design with no valid cells keeps the
existing error message and leaves the current editor design unchanged.

Run `bun test packages/tgui/__tests__/blueprint-import.test.tsx` from `tgui`.
The mounted tests use the production planner, core controls and backend with an
isolated layout shell. They cover null/primitive/array entries, existing missing
field/bounds rules, mixed imports, recovery/cancellation and exact saved payload
order, directions and floor count. Importing alone sends no backend action.

This is a narrow null-record crash fix, not a replacement import schema or a
change to coordinate, direction or floor-count policy. Tests do not establish
native-client visuals, actual construction or server-side blueprint validation.
