import { describe, expect, test } from 'bun:test';

import { matchesRecipeSearch } from '../interfaces/MiaCraft/search';

describe('MiaCraft name-or-visible-ingredient search', () => {
  test('empty query keeps recipes regardless of missing or malformed display fields', () => {
    for (const recipe of [
      {},
      { name: 'Hammer', req_text: ' 1 Iron ingot' },
      { name: null, req_text: undefined },
      { name: 17, req_text: false },
    ]) {
      expect(matchesRecipeSearch(recipe, '')).toBe(true);
    }
  });

  test.each([
    [
      'name only',
      { name: 'Iron ring', req_text: ' 1 Gold ingot' },
      'iron',
      true,
    ],
    [
      'ingredients only',
      { name: 'Hammer', req_text: ' 1 IRON ingot' },
      'iron',
      true,
    ],
    [
      'both fields',
      { name: 'Iron nail', req_text: ' 1 Iron ingot' },
      'iron',
      true,
    ],
    ['neither field', { name: 'Bandage', req_text: ' 1 Cloth' }, 'iron', false],
    ['name substring', { name: 'HAMMER' }, 'amm', true],
    [
      'ingredient substring',
      { req_text: ' 2 Iron ingot, 1 Stick' },
      'on ing',
      true,
    ],
    [
      'displayed quantity',
      { req_text: ' 2 Iron ingot, 1 Stick' },
      '2 iron',
      true,
    ],
    ['no plural expansion', { req_text: ' 1 Stick' }, 'sticks', false],
    [
      'no tokenization',
      { name: 'Hammer', req_text: ' 1 Iron ingot' },
      'hammer iron',
      false,
    ],
    [
      'no term reordering',
      { req_text: ' 2 Iron ingot, 1 Stick' },
      'stick iron',
      false,
    ],
    [
      'whitespace matches literally',
      { name: 'Hammer', req_text: ' 1 Iron ingot' },
      ' iron ',
      true,
    ],
    [
      'trailing space is significant',
      { req_text: ' 1 Cloth' },
      'cloth ',
      false,
    ],
    [
      'whitespace is not an empty query',
      { name: 'Hammer', req_text: '' },
      ' ',
      false,
    ],
  ])('%s', (_label, recipe, query, expected) => {
    expect(matchesRecipeSearch(recipe, query)).toBe(expected);
  });

  test('missing, null, and empty ingredient text preserve name matches', () => {
    expect(matchesRecipeSearch({ name: 'Hammer' }, 'hammer')).toBe(true);
    for (const req_text of [undefined, null, '']) {
      expect(matchesRecipeSearch({ name: 'Hammer', req_text }, 'hammer')).toBe(
        true,
      );
      expect(matchesRecipeSearch({ name: 'Hammer', req_text }, 'iron')).toBe(
        false,
      );
    }
  });

  test('non-string fields are ignored without coercion and cannot hide a valid match in the other field', () => {
    const noCoercion = {
      toString() {
        throw new Error('Search must not stringify non-display fields');
      },
    };
    for (const value of [
      undefined,
      null,
      1,
      true,
      ['iron'],
      { ingredient: 'iron' },
      Object('iron'),
      Symbol('iron'),
      noCoercion,
    ]) {
      expect(
        matchesRecipeSearch({ name: value, req_text: value }, 'iron'),
      ).toBe(false);
      expect(
        matchesRecipeSearch({ name: 'Iron ring', req_text: value }, 'iron'),
      ).toBe(true);
      expect(
        matchesRecipeSearch({ name: value, req_text: ' 1 Iron ingot' }, 'iron'),
      ).toBe(true);
    }
  });

  test('only name and displayed req_text are searchable, not other recipe metadata', () => {
    const recipe = {
      name: 'Belt',
      req_text: ' 2 Cloth',
      path: '/datum/crafting_recipe/secret_path',
      ref: 'hidden-reference-marker',
      tool_text: 'Knife',
      catalyst_text: 'Water',
      craftingdifficulty: 'Easy',
      sellprice: 4,
      category: 'Tailoring',
      reqs: { '/obj/item/secret_ingredient': 2 },
    };
    for (const query of [
      'secret_path',
      'hidden-reference-marker',
      'knife',
      'water',
      'easy',
      '4',
      'tailoring',
      'secret_ingredient',
    ]) {
      expect(matchesRecipeSearch(recipe, query)).toBe(false);
    }
    expect(matchesRecipeSearch(recipe, 'cloth')).toBe(true);
    expect(matchesRecipeSearch(recipe, 'belt')).toBe(true);
  });

  test('filtering never mutates recipes or merges same-name variants', () => {
    const recipes = Object.freeze([
      Object.freeze({
        name: 'Ribbon',
        path: '/recipe/ribbon-second',
        req_text: ' 2 Hemp fibre',
      }),
      Object.freeze({
        name: 'Awl',
        path: '/recipe/awl',
        req_text: ' 1 Iron ingot',
      }),
      Object.freeze({
        name: 'Ribbon',
        path: '/recipe/ribbon-first',
        req_text: ' 2 Silk fibre',
      }),
    ]);
    const before = JSON.stringify(recipes);
    const matching = recipes.filter((recipe) =>
      matchesRecipeSearch(recipe, 'fibre'),
    );
    expect(matching).toEqual([recipes[0], recipes[2]]);
    expect(matching[0]).toBe(recipes[0]);
    expect(matching[1]).toBe(recipes[2]);
    expect(
      recipes.filter((recipe) => matchesRecipeSearch(recipe, 'silk')),
    ).toEqual([recipes[2]]);
    expect(recipes.filter((recipe) => matchesRecipeSearch(recipe, ''))).toEqual(
      [...recipes],
    );
    expect(JSON.stringify(recipes)).toBe(before);
  });
});
