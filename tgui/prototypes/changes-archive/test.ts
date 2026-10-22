import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { here, plugins } from './build-options';
const generated = join(here, '.test-build');
await mkdir(generated, { recursive: true });
const result = await Bun.build({
  entrypoints: [join(here, 'view-checks.tsx')],
  outdir: generated,
  naming: 'view.test.js',
  target: 'browser',
  conditions: ['browser', 'production'],
  format: 'esm',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: plugins(),
  external: ['bun:test'],
});
if (!result.success) throw Error(result.logs.map(String).join('\n'));
for (const files of [
  [join(generated, 'view.test.js')],
  [join(here, 'oracle-checks.tsx')],
  [
    join(here, '../../packages/tgui/__tests__/changelog-archive.test.ts'),
    join(here, '../../packages/tgui/__tests__/changelog-filter.test.ts'),
  ],
]) {
  const child = Bun.spawn([process.execPath, 'test', ...files], {
    cwd: join(here, '../..'),
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const code = await child.exited;
  if (code) process.exit(code);
}
