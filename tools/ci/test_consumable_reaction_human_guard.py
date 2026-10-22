"""Source-bound consumable human-field guard regression; never executes DM.

Run: python3 tools/ci/test_consumable_reaction_human_guard.py
The narrow model covers the reviewed guard, first preference-field access and
unconditional parent delegation, not stress effects, chemistry or game runtime.
The real ingress is Aerosolize -> chemical smoke -> living reagent dispatcher.
The nonhuman-carbon witness is the mapped Adventurer's Dream spirit barkeeper;
Soulspeak in necra.dm is commented out and is NOT reachability evidence.
Exact source contracts fail closed when the modeled code needs fresh review.
"""
from pathlib import Path
import hashlib
import json
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
HUMAN = '/mob/living/carbon/human'
CARBON = '/mob/living/carbon'
SPIRIT = CARBON + '/spirit'
LIVING = '/mob/living'
OLD_GUARD = 'method == INGEST'
NEW_GUARD = 'method == INGEST && ishuman(M)'
TOUCH, INGEST, VAPOR, PATCH, INJECT = range(1, 6)
FOOD = 'code/modules/reagents/chemistry/reagents/food_reagents.dm'
AEROSOL = 'code/modules/spells/spell_types/wizard/invoked_aoe/aerosolize.dm'
SMOKE = 'code/game/objects/effects/effect_system/effects_smoke.dm'
HOLDER = 'code/modules/reagents/chemistry/holder.dm'
BASE = 'code/modules/reagents/chemistry/reagents.dm'
CALLBACK = '/datum/reagent/consumable/reaction_mob(mob/living/M, method=TOUCH, reac_volume)'

# Preserve the entire preference branch and parent call, not just token presence.
CALLBACK_TAIL = '''		var/mob/living/carbon/human/HM = M

		if(HM.culinary_preferences)
			var/favorite_drink_type = HM.culinary_preferences[CULINARY_FAVOURITE_DRINK]
			if(favorite_drink_type == type)
				if(HM.add_stress(/datum/stressevent/favourite_drink))
					to_chat(HM, span_green("Yum! My favorite drink!"))
			else if(ispath(type, favorite_drink_type))
				var/datum/reagent/consumable/favorite_drink_instance = favorite_drink_type
				var/favorite_drink_name = initial(favorite_drink_instance.name)
				if(favorite_drink_name == name)
					if(HM.add_stress(/datum/stressevent/favourite_drink))
						to_chat(HM, span_green("Yum! My favorite drink!"))

			var/hated_drink_type = HM.culinary_preferences[CULINARY_HATED_DRINK]
			if(hated_drink_type == type)
				if(HM.add_stress(/datum/stressevent/hated_drink))
					to_chat(HM, span_red("Yuck! My hated drink!"))
			else if(ispath(type, hated_drink_type))
				var/datum/reagent/consumable/hated_drink_instance = hated_drink_type
				var/hated_drink_name = initial(hated_drink_instance.name)
				if(hated_drink_name == name)
					if(HM.add_stress(/datum/stressevent/hated_drink))
						to_chat(HM, span_red("Yuck! My hated drink!"))
	return ..()
'''

