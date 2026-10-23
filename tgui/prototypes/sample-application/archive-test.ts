import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { banner, definitions, here, plugins } from './build-options';

// Source-mounted simulated DOM checks only. Never emits application/preview dist.
const generated = join(here, '.generated');
await mkdir(generated, { recursive: true });
const result = await Bun.build({
  entrypoints: [join(here, 'tests/archive-checks.tsx')],
  outdir: generated,
  naming: 'ArchiveIntegration.test.js',
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
  [process.execPath, 'test', join(generated, 'ArchiveIntegration.test.js')],
  { cwd: here, stdout: 'inherit', stderr: 'inherit' },
);
process.exit(await child.exited);
