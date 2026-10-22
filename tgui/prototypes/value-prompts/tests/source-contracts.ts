import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
const tgui = resolve(import.meta.dir, '../../..');
const read = (path: string) => Bun.file(resolve(tgui, path)).text();

test('production oracle resolves repository keyboard adapters, not raw leaf defaults', async () => {
  const config = await Bun.file(resolve(tgui, 'tsconfig.json')).json();
  expect(config.compilerOptions.paths['tgui-core/components']).toEqual([
    './packages/tgui/components/keyboard/index.ts',
  ]);
  expect(await read('packages/tgui/components/keyboard/index.ts')).toContain(
    "export { TextArea } from './TextArea'",
  );
  expect(
    await read('packages/tgui/components/keyboard/TextArea.tsx'),
  ).toContain('dontUseTabForIndent={props.dontUseTabForIndent ?? true}');
});

test('production modal source keeps local initialization, real controls and footer exclusion', async () => {
  const number = await read('packages/tgui/interfaces/NumberInputModal.tsx');
  const text = await read('packages/tgui/interfaces/TextInputModal.tsx');
  expect(number).toContain('useState(init_value)');
  expect(number).toContain('<RestrictedInput');
  expect(number).toContain('onValidationChange={setIsValid}');
  expect(number).toContain("closest('.Button')");
  expect(text).toContain("useRef(placeholder || '')");
  expect(text).toContain('<TextArea');
  expect(text).toContain('onChange={onType}');
  expect(text).toContain("closest('.InputModal__footer')");
  expect(text).toContain('input.length >= 30');
  expect(text).toContain('onDrop={handleBlockedInput}');
  expect(text).toContain('onPaste={handleBlockedInput}');
});

test('timeout remains delivered-only, and native window close suspends rather than cancels', async () => {
  const number = await read('packages/tgui/interfaces/NumberInputModal.tsx');
  const text = await read('packages/tgui/interfaces/TextInputModal.tsx');
  for (const source of [number, text]) {
    expect(source).toContain('{!!timeout && <Loader value={timeout} />}');
    expect(source).not.toMatch(
      /setInterval|setTimeout|Date\.now|requestAnimationFrame/,
    );
  }
  const window = await read('packages/tgui/layouts/Window.tsx');
  expect(window).toMatch(
    /onClose=\{\(\) => \{[\s\S]*?dispatch\(backendSuspendStart\(\)\)/,
  );
  expect(await read('packages/tgui/backend.ts')).toContain(
    "Byond.sendMessage('suspend')",
  );
  expect(window).not.toContain("act('cancel')");
});
