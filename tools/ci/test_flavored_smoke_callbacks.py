"""Source-bound flavored-cigarette callback regression; never executes DM.

Run from a checkout: python3 tools/ci/test_flavored_smoke_callbacks.py
--repo and --drug-source support baseline and scratch candidate comparisons.
Models only type inheritance, selected stress-event dispatch, and the holder's
start-metabolizing gate. Not a DM interpreter, smoking simulation, dose model,
health/stress calculation, native compile, runtime, or proof of per-puff timing.
Exact source pins fail closed when relevant code changes. All original drug
fields/procs and orphan types remain untouched. No balance changes are modeled.
"""
import argparse
import hashlib
import os
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
DRUG_SOURCE = None
DRUG = 'code/modules/reagents/chemistry/reagents/drug_reagents.dm'
CIGS = 'code/game/objects/items/cigs_lighters.dm'
BASE = 'code/modules/reagents/chemistry/reagents.dm'
HOLDER = 'code/modules/reagents/chemistry/holder.dm'
PREFIX = '/datum/reagent/drug/'
FOOD = PREFIX + 'food_reagent'
FLAVORS = ('mentha', 'blackberry', 'apple')
CIG = '/obj/item/clothing/mask/cigarette'
VARIANTS = {flavor + suffix: (flavor,) for flavor in FLAVORS
            for suffix in ('', '/cheroot')}
VARIANTS.update({name: ('apple', 'mentha')
                 for name in ('menthaapple', 'menthaapple/cheroot')})
