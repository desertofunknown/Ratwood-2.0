# Blueprint import boundary checks

The Paste Blueprint workflow decodes JSON supplied by the player. Its cell filter
verifies each entry is a non-null record before reading coordinates and accepts
only numeric or absent directions. Rejected entries are filtered out; a design
with no valid cells keeps the existing error message and current editor design.

Floor metadata uses the existing numeric conversion and 2–4 clamp. If conversion
throws, the import shows the existing invalid-blueprint error before changing
editor state. The packed design uses a dictionary without inherited properties,
so string type names such as `constructor` cannot collide with object members.
These checks fix observed handler/save crashes without changing valid exported
coordinates, numeric directions, tile order, duplicates or normal floor counts.

Run `bun test packages/tgui/__tests__/blueprint-import.test.tsx` from `tgui`.
The mounted tests use the production planner, core controls and backend with an
isolated layout shell. They cover invalid cell/direction shapes, floor conversion,
special type names, existing bounds rules, mixed imports, recovery/cancellation,
and exact saved payloads. Importing alone sends no backend action.

This is not a replacement import schema: numeric coordinate/direction policy and
successfully coercible floor metadata retain existing behavior. The tests do not
establish native-client visuals, construction or server-side blueprint validation.
