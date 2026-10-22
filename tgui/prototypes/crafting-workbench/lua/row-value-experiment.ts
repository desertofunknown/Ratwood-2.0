// Isolated actual-Fengari operation counts. No timings or production edits.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const here = import.meta.dir;
const output = join(here, '.generated/row-value');
const baselineCommit = 'fe543e16f56032100b197f3d9452767a1db56e5b';
const baseline = Bun.spawnSync(
  [
    'git',
    'show',
    `${baselineCommit}:tgui/prototypes/crafting-workbench/lua/workbench.lua`,
  ],
  { cwd: here },
);
if (baseline.exitCode !== 0) {
  throw new Error(String(baseline.stderr ?? 'Baseline read failed'));
}
const before = baseline.stdout.toString();
const after = await readFile(join(here, 'workbench.lua'), 'utf8');
const originalAdapter = await readFile(join(here, 'adapter.ts'), 'utf8');
await mkdir(output, { recursive: true });

function replaceOnce(source: string, needle: string, replacement: string) {
  if (source.split(needle).length !== 2) {
    throw new Error(`Expected exactly one instrumentation site: ${needle}`);
  }
  return source.replace(needle, replacement);
}

function instrument(source: string) {
  // Probes observe original operation sites without replacing any conversion,
  // DOM read, comparison or write. Only registered row nodes contribute counts.
  source = replaceOnce(
    source,
    '  local function text(node, value)\n    value = js.global:String(value)\n    if node.textContent ~= value then node.textContent = value end',
    `  local function text(node, value)
    host:probeRow(node, "textHelperCalls")
    host:probeRow(node, "stringConversions")
    value = js.global:String(value)
    host:probeRow(node, "textContentReads")
    if node.textContent ~= value then node.textContent = value end`,
  );
  source = replaceOnce(
    source,
    '  local function attr(node, key, value)\n    if value == nil then\n      if node:hasAttribute(key) then node:removeAttribute(key) end\n    else\n      value = tostring(value)\n      if node:getAttribute(key) ~= value then node:setAttribute(key, value) end',
    `  local function attr(node, key, value)
    host:probeRow(node, "attrHelperCalls")
    if value == nil then
      host:probeRow(node, "hasAttributeReads")
      if node:hasAttribute(key) then node:removeAttribute(key) end
    else
      value = tostring(value)
      host:probeRow(node, "getAttributeReads")
      if node:getAttribute(key) ~= value then node:setAttribute(key, value) end`,
  );
  for (const [field, statement] of [
    [
      'button',
      '    record.button = button("Workbench__recipe", nil, record.node)',
    ],
    [
      'name',
      '    record.name = element("span", "Workbench__recipe-name", nil, record.button)',
    ],
    [
      'ingredients',
      '    record.ingredients = element("span", "Workbench__recipe-ingredients", nil, record.button)',
    ],
    [
      'match',
      '    record.match = element("span", "Workbench__match", nil, record.button)',
    ],
    [
      'category',
      '          record.category = element("h2", "Workbench__category-heading")',
    ],
  ] as const) {
    source = replaceOnce(
      source,
      statement,
      `${statement}\n    host:registerRowNode(record.${field}, entry.identity, "${field}")`,
    );
  }
  return source;
}

