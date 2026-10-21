# Projectile embedding return contract

Ported only the embedding-result hunk from SirSwagmeyer's upstream commit
[`717893d12cb4844d9931b1e79d539c49b05ecdb7`](https://github.com/Rotwood-Vale/Ratwood-2.0/commit/717893d12cb4844d9931b1e79d539c49b05ecdb7).
The unrelated armor-formula changes in that commit are not included.

Carbon projectile embedding now returns the bodypart's actual acceptance result.
Previously it returned success even when `add_embedded_object` refused an item,
including its `can_embed`, GODMODE or pierce-immunity guards. The existing caller
uses a false result to run `handle_drop`; reusable ammunition's implementation
moves its existing dropped item to turf, with a repeated-drop guard. Successful
embedding still returns true. Damage, the effective-damage threshold of eight,
probability, traits, wounds, armor formulas and all other production bytes remain
unchanged. This intentionally restores the fallback on a rejected attempt.

Run `python3 tools/ci/test_projectile_embed.py`. The test accepts only the exact
current guard and call syntax, models its boolean return with a stubbed chance
and bodypart result, and checks all guard combinations and damage boundaries.
It verifies rejection-before-mutation and the existing caller/drop contracts.
The original unconditional-success form is retained in memory as a sensitivity
check. This is not a DM interpreter or an in-game projectile simulation.
Compiler-only validation does not demonstrate live ammunition recovery, turf
movement, projectile cleanup or combat outcomes.
