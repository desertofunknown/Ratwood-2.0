# Navaja damage-state correction

Ported from ariaworld's upstream commit
[`720e3c5b6bd0c8fecea34681292be48594569a96`](https://github.com/Rotwood-Vale/Ratwood-2.0/commit/720e3c5b6bd0c8fecea34681292be48594569a96).
The base folding navaja now assigns `force_dynamic` alongside its existing
`force = 20` when opened and `force = 5` when closed. This matches the existing
Freifechter variant; that variant is unchanged.

Item initialization caches damage through `update_force_dynamic()`, and the
actual `get_complex_damage` routine starts from `I.force_dynamic`. Previously,
the base knife's folding action changed `force` but could leave that cache stale.
The fix intentionally changes the damage state consumed after folding, not the
20/5 balance constants. Defense, throw damage, size, icons, sounds, sharpness,
storage delays, initialization and all other source bytes remain unchanged.

Run `python3 tools/ci/test_navaja_state.py`. It extracts the real toggle branches'
literal damage assignments and checks opening, closing and repeated toggles for
both variants, including stale starting caches. This is a narrow source-based
state model, not a DM interpreter or combat simulation. Compile-only validation
does not establish live hits, armor outcomes, wielding or broken-weapon behavior.