const entry = join(output, 'entry.ts');
await writeFile(
  entry,
  `
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { mountWorkbench } from '../../adapter';
GlobalRegistrator.register();
const operations = ['textHelperCalls', 'stringConversions', 'textContentReads', 'attrHelperCalls', 'getAttributeReads', 'hasAttributeReads'];
const zero = () => Object.fromEntries(operations.map(key => [key, 0]));
const nodes = new WeakMap();
let capture;
globalThis.__rowExperiment = {
  registerRowNode(node, identity, field) { nodes.set(node, { identity, field }); },
  probeRow(node, operation) {
    const meta = nodes.get(node);
    if (!capture || !meta) return;
    const group = capture.existing.has(meta.identity) ? 'retained' : 'newlyCreated';
    capture.counts[group][operation]++;
    capture.counts.total[operation]++;
    const key = group + ':' + meta.field;
    (capture.counts.fields[key] ??= zero())[operation]++;
    const row = capture.counts.perRow[meta.identity] ??= { group, fields: {}, ...zero() };
    row[operation]++;
    (row.fields[meta.field] ??= zero())[operation]++;
  },
};
const recipes = Array.from({ length: 81 }, (_, index) => ({
  name: 'Recipe ' + String(index).padStart(4, '0'),
  path: '/row-experiment/recipe/' + index,
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
const rows = () => [...target.querySelectorAll('.Workbench__recipe')];
const identities = () => new Set(rows().map(node => nodes.get(node).identity));
const click = (text) => {
  const button = [...target.querySelectorAll('button')].find(node => node.textContent === text);
  if (!button) throw new Error('Missing button: ' + text);
  button.click();
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const results = {};
const measure = (name, action, check) => {
  const existing = identities();
  const counts = { retained: zero(), newlyCreated: zero(), total: zero(), fields: {}, perRow: {} };
  capture = { existing, counts };
  action();
  capture = undefined;
  const current = identities();
  check?.();
  const retained = [...current].filter(identity => existing.has(identity)).length;
  const active = document.activeElement;
  results[name] = {
    counts,
    rows: { before: existing.size, after: current.size, retained, added: current.size - retained, removed: existing.size - retained },
    // These snapshots happen after counting stops and cannot inflate reads.
    html: target.innerHTML,
    focus: active?.outerHTML,
  };
};
assert(rows().length === 40, 'Initial page must contain 40 rows');
measure('unchanged40', () => root.update(data));
measure('materialFlag40', () => {
  data.craftability[recipes[20].name] = 0;
  root.update(data);
}, () => assert(rows()[20].querySelector('.Workbench__match').textContent === 'Material match: not reported', 'Material flag stale'));
measure('nameAndIngredients40', () => {
  recipes[20].name += ' edited';
  recipes[20].req_text = '3 edited timber';
  data.craftability[recipes[20].name] = 0;
  root.update(data);
}, () => {
  assert(rows()[20].querySelector('.Workbench__recipe-name').textContent === 'Recipe 0020 edited', 'Name stale');
  assert(rows()[20].querySelector('.Workbench__recipe-ingredients').textContent === '3 edited timber', 'Ingredients stale');
});
measure('select40', () => rows()[5].click(), () => assert(rows()[5].getAttribute('aria-expanded') === 'true', 'Selection stale'));
measure('selectedUnchanged40', () => root.update(data));
measure('back40', () => click('← Back to recipes'), () => assert(rows()[5].getAttribute('aria-expanded') === 'false', 'Back state stale'));
measure('add40Rows', () => click('Show 40 more recipes'), () => assert(rows().length === 80, 'Pagination failed'));
measure('unchanged80', () => root.update(data));
measure('remove40Rows', () => {
  data.crafting_recipes.Benchmark = recipes.slice(0, 40);
  root.update(data);
}, () => assert(rows().length === 40, 'Removal failed'));
measure('readd40Rows', () => {
  data.crafting_recipes.Benchmark = recipes;
  root.update(data);
}, () => assert(rows().length === 80, 'Reappearance failed'));
root.unmount();
assert(!target.children.length, 'Unmount failed');
console.log(JSON.stringify(results));
`,
);

const results: Record<string, any> = {};
const hashes: Record<string, string> = {};
for (const [name, source] of [
  ['baseline', before],
  ['candidate', after],
] as const) {
  hashes[name] = createHash('sha256').update(source).digest('hex');
  const adapter = replaceOnce(
    replaceOnce(
      originalAdapter,
      "import source from './workbench.lua' with { type: 'text' };",
      `const source = ${JSON.stringify(instrument(source))};`,
    ),
    '        pageSize: PAGE_SIZE,',
    `        pageSize: PAGE_SIZE,
        registerRowNode: (globalThis as any).__rowExperiment.registerRowNode,
        probeRow: (globalThis as any).__rowExperiment.probeRow,`,
  );
  const built = await Bun.build({
    entrypoints: [entry],
    outdir: output,
    naming: `${name}.js`,
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
        name: 'isolated-row-value-counts',
        setup(build) {
          build.onLoad({ filter: /\/lua\/adapter\.ts$/ }, () => ({
            loader: 'ts',
            contents: adapter,
          }));
        },
      },
    ],
  });
  if (!built.success) throw new Error(built.logs.map(String).join('\n'));
  // Each variant starts in a separate process with a fresh actual Fengari VM.
  const run = Bun.spawnSync([process.execPath, join(output, `${name}.js`)], {
    cwd: here,
  });
  if (run.exitCode !== 0) {
    throw new Error(String(run.stderr ?? 'Experiment process failed'));
  }
  results[name] = JSON.parse(run.stdout.toString());
}

