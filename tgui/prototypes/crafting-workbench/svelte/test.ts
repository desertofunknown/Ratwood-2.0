import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sveltePlugin } from './compiler';

const here = dirname(fileURLToPath(import.meta.url));
const output = join(here, '.generated');
await mkdir(output, { recursive: true });
// Resolve Svelte's browser entry, exactly like the demo build. Only the test API
// stays external. This executes mounted production client code in Happy DOM.
const result = await Bun.build({
  entrypoints: [join(here, 'mounted-checks.ts')],
  outdir: output,
  naming: 'Workbench.test.js',
  target: 'browser',
  conditions: ['browser', 'production'],
  format: 'esm',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  external: ['bun:test'],
  plugins: [sveltePlugin()],
});
if (!result.success) throw new Error(result.logs.map(String).join('\n'));
const tests = Bun.spawn(
  [process.execPath, 'test', join(output, 'Workbench.test.js')],
  {
    cwd: here,
    stdout: 'inherit',
    stderr: 'inherit',
  },
);
process.exit(await tests.exited);
