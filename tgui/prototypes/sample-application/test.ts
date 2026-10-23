import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { banner, definitions, here, plugins } from './build-options';

// Source-mounted production-mode Happy DOM tests, NOT emitted browser app bundles.
const generated = join(here, '.generated');
await mkdir(generated, { recursive: true });
const result = await Bun.build({
  entrypoints: [join(here, 'tests/integration-checks.tsx')],
  outdir: generated,
  naming: 'Application.test.js',
  target: 'browser',
  conditions: ['browser', 'production'],
  format: 'esm',
  define: definitions,
  banner,
  plugins: plugins(),
  external: ['bun:test'],
});
if (!result.success) throw new Error(result.logs.map(String).join('\n'));
const child = Bun.spawn(
  [process.execPath, 'test', join(generated, 'Application.test.js')],
  { cwd: here, stdout: 'inherit', stderr: 'inherit' },
);
process.exit(await child.exited);