# Filled once from reviewed source, not recomputed from the tested checkout.
BASELINE_DRUG_HASH = 'ff5bddfb4b59e1b25e48acac22cf0c6bbcd4a42a8c51185d52953de5eed77fdb'
PINS = {('code/game/objects/items/cigs_lighters.dm', '/obj/item/clothing/mask/cigarette'): '2b0bc6cc1b37d637089df0c33eb5459728d812effbbd72d1d812e9b5bf7dc349',
 ('code/game/objects/items/cigs_lighters.dm', '/obj/item/clothing/mask/cigarette/rollie'): 'fdfc5441c82629cdb7e628e5e5cca5c19206f9c9f6ddd75316fd5322b20b85e6',
 ('code/game/objects/items/cigs_lighters.dm', '/obj/item/clothing/mask/cigarette/Initialize(mapload)'): 'fd6523ffbe284cc875023ccf8cceba4e6c642d7d31e242aa5700a87636ceee9d',
 ('code/game/objects/items/cigs_lighters.dm', '/obj/item/clothing/mask/cigarette/proc/handle_reagents()'): '4924e7e78ced85c79649d9a928aebb0b5d7436c5325e78b3a8d20476ad599ad8',
 ('code/game/objects/items/cigs_lighters.dm', '/obj/item/clothing/mask/cigarette/process()'): '0dfc6b83331096ec96b30ec109eb851ffc736373c49c64062fcc5ad5c11a7549',
 ('code/game/objects/items/cigs_lighters.dm', '/obj/item/clothing/mask/cigarette/rollie/mentha'): '205fc104383451286766925027f24ce93192f0d7c8688a39125dfd1a30a15631',
 ('code/game/objects/items/cigs_lighters.dm', '/obj/item/clothing/mask/cigarette/rollie/mentha/cheroot'): '35916494a56dd12fb5a99056ec0c34cb1629bb3971ad4eea2c780e95060bbaa6',
 ('code/game/objects/items/cigs_lighters.dm', '/obj/item/clothing/mask/cigarette/rollie/blackberry'): '925c86da518d0ef23b42d4b9cc98c203f6995276776004c882206b5e10320f79',
 ('code/game/objects/items/cigs_lighters.dm', '/obj/item/clothing/mask/cigarette/rollie/blackberry/cheroot'): '1bfc7ec69b9032721c80f147cbd97ddf8e08a77412948fbdacabb00a559a1278',
 ('code/game/objects/items/cigs_lighters.dm', '/obj/item/clothing/mask/cigarette/rollie/apple'): 'f14825551c9a64a94be9da8a6ca6732b137a9cac2167c836304bac601a980540',
 ('code/game/objects/items/cigs_lighters.dm', '/obj/item/clothing/mask/cigarette/rollie/apple/cheroot'): 'f72e55234942a2bc1ef69531035fe3b2f00bdfce70c8472d07a7fa1ea021c41a',
 ('code/game/objects/items/cigs_lighters.dm', '/obj/item/clothing/mask/cigarette/rollie/menthaapple'): 'f4297c8a7806e9e6b0489cbf0f59a4d12adb101784c62e9373fc488e1976ee05',
 ('code/game/objects/items/cigs_lighters.dm', '/obj/item/clothing/mask/cigarette/rollie/menthaapple/cheroot'): '64523535cedf9e4b169f2a74df58f9f82fc567a893cdddc78febcd8320eb4143',
 ('code/game/objects/items/cigs_lighters.dm', '/obj/item/clothing/mask/cigarette/rollie/chocolate'): 'ca1cd5774ac2fd2526cf4909115f3dbf190bf4dd18bed89902d3561c0df1dd77',
 ('code/game/objects/items/cigs_lighters.dm', '/obj/item/clothing/mask/cigarette/rollie/chocolate/cheroot'): '7b1c420f282e64e80008e8ae74e0018f1a8e84e01ee0083115dc2aa9caae60fc',
 ('code/modules/reagents/chemistry/reagents.dm', '/datum/reagent'): '20a1f7c257c58a947c810e23fe244487f333d30bd762d0dd63d37476ee2981ec',
 ('code/modules/reagents/chemistry/reagents.dm', '/datum/reagent/Destroy()'): '1b0b3cb66f65890ae434d8db1eb32333fc78fc59f98058e930f821bfb49be77c',
 ('code/modules/reagents/chemistry/reagents.dm', '/datum/reagent/proc/on_mob_metabolize(mob/living/L)'): '84891d8648bf505d45953dfa2050b92bfdfd75844bc53c307622cd4b85ab2480',
 ('code/modules/reagents/chemistry/reagents.dm', '/datum/reagent/proc/on_mob_end_metabolize(mob/living/L)'): '84891d8648bf505d45953dfa2050b92bfdfd75844bc53c307622cd4b85ab2480',
 ('code/modules/reagents/chemistry/reagents.dm', '/datum/reagent/proc/on_mob_life(mob/living/carbon/M)'): '4041eea8d8b9a79263f0aca745f820c2445771214cba1ef7d21b426d872d0374',
 ('code/modules/reagents/chemistry/reagents.dm', '/datum/reagent/proc/overdose_process(mob/living/M)'): '84891d8648bf505d45953dfa2050b92bfdfd75844bc53c307622cd4b85ab2480',
 ('code/modules/reagents/chemistry/holder.dm', '/datum/reagents/proc/trans_to(obj/target, amount = 1, multiplier = 1, preserve_data = TRUE, no_react = FALSE, mob/transfered_by, remove_blacklisted = FALSE, method = null, show_message = TRUE, round_robin = FALSE, prepend = FALSE)'): '8466cfef41d7799e8edb07c51c7a6e50208d126863c9a48515d3b0f411a141a7',
 ('code/modules/reagents/chemistry/holder.dm', '/datum/reagents/proc/metabolize(mob/living/carbon/C, can_overdose = FALSE, liverless = FALSE)'): 'c8a10d6a93f4098037e391c94369aa284c2a13558d67097a83cbb5ca8105c133',
 ('code/modules/reagents/chemistry/holder.dm', '/datum/reagents/proc/end_metabolization(mob/living/carbon/C, keep_liverless = TRUE)'): 'c4f09e114f24f2ebafe895f012280d5674e8a863897879bf067d05f51815cbb0',
 ('code/modules/reagents/chemistry/holder.dm', '/datum/reagents/proc/del_reagent(reagent)'): 'ef606e28cc311a476a10703a44f1586349091a4b3aed039d640fd426632b9206',
 ('code/modules/reagents/chemistry/holder.dm', '/datum/reagents/proc/add_reagent(reagent, amount, list/data=null, reagtemp = 300, no_react = 0, prepend = FALSE)'): '72d4a503f1f8104b8c533d8b0522db07afe270126b89dfc706b1765b3a55d779',
 ('code/datums/stress/positive_events.dm', '/datum/stressevent/menthasmoke'): '34305494ad76a2ed9a4ea8a486f20987e15ab4efb3a6f2ca2316455937927738',
 ('code/datums/stress/positive_events.dm', '/datum/stressevent/blackberrysmoke'): '7e6702e5c97aea9fead8579437216019764baad2edc19a81086abf77970d13f9',
 ('code/datums/stress/positive_events.dm', '/datum/stressevent/applesmoke'): '0ae11ecb089448d11fd6a83415dd3cf3b6480b378b9a2d6325eec55f5e8ca260',
 ('code/datums/stress/positive_events.dm', '/datum/stressevent/chocolatesmoke'): '4286e2ca411584d8db5b7aecb18a2f271b5efa6352334b6f56b2fd77a688dc0a',
 ('code/modules/cargo/packsrogue/merchant/substances.dm', '/datum/supply_pack/rogue/substances/msigs'): '3b34054943b59f27003703ca426f0d7102f025c4e70d58166521f4d94085873c',
 ('code/modules/roguetown/roguemachine/drugmachine.dm', '/obj/structure/roguemachine/drugmachine/Initialize(mapload)'): 'a8006e1c0b464ac5f6bab6a8e33cdb3e2e9a2f2ed68843e2c0e3bfb00be427e4'}


