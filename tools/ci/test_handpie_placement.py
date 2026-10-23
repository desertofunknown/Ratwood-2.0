"""Source-pinned handpie ordering contract and deliberately narrow Python model.

Original change: Xander3359, 7c80a1afbe5d6d8fb8211afe7035432b8a832d1a,
https://github.com/Rotwood-Vale/Ratwood-2.0/pull/3082 . Only call ordering
is adapted, not the entire commit, spawn-location change, or guard refactor.
Run: python3 tools/ci/test_handpie_placement.py [--repo ROOT] [--source FILE]
Not a DM interpreter, native compilation, runtime test, or exception equivalence
claim. The model assumes normal successful synchronous Destroy, a valid user,
and ordinary two-handed inventory. Full-file source pins fail closed on drift.
"""
import argparse
import hashlib
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = None
PATH = 'modular/Neu_Food/code/raw/raw_dough.dm'
CONFIG = {'pins': {'code/modules/mob/inventory.dm': '328b0e452a32602a78c8d4008d6dca7de7899339e19d13399f2db2ab115b1dfc', 'code/game/objects/items.dm': '16b33a1c004b95c91cdfb905c333a4cd6c2668cdca31f6b738f2b9a16daeaf7f', 'code/modules/food_and_drinks/food/snacks.dm': 'e78f3e282f79f2945c960e1c00a76df45c364e0cf9c8273d0ff13407697e26ef', 'code/modules/reagents/reagent_containers.dm': '7bb3beffe848222fb8e62b6886adf71cdf355cac7a4decedbe986c9ce7ed8778', 'code/game/atoms.dm': 'e46a3ba0ef457c8aa5705496f37c8468587ec0cf10d736d61411a320987accff', 'code/game/atoms_movable.dm': 'dd27c7366e11f3629bf176261e10b406ea6db475437aca54bce1481906e9f7b5', 'code/game/objects/objs.dm': '4e4ae4e1f74e91c85befc722abcb5058ac91e77767cdbb1c78cc3a980a0e4335', 'code/datums/datum.dm': 'dc8dda5f2520977d09b5cda5510bf1c548d584bcdb798ab05e87927876517f1f', 'code/controllers/subsystem/garbage.dm': '3422f0a2f6746360505477711169d84168810ce5cc477fdf81cae3008deb6b7a', 'code/modules/reagents/chemistry/holder.dm': 'b1a78d7168dff57544f64d1bb1faaafbb3d810be32a35f6fbc1b0d2fcaad9e0a', 'code/modules/reagents/chemistry/reagents.dm': '4078c57a12e21c0e53755d16080d7abadc1d196ebf1fe40c7216c3706045f127', 'modular/Neu_Food/code/cooked/cooked_pastry.dm': 'e37926d738943a2da029eb59a6f19b79474c1d3cc3f7f2bbbafba0c5150f73f3', 'code/modules/farming/produce.dm': 'ffc7b44f63d5ad5928c343058ff9a20c02ea8743cf62941c1e0b14eed3e7e077'}, 'baseline_hash': '4d11c6b04e1b29cdadc3f3ecde963624a8b9513f86f4bec0e8302bac77f8d0e9', 'candidate_hash': '83f911e964f37f7ca9e6de5e62d1a571d6d473350191f4af08b22ae8bd888dda'}
HEADER = '/obj/item/reagent_containers/food/snacks/rogue/piedough/proc/prepare_handpie(obj/item/I, mob/living/user, handpie_path)'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source():
    return (SOURCE or ROOT / PATH).read_text()


def body():
    return source().split(HEADER + '\n', 1)[1].split('\n/*', 1)[0].rstrip()


def model(hands, success=True, nested=False):
    """Only source-derived action ordering; cleanup/inventory rules are pinned."""
    hands = list(hands)
    state = dict(hands=hands, output=None, deleted=[], floor=[], xp=0,
                 reagents={'filling': ['input1'], 'dough': ['input2']}, events=[])
    if not success:
        return state
    state['xp'] = 1
    state['output'] = {'reagents': ['recipe_default'], 'location': 'floor'}
    state['events'].append('construct')
    actions = sorted([(body().index('qdel(I)'), 'filling'),
                      (body().index('qdel(src)'), 'dough'),
                      (body().index('user.put_in_hands(handpie)'), 'place')])
    for _, action in actions:
        state['events'].append(action)
        if action == 'place':
            if None in hands:
                slot = hands.index(None)
                hands[slot] = 'pie'
                state['output']['location'] = slot
            else:
                state['floor'].append('pie')
        else:
            if nested:
                state['floor'].append(action + '_contents')
            if action in hands:
                hands[hands.index(action)] = None
            state['reagents'][action] = None
            state['deleted'].append(action)
    return state


