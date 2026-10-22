import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
const tgui = resolve(import.meta.dir, '../../..');
const read = (path: string) => Bun.file(resolve(tgui, path)).text();
const dm = await read('../code/modules/tgui_input/list.dm');
const source = await read('packages/tgui/interfaces/ListInputModal.tsx');
const buttons = await read('packages/tgui/interfaces/common/InputButtons.tsx');
const loader = await read('packages/tgui/interfaces/common/Loader.tsx');
const window = await read('packages/tgui/layouts/Window.tsx');
const backend = await read('packages/tgui/backend.ts');
const helpers = await read('../code/__HELPERS/_lists.dm');

test('DM producer exact identities, default truthiness and defensive flags remain explicit', () => {
  expect(dm).toContain('whitelistedWords.Replace("[i]", "")');
  expect(dm).toContain(
    'string_key = avoid_assoc_duplicate_keys(string_key, repeat_items)',
  );
  expect(dm).toContain('src.items += string_key');
  expect(dm).toContain('src.items_map[string_key] = i');
  expect(dm).toContain('data["init_value"] = default || items[1]');
  expect(dm).toContain('data["large_buttons"] = FALSE');
  expect(dm).toContain('data["swapped_buttons"] = FALSE');
  expect(dm).toContain('data["enable_preview"] = enable_combat_music_preview');
  expect(helpers).toContain('while(used_key_list[input_key])');
  expect(helpers).toContain('used_key_list[input_key] = 1');
});
test('DM routes only submit/cancel/preview_toggle and validates exact entry membership', () => {
  const actions = dm.slice(
    dm.indexOf('/datum/tgui_list_input/ui_act('),
    dm.indexOf('/datum/tgui_list_input/proc/set_choice'),
  );
  expect([...actions.matchAll(/if\("([^\"]+)"\)/g)].map((m) => m[1])).toEqual([
    'submit',
    'cancel',
    'preview_toggle',
  ]);
  expect(actions).toContain('if (!(params["entry"] in items))');
  expect(actions).toContain('set_choice(items_map[params["entry"]])');
  expect(actions).toContain(
    'if(!enable_combat_music_preview || !(params["entry"] in items))',
  );
  expect(actions).toContain(
    'preview_owner?.start_combat_music_preview(entry_key)',
  );
  expect(actions).toContain('SStgui.update_uis(src)');
  expect(dm).toMatch(
    /ui_close\(mob\/user\)[\s\S]*?stop_preview\(\)[\s\S]*?closed = TRUE/,
  );
});
test('production timeout is server-owned fraction and UI remains a delivered-value loader', () => {
  expect(dm).toContain('QDEL_IN(src, timeout)');
  expect(dm).toContain(
    'clamp((timeout - (world.time - start_time) - 1 SECONDS) / (timeout - 1 SECONDS), 0, 1)',
  );
  expect(source).toContain('{!!timeout && <Loader value={timeout} />}');
  expect(loader).toContain('clamp01(value) * 100');
  expect(source + loader).not.toMatch(
    /setInterval|setTimeout|Date\.now|requestAnimationFrame/,
  );
});
test('actual window Close uses suspend, not the list Cancel action', () => {
  expect(window).toMatch(
    /onClose=\{\(\) => \{[\s\S]*?dispatch\(backendSuspendStart\(\)\)/,
  );
  expect(backend).toContain("Byond.sendMessage('suspend')");
  expect(source).toContain("act('cancel')");
  expect(window).not.toContain("act('cancel')");
});
test('source control and label contracts anchor the differential harness', () => {
  expect(source).toContain('captureKeys={false}');
  expect(source).toContain('onFocusCapture={() => selectChoice(item)}');
  expect(source).toContain('item.replace(/^\\w/, (c) => c.toUpperCase())');
  expect(source).toContain('entry: selectedItem ?? items[0]');
  expect(source).toContain("{previewing ? 'Stop' : 'Listen'}");
  expect(source).toContain('event.target !== searchRef.current');
  expect(buttons).toContain('Confirm');
  expect(buttons).toContain('Cancel');
  expect(buttons).toContain(
    "direction={!swapped_buttons ? 'row' : 'row-reverse'}",
  );
});
