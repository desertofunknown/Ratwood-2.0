import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { plugins } from '../build-options';
const here = import.meta.dir;
const generated = join(here, '.generated');
await mkdir(generated, { recursive: true });
const tgui = resolve(here, '../../..');
const oracle = join(generated, 'production-records.json');
async function run(file: string, extra: Record<string, string> = {}) {
  const child = Bun.spawn(
    [
      process.execPath,
      'test',
      '--tsconfig-override',
      join(tgui, 'tsconfig.json'),
      file,
    ],
    {
      cwd: tgui,
      env: { ...process.env, ...extra },
      stdout: 'inherit',
      stderr: 'inherit',
    },
  );
  const code = await child.exited;
  if (code) process.exit(code);
}
await run(join(here, 'production-oracle.tsx'), {
  SELECTION_ORACLE_PATH: oracle,
});
const result = await Bun.build({
  entrypoints: [join(here, 'candidate-checks.tsx')],
  outdir: generated,
  naming: 'candidate.test.js',
  target: 'browser',
  conditions: ['browser', 'production'],
  format: 'esm',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: plugins(),
  external: ['bun:test'],
});
if (!result.success) throw Error(result.logs.map(String).join('\n'));
await run(join(generated, 'candidate.test.js'), {
  SELECTION_ORACLE_PATH: oracle,
});
await run(join(here, 'source-contracts.ts'));