for (const name of Object.keys(results.baseline)) {
  const beforeResult = results.baseline[name];
  const afterResult = results.candidate[name];
  for (const field of ['html', 'focus', 'rows']) {
    if (
      JSON.stringify(beforeResult[field]) !== JSON.stringify(afterResult[field])
    ) {
      throw new Error(`${name}: A/B ${field} mismatch`);
    }
  }
  // Each helper has one conversion/read or attribute read per successful call.
  for (const result of [beforeResult, afterResult]) {
    const counts = result.counts.total;
    if (
      counts.textHelperCalls !== counts.stringConversions ||
      counts.textHelperCalls !== counts.textContentReads ||
      counts.attrHelperCalls !==
        counts.getAttributeReads + counts.hasAttributeReads
    ) {
      throw new Error(`${name}: inconsistent helper operation counts`);
    }
  }
  console.log(
    name,
    JSON.stringify(
      {
        rows: beforeResult.rows,
        baseline: beforeResult.counts,
        candidate: afterResult.counts,
      },
      (key, value) =>
        key === 'perRow' || key === 'fields' ? undefined : value,
    ),
  );
}
// Expected retained baseline text/attr, retained candidate text/attr, and
// new-row text/attr (identical in both variants). A retained category heading
// accounts for the one text call even when all cached row values are unchanged.
const expected: Record<string, readonly number[]> = {
  unchanged40: [121, 80, 1, 0, 0, 0],
  materialFlag40: [121, 80, 2, 1, 0, 0],
  nameAndIngredients40: [121, 80, 3, 0, 0, 0],
  select40: [121, 80, 1, 1, 0, 0],
  selectedUnchanged40: [121, 80, 1, 0, 0, 0],
  back40: [121, 80, 1, 1, 0, 0],
  add40Rows: [121, 80, 1, 0, 120, 120],
  unchanged80: [241, 160, 1, 0, 0, 0],
  remove40Rows: [121, 80, 1, 0, 0, 0],
  readd40Rows: [121, 80, 1, 0, 120, 120],
};
for (const [scenario, values] of Object.entries(expected)) {
  for (const [variant, offset] of [
    ['baseline', 0],
    ['candidate', 2],
  ] as const) {
    const retainedText = values[offset]!;
    const retainedAttr = values[offset + 1]!;
    const newText = values[4]!;
    const newAttr = values[5]!;
    for (const [group, text, attr] of [
      ['retained', retainedText, retainedAttr],
      ['newlyCreated', newText, newAttr],
      ['total', retainedText + newText, retainedAttr + newAttr],
    ] as const) {
      const counts = results[variant][scenario].counts[group];
      if (
        counts.textHelperCalls !== text ||
        counts.stringConversions !== text ||
        counts.textContentReads !== text ||
        counts.attrHelperCalls !== attr ||
        counts.getAttributeReads !== attr ||
        counts.hasAttributeReads !== 0
      ) {
        throw new Error(
          `${scenario}/${variant}/${group}: expected text=${text}, attr=${attr}; got ${JSON.stringify(counts)}`,
        );
      }
    }
  }
}
await writeFile(
  join(output, 'results.json'),
  JSON.stringify({ baselineCommit, hashes, results }, null, 2),
);
console.log('Source SHA-256:', JSON.stringify(hashes));
console.log(
  'PASS: exact row-operation counts and identical DOM/focus across all scenarios.',
);
console.log(
  'Counts describe instrumented Lua helper operation sites in Fengari + Happy DOM, not elapsed time or browser performance.',
);
