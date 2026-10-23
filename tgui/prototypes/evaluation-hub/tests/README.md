# Evaluation hub verification

This isolated suite uses Python's standard library and the existing Node runtime.
It does not join the production test runner, start a preview or game server, install
packages, or visit any study route.

Run from any directory:

    python3 /path/to/tgui/prototypes/evaluation-hub/tests/check_hub.py

The suite builds into uniquely named temporary directories under `.test-build/`, never into the
default distribution. Its own temporary files are removed when the run exits.
Its contracts cover:

- Approved same-origin route inventory, exact React/Svelte pairs, and separate Lua
  research. The approval inventory is an input, not evidence of browser reachability.
- Three journey groups, uniquely identifiable navigation targets, and unique
  accessible names for study links.
- Static HTML with restrictive CSP; no script, form, executable event attributes,
  remote asset references, or live-game integration.
- Semantic heading order, unique IDs, named links, skip navigation, and valid
  fragment targets. These are source checks, not a screen-reader audit.
- Manifest file sizes and hashes, complete output coverage, exact source mirrors,
  and byte-for-byte reproducibility across independent builds, including a
  clean rebuild using only the packaged sources.
- Rejection of malformed or incomplete route inventories.
- Unchanged tracked production and earlier prototype files across the build.

Browser verification remains a separate gate: desktop and narrow layouts,
keyboard traversal and visible focus, skip-link behavior, contrast, overflowing
content, actual destination availability, and any CSP/network console failures.
Do not describe these source checks as visual or interactive browser verification.