class HandpiePlacement(unittest.TestCase):
    def test_source_dependencies_pinned(self):
        for path, expected in CONFIG['pins'].items():
            with self.subTest(path=path):
                self.assertEqual(digest((ROOT / path).read_bytes()), expected)
        self.assertIn(digest(source().encode()),
                      [CONFIG['baseline_hash'], CONFIG['candidate_hash']])

    def test_exact_success_body_and_order(self):
        expected = '''\tplaysound(get_turf(user), 'sound/foley/dropsound/food_drop.ogg', 50, TRUE, -1)
\tto_chat(user, span_notice("Making a handpie..."))
\tif(do_after(user,short_cooktime, target = src))
\t\tadd_sleep_experience(user, /datum/skill/craft/cooking, user.STAINT)
\t\tvar/handpie = new handpie_path(get_turf(user))
\t\tqdel(I)
\t\tqdel(src)
\t\tuser.put_in_hands(handpie)'''
        self.assertEqual(body(), expected)

    def test_both_ingredients_held(self):
        result = model(['filling', 'dough'])
        self.assertEqual(result['hands'], ['pie', None])
        self.assertNotIn('pie', result['floor'])

    def test_floor_dough_other_hand_occupied(self):
        result = model(['filling', 'unrelated'])
        self.assertEqual(result['hands'], ['pie', 'unrelated'])
        self.assertNotIn('pie', result['floor'])

    def test_free_offhand_output_retained(self):
        result = model(['filling', None])
        self.assertIn('pie', result['hands'])
        self.assertNotIn('pie', result['floor'])
        self.assertEqual(result['deleted'], ['filling', 'dough'])

    def test_cancellation_no_effects(self):
        result = model(['filling', 'dough'], success=False, nested=True)
        self.assertEqual(result['hands'], ['filling', 'dough'])
        self.assertEqual(result['deleted'], [])
        self.assertEqual(result['floor'], [])
        self.assertIsNone(result['output'])
        self.assertEqual(result['xp'], 0)
        self.assertEqual(result['reagents'], {'filling': ['input1'], 'dough': ['input2']})

    def test_nested_contents_drop_not_deleted_or_hand_placed(self):
        result = model(['filling', 'dough'], nested=True)
        self.assertIn('filling_contents', result['floor'])
        self.assertIn('dough_contents', result['floor'])
        self.assertNotIn('filling_contents', result['deleted'] + result['hands'])
        self.assertNotIn('dough_contents', result['deleted'] + result['hands'])

    def test_reagent_ownership_and_creation_before_deletion(self):
        result = model(['filling', 'dough'])
        self.assertEqual(result['events'][0], 'construct')
        self.assertEqual(result['reagents'], {'filling': None, 'dough': None})
        self.assertEqual(result['output']['reagents'], ['recipe_default'])
        self.assertEqual(result['xp'], 1)

    def test_synchronous_cleanup_contract(self):
        read = lambda p: (ROOT / p).read_text()
        self.assertIn('var/hint = to_delete.Destroy(arglist(args.Copy(2)))', read('code/controllers/subsystem/garbage.dm'))
        self.assertIn('return QDEL_HINT_QUEUE', read('code/datums/datum.dm'))
        self.assertIn('m.temporarilyRemoveItemFromInventory(src, TRUE)', read('code/game/objects/items.dm'))
        self.assertIn('held_items[hand_index] = null', read('code/modules/mob/inventory.dm'))
        self.assertIn('something.forceMove(dest)', read('code/modules/food_and_drinks/food/snacks.dm'))
        self.assertIn('QDEL_NULL(reagents)', read('code/game/atoms.dm'))
        self.assertIn('my_atom = null', read('code/modules/reagents/chemistry/holder.dm'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=ROOT)
    parser.add_argument('--source', type=Path)
    args, rest = parser.parse_known_args()
    ROOT, SOURCE = args.repo.resolve(), args.source.resolve() if args.source else None
    unittest.main(argv=[__file__] + rest)