def active(source):
    pattern = r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|//[^\n]*|/\*.*?\*/'''
    return re.sub(pattern, lambda m: '\n' * m[0].count('\n')
                  if m[0].startswith(('//', '/*')) else m[0], source, flags=re.S)


def definitions(source):
    """Narrow top-level definition locator, not a general DM parser."""
    source = active(source)
    matches = list(re.finditer(r'^(/[^\n]*?)\s*$', source, re.M))
    result = {}
    for i, match in enumerate(matches):
        header = match[1].rstrip()
        if header in result:
            raise AssertionError('Duplicate definition: ' + header)
        end = matches[i + 1].start() if i + 1 < len(matches) else len(source)
        result[header] = '\n'.join(line.rstrip() for line in
                                  source[match.end():end].splitlines() if line.strip())
    return result


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def normalize(source):
    return '\n'.join(line.rstrip() for line in active(source).splitlines() if line.strip())


def read(path):
    return (ROOT / path).read_text()


def dm_sources():
    # Include modular_*, interface, maps and future source directories.
    # Do not traverse metadata, dependency/private directories, or symlinks.
    excluded = {'.git', '.aws', '.codex', '.agents', 'node_modules', '__pycache__'}
    paths = []
    for directory, children, files in os.walk(ROOT, followlinks=False):
        children[:] = [name for name in children
                       if name not in excluded
                       and not (Path(directory) / name).is_symlink()]
        for name in files:
            path = Path(directory) / name
            if name.endswith('.dm') and not path.is_symlink():
                if not path.resolve().is_relative_to(ROOT.resolve()):
                    raise AssertionError('DM source outside repository: ' + str(path))
                paths.append(path)
    return sorted(paths)


def drug_source():
    return DRUG_SOURCE.read_text() if DRUG_SOURCE else read(DRUG)


def validate(source):
    # Permit precisely the six reviewed insertions; everything else stays pinned,
    # including original flavor callbacks, defaults, and unused orphan declarations.
    restored = source
    for flavor in FLAVORS:
        addition = ('\tparent_type = ' + FOOD + '\n\tstress_type = '
                    '/datum/stressevent/' + flavor + 'smoke\n')
        restored = restored.replace(addition, '', 1)
    if digest(normalize(restored)) != BASELINE_DRUG_HASH:
        raise AssertionError('Unreviewed drug defaults, callbacks, or declarations')
    for (path, header), expected in PINS.items():
        if digest(definitions(read(path))[header]) != expected:
            raise AssertionError('Unreviewed route/default/event: ' + header)
    return definitions(source)


def parent(path, defs):
    body = defs.get(path, '')
    match = re.search(r'^\tparent_type = (\S+)$', body, re.M)
    return match[1] if match else path.rsplit('/', 1)[0]


def lineage(path, defs):
    result = []
    while path:
        if path in result:
            raise AssertionError('Inheritance cycle')
        result.append(path)
        path = parent(path, defs)
    return result


def dispatch_event(path, defs):
    """Resolve the first applicable reviewed callback and inherited stress field."""
    ancestry = lineage(path, defs)
    for ancestor in ancestry:
        matches = [h for h in defs if h.startswith(ancestor + '/on_mob_metabolize(')]
        if matches:
            if ancestor == FOOD:
                for source_type in ancestry:
                    match = re.search(r'^\tstress_type = (\S+)$', defs.get(source_type, ''), re.M)
                    if match:
                        return match[1]
                raise AssertionError('Shared callback without stress_type')
            if ancestor == PREFIX + 'chocolate':
                return '/datum/stressevent/chocolatesmoke'
            raise AssertionError('Unreviewed callback owner: ' + ancestor)
    # /drug and /reagent have no overriding callback; pinned base proc returns.
    return None


