import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
const tgui = resolve(import.meta.dir, '../../..');
const read = (path: string) => Bun.file(resolve(tgui, path)).text();
test('DM membership remains exact; native fallback only two/three; server owns timer', async () => {
  const dm = await read('../code/modules/tgui_input/alert.dm');
  expect(dm).toContain('if (!(params["choice"] in buttons))');
  expect(dm).toContain('if(!user.client.prefs.tgui_pref || strict_byond)');
  expect(dm).toContain('if(length(buttons) == 2)');
  expect(dm).toContain('if(length(buttons) == 3)');
  expect(dm).not.toContain('if(length(buttons) == 1)');
  expect(dm).toContain('QDEL_IN(src, timeout)');
  expect(dm).toContain('world.time - start_time');
  expect(dm).toContain('while (!choice && !closed && !QDELETED(src))');
});
test('actual AlertModal, Button adapter, and Autofocus behavior anchors', async () => {
  const source = await read('packages/tgui/interfaces/AlertModal.tsx');
  for (const fragment of [
    'useState(0)',
    'button.length > 18',
    'buttons.length > 3',
    'captureKeys={false}',
    'reverse={!swapped_buttons}',
    '{!!timeout && <Loader value={timeout} />}',
  ])
    expect(source).toContain(fragment);
  expect(source).not.toMatch(
    /setInterval|setTimeout|Date\.now|requestAnimationFrame/,
  );
  const autofocus = await read(
    'node_modules/tgui-core/dist/components/Autofocus.js',
  );
  expect(autofocus).toContain('setTimeout');
  expect(autofocus).toContain('},1)');
  expect(autofocus).toContain('clearTimeout');
  const button = await read('packages/tgui/components/keyboard/Buttons.tsx');
  expect(button).toContain("role: 'button'");
  const window = await read('packages/tgui/layouts/Window.tsx');
  expect(window).toMatch(
    /onClose=\{\(\) => \{[\s\S]*?dispatch\(backendSuspendStart\(\)\)/,
  );
  expect(window).not.toContain("act('cancel')");
});
