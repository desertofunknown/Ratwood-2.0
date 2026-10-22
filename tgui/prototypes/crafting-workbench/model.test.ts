import { describe, expect, test } from 'bun:test';

import { isRecipeCraftable } from '../../packages/tgui/interfaces/MiaCraft/craftability';
import { matchesRecipeSearch } from '../../packages/tgui/interfaces/MiaCraft/search';
import {
  filterRecipeEntries,
  getRecipeEntries,
  type WorkbenchData,
} from './model';

const data: WorkbenchData = {
  crafting_recipes: {
    Zeta: [
      { name: 'Saw', path: '/saw', req_text: ' 1 Iron' },
      {
        name: 'Hammer',
        path: '/hammer',
        req_text: ' 2 Wood',
        tool_text: 'Hidden tool',
        catalyst_text: 'Hidden catalyst',
        craftingdifficulty: 'Very hard',
        sellprice: 987,
      },
    ],
    Alpha: {
      second: { name: 'Ribbon', path: '/ribbon-second', req_text: ' 2 Silk' },
      first: { name: 'Awl', path: '/awl', req_text: ' 1 Iron' },
      third: { name: 'Ribbon', path: '/ribbon-first', req_text: ' 2 Hemp' },
      literal: {
        name: 'A [<"&>]',
        path: '/hidden/path',
        req_text: 'Cloth  & thread',
      },
    },
  },
  craftability: { Saw: 1, Hammer: true, Ribbon: 1, Awl: '1' },
  showonlycraftable: false,
};

describe('standalone catalog equivalence', () => {
  test('stable category and recipe sorting matches production without mutation or deduplication', () => {
    const before = JSON.stringify(data);
    const entries = getRecipeEntries(data);
    const expected = Object.entries(data.crafting_recipes)
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .flatMap(([, recipes]) =>
        Object.entries(recipes)
          .sort(([, a], [, b]) => String(a.name).localeCompare(String(b.name)))
          .map(([, recipe]) => recipe),
      );
    expect(entries.map((entry) => entry.recipe)).toEqual(expected);
    expect(
      entries
        .filter((entry) => entry.recipe.name === 'Ribbon')
        .map((entry) => entry.recipe.path),
    ).toEqual(['/ribbon-second', '/ribbon-first']);
    expect(new Set(entries.map((entry) => entry.identity)).size).toBe(
      entries.length,
    );
    expect(JSON.stringify(data)).toBe(before);
  });

  test('all query/filter combinations retain production literal search and strict membership', () => {
    const entries = getRecipeEntries(data);
    for (const query of [
      '',
      'IRON',
      ' ',
      'iron ',
      '  ',
      '[<"&>]',
      'Hidden tool',
      'Hidden catalyst',
      'Very hard',
      '987',
      '/hidden/path',
      'Alpha',
    ]) {
      for (const category of [null, 'Alpha', 'Zeta', 'Absent']) {
        for (const only of [false, true]) {
          const expected = entries.filter(
            (entry) =>
              (category === null || entry.category === category) &&
              (!only ||
                isRecipeCraftable(data.craftability, entry.recipe.name)) &&
              matchesRecipeSearch(entry.recipe, query.toLowerCase()),
          );
          expect(filterRecipeEntries(entries, query, category, only)).toEqual(
            expected,
          );
        }
      }
    }
  });

  test('a source slot replacement cannot retain another recipe path identity', () => {
    const before = getRecipeEntries({
      ...data,
      crafting_recipes: { Alpha: [{ name: 'Twin', path: '/one' }] },
    });
    const after = getRecipeEntries({
      ...data,
      crafting_recipes: { Alpha: [{ name: 'Twin', path: '/two' }] },
    });
    expect(before[0].identity).not.toBe(after[0].identity);
  });

  test('same path entries and unusual category/key/path delimiters are not collapsed', () => {
    const entries = getRecipeEntries({
      ...data,
      crafting_recipes: {
        'A:[]"': {
          '1:"': { name: 'Twin', path: '/same' },
          '2:"': { name: 'Twin', path: '/same' },
        },
        A: [{ name: 'Twin', path: '/same' }],
      },
    });
    expect(entries).toHaveLength(3);
    expect(new Set(entries.map((entry) => entry.identity)).size).toBe(3);
  });

  test('name-keyed material hint uses own enumerable strict 1, including special names', () => {
    const craftability = Object.create({ inherited: 1 });
    for (const [name, value] of Object.entries({
      one: 1,
      string: '1',
      yes: true,
      nil: null,
      zero: 0,
    })) {
      craftability[name] = value;
    }
    Object.defineProperty(craftability, '__proto__', {
      value: 1,
      enumerable: true,
    });
    Object.defineProperty(craftability, 'hidden', {
      value: 1,
      enumerable: false,
    });
    const entries = getRecipeEntries({
      ...data,
      craftability,
      crafting_recipes: {
        A: [
          'one',
          'string',
          'yes',
          'nil',
          'zero',
          '__proto__',
          'inherited',
          'hidden',
        ].map((name) => ({ name, path: `/${name}` })),
      },
    });
    expect(
      entries
        .filter((entry) => entry.materialMatch)
        .map((entry) => entry.recipe.name)
        .sort(),
    ).toEqual(['__proto__', 'one']);
  });
});
