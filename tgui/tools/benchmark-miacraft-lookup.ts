/**
 * From tgui:
 * python3 tools/extract-miacraft-workload.py /tmp/miacraft-fixture.json
 * bun tools/benchmark-miacraft-lookup.ts /tmp/miacraft-fixture.json /tmp/miacraft-results.json
 *
 * Warm pure-JavaScript derived-data timings, not React/DOM/browser/FPS or cold
 * startup. The source-derived fixture is an approximation, not a live payload.
 * Original expressions: MiaCraft.js at f37f615, lines 16-20, 44, 113, 142.
 * Every pass includes a fresh baseline entry array, fresh Set construction, or
 * a fresh predicate calling the actual helper. No cross-render cache assumed.
 * Seven batch averages, rotating arm order; min/max are not latency percentiles.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

import { isRecipeCraftable } from '../packages/tgui/interfaces/MiaCraft/craftability';

const [fixturePath, resultPath] = process.argv.slice(2);
if (!fixturePath || !resultPath || process.argv.length !== 4) {
  throw new Error(
    'Usage: bun tools/benchmark-miacraft-lookup.ts FIXTURE.json RESULTS.json',
  );
}
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const categories = fixture.categories;
type Mode = 'baseline' | 'set' | 'record';
function membership(record: any, mode: Mode) {
  if (mode === 'baseline') {
    const entries = Object.entries(record);
    return (name: unknown) =>
      entries.some((entry) => entry[0] === name && entry[1] === 1);
  }
  if (mode === 'set') {
    const names = new Set(
      Object.entries(record)
        .filter(([, value]) => value === 1)
        .map(([name]) => name),
    );
    return (name: unknown) => names.has(name as string);
  }
  return (name: unknown) => isRecipeCraftable(record, name);
}
function transform(
  catalog: any,
  record: any,
  onlyCraftable: boolean,
  searchText: string,
  open: string,
  mode: Mode,
) {
  if (mode === 'baseline') {
    // Keep the production baseline's item.name access inside each .some callback.
    const craftability = Object.entries(record);
    return Object.entries(catalog)
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([category, crafties]) => {
        const visible = Object.entries(crafties as any)
          .filter(
            ([, item]: any) =>
              !onlyCraftable ||
              craftability.some(
                (object) => object[0] === item.name && object[1] === 1,
              ),
          )
          .sort(([, a]: any, [, b]: any) =>
            String(a.name).localeCompare(String(b.name)),
          )
          .filter(([, item]: any) =>
            item.name.toLowerCase().includes(searchText),
          );
        const mounted = open === 'all' || open === category;
        return [
          category,
          visible.map(([key, item]: any) => [
            key,
            item.path,
            item.name,
            mounted
              ? craftability.some(
                  (object) => object[0] === item.name && object[1] === 1,
                )
              : null,
          ]),
        ];
      });
  }
  const craftable = membership(record, mode);
  return Object.entries(catalog)
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([category, crafties]) => {
      const visible = Object.entries(crafties as any)
        .filter(([, item]: any) => !onlyCraftable || craftable(item.name))
        .sort(([, a]: any, [, b]: any) =>
          String(a.name).localeCompare(String(b.name)),
        )
        .filter(([, item]: any) =>
          item.name.toLowerCase().includes(searchText),
        );
      const mounted = open === 'all' || open === category;
      return [
        category,
        visible.map(([key, item]: any) => [
          key,
          item.path,
          item.name,
          mounted ? craftable(item.name) : null,
        ]),
      ];
    });
}
const unusual = Object.create({ inherited: 1 });
Object.assign(unusual, {
  numeric: 1,
  boolean: true,
  string: '1',
  zero: 0,
  negative: -1,
  nan: NaN,
  missingValue: undefined,
  null: null,
});
for (const name of [
  '__proto__',
  'constructor',
  'toString',
  'hasOwnProperty',
  '01',
  '1',
]) {
  Object.defineProperty(unusual, name, { value: 1, enumerable: true });
}
Object.defineProperty(unusual, 'nonEnumerable', {
  value: 1,
  enumerable: false,
});
// Preserve Object.entries own-enumerable membership, including custom non-enumerable properties.
const plainRecord = Object.create({ inherited: 1 });
for (const [name, value] of Object.entries(unusual)) {
  Object.defineProperty(plainRecord, name, { value, enumerable: true });
}
Object.defineProperty(plainRecord, 'nonEnumerable', {
  value: 1,
  enumerable: false,
});
for (const name of [
  'numeric',
  'boolean',
  'string',
  'zero',
  'negative',
  'nan',
  'missingValue',
  'null',
  'nonEnumerable',
  'inherited',
  'absent',
  '__proto__',
  'constructor',
  'toString',
  'hasOwnProperty',
  '01',
  '1',
  undefined,
  null,
  1,
  true,
  {},
  Symbol('x'),
  NaN,
]) {
  const expected = membership(plainRecord, 'baseline')(name);
  assert.equal(membership(plainRecord, 'set')(name), expected);
  assert.equal(membership(plainRecord, 'record')(name), expected);
}
const specialCatalog = {
  Z: [
    { name: 'numeric', path: 'n1' },
    { name: 'numeric', path: 'n2' },
    { name: 'boolean', path: 'b' },
    { name: 'missing', path: 'm' },
    { name: '__proto__', path: 'p' },
    { name: 'constructor', path: 'c' },
  ],
  A: [
    { name: 'toString', path: 't' },
    { name: '1', path: 'one' },
    { name: 'inherited', path: 'i' },
    { name: 'nonEnumerable', path: 'nonenum' },
  ],
};
for (const only of [true, false]) {
  for (const query of ['', 'n', 'missing']) {
    for (const open of ['closed', 'Z', 'all']) {
      const expected = transform(
        specialCatalog,
        plainRecord,
        only,
        query,
        open,
        'baseline',
      );
      assert.deepEqual(
        transform(specialCatalog, plainRecord, only, query, open, 'set'),
        expected,
      );
      assert.deepEqual(
        transform(specialCatalog, plainRecord, only, query, open, 'record'),
        expected,
      );
    }
  }
}
let seed = 81429;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
}
const shuffled = [...fixture.names];
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}
const batches = 7,
  iterations = 25,
  warmup = 25;
let sink = 0;
const rows: any[] = [];
for (const ratio of [0, 0.1, 0.5, 1]) {
  const trueNames = new Set(
    shuffled.slice(0, Math.round(ratio * shuffled.length)),
  );
  const record = Object.fromEntries(
    fixture.names.map((name: string) => [name, trueNames.has(name) ? 1 : 0]),
  );
  for (const only of [true, false]) {
    for (const query of ['', 'wood']) {
      for (const open of ['closed', 'Crafting', 'all']) {
        const modes: Mode[] = ['baseline', 'set', 'record'];
        const measurements: any = {};
        const expected = transform(
          categories,
          record,
          only,
          query,
          open,
          'baseline',
        );
        for (const mode of modes) {
          assert.deepEqual(
            transform(categories, record, only, query, open, mode),
            expected,
          );
          measurements[mode] = [];
        }
        const run = (mode: Mode) => {
          const result = transform(categories, record, only, query, open, mode);
          sink += result.length + (result[0]?.[1] as any).length;
        };
        for (let i = 0; i < warmup; i++) for (const mode of modes) run(mode);
        for (let b = 0; b < batches; b++) {
          for (let k = 0; k < modes.length; k++) {
            const mode = modes[(k + b) % modes.length];
            const start = performance.now();
            for (let i = 0; i < iterations; i++) run(mode);
            measurements[mode].push(
              ((performance.now() - start) * 1000) / iterations,
            );
          }
        }
        for (const mode of modes) {
          const values = measurements[mode].sort(
            (a: number, b: number) => a - b,
          );
          measurements[mode] = {
            median_us: +values[3].toFixed(2),
            min_us: +values[0].toFixed(2),
            max_us: +values[6].toFixed(2),
          };
        }
        const row = {
          ratio,
          onlyCraftable: only,
          query,
          open,
          matchingRows: expected.reduce(
            (sum: number, [, v]: any) => sum + v.length,
            0,
          ),
          ...measurements,
        };
        rows.push(row);
        console.log(JSON.stringify(row));
      }
    }
  }
}
const report = {
  runtime: Bun.version,
  note: 'Warm Bun pure-JavaScript derived-data benchmark, not React/DOM/browser timing or FPS. Source-derived catalogue with counts reported below; simulated bounded craftability distribution. Every timed iteration includes fresh Object.entries (baseline), fresh Set construction (Set arm), or own-enumerable-property lookup (record arm), category sorting and unchanged recipe sort/filter pipeline. No inter-render cache. Inherited and own non-enumerable keys are excluded exactly as Object.entries. Backend JSON data contract; no getter/proxy side-effect equivalence claim. 7 batches of 25, 25 warmup per arm per case, rotating arm order. No cold-process or cold-browser claim.',
  recipeCount: fixture.recipe_count,
  craftabilityKeyCount: fixture.names.length,
  categoryCounts: fixture.category_counts,
  batches,
  iterations,
  warmup,
  sink,
  equivalence:
    'PASS: 48 source-backed scenarios plus 18 edge-case pipeline scenarios and 24 mixed membership inputs; duplicate names/order, numeric 1 vs true/string1/0, missing/inherited/own-nonenumerable/prototype-like names, non-string lookup names.',
  rows,
};
writeFileSync(resultPath, JSON.stringify(report, null, 2) + '\n');
console.log(
  'SUMMARY ' +
    JSON.stringify({
      runtime: report.runtime,
      equivalence: report.equivalence,
      sink,
    }),
);
