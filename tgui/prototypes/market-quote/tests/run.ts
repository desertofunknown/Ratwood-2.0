import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { plugins } from '../build-options';
const here = import.meta.dir,
  tgui = resolve(here, '../../..'),
  generated = join(here, '.generated');
await mkdir(generated, { recursive: true });
async function run(file: string) {
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
      env: {
        ...process.env,
        MARKET_ORACLE_PATH: join(generated, 'market-oracle.json'),
      },
      stdout: 'inherit',
      stderr: 'inherit',
    },
  );
  if (await child.exited) process.exit(1);
}
await run(join(here, 'model-checks.ts'));
await run(join(here, 'production-oracle.tsx'));
await run(join(tgui, 'packages/tgui/__tests__/steward-trade-modal.test.tsx'));
await run(join(here, 'source-contracts.ts'));
const result = await Bun.build({
  entrypoints: [join(here, 'mounted-checks.tsx')],
  outdir: generated,
  naming: 'mounted-checks.js',
  target: 'browser',
  conditions: ['browser', 'production'],
  format: 'esm',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: plugins(),
  external: ['bun:test'],
});
if (!result.success) throw Error(result.logs.map(String).join('\n'));
await run(join(generated, 'mounted-checks.js'));
