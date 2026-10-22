"""Source-bound economy guidebook ordering regressions; never executes DM.

Run: python3 tools/ci/test_economy_guidebook_order.py
Optional --repo and --guidebook-source test an unchanged checkout or scratch fix.
The model accepts only the reviewed picker bodies. It parses the actual chapter
names, categories and type paths, then models type-path enumeration and label
sorting with Python lexical order. This is NOT a claim about BYOND typesof order,
sorttext collation, input rendering or runtime navigation. Direct opening, cancel,
missing-label guards and browse navigation are also checked as source contracts.
"""
import argparse
from dataclasses import dataclass
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
GUIDEBOOK_SOURCE = None
DIRECTORY = 'code/modules/crafting/recipe_books/book_entries/treasury/'
GUIDEBOOK = DIRECTORY + 'economy_guidebook.dm'
ROOT_NAMES = ('general', 'merchant', 'realm', 'underground')
TYPE_ROOTS = tuple('/datum/book_entry/treasury_' + name for name in ROOT_NAMES)
CATEGORIES = ('Common', 'Merchant', 'Steward', 'Underground')
GET_ENTRIES = '/proc/get_economy_guidebook_entries()'
OPEN = '/proc/open_economy_guidebook(mob/user, category, entry_type)'

EXPECTED_ENUMERATION = '''
	var/static/list/entries
	if(entries)
		return entries
	entries = list()
	var/list/abstract_roots = list(
		/datum/book_entry/treasury_general,
		/datum/book_entry/treasury_merchant,
		/datum/book_entry/treasury_realm,
		/datum/book_entry/treasury_underground,
	)
	var/list/all_types = list()
	for(var/root in abstract_roots)
		all_types += typesof(root)
	for(var/T in all_types)
		if(T in abstract_roots)
			continue
		entries += T
	return entries'''
EXPECTED_PICKER = r'''
	if(!user)
		return
	var/list/entries = get_economy_guidebook_entries()
	if(entry_type && (entry_type in entries))
		var/datum/book_entry/B = new entry_type()
		B.show_menu(user)
		return
	var/list/matching_labels = list()
	var/list/other_labels = list()
	var/list/label_to_type = list()
	for(var/T in entries)
		var/datum/book_entry/probe = T
		var/nm = initial(probe.name)
		var/cat = initial(probe.category)
		var/label = "\[[cat]\] [nm]"
		label_to_type[label] = T
		if(category && cat == category)
			matching_labels += label
		else
			other_labels += label
	matching_labels = sortList(matching_labels)
	other_labels = sortList(other_labels)
	var/list/options = matching_labels + other_labels
	if(!length(options))
		return
	var/picked = input(user, "Which chapter would I like to read?", "The Comprehensive Guide to the [SSmapping.map_adjustment.realm_name] Economy") as null|anything in options
	if(!picked)
		return
	var/picked_type = label_to_type[picked]
	if(!picked_type)
		return
	var/datum/book_entry/B = new picked_type()
	B.show_menu(user)'''
BASELINE_PICKER = EXPECTED_PICKER.replace(
    'matching_labels = sortList(', 'sortList('
).replace('other_labels = sortList(', 'sortList(')