class MetabolismProjection:
    """Only the !R.metabolizing gate; skips doses, reaction and tick side effects."""
    def __init__(self, paths, defs):
        self.paths, self.defs = paths, defs
        self.metabolizing = set()
        self.events = []

    def puff(self):
        # Pinned smoking route transfers reagent; it does not call metabolism.
        pass

    def metabolize(self):
        for path in self.paths:
            if path not in self.metabolizing:
                self.metabolizing.add(path)
                event = dispatch_event(path, self.defs)
                if event:
                    self.events.append(event)

    def end_metabolization(self):
        self.metabolizing.clear()


class FlavorCallbacks(unittest.TestCase):
    def setUp(self):
        self.source = drug_source()
        self.defs = validate(self.source)
        self.cigs = definitions(read(CIGS))

    def test_eight_producers_reach_expected_events(self):
        self.assertEqual(len(VARIANTS), 8)
        for variant, flavors in VARIANTS.items():
            with self.subTest(variant=variant):
                body = self.cigs[CIG + '/rollie/' + variant]
                produced = re.findall(r'/datum/reagent/drug/(\w+) = \d+', body)
                self.assertEqual(set(produced), {'nicotine', *flavors})
                observed = {dispatch_event(PREFIX + f, self.defs) for f in flavors}
                self.assertEqual(observed, {'/datum/stressevent/' + f + 'smoke' for f in flavors})

    def test_inheritance_membership_and_unchanged_orphans(self):
        for flavor in FLAVORS:
            with self.subTest(flavor=flavor):
                ancestry = lineage(PREFIX + flavor, self.defs)
                self.assertIn(FOOD, ancestry)
                self.assertIn('/datum/reagent/drug', ancestry)
                self.assertEqual(self.defs[FOOD + '/' + flavor],
                                 '\tstress_type = /datum/stressevent/' + flavor + 'smoke')

    def test_compiled_source_membership(self):
        dme = active(read('roguetown.dme'))
        for path in (DRUG, CIGS, BASE, HOLDER, 'code/datums/stress/positive_events.dm'):
            self.assertIn('#include "' + path.replace('/', chr(92)) + '"', dme)

    def test_chocolate_working_control(self):
        self.assertNotIn(FOOD, lineage(PREFIX + 'chocolate', self.defs))
        self.assertEqual(dispatch_event(PREFIX + 'chocolate', self.defs),
                         '/datum/stressevent/chocolatesmoke')
        for variant in ('chocolate', 'chocolate/cheroot'):
            self.assertIn(PREFIX + 'chocolate = 12', self.cigs[CIG + '/rollie/' + variant])

    def test_start_metabolism_not_every_puff_or_tick(self):
        model = MetabolismProjection([PREFIX + f for f in (*FLAVORS, 'chocolate')], self.defs)
        model.puff()
        self.assertEqual(model.events, [])
        model.metabolize()
        self.assertEqual(model.events, ['/datum/stressevent/' + f + 'smoke'
                                        for f in (*FLAVORS, 'chocolate')])
        first = model.events.copy()
        model.puff()
        model.metabolize()
        self.assertEqual(model.events, first)
        model.end_metabolization()
        model.metabolize()
        self.assertEqual(model.events, first * 2)

    def test_no_existing_food_reagent_type_test_consumers(self):
        for path in dm_sources():
            if path == ROOT / DRUG:
                continue
            self.assertNotIn(FOOD, active(path.read_text(errors="surrogateescape")), str(path))

    def test_reject_unreviewed_mutations(self):
        mutants = [self.source.replace('name = "Mentha"', 'name = "Changed"', 1),
                   self.source.replace('overdose_threshold = 999', 'overdose_threshold = 998', 1),
                   self.source.replace('carbon_mob.add_stress(stress_type)', 'return', 1),
                   self.source.replace('var/datum/stressevent/stress_type', 'var/datum/stressevent/stress_type\n\tmetabolization_rate = 2', 1)]
        if '\tparent_type = ' + FOOD in self.source:
            mutants.extend([
                self.source.replace('parent_type = ' + FOOD,
                                    'parent_type = /datum/reagent/drug', 1),
                self.source.replace('stress_type = /datum/stressevent/menthasmoke',
                                    'stress_type = /datum/stressevent/applesmoke', 1),
            ])
        for mutant in mutants:
            with self.assertRaises(AssertionError):
                validate(mutant)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', type=Path, default=ROOT)
    parser.add_argument('--drug-source', type=Path)
    args, remaining = parser.parse_known_args()
    ROOT, DRUG_SOURCE = args.repo, args.drug_source
    unittest.main(argv=[__file__, *remaining])
