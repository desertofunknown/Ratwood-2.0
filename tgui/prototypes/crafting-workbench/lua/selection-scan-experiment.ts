// Isolated actual-VM A/B: never edits the renderer, adapter or shared harness.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const here = import.meta.dir;
const output = join(here, '.generated/selection-scan');
await mkdir(output, { recursive: true });
const baseline = Bun.spawnSync(
  [
    'git',
    'show',
    '32371549f2fbb14b3b3a11ce8196f47aaddde065:tgui/prototypes/crafting-workbench/lua/workbench.lua',
  ],
  { cwd: here },
);
if (baseline.exitCode !== 0)
  throw new Error(String(baseline.stderr ?? 'Baseline read failed'));
const before = baseline.stdout.toString();
const after = await readFile(join(here, 'workbench.lua'), 'utf8');
const loop = `    for i = 0, filtered.length - 1 do
      if filtered[i].identity == selectedIdentity then selected = filtered[i]; break end
    end`;
const guarded = `    if selectedIdentity ~= nil then
      for i = 0, filtered.length - 1 do
        if filtered[i].identity == selectedIdentity then selected = filtered[i]; break end
      end
    end`;
if (before.replace(loop, guarded) !== after || !before.includes(loop)) {
  throw new Error(
    'Candidate must differ from pinned baseline ONLY by nil-selection guard.',
  );
}
for (const [name, source] of [
  ['baseline', before],
  ['candidate', after],
]) {
  await writeFile(join(output, `${name}.lua`), source);
  console.log(name, createHash('sha256').update(source).digest('hex'));
}
const entry = join(output, 'entry.ts');
await writeFile(
  entry,
  `
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { mountWorkbench } from '../../adapter';
GlobalRegistrator.register();
const counts = globalThis.__scanReads = { entry: 0, identity: 0 };
const recipes = Array.from({ length: 1282 }, (_, index) => ({
  name: 'Recipe ' + String(index).padStart(4, '0'),
  path: '/benchmark/recipe/' + index,
  req_text: index % 2 ? '1 fiber' : '2 timber',
}));
const data = {
  crafting_recipes: { Benchmark: recipes },
  craftability: Object.fromEntries(recipes.map(recipe => [recipe.name, 1])),
  showonlycraftable: false,
};
const target = document.createElement('div');
document.body.append(target);
const root = mountWorkbench(target, data, () => {});
counts.entry = counts.identity = 0;
root.update(data);
const reads = { ...counts };
const samples = [];
for (let iteration = 0; iteration < (globalThis.__instrumented ? 0 : 35); iteration++) {
  data.craftability[recipes[iteration].name] = 0;
  const start = performance.now();
  root.update(data);
  if (iteration >= 5) samples.push(performance.now() - start);
}
const rows = target.querySelectorAll('.Workbench__recipe').length;
if (rows !== 40 || target.querySelector('.Workbench__folio-title')) throw new Error('Nonneutral benchmark');
// Selection checks run only after neutral timings, outside all timed intervals.
const selectionReads = {};
if (globalThis.__instrumented) {
  const small = recipes.slice(0, 81);
  data.crafting_recipes.Benchmark = small;
  for (const recipe of small) data.craftability[recipe.name] = 1;
  root.update(data);
  const click = (text) => {
    const button = [...target.querySelectorAll('button')].find(node => node.textContent === text);
    if (!button) throw new Error('Missing button: ' + text);
    button.click();
  };
  const capture = (key) => {
    counts.entry = counts.identity = 0;
    root.update(data);
    selectionReads[key] = { ...counts };
  };
  target.querySelector('.Workbench__recipe').click();
  capture('first');
  click('← Back to recipes');
  click('Show 40 more recipes');
  click('Show 1 more recipes');
  target.querySelectorAll('.Workbench__recipe')[80].click();
  capture('last');
  data.showonlycraftable = true;
  root.update(data);
  if (target.querySelectorAll('.Workbench__recipe').length !== 40 || !target.querySelector('.Workbench__folio-title').textContent.includes('0080')) throw new Error('Off-page setup failed');
  capture('offpage');
}
root.unmount();
const sorted = [...samples].sort((a,b) => a-b);
console.log(JSON.stringify({ reads, selectionReads, rows, samples, median: samples.length ? (sorted[14] + sorted[15]) / 2 : null }));
`,
);
const adapterPath = join(here, 'adapter.ts');
const originalAdapter = await readFile(adapterPath, 'utf8');
const results: Record<string, any[]> = {};
// Counts include all renderer reads from the filtered list, not only the scan.
// The isolated guard therefore must remove exactly 1282 of each read.
const instrument = `filterRecipeEntries: (...args: Parameters<typeof filterRecipeEntries>) => {
  const counts = (globalThis as any).__scanReads;
  return new Proxy(filterRecipeEntries(...args), {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (typeof key !== 'string' || !/^\\d+$/.test(key)) return value;
      counts.entry++;
      return new Proxy(value, {
        get(entry, field, receiver) {
          if (field === 'identity') counts.identity++;
          return Reflect.get(entry, field, receiver);
        },
      });
    },
  });
},`;
for (const mode of ['counts', 'timing']) {
  for (const [name, source] of [
    ['baseline', before],
    ['candidate', after],
  ]) {
    const result = await Bun.build({
      entrypoints: [entry],
      outdir: output,
      naming: `${mode}-${name}.js`,
      target: 'browser',
      conditions: ['browser', 'production'],
      format: 'esm',
      external: ['@happy-dom/global-registrator'],
      define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
        'process.env.FENGARICONF': 'undefined',
        process: 'undefined',
      },
      plugins: [
        {
          name: 'isolated-selection-scan-variant',
          setup(build) {
            build.onLoad({ filter: /\/lua\/adapter\.ts$/ }, () => ({
              loader: 'ts',
              contents: (mode === 'counts'
                ? originalAdapter.replace(
                    '        filterRecipeEntries,',
                    '        ' + instrument,
                  )
                : originalAdapter
              ).replace(
                "import source from './workbench.lua' with { type: 'text' };",
                'const source = ' +
                  JSON.stringify(source) +
                  ';globalThis.__instrumented = ' +
                  (mode === 'counts') +
                  ';',
              ),
            }));
          },
        },
      ],
    });
    if (!result.success) throw new Error(result.logs.map(String).join('\n'));
  }
  for (let round = 0; round < (mode === 'counts' ? 1 : 4); round++) {
    // Reverse order on alternating rounds; fresh process and VM for every run.
    for (const name of round % 2
      ? ['candidate', 'baseline']
      : ['baseline', 'candidate']) {
      const run = Bun.spawnSync(
        [process.execPath, join(output, `${mode}-${name}.js`)],
        { cwd: here },
      );
      if (run.exitCode !== 0)
        throw new Error(String(run.stderr ?? 'Experiment process failed'));
      const measured = JSON.parse(run.stdout.toString());
      (results[`${mode}-${name}`] ??= []).push(measured);
      console.log(
        mode,
        name,
        round,
        JSON.stringify(
          mode === 'counts'
            ? {
                reads: measured.reads,
                selectionReads: measured.selectionReads,
                rows: measured.rows,
              }
            : { medianMs: measured.median, rows: measured.rows },
        ),
      );
    }
  }
}
for (const kind of ['entry', 'identity']) {
  const delta =
    results['counts-baseline'][0].reads[kind] -
    results['counts-candidate'][0].reads[kind];
  if (delta !== 1282)
    throw new Error(`${kind} read delta was ${delta}, expected 1282`);
}
if (
  JSON.stringify(results['counts-baseline'][0].selectionReads) !==
  JSON.stringify(results['counts-candidate'][0].selectionReads)
) {
  throw new Error('Selected first/last/off-page read counts changed.');
}
await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2));
console.log(
  'PASS: exactly 1282 fewer filtered-entry reads and identity reads per neutral update.',
);
console.log(
  'Timing is noninstrumented Bun/Happy DOM hypothesis evidence ONLY, not browser speed.',
);
