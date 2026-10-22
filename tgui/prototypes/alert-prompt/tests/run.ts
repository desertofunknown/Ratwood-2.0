import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { plugins } from '../build-options';
const here = import.meta.dir;
const generated = join(here, '.generated');
await mkdir(generated, { recursive: true });
const tgui = resolve(here, '../../..');
const oracle = join(generated, 'production-records.json');
async function run(
  file: string,
  extra: Record<string, string> = {},
  stopOnFailure = true,
) {
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
  if (code && stopOnFailure) process.exit(code);
  return code;
}
// These are intentionally explicit, isolated phases, not main-suite test files.
await run(join(here, 'model-checks.ts'));
await run(join(here, 'source-contracts.ts'));
await run(join(here, 'production-oracle.tsx'), { ALERT_ORACLE_PATH: oracle });
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
let failed = false;
for (const framework of ['React', 'Svelte']) {
  const code = await run(
    join(generated, 'candidate.test.js'),
    {
      ALERT_ORACLE_PATH: oracle,
      ALERT_FRAMEWORK: framework,
      ALERT_CANDIDATE_PATH: join(
        generated,
        `${framework.toLowerCase()}-records.json`,
      ),
    },
    false,
  );
  failed ||= code !== 0;
}
if (failed) process.exit(1);
