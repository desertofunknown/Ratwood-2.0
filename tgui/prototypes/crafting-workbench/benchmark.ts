import { writeFile } from 'node:fs/promises';

import { isRecipeCraftable } from '../../packages/tgui/interfaces/MiaCraft/craftability';
import { matchesRecipeSearch } from '../../packages/tgui/interfaces/MiaCraft/search';
import {
  filterRecipeEntries,
  getRecipeEntries,
  type WorkbenchData,
} from './model';

const fixturePath = process.argv[2];
const outputPath = process.argv[3];
if (!fixturePath || !outputPath) {
  throw new Error(
    'Usage: bun benchmark.ts source-derived-fixture.json results.json',
  );
}
const fixture = await Bun.file(fixturePath).json();
const categories = Object.fromEntries(
  Object.entries(fixture.categories).map(([category, recipes]) => [
    category,
    (recipes as { name: string; path: string }[]).map((recipe, index) => ({
      ...recipe,
      req_text: index % 2 ? '1 sample fiber' : '2 sample timber',
    })),
  ]),
);
const names = fixture.names as string[];
function original(data: WorkbenchData, query: string) {
  return Object.entries(data.crafting_recipes)
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .flatMap(([category, recipes]) =>
      Object.entries(recipes)
        .filter(
          ([, recipe]) =>
            !data.showonlycraftable ||
            isRecipeCraftable(data.craftability, recipe.name),
        )
        .sort(([, a], [, b]) => String(a.name).localeCompare(String(b.name)))
        .filter(([, recipe]) => matchesRecipeSearch(recipe, query))
        .map(([sourceKey, recipe]) =>
          JSON.stringify([category, sourceKey, recipe.path]),
        ),
    );
}
function prototype(data: WorkbenchData, query: string) {
  return filterRecipeEntries(
    getRecipeEntries(data),
    query,
    null,
    !!data.showonlycraftable,
  ).map((entry) => entry.identity);
}
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const results: unknown[] = [];
let sink = 0;
for (const fraction of [0.1, 0.5, 1]) {
  for (const only of [false, true]) {
    const data: WorkbenchData = {
      crafting_recipes: categories as WorkbenchData['crafting_recipes'],
      craftability: Object.fromEntries(
        names.map((name, index) => [
          name,
          Number(index % 100 < fraction * 100),
        ]),
      ),
      showonlycraftable: only,
    };
    for (const query of ['', 'iron', 'sample fiber', 'no-such-recipe']) {
      const expected = original(data, query);
      if (JSON.stringify(expected) !== JSON.stringify(prototype(data, query))) {
        throw new Error(`Output mismatch: ${fraction}/${only}/${query}`);
      }
      const samples = { original: [] as number[], prototype: [] as number[] };
      for (let warmup = 0; warmup < 20; warmup++) {
        sink += original(data, query).length + prototype(data, query).length;
      }
      for (let batch = 0; batch < 7; batch++) {
        const arms =
          batch % 2
            ? (['prototype', 'original'] as const)
            : (['original', 'prototype'] as const);
        for (const arm of arms) {
          const start = performance.now();
          for (let iteration = 0; iteration < 40; iteration++) {
            sink += (arm === 'original' ? original : prototype)(
              data,
              query,
            ).length;
          }
          samples[arm].push((performance.now() - start) / 40);
        }
      }
      results.push({
        fraction,
        only,
        query,
        matches: expected.length,
        originalMs: median(samples.original),
        prototypeMs: median(samples.prototype),
        samples,
      });
    }
  }
}
await writeFile(
  outputPath,
  JSON.stringify(
    {
      scope:
        'Warm Bun derived-data only. No React, layout, paint, native client or gameplay timing. Current name/path catalog with explicitly synthetic ingredient text and material distributions.',
      bun: Bun.version,
      recipes: fixture.recipe_count,
      categories: Object.keys(categories).length,
      warmups: 20,
      batches: 7,
      iterationsPerBatch: 40,
      equivalentCases: results.length,
      sink,
      results,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Verified and measured ${results.length} equivalent derived-data cases; ${fixture.recipe_count} source-derived recipes.`,
);
