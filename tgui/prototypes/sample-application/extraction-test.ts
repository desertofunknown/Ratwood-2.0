import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { banner, definitions, here, plugins } from './build-options';

// The eager seams must not resolve auxiliary code through an accidental barrel.
for (const file of [
  'session-core.ts',
  'workbench-react.tsx',
  'workbench-svelte.tsx',
]) {
  const inputs = new Set<string>();
  const result = await Bun.build({
    entrypoints: [join(here, 'screens', file)],
    target: 'browser',
    conditions: ['browser', 'production'],
    format: 'esm',
    define: definitions,
    plugins: plugins(inputs),
  });
  if (!result.success) throw Error(result.logs.map(String).join('\n'));
  assert(
    inputs.has(join(here, 'screens', file)),
    `${file} must appear in its resolved input inventory.`,
  );
  assert(
    ![...inputs].some((path) =>
      /\/(?:changes-archive|treasury-ledger|market-quote|display-readability|selection-prompt|value-prompts|alert-prompt)\/|\/sample-application\/(?:dialogs\/|screens\/(?:session|react|svelte|controls)\.)/.test(
        path,
      ),
    ),
    `${file} must not resolve auxiliary controllers, views or controls.`,
  );
  if (file === 'workbench-react.tsx') {
    assert(
      inputs.has(join(here, '../crafting-workbench/Workbench.tsx')),
      'The React eager seam must reuse the existing workbench view.',
    );
    assert(
      ![...inputs].some((path) => path.includes('/svelte/')),
      'The React eager seam must not include the Svelte runtime.',
    );
  }
  if (file === 'workbench-svelte.tsx') {
    assert(
      inputs.has(join(here, '../crafting-workbench/svelte/adapter.ts')),
      'The Svelte eager seam must reuse the existing workbench mount adapter.',
    );
  }
}

// Source-mounted simulated DOM only. No application dist, listener or browser.
const generated = join(here, '.generated');
await mkdir(generated, { recursive: true });
const result = await Bun.build({
  entrypoints: [join(here, 'tests/workbench-extraction-checks.tsx')],
  outdir: generated,
  naming: 'WorkbenchExtraction.test.js',
  target: 'browser',
  conditions: ['browser', 'production'],
  format: 'esm',
  define: definitions,
  banner,
  plugins: plugins(),
  external: ['bun:test'],
});
if (!result.success) throw Error(result.logs.map(String).join('\n'));
const child = Bun.spawn(
  [process.execPath, 'test', join(generated, 'WorkbenchExtraction.test.js')],
  { cwd: here, stdout: 'inherit', stderr: 'inherit' },
);
process.exit(await child.exited);
