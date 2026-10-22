"""Source-bound getpois models, not native DM execution or runtime measurements."""
from pathlib import Path
import unittest

from test_unique_labels import corrected

ROOT = Path(__file__).resolve().parents[2]


def poi_model(mobs, atoms=(), *, reserve_final=False, mobs_only=False, skip_mindless=False):
    """Inputs are already in sortmobs order; identity is each input tuple itself."""
    counts, final_counts, result = {}, {}, {}
    for mob in mobs:
        real, visible, dead, mindless, stealth = mob
        if (skip_mindless and mindless) or stealth:
            continue
        label = corrected(real, counts)
        if real and real != visible:
            label += f" [{visible}]"
        if dead:
            continue
        result[corrected(label, final_counts) if reserve_final else label] = mob
    if not mobs_only:
        for atom in atoms:
            name, located = atom
            if not located:
                continue
            label = corrected(name, counts)
            result[corrected(label, final_counts) if reserve_final else label] = atom
    return result


def mob(real, visible=None, *, dead=False, mindless=False, stealth=False):
    return (real, real if visible is None else visible, dead, mindless, stealth)


class PoiLabelTests(unittest.TestCase):
    def test_decorated_raw_collision_both_orders(self):
        inputs = [mob('Bob', 'Bronze Construct'), mob('Bob [Bronze Construct]')]
        for order in (inputs, inputs[::-1]):
            self.assertEqual(len(poi_model(order)), 1)
            fixed = poi_model(order, reserve_final=True)
            self.assertEqual(list(fixed), ['Bob [Bronze Construct]', 'Bob [Bronze Construct] (2)'])
            for item, value in zip(order, fixed.values()):
                self.assertIs(value, item)

    def test_atom_decorated_collision(self):
        first, second = mob('Bob', 'Bronze Construct'), ('Bob [Bronze Construct]', True)
        self.assertEqual(len(poi_model([first], [second])), 1)
        fixed = poi_model([first], [second], reserve_final=True)
        self.assertEqual(len(fixed), 2)
        self.assertIs(fixed['Bob [Bronze Construct]'], first)
        self.assertIs(fixed['Bob [Bronze Construct] (2)'], second)

    def test_nested_suffixes(self):
        inputs = [mob('Bob', 'Bronze Construct'), mob('Bob [Bronze Construct] (2)'),
                  mob('Bob [Bronze Construct]'), mob('Bob [Bronze Construct] (3)')]
        fixed = poi_model(inputs, reserve_final=True)
        self.assertEqual(list(fixed), ['Bob [Bronze Construct]', 'Bob [Bronze Construct] (2)',
                                     'Bob [Bronze Construct] (3)', 'Bob [Bronze Construct] (3) (2)'])
        self.assertEqual(list(fixed.values()), inputs)

    def test_noncolliding_exact_parity_and_base_numbering(self):
        inputs = [mob('Bob', 'Masked'), mob('Bob', 'Other'), mob('Bob'), mob('Alice')]
        self.assertEqual(list(poi_model(inputs)), ['Bob [Masked]', 'Bob (2) [Other]', 'Bob (3)', 'Alice'])
        self.assertEqual(poi_model(inputs, [('Alice', True)], reserve_final=True),
                         poi_model(inputs, [('Alice', True)]))

    def test_filters_dead_reservation_and_atoms(self):
        inputs = [mob('Bob', dead=True), mob('Bob'), mob('Bob', mindless=True), mob('Bob', stealth=True)]
        atoms = [('Bob', False), ('Bob', True)]
        for only in (False, True):
            for skip in (False, True):
                self.assertEqual(poi_model(inputs, atoms, reserve_final=True, mobs_only=only, skip_mindless=skip),
                                 poi_model(inputs, atoms, mobs_only=only, skip_mindless=skip))
        self.assertEqual(list(poi_model(inputs, atoms, reserve_final=True, skip_mindless=True)), ['Bob (2)', 'Bob (3)'])

    def test_source_matches_model(self):
        source = (ROOT / 'code/__HELPERS/unsorted.dm').read_text()
        source = source[source.index('/proc/getpois('):source.index('//Orders mobs by type then by name')]
        expected = '''/proc/getpois(mobs_only=0,skip_mindless=0,team=null)
	var/list/mobs = sortmobs()
	var/list/namecounts = list()
	// Decoration can collide with another real name, so reserve completed labels separately.
	var/list/final_namecounts = list()
	var/list/pois = list()
	for(var/mob/M in mobs)
		if(skip_mindless && (!M.mind || !M.ckey))
			continue
		if(M.client && M.client.holder && M.client.holder.fakekey) //stealthmins
			continue
		var/name = avoid_assoc_duplicate_keys(M.real_name, namecounts)

		if(M.real_name && M.real_name != M.name)
			name += " \\[[M.name]\\]"
		if(M.stat == DEAD)
			continue
		pois[avoid_assoc_duplicate_keys(name, final_namecounts)] = M

	if(!mobs_only)
		for(var/atom/A in GLOB.poi_list)
			if(!A || !A.loc)
				continue
			var/name = avoid_assoc_duplicate_keys(A.name, namecounts)
			pois[avoid_assoc_duplicate_keys(name, final_namecounts)] = A
	pois = sort_list(pois)
	return pois
'''
        self.assertEqual(source, expected)


if __name__ == '__main__':
    unittest.main()
