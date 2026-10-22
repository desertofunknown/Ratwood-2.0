import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sveltePlugin } from '../svelte/compiler';

const here = dirname(fileURLToPath(import.meta.url));
const output = join(here, '.generated');
await mkdir(output, { recursive: true });
// Execute the actual browser-target Fengari VM + Lua source, not a JS UI clone.
const result = await Bun.build({
  entrypoints: [join(here, 'mounted-checks.ts')],
  outdir: output,
  naming: 'Workbench.test.js',
  target: 'browser',
  conditions: ['browser', 'production'],
  format: 'esm',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env.FENGARICONF': 'undefined',
    process: 'undefined',
  },
  loader: { '.lua': 'text' },
  external: ['bun:test'],
  plugins: [sveltePlugin()],
});
if (!result.success) throw new Error(result.logs.map(String).join('\n'));
const tests = Bun.spawn(
  [process.execPath, 'test', join(output, 'Workbench.test.js')],
  { cwd: here, stdout: 'inherit', stderr: 'inherit' },
);
process.exit(await tests.exited);