ROUTE_BODIES = {
    ('code/modules/spells/spell_types/wizard/invoked_aoe/aerosolize.dm',
     '/obj/effect/proc_holder/spell/invoked/aerosolize/proc/get_container(mob/living/user, target)'): '''	var/obj/item/reagent_containers/con = target
	if(!istype(con))
		to_chat(user, span_warning("This must be cast on a container."))
		return null
	if(!con.spillable)
		to_chat(user, span_warning("[con] is not an open container."))
		return null
	if(con.reagents.total_volume <= 0)
		to_chat(user, span_warning("[con] is empty."))
		return null
	return con
''',
    ('code/modules/spells/spell_types/wizard/invoked_aoe/aerosolize.dm',
     '/obj/effect/proc_holder/spell/invoked/aerosolize/cast(list/targets, mob/living/user)'): '''	var/turf/T = get_turf(targets[1])
	var/obj/item/reagent_containers/con = get_container(user, targets[1])
	if(!T || !con)
		revert_cast()
		return
	var/datum/effect_system/smoke_spread/chem/smoke = new
	smoke.set_up(con.reagents, 1, T, FALSE)
	smoke.start()
	con.reagents.clear_reagents()
	playsound(user, 'sound/magic/webspin.ogg', 100)
''',
    ('code/game/objects/effects/effect_system/effects_smoke.dm',
     '/obj/effect/particle_effect/smoke/process()'): '''	lifetime--
	if(lifetime < 1)
		kill_smoke()
		return 0
	for(var/mob/living/L in range(0,src))
		smoke_mob(L)
	return 1
''',
    ('code/game/objects/effects/effect_system/effects_smoke.dm',
     '/obj/effect/particle_effect/smoke/chem/smoke_mob(mob/living/carbon/M)'): '''	if(lifetime<1)
		return 0
	if(!istype(M))
		return 0
	var/fraction = 1/initial(lifetime)
	reagents.copy_to(M, fraction*reagents.total_volume)
	reagents.reaction(M, INGEST, fraction)
	return 1
''',
    ('code/modules/reagents/chemistry/holder.dm',
     '/datum/reagents/proc/reaction(atom/A, method = TOUCH, volume_modifier = 1, show_message = 1)'): '''	var/react_type
	if(isliving(A))
		react_type = "LIVING"
		if(method == INGEST)
			var/mob/living/L = A
			L.taste(src)
	else if(isturf(A))
		react_type = "TURF"
	else if(isobj(A))
		react_type = "OBJ"
	else
		return
	var/list/cached_reagents = reagent_list
	for(var/reagent in cached_reagents)
		var/datum/reagent/R = reagent
		switch(react_type)
			if("LIVING")
				var/touch_protection = 0
				if(method == VAPOR)
					var/mob/living/L = A
					touch_protection = L.get_permeability_protection()
				R.reaction_mob(A, method, R.volume * volume_modifier, show_message, touch_protection)
			if("TURF")
				R.reaction_turf(A, R.volume * volume_modifier, show_message)
			if("OBJ")
				R.reaction_obj(A, R.volume * volume_modifier, show_message)
''',
    ('code/modules/reagents/chemistry/reagents.dm',
     '/datum/reagent/proc/reaction_mob(mob/living/M, method=TOUCH, reac_volume, show_message = 1, touch_protection = 0)'): '''	if(!istype(M))
		return 0
	if(method == VAPOR) //smoke, foam, spray
		if(M.reagents)
			var/modifier = CLAMP((1 - touch_protection), 0, 1)
			var/amount = round(reac_volume*modifier, 0.1)
			if(amount >= 0.5)
				M.reagents.add_reagent(type, amount)
	return 1
''',
}

# Reviewed upstream bodies: smoke creation/processing/copy and generic taste.
PINNED_BODIES = {
    ('code/game/objects/effects/effect_system/effects_smoke.dm',
     '/obj/effect/particle_effect/smoke/Initialize(mapload)'):
        '73d5e8e0cf887e4f3ed7631770e266b2fdc82deb431627efec702a00c5106b95',
    ('code/game/objects/effects/effect_system/effects_smoke.dm',
     '/obj/effect/particle_effect/smoke/chem/process()'):
        'bcd76ee1467585af8911aef5bd8069b73cf035af604ef36e25b3eed6425d4f27',
    ('code/game/objects/effects/effect_system/effects_smoke.dm',
     '/datum/effect_system/smoke_spread/chem/set_up(datum/reagents/carry = null, radius = 1, loca, silent = FALSE)'):
        '1065d2f2b4c33b0f7213bf400e16fb4cd01c8561cf1c4f1712d41a6310bf10cc',
    ('code/game/objects/effects/effect_system/effects_smoke.dm',
     '/datum/effect_system/smoke_spread/chem/start()'):
        'b91392c96410c46934eff5b2b13286c587287b3bce081698002c3866cc793b81',
    ('code/modules/reagents/chemistry/holder.dm',
     '/datum/reagents/proc/copy_to(obj/target, amount=1, multiplier=1, preserve_data=1)'):
        '33e2ad87006c1b751a8556d54bd64de3b833192919bcbbcb3dded01a9557f771',
    ('code/modules/mob/living/taste.dm',
     '/mob/living/proc/taste(datum/reagents/from)'):
        '7cb8adef0983f684297f0c24f8293092167bf89154e371d2d92566142d08085e',
}