# Freeze the existing public labels and their concrete identities, not chapter prose.
EXPECTED_CHAPTERS = (
    ('charters', '00. Charters of the Realm'),
    ('levies', '01. Taxation and Levies'),
    ('fines', '02. Fines'),
    ('patronage', '03. Patronage: Writs and Rolls'),
    ('supply', '04. Supply and Demand'),
    ('tax_evasion', '05. Jolly Tax Evasion'),
    ('mercenary_statue', '06. The Mercenary Statue'),
    ('zadcote', '07. Zadcote and Zadcage'),
    ('navigator', '01. The Navigator'),
    ('fulfillment_crate', '02. The Ship Fulfillment Crate'),
    ('goldface', '03. Goldface and Silverface'),
    ('harbor_mechanics', '04. Ships, Hails, and the Warehouses'),
    ('kinship', '05. The Kinship Bonus'),
    ('avisa_market', '06. The Market on the Notice Board'),
    ('escrow', '07. COMMISSIONER'),
    ('rag_picker', '08. The Scrapper'),
    ('budgets', '01. Budgets and Authority'),
    ('assembly', '02. The City Assembly and the Alderman'),
    ('defense', '03. Defense and Blockades'),
    ('trade', '04. Regional Trade'),
    ('auto_import', '05. Standing (Auto) Imports'),
    ('standing_orders', '06. Of Standing Orders'),
    ('warehouse', '07. Warehouse'),
    ('insolvent', '08. Insolvency, Sequestration and Loans'),
    ('banditry', '09. Banditry'),
    ('black_market', '01. The Black Market'),
)


def active(source):
    """Strip comments without treating quoted text as comments; not a DM parser."""
    pattern = r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|//[^\n]*|/\*.*?\*/'''
    return re.sub(pattern, lambda m: '\n' * m[0].count('\n')
                  if m[0].startswith(('//', '/*')) else m[0], source, flags=re.S)


def lines(source):
    return [line.rstrip() for line in active(source).splitlines() if line.strip()]


def body(source, header):
    matches = re.findall(r'^' + re.escape(header) + r'[ \t]*\n(.*?)(?=^/|\Z)',
                         active(source), re.M | re.S)
    if len(matches) != 1:
        raise AssertionError(f'Expected one active definition: {header}')
    return matches[0]


def read(path):
    return (ROOT / path).read_text()


def picker_mode(source):
    actual = lines(body(source, OPEN))
    for fixed, expected in ((True, EXPECTED_PICKER), (False, BASELINE_PICKER)):
        if actual == lines(expected):
            return fixed
    raise AssertionError('Unreviewed economy guidebook picker; update the model after review')


@dataclass(frozen=True)
class Chapter:
    path: str
    category: str
    name: str

    @property
    def label(self):
        return f'[{self.category}] {self.name}'


def parse_chapters():
    chapters = []
    for stem, root, category in zip(ROOT_NAMES, TYPE_ROOTS, CATEGORIES):
        source = read(DIRECTORY + stem + '_chapters.dm')
        expected = [f'\tabstract_type = {root}', f'\tcategory = "{category}"']
        if lines(body(source, root)) != expected:
            raise AssertionError(f'Unreviewed category root: {root}')
        paths = re.findall(r'^(' + re.escape(root) + r'/[\w/]+)[ \t]*$', active(source), re.M)
        for path in paths:
            content = lines(body(source, path))
            if len(content) != 1 or not re.fullmatch(r'\tname = "[^"\n]+"', content[0]):
                raise AssertionError(f'Unreviewed chapter metadata: {path}')
            chapters.append(Chapter(path, category, content[0].split('"')[1]))
    return chapters


def menu(entries, category, *, fixed):
    matching, other, mapping = [], [], {}
    for chapter in entries:
        mapping[chapter.label] = chapter.path
        (matching if category and category == chapter.category else other).append(chapter.label)
    # sortList returns a copy. Python lexical order models these ASCII labels only.
    if fixed:
        matching, other = sorted(matching), sorted(other)
    else:
        sorted(matching)
        sorted(other)
    return matching + other, mapping


def open_model(entries, category, entry_type, picked=None, *, fixed, user=True):
    if not user:
        return None
    if entry_type and entry_type in [chapter.path for chapter in entries]:
        return entry_type
    options, mapping = menu(entries, category, fixed=fixed)
    if not options or not picked:
        return None
    return mapping.get(picked)


class EconomyGuidebookTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = GUIDEBOOK_SOURCE.read_text() if GUIDEBOOK_SOURCE else read(GUIDEBOOK)
        cls.fixed = picker_mode(cls.source)
        cls.chapters = parse_chapters()
        # A source-derived, intentionally non-label-ordered input, not engine evidence.
        cls.entries = [chapter for root in TYPE_ROOTS
                       for chapter in sorted(cls.chapters, key=lambda item: item.path)
                       if chapter.path.startswith(root + '/')]

    def test_source_retains_both_returned_sorted_lists(self):
        self.assertTrue(self.fixed, 'Both sortList return values must be assigned')

    def test_enumeration_and_copying_sort_helper_match_model(self):
        self.assertEqual(lines(body(self.source, GET_ENTRIES)), lines(EXPECTED_ENUMERATION))
        self.assertEqual(lines(body(read('code/__HELPERS/_lists.dm'),
                                    '/proc/sortList(list/L, cmp=/proc/cmp_text_asc)')),
                         ['\treturn sortTim(L.Copy(), cmp)'])
        self.assertEqual(lines(body(read('code/__HELPERS/cmp.dm'), '/proc/cmp_text_asc(a,b)')),
                         ['\treturn sorttext(b,a)'])

    def test_exact_26_chapter_labels_and_types_are_unchanged(self):
        expected = []
        for root, category, group in zip(TYPE_ROOTS, CATEGORIES,
                                        (EXPECTED_CHAPTERS[:8], EXPECTED_CHAPTERS[8:16],
                                         EXPECTED_CHAPTERS[16:25], EXPECTED_CHAPTERS[25:])):
            expected.extend(Chapter(root + '/' + leaf, category, name) for leaf, name in group)
        self.assertEqual(self.chapters, expected)
        self.assertEqual(len({chapter.label for chapter in self.chapters}), 26)
        self.assertEqual(len({chapter.path for chapter in self.chapters}), 26)

    def test_numbered_merchant_chapters_follow_reading_order(self):
        modeled_input = [chapter.name[:2] for chapter in self.entries if chapter.category == 'Merchant']
        self.assertEqual(modeled_input, ['06', '07', '02', '03', '04', '05', '01', '08'])
        options, _ = menu(self.entries, 'Merchant', fixed=self.fixed)
        self.assertEqual([label.split('] ')[1][:2] for label in options[:8]],
                         [f'{number:02}' for number in range(1, 9)])

    def test_every_category_is_first_then_both_partitions_are_sorted(self):
        for category in CATEGORIES:
            with self.subTest(category=category):
                options, _ = menu(self.entries, category, fixed=self.fixed)
                expected = sorted(c.label for c in self.chapters if c.category == category)
                expected += sorted(c.label for c in self.chapters if c.category != category)
                self.assertEqual(options, expected)

    def test_null_empty_unknown_and_case_mismatched_categories_sort_all(self):
        expected = sorted(chapter.label for chapter in self.chapters)
        for category in (None, '', 'Unknown', 'merchant'):
            with self.subTest(category=category):
                self.assertEqual(menu(self.entries, category, fixed=self.fixed)[0], expected)

    def test_mapping_and_input_are_preserved_in_either_enumeration_order(self):
        expected_map = {chapter.label: chapter.path for chapter in self.chapters}
        for entries in (self.entries, list(reversed(self.entries)), self.chapters):
            original = entries.copy()
            for category in (*CATEGORIES, None, 'Unknown'):
                with self.subTest(category=category, first=entries[0].path):
                    options, mapping = menu(entries, category, fixed=self.fixed)
                    self.assertEqual(mapping, expected_map)
                    self.assertCountEqual(options, expected_map)
                    self.assertEqual(options, menu(self.entries, category, fixed=True)[0])
            self.assertEqual(entries, original)

    def test_concrete_opening_and_every_selected_label_keep_exact_type(self):
        for chapter in self.chapters:
            with self.subTest(chapter=chapter.path):
                self.assertEqual(open_model(self.entries, 'Unknown', chapter.path, fixed=self.fixed), chapter.path)
                for entry_type in (None, *TYPE_ROOTS, '/datum/book_entry/unrecognized'):
                    self.assertEqual(open_model(self.entries, chapter.category, entry_type,
                                                chapter.label, fixed=self.fixed), chapter.path)

    def test_no_user_empty_picker_cancel_and_missing_lookup_do_not_open(self):
        self.assertIsNone(open_model(self.entries, 'Merchant', self.chapters[0].path,
                                     fixed=self.fixed, user=False))
        self.assertIsNone(open_model([], 'Merchant', None, 'missing', fixed=self.fixed))
        for picked in (None, '', '[Merchant] missing chapter'):
            self.assertIsNone(open_model(self.entries, 'Merchant', TYPE_ROOTS[1], picked, fixed=self.fixed))

    def test_existing_duplicate_label_collision_semantics_are_not_changed(self):
        first = Chapter('/test/first', 'Merchant', '01. Duplicate')
        last = Chapter('/test/last', 'Merchant', '01. Duplicate')
        for entries in ([first, last], [last, first]):
            for category in ('Merchant', None, 'Unknown'):
                with self.subTest(category=category, last=entries[-1].path):
                    options, mapping = menu(entries, category, fixed=self.fixed)
                    self.assertEqual(options, [first.label, first.label])
                    # Existing association is last-wins; this patch adds no allocator.
                    self.assertEqual(mapping, {first.label: entries[-1].path})
                    self.assertEqual((options, mapping), menu(entries, category, fixed=False))

    def test_unknown_picker_control_flow_is_rejected(self):
        for before, after in (('if(!user)', 'if(FALSE)'),
                              ('label_to_type[label] = T', 'label_to_type[label] = entry_type'),
                              ('matching_labels + other_labels', 'other_labels + matching_labels')):
            with self.subTest(change=before), self.assertRaises(AssertionError):
                picker_mode(self.source.replace(before, after))

    def test_dme_includes_helpers_chapters_and_live_help_routes(self):
        includes = {path.replace('\\', '/') for path in re.findall(
            r'^#include "([^"]+\.dm)"', read('roguetown.dme'), re.M)}
        machine = 'code/modules/roguetown/roguemachine/'
        required = [GUIDEBOOK, 'code/__HELPERS/_lists.dm', 'code/__HELPERS/cmp.dm',
                    'code/modules/crafting/recipe_books/book_entries/book_entry_base.dm',
                    machine + 'merchant/_goldface.dm', machine + 'merchant/navigator.dm']
        required += [DIRECTORY + stem + '_chapters.dm' for stem in ROOT_NAMES]
        self.assertTrue(set(required) <= includes, set(required) - includes)
        route = '\tif(action == "help")\n\t\topen_economy_guidebook(usr, "Merchant", /datum/book_entry/treasury_merchant)\n\t\treturn TRUE'
        for path in ('merchant/_goldface.dm', 'merchant/navigator.dm'):
            self.assertIn(route, active(read(machine + path)))
        for path in ('Goldface.tsx', 'Navigator/NavigatorContent.tsx'):
            self.assertIn("onClick={() => act('help')}", read('tgui/packages/tgui/interfaces/' + path))
        for path, user, leaf in (('merchant/trade/fulfillment_crate.dm', 'usr', 'fulfillment_crate'),
                                 ('noticeboard/noticeboard.dm', 'H', 'avisa_market')):
            self.assertIn(f'open_economy_guidebook({user}, "Merchant", {TYPE_ROOTS[1]}/{leaf})',
                          active(read(machine + path)))
        base = read('code/modules/crafting/recipe_books/book_entries/book_entry_base.dm')
        self.assertEqual(lines(body(base, '/datum/book_entry/proc/show_menu(mob/user)')),
                         ['\tuser << browse(generate_html(user),"window=recipe;size=500x810")'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--repo', type=Path)
    parser.add_argument('--guidebook-source', type=Path)
    args, remaining = parser.parse_known_args()
    if args.repo:
        ROOT = args.repo.resolve()
    GUIDEBOOK_SOURCE = args.guidebook_source
    unittest.main(argv=[__file__, *remaining])
