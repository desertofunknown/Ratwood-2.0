import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createSampleData } from './fixtures';

// Source-model evidence only. These checks do not execute DreamMaker, touch a
// savefile, validate a rendered game effect, or prove that disk writes succeeded.
const repo = resolve(import.meta.dir, '../../..');
const read = (path: string) => readFileSync(resolve(repo, path), 'utf8');
const toggles = read('code/modules/client/preferences_toggles.dm');
const hud = read('code/_onclick/hud/hud.dm');
const defines = read('code/__DEFINES/hud.dm');
const preferences = read('code/modules/client/preferences.dm');
const persistence = read('code/modules/client/preferences_savefile.dm');
const gameInterface = read('interface/interface.dm');
const multiline = read('code/modules/tgui_input/multilinepref.dm');

function between(source: string, start: string, end: string): string {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  if (first < 0 || last < 0)
    throw Error(`Missing scoped source markers: ${start} / ${end}`);
  return source.slice(first + start.length, last);
}
function proc(source: string, signature: string): string {
  const start = source.indexOf(signature);
  if (start < 0) throw Error(`Missing source procedure: ${signature}`);
  const rest = source.slice(start + signature.length);
  const next = rest.search(/^\/(?![/*])/m);
  return signature + (next < 0 ? rest : rest.slice(0, next));
}
const uiData = proc(toggles, '/datum/toggle_options_menu/ui_data(');
const uiAct = proc(toggles, '/datum/toggle_options_menu/ui_act(');
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const routes = [
  [
    'fullscreen',
    '!!(owner.prefs.toggles & TOGGLE_FULLSCREEN)',
    'toggle_fullscreen',
    'toggles',
    'TOGGLE_FULLSCREEN',
  ],
  ['crt', '!!owner.prefs.crt', 'crtmode', 'crt'],
  ['grain', '!!owner.prefs.grain', 'grainfilter', 'grain'],
  [
    'tgui_multiline',
    '!!owner.mob?.tgui_multiline',
    'toggle_tgui_multiline',
    '',
  ],
  ['screen_shake', '!!owner.prefs.shake', 'toggle_screenshake', 'shake'],
  [
    'no_redflash',
    '!!owner.prefs.no_redflash',
    'toggle_redflash',
    'no_redflash',
  ],
  [
    'chat_headshot',
    '!!owner.prefs.chatheadshot',
    'set_picinchat',
    'chatheadshot',
  ],
  [
    'mouseover_role',
    '!!owner.prefs.show_mouseover_role',
    'toggle_mouseover_role',
    'show_mouseover_role',
  ],
  [
    'examine_blocks',
    '!!owner.prefs.no_examine_blocks',
    'toggle_examine_blocks',
    'no_examine_blocks',
  ],
  [
    'language_fonts',
    '!!owner.prefs.no_language_fonts',
    'toggle_language_fonts',
    'no_language_fonts',
  ],
  [
    'language_icon',
    '!!owner.prefs.no_language_icon',
    'toggle_language_icon',
    'no_language_icon',
  ],
  [
    'floating_text',
    '!!(owner.prefs.floating_text_toggles & FLOATING_TEXT)',
    'toggle_floatingtext',
    'floating_text_toggles',
    'FLOATING_TEXT',
  ],
  [
    'xp_text',
    '!!(owner.prefs.floating_text_toggles & XP_TEXT)',
    'toggle_xptext',
    'floating_text_toggles',
    'XP_TEXT',
  ],
] as const;

function extractedEntries(variable: string, end: string) {
  const source = between(uiData, `var/list/${variable} = list(`, end);
  return [
    ...source.matchAll(
      /list\("id" = "([^"]+)", "label" = "([^"]+)", "enabled" = (.+?), "desc" = "([^"]+)"\)/g,
    ),
  ].map(([, id, label, enabled, desc]) => ({ id, label, enabled, desc }));
}

test('fixture binds exactly the ordered Graphics/Visuals toggle IDs, wording and delivered polarity to DM', () => {
  const data = createSampleData();
  expect(data.categories.map(({ name }) => name)).toEqual([
    'Graphics',
    'Visuals',
  ]);
  const sourceEntries = [
    extractedEntries('graphics_entries', '\n\tvar/list/graphics_selects'),
    extractedEntries('visual_entries', '\n\tvar/list/gameplay_entries'),
  ];
  expect(sourceEntries.map((entries) => entries.length)).toEqual([4, 9]);
  sourceEntries.forEach((entries, index) => {
    expect(
      data.categories[index].entries.map(({ id, label, desc }) => ({
        id,
        label,
        desc,
      })),
    ).toEqual(entries.map(({ id, label, desc }) => ({ id, label, desc })));
  });
  expect(sourceEntries.flat().map(({ id, enabled }) => [id, enabled])).toEqual(
    routes.map(([id, enabled]) => [id, enabled]),
  );
  // Last assignment is the populated result; the earlier assignment handles a
  // missing owner. Do not pin unrelated category names or entries.
  const categories = uiData.slice(
    uiData.lastIndexOf('data["categories"] = list('),
  );
  const scopedOrder: {
    name: string;
    entries: string;
    selects: string | undefined;
  }[] = [
    ...categories.matchAll(
      /list\("name" = "(Graphics|Visuals)", "entries" = ([a-z_]+)(?:, "selects" = ([a-z_]+))?\)/g,
    ),
  ].map(([, name, entries, selects]) => ({ name, entries, selects }));
  expect(scopedOrder).toEqual([
    {
      name: 'Graphics',
      entries: 'graphics_entries',
      selects: 'graphics_selects',
    },
    { name: 'Visuals', entries: 'visual_entries', selects: undefined },
  ]);
});

test('fixture binds palette field, option order and backend deuten spelling to actual declarations', () => {
  const data = createSampleData();
  const select = data.categories[0].selects![0];
  expect(data.categories[0].selects).toHaveLength(1);
  expect(data.categories[1].selects).toBeUndefined();
  const declaration = between(
    uiData,
    'var/list/graphics_selects = list(',
    '\n\tvar/list/character_entries',
  );
  for (const field of ['id', 'label', 'desc'] as const) {
    const actual = declaration.match(new RegExp(`"${field}" = "([^"]+)"`));
    expect(actual?.[1]).toBe(select[field]);
  }
  expect(declaration).toContain('"value" = owner.prefs.hud_colorblind_palette');
  expect(declaration).toContain('"options" = hud_colorblind_palette_options()');
  const options = proc(hud, '/proc/hud_colorblind_palette_options()');
  const actualOptions = [
    ...options.matchAll(
      /list\("value" = (HUD_COLORBLIND_[A-Z]+), "label" = "([^"]+)"\)/g,
    ),
  ].map(([, constant, label]) => {
    const value = defines.match(
      new RegExp(`^#define ${constant} "([^"]+)"$`, 'm'),
    )?.[1];
    if (!value) throw Error(`Missing palette constant ${constant}`);
    return { label, value };
  });
  expect(select.options).toEqual(actualOptions);
  expect(select.options.map(({ value }) => value)).toEqual([
    'none',
    'deuten',
    'protan',
    'tritan',
  ]);
  const valid = proc(hud, '/proc/is_hud_colorblind_palette(palette)');
  for (const constant of ['NONE', 'DEUTERANOPIA', 'PROTANOPIA', 'TRITANOPIA']) {
    expect(valid).toContain(
      `if(HUD_COLORBLIND_${constant})\n\t\t\treturn TRUE`,
    );
  }
  expect(valid).toContain('\n\treturn FALSE');
  const setter = proc(
    preferences,
    '/datum/preferences/proc/set_hud_colorblind_palette(new_palette)',
  );
  expect(setter).toContain(
    'if(!is_hud_colorblind_palette(new_palette))\n\t\treturn FALSE',
  );
  expect(setter).toContain(
    'hud_colorblind_palette = new_palette\n\treturn TRUE',
  );
});

test('scoped actions retain toggle/select payloads, guarded palette application and update ordering', () => {
  expect(uiAct).toContain('if(!owner?.prefs)\n\t\treturn FALSE');
  const toggleAction = between(
    uiAct,
    'if(action == "toggle")',
    '\n\tif(action == "select")',
  );
  expect(toggleAction).toContain('var/id = params["id"]');
  for (const [id, , verb] of routes) {
    const receiver = id === 'tgui_multiline' ? 'owner.mob?' : 'owner';
    expect(toggleAction).toMatch(
      new RegExp(
        `if\\("${id}"\\)\\n\\t{4}${escaped(receiver)}\\.${verb}\\(\\)`,
      ),
    );
  }
  expect(toggleAction).toMatch(
    /SStgui\.update_uis\(src\)\n\t\treturn TRUE\s*$/,
  );
  const selectAction = uiAct.slice(uiAct.indexOf('if(action == "select")'));
  expect(selectAction).toContain('var/select_id = params["id"]');
  expect(selectAction).toContain(
    'if("hud_colorblind_palette")\n\t\t\t\tif(!owner.prefs.set_hud_colorblind_palette(params["value"]))\n\t\t\t\t\treturn FALSE\n\t\t\t\towner.prefs.save_preferences()\n\t\t\t\towner.refresh_colorblind_hud_palette()',
  );
  expect(selectAction).toContain('SStgui.update_uis(src)\n\t\treturn TRUE');
  // The result of save_preferences is not tested or returned as a disk receipt.
  expect(selectAction).not.toMatch(
    /(?:if\(|=|return)\s*owner\.prefs\.save_preferences/,
  );
  expect(uiData).not.toMatch(
    /data\["(?:saved|save_result|save_status|persisted)"\]/,
  );
});

test('persistent options invoke existing verbs and write account-root preferences; multiline remains current-mob-only', () => {
  const save = proc(persistence, '/datum/preferences/proc/save_preferences()');
  const load = proc(persistence, '/datum/preferences/proc/load_preferences()');
  const path = proc(persistence, '/datum/preferences/proc/load_path(');
  expect(path).toContain('filename="preferences.sav"');
  expect(path).toContain(
    'path = "data/player_saves/[copytext(ckey,1,2)]/[ckey]/[filename]"',
  );
  for (const source of [save, load]) expect(source).toContain('S.cd = "/"');
  expect(save).toContain('if(!path)\n\t\treturn FALSE');
  expect(save).toContain('if(!S)\n\t\treturn FALSE');
  for (const [id, , verb, field, flag] of routes) {
    if (id === 'tgui_multiline') continue;
    const source = ['crt', 'grain', 'chat_headshot'].includes(id)
      ? gameInterface
      : toggles;
    const body = proc(source, `/client/verb/${verb}()`);
    expect(body).toContain('prefs.save_preferences()');
    expect(body).not.toMatch(/(?:if\(|=|return)\s*prefs\.save_preferences/);
    if (flag) expect(body).toContain(`prefs.${field} ^= ${flag}`);
    else if (id === 'crt' || id === 'grain') {
      expect(body).toContain(`prefs.${field} = FALSE`);
      expect(body).toContain(`prefs.${field} = TRUE`);
      expect(body.match(/prefs\.save_preferences\(\)/g)).toHaveLength(2);
    } else expect(body).toContain(`prefs.${field} = !prefs.${field}`);
    expect(save).toMatch(
      new RegExp(`WRITE_FILE\\(S\\["${field}"\\]\\s*, ${field}\\)`),
    );
    expect(load).toMatch(new RegExp(`S\\["${field}"\\]\\s*>> ${field}`));
  }
  expect(save).toContain(
    'WRITE_FILE(S["hud_colorblind_palette"], hud_colorblind_palette)',
  );
  expect(load).toContain(
    'S["hud_colorblind_palette"] >> hud_colorblind_palette',
  );
  expect(multiline).toContain('/mob\n\tvar/tgui_multiline = TRUE');
  const mobToggle = proc(multiline, '/mob/verb/toggle_tgui_multiline()');
  expect(mobToggle).toContain('tgui_multiline = !tgui_multiline');
  expect(mobToggle).not.toMatch(/prefs|save_preferences|save_character/);
  for (const source of [save, load])
    expect(source).not.toContain('tgui_multiline');
});

test('synthetic fixtures never share mutable categories, entries, selects or options', () => {
  const first = createSampleData();
  const second = createSampleData();
  expect(first).toEqual(second);
  expect(first).not.toBe(second);
  expect(first.categories).not.toBe(second.categories);
  first.categories.forEach((category, index) => {
    expect(category).not.toBe(second.categories[index]);
    expect(category.entries).not.toBe(second.categories[index].entries);
    category.entries.forEach((entry, position) =>
      expect(entry).not.toBe(second.categories[index].entries[position]),
    );
  });
  const a = first.categories[0].selects!;
  const b = second.categories[0].selects!;
  expect(a).not.toBe(b);
  expect(a[0]).not.toBe(b[0]);
  expect(a[0].options).not.toBe(b[0].options);
  a[0].options.forEach((option, index) =>
    expect(option).not.toBe(b[0].options[index]),
  );
  a[0].options[1].value = 'synthetic-mutated-value';
  first.categories[0].entries[0].label = 'Synthetic changed label';
  expect(second).toEqual(createSampleData());
});