def read_sources():
    paths = {FOOD, AEROSOL, SMOKE, HOLDER, BASE}
    paths.update(path for path, _ in PINNED_BODIES)
    return {path: (ROOT / path).read_text() for path in paths}


def active_source(source):
    # Preserve quoted strings/resources while removing DM comments. This is a
    # definition locator, not a DM parser or interpreter.
    pattern = r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|//[^\n]*|/\*.*?\*/'''
    return re.sub(pattern, lambda m: '\n' * m[0].count('\n')
                  if m[0].startswith(('//', '/*')) else m[0], source, flags=re.S)


def definition(source, header):
    pattern = r'^' + re.escape(header) + r'\n(.*?)(?=^/(?![/*])|\Z)'
    # A matching signature inside a block comment is not executable evidence.
    if not re.search(pattern, active_source(source), re.M | re.S):
        raise AssertionError('Missing active definition: ' + header)
    matches = re.findall(pattern, source, re.M | re.S)
    if len(matches) != 1:
        raise AssertionError('Missing or duplicate raw definition: ' + header)
    return matches[0].rstrip('\n') + '\n'


def callback_guard(source):
    body = definition(source, CALLBACK)
    for guard in (OLD_GUARD, NEW_GUARD):
        if body == '\tif(' + guard + ')\n' + CALLBACK_TAIL:
            return guard
    raise AssertionError('Unreviewed consumable callback body')


def validate_route(sources):
    for (path, proc), expected in ROUTE_BODIES.items():
        if definition(sources[path], proc) != expected:
            raise AssertionError('Unreviewed ingress/parent body: ' + proc)
    for (path, proc), expected in PINNED_BODIES.items():
        body = definition(sources[path], proc)
        if hashlib.sha256(body.encode()).hexdigest() != expected:
            raise AssertionError('Unreviewed upstream body: ' + proc)


def subtype(path, parent):
    return path == parent or path.startswith(parent + '/')


class Mob:
    def __init__(self, path, preferences=None):
        self.path = path
        self.preferences = preferences
        self.preference_reads = 0
        self.copies = 0
        self.generic_tastes = 0

    def read_human_preferences(self):
        self.preference_reads += 1
        if not subtype(self.path, HUMAN):
            raise AttributeError('Nonhuman mob has no culinary_preferences')
        return self.preferences


class ParentSpy:
    def __init__(self):
        self.calls = []
        self.result = object()

    def __call__(self, mob, method, volume):
        self.calls.append((mob, method, volume))
        return self.result


def run_callback(source, mob, method, volume, parent):
    guard = callback_guard(source)
    if method == INGEST and (guard == OLD_GUARD or subtype(mob.path, HUMAN)):
        # Only model the first human-only field access. Preference/stress logic
        # is preserved verbatim by CALLBACK_TAIL, not reimplemented in Python.
        mob.read_human_preferences()
    return parent(mob, method, volume)


def smoke_dispatch(sources, mob, parent, lifetime=10, total_volume=20):
    validate_route(sources)
    # Narrow projection of the reviewed override. It does NOT invoke the base
    # smoke_mob breathing/mask guards, since the actual override never calls ..().
    if lifetime < 1 or not subtype(mob.path, CARBON):
        return 0
    fraction = 1 / 10  # chem initial(lifetime); pinned separately below
    mob.copies += 1
    mob.generic_tastes += 1
    run_callback(sources[FOOD], mob, INGEST, total_volume * fraction, parent)
    return 1


class ConsumableReactionGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources = read_sources()
        cls.source = cls.sources[FOOD]

    def test_nonhuman_carbon_smoke_skips_only_preferences_and_calls_parent(self):
        for path in (SPIRIT, CARBON):
            with self.subTest(path=path):
                mob, parent = Mob(path), ParentSpy()
                try:
                    result = smoke_dispatch(self.sources, mob, parent)
                except AttributeError as error:
                    self.fail('Reviewed INGEST ingress reaches unsafe field: ' + str(error))
                self.assertEqual(result, 1)
                self.assertEqual(mob.preference_reads, 0)
                self.assertEqual((mob.copies, mob.generic_tastes), (1, 1))
                self.assertEqual(parent.calls, [(mob, INGEST, 2)])

    def test_human_descendants_retain_branch_and_parent_return(self):
        for path in (HUMAN, HUMAN + '/species/elf/dark',
                     HUMAN + '/species/human/northern'):
            for prefs in (None, {}, {'favourite': 'milk', 'hated': 'ale'}):
                with self.subTest(path=path, preferences=prefs):
                    mob, parent = Mob(path, prefs), ParentSpy()
                    self.assertIs(run_callback(self.source, mob, INGEST, 7, parent),
                                  parent.result)
                    self.assertEqual(mob.preference_reads, 1)
                    self.assertEqual(parent.calls, [(mob, INGEST, 7)])

    def test_other_methods_keep_parent_and_never_enter_preferences(self):
        for path in (SPIRIT, CARBON, HUMAN, HUMAN + '/species/elf/dark',
                     LIVING + '/simple_animal'):
            for method in (TOUCH, VAPOR, PATCH, INJECT):
                for volume in (0, 0.1, 10):
                    mob, parent = Mob(path), ParentSpy()
                    self.assertIs(run_callback(self.source, mob, method, volume, parent),
                                  parent.result)
                    self.assertEqual(mob.preference_reads, 0)
                    self.assertEqual(parent.calls, [(mob, method, volume)])

    def test_old_condition_reproduces_missing_field_before_parent(self):
        old = self.source.replace(NEW_GUARD, OLD_GUARD, 1)
        sources = dict(self.sources, **{FOOD: old})
        mob, parent = Mob(SPIRIT), ParentSpy()
        with self.assertRaisesRegex(AttributeError, 'culinary_preferences'):
            smoke_dispatch(sources, mob, parent)
        self.assertEqual((mob.copies, mob.generic_tastes, mob.preference_reads), (1, 1, 1))
        self.assertEqual(parent.calls, [])

    def test_smoke_upstream_filters_are_not_broadened(self):
        for path, lifetime in ((SPIRIT, 0), (LIVING + '/simple_animal', 10)):
            mob, parent = Mob(path), ParentSpy()
            self.assertEqual(smoke_dispatch(self.sources, mob, parent, lifetime), 0)
            self.assertEqual((mob.copies, mob.generic_tastes, mob.preference_reads), (0, 0, 0))
            self.assertEqual(parent.calls, [])

    def test_entire_callback_tail_is_preserved(self):
        callback_guard(self.source)
        self.assertTrue(CALLBACK_TAIL.endswith('\treturn ..()\n'))
        self.assertIn('HM.culinary_preferences[CULINARY_FAVOURITE_DRINK]', CALLBACK_TAIL)
        self.assertIn('HM.culinary_preferences[CULINARY_HATED_DRINK]', CALLBACK_TAIL)

    def test_actual_ingress_and_parent_match_exact_source(self):
        validate_route(self.sources)
        smoke = self.sources[SMOKE]
        chem = definition(smoke, '/obj/effect/particle_effect/smoke/chem')
        self.assertEqual(chem, '\tlifetime = 10\n')
        override = definition(smoke, '/obj/effect/particle_effect/smoke/chem/smoke_mob(mob/living/carbon/M)')
        self.assertNotIn('..()', override)
        self.assertNotIn('ishuman', override)

    def test_predicate_constants_and_human_only_field_are_source_bound(self):
        helpers = active_source((ROOT / 'code/__DEFINES/is_helpers.dm').read_text())
        for name, path in (('ishuman', HUMAN), ('iscarbon', CARBON), ('isliving', LIVING)):
            self.assertIn('#define ' + name + '(A) (istype(A, ' + path + '))', helpers)
        constants = active_source((ROOT / 'code/__DEFINES/reagents.dm').read_text())
        for name, value in (('TOUCH', TOUCH), ('INGEST', INGEST), ('VAPOR', VAPOR),
                            ('PATCH', PATCH), ('INJECT', INJECT)):
            self.assertRegex(constants, rf'(?m)^#define {name}\s+{value}\s*$')
        human = (ROOT / 'code/modules/mob/living/carbon/human/human_defines.dm').read_text()
        self.assertIn('\tvar/list/culinary_preferences = list()', definition(active_source(human), HUMAN))
        # Verify the actual nonhuman type and all mob declarations, not merely a
        # guessed generic living contract. Preferences on /datum do not count.
        declarations = []
        for path in (ROOT / 'code/modules/mob').rglob('*.dm'):
            for line in active_source(path.read_text()).splitlines():
                if re.match(r'\s*var/(?:list/)?culinary_preferences\b', line):
                    declarations.append(path.relative_to(ROOT).as_posix())
        self.assertEqual(declarations, ['code/modules/mob/living/carbon/human/human_defines.dm'])

    def test_active_mapped_spirit_is_real_nonhuman_carbon_with_reagents(self):
        config = json.loads((ROOT / '_maps/rockhill.json').read_text())
        other_path = '_maps/map_files/otherz/advspawnrockhill.json'
        self.assertIn(other_path, config['other_z'])
        other = json.loads((ROOT / other_path).read_text())
        map_path = ROOT / '_maps' / other['map_path'] / other['map_file']
        dmm = map_path.read_text()
        self.assertIn('"xb" = (\n/mob/living/carbon/spirit{', dmm)
        self.assertIn('name = "The Barkeeper";', dmm)
        # Check an actual placed tile, not an unused DMM dictionary entry.
        self.assertRegex(dmm, r'\(13,1,1\) = \{"\n(?:[^\n]*\n){5}xb\n')
        mapping = active_source((ROOT / 'code/controllers/subsystem/mapping.dm').read_text())
        self.assertIn('for(var/map_json in current_map.other_z)\n\t\totherZ += load_map_config(map_json)', mapping)
        self.assertIn('\t\tLoadOtherZ(FailedZs, otherZ)', mapping)
        spirit = (ROOT / 'code/modules/mob/living/carbon/spirit/spirit.dm').read_text()
        self.assertNotIn('parent_type', definition(spirit, SPIRIT))
        self.assertIn('\t. = ..()\n', definition(spirit, SPIRIT + '/Initialize(mapload, cubespawned=FALSE, mob/spawner)'))
        carbon = (ROOT / 'code/modules/mob/living/carbon/carbon.dm').read_text()
        self.assertIn('\tcreate_reagents(1000)\n', definition(carbon, CARBON + '/Initialize(mapload)'))
        necra = active_source((ROOT / 'code/modules/spells/roguetown/acolyte/necra.dm').read_text())
        self.assertNotIn('capturedsoul.loc = user.loc', necra)

    def test_filled_consumable_container_is_accepted_without_human_target_gate(self):
        glass = (ROOT / 'code/modules/reagents/reagent_containers/glass.dm').read_text()
        self.assertIn('\tspillable = TRUE\n', definition(glass, '/obj/item/reagent_containers/glass'))
        milk = (ROOT / 'code/modules/reagents/chemistry/reagents/drink_reagents.dm').read_text()
        self.assertIn('\tname = "Milk"\n', definition(milk, '/datum/reagent/consumable/milk'))
        # Aerosolize accepts any positive-volume spillable reagent container.
        container = ROUTE_BODIES[(AEROSOL, '/obj/effect/proc_holder/spell/invoked/aerosolize/proc/get_container(mob/living/user, target)')]
        self.assertNotIn('ishuman', container)
        self.assertNotIn('consumable', container)
        spells = active_source((ROOT / 'code/modules/spells/spell_types/wizard/spell_list.dm').read_text())
        self.assertIn('\t\t/obj/effect/proc_holder/spell/invoked/aerosolize,', spells)

    def test_ingress_and_witness_files_are_in_build_manifest(self):
        manifest = (ROOT / 'roguetown.dme').read_text()
        paths = [FOOD, AEROSOL, SMOKE, HOLDER, BASE,
                 'code/modules/mob/living/taste.dm',
                 'code/modules/mob/living/carbon/carbon.dm',
                 'code/modules/mob/living/carbon/spirit/spirit.dm']
        for path in paths:
            self.assertIn('#include "' + path.replace('/', '\\') + '"', manifest)

    def test_unreviewed_guard_mutations_are_rejected(self):
        guard = callback_guard(self.source)
        for changed in ('method == INGEST || ishuman(M)', 'ishuman(M)',
                        'method == INGEST && M.type == /mob/living/carbon/human',
                        'method == INGEST && iscarbon(M)',
                        'method == INGEST && !ishuman(M)'):
            with self.subTest(guard=changed), self.assertRaises(AssertionError):
                callback_guard(self.source.replace('if(' + guard + ')', 'if(' + changed + ')', 1))

    def test_preference_body_mutations_are_rejected(self):
        for before, after in (
            ('if(HM.culinary_preferences)', 'if(TRUE)'),
            ('CULINARY_HATED_DRINK', 'CULINARY_FAVOURITE_DRINK'),
            ('favorite_drink_type == type', 'favorite_drink_type != type'),
            ('ispath(type, hated_drink_type)', 'ispath(type, favorite_drink_type)'),
            ('if(hated_drink_name == name)', 'if(hated_drink_name != name)'),
            ('span_green(', 'span_red('),
        ):
            with self.subTest(mutation=before), self.assertRaises(AssertionError):
                callback_guard(self.source.replace(before, after, 1))

    def test_parent_delegation_mutations_are_rejected(self):
        body = definition(self.source, CALLBACK)
        for changed in (body.replace('\treturn ..()\n', '\treturn\n'),
                        body.replace('\treturn ..()\n', '\t\treturn ..()\n'),
                        body.replace('\treturn ..()\n', '\tif(ishuman(M))\n\t\treturn ..()\n'),
                        body + '\treturn ..()\n'):
            with self.subTest(body=changed), self.assertRaises(AssertionError):
                callback_guard(self.source.replace(body, changed, 1))

    def test_upstream_guard_or_dispatch_mutations_are_rejected(self):
        mutations = (
            (AEROSOL, '\treturn con\n', '\tif(ishuman(target))\n\t\treturn con\n'),
            (SMOKE, 'for(var/mob/living/L in range(0,src))',
             'for(var/mob/living/carbon/human/L in range(0,src))'),
            (SMOKE, '\tvar/fraction = 1/initial(lifetime)\n\treagents.copy_to(M,',
             '\tif(!ishuman(M))\n\t\treturn 0\n\tvar/fraction = 1/initial(lifetime)\n\treagents.copy_to(M,'),
            (SMOKE, 'reagents.reaction(M, INGEST, fraction)', 'reagents.reaction(M, TOUCH, fraction)'),
            (HOLDER, '\tif(isliving(A))\n', '\tif(ishuman(A))\n'),
            (HOLDER, 'R.reaction_mob(A, method, R.volume * volume_modifier, show_message, touch_protection)',
             'R.reaction_mob(A, TOUCH, R.volume * volume_modifier, show_message, touch_protection)'),
            (BASE, '\treturn 1\n', '\treturn 0\n'),
        )
        for path, before, after in mutations:
            with self.subTest(path=path, mutation=before):
                self.assertIn(before, self.sources[path])
                mutated = dict(self.sources)
                mutated[path] = mutated[path].replace(before, after, 1)
                with self.assertRaises(AssertionError):
                    validate_route(mutated)

    def test_commented_out_route_is_not_evidence(self):
        for path, proc in ROUTE_BODIES:
            with self.subTest(proc=proc):
                body = definition(self.sources[path], proc)
                mutated = dict(self.sources)
                block = proc + '\n' + body
                mutated[path] = mutated[path].replace(block, '/*\n' + block + '*/\n', 1)
                with self.assertRaises(AssertionError):
                    validate_route(mutated)

    def test_source_locator_keeps_comment_markers_inside_strings(self):
        source = '/example\n\tname = "http://example/*literal*/"\n'
        self.assertEqual(active_source(source), source)
        self.assertEqual(active_source('/* /example\n */\n'), '\n\n')


if __name__ == '__main__':
    unittest.main()
