# Merchant catalog correction

The four cultural catalog files incorporate the 15 item-path corrections from
[Rotwood-Vale/Ratwood-2.0 PR #3096](https://github.com/Rotwood-Vale/Ratwood-2.0/pull/3096)
by Gug1234 (changelog credit: Yuckuza), merged as
[`8840e95204356f111007ace9484b35f37e0fe41b`](https://github.com/Rotwood-Vale/Ratwood-2.0/commit/8840e95204356f111007ace9484b35f37e0fe41b).
No other upstream changes or license changes are included.

This is an intentional purchased-item correction, not a cosmetic rename or a
behavior-preserving optimization. Hammerhold supplies the intended steel/spiked
mauls, iron plate/helmet and smith plate; Aavnr supplies Freifechter equipment and
jackchains; Zybantium supplies the bronze makhaira. These existing item types can
have different armor, damage, durability, weight and other equipment properties
from the items previously supplied. Their definitions are unchanged here.
Gronn's offer intentionally keeps the cultural label **Zayran Battleaxe** while
supplying the existing **Bearded Axe** (`woodcut/steel/atgervi`).

Prices, shipment quantities, ordered kit sizes, offer metadata and realm
registration remain unchanged. The standalone Aavnr fencing boots/gloves were
not registered in its realm stock list and are still not added; its registered
Freifechter kit receives the corrected items.

Run `python3 tools/ci/test_merchant_catalog.py` for the static contracts. The JSON
fixture pins the ten affected offers, including all ordered contents and explicit
fields. Tests also check source definitions in DME-included files, existing realm
registration counts and the intentional Gronn label mismatch. These are lexical
source checks, not a DM preprocessor/compiler, runtime purchase test or balance
validation. Update the fixture deliberately if changing these offers later.
