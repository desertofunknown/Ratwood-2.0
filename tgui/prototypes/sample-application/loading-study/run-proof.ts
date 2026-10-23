import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const here = import.meta.dir;
const repository = resolve(here, '../../../..');
const generated = join(here, '.generated');
await mkdir(generated, { recursive: true });
const manifest = JSON.parse(
  await readFile(join(here, 'dist/manifest.json'), 'utf8'),
);
assert.equal(Bun.version, manifest.bun);
for (const file of manifest.files) {
  const bytes = await readFile(join(here, 'dist', file.path));
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    file.sha256,
    `Emitted artifact changed after graph audit: ${file.path}`,
  );
}
for (const source of [
  ...Object.values(manifest.sources).flat(),
  ...manifest.buildRecipe,
] as { path: string; sha256: string }[]) {
  const path = resolve(repository, source.path);
  assert(
    path.startsWith(repository + '/'),
    'Source inventory escaped repository.',
  );
  const bytes = await readFile(path);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    source.sha256,
    `Source changed after build: ${source.path}. Rebuild before testing.`,
  );
}
const wrapper = join(generated, 'ModuleProof.test.ts');
await writeFile(wrapper, "import '../proof-checks';\n");
const scenarios = [
  'uninstalled facade fails closed',
  'cold production refuses before install without getter reads',
  'real host and deferred modules share one owned binding',
  ...['global', 'window'].flatMap((target) =>
    ['Byond', 'hubStorage'].flatMap((property) =>
      ['own', 'inherited'].map(
        (ownership) => `startup ${target} ${property} ${ownership}`,
      ),
    ),
  ),
  ...['global', 'window'].flatMap((target) =>
    ['Byond', 'hubStorage'].flatMap((property) =>
      ['own', 'inherited'].map(
        (ownership) => `warm foreign ${target} ${property} ${ownership}`,
      ),
    ),
  ),
  ...['production', 'deferred'].map((kind) => `cold pending retire ${kind}`),
  ...['production', 'deferred'].map((kind) => `cold pending foreign ${kind}`),
  'cached imports and retained callbacks lose authority at retirement',
];
let assertions = 0;
const reports: { scenario: string; assertions: number }[] = [];
for (const scenario of scenarios) {
  // ESM evaluation errors are cached. Each scenario gets a fresh process and
  // exact same immutable module URLs, never cache-busting singleton copies.
  const child = Bun.spawn(
    [
      process.execPath,
      'test',
      '--preload',
      join(here, '../../../happydom.ts'),
      wrapper,
    ],
    {
      cwd: here,
      env: { ...process.env, LOADING_PROOF_CASE: scenario },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const log = stdout + stderr;
  process.stdout.write(log);
  assert.equal(code, 0, `${scenario} failed`);
  assert.match(log, /\b1 pass\b/);
  assert.match(log, /\b0 fail\b/);
  const count = Number(log.match(/(\d+) expect\(\) calls/)?.[1]);
  assert(
    Number.isInteger(count) && count > 0,
    'Missing pinned Bun assertion summary',
  );
  assertions += count;
  reports.push({ scenario, assertions: count });
}
const report = {
  environment: `Bun ${Bun.version} + Happy DOM; no browser/native/route-lazy/performance claim`,
  scenarios: reports,
  passed: reports.length,
  assertions,
  emittedHashes: manifest.files.map(
    ({ path, sha256 }: { path: string; sha256: string }) => ({ path, sha256 }),
  ),
};
await writeFile(
  join(generated, 'proof-results.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  `Module proof: ${reports.length} isolated cases / ${assertions} assertions passed.`,
);
