import { describe, expect, test } from 'bun:test';

import { isRecipeCraftable } from '../interfaces/MiaCraft/craftability';

// Independent oracle copied from MiaCraft.js at f37f615: Object.entries is
// computed once per render, and both filtering and background styling use
// this exact strict-name, strict-numeric-one membership expression.
const originalLookup = (craftability: Record<string, unknown>) => {
  const entries = Object.entries(craftability);
  return (name: unknown) =>
    entries.some((object) => object[0] === name && object[1] === 1);
};
const expectEquivalent = (
  craftability: Record<string, unknown>,
  names: readonly unknown[],
) => {
  const original = originalLookup(craftability);
  for (const name of names) {
    expect(isRecipeCraftable(craftability, name)).toBe(original(name));
  }
};

describe('MiaCraft craftability membership equivalence', () => {
  test.each([
    ['numeric one', 1, true],
    ['zero', 0, false],
    ['negative one', -1, false],
    ['two', 2, false],
    ['true', true, false],
    ['false', false, false],
    ['string one', '1', false],
    ['empty string', '', false],
    ['null', null, false],
    ['undefined', undefined, false],
    ['NaN', NaN, false],
    ['infinity', Infinity, false],
    ['bigint one', 1n, false],
    ['boxed one', Object(1), false],
    ['array containing one', [1], false],
    ['ordinary object', {}, false],
  ])('requires strict numeric one: %s', (_label, value, expected) => {
    const craftability = { Recipe: value };
    expect(originalLookup(craftability)('Recipe')).toBe(expected);
    expect(isRecipeCraftable(craftability, 'Recipe')).toBe(expected);
    expectEquivalent(craftability, ['recipe', 'Missing', '']);
  });

  test('missing keys and empty records are not craftable', () => {
    for (const craftability of [{}, Object.create(null)]) {
      expectEquivalent(craftability, [
        '',
        'Missing',
        'constructor',
        'toString',
        '__proto__',
        undefined,
      ]);
      expect(isRecipeCraftable(craftability, 'Missing')).toBe(false);
    }
  });

  test('string names retain exact spelling, whitespace, empty strings, and numeric-looking keys', () => {
    const craftability = {
      '': 1,
      '1': 1,
      '01': 1,
      Recipe: 1,
      ' recipe ': 1,
      Épée: 1,
    };
    expectEquivalent(craftability, [
      '',
      '1',
      '01',
      'Recipe',
      'recipe',
      ' recipe ',
      'Recipe ',
      'Épée',
      'épée',
    ]);
    expect(isRecipeCraftable(craftability, '1')).toBe(true);
    expect(isRecipeCraftable(craftability, '01')).toBe(true);
    expect(isRecipeCraftable(craftability, '')).toBe(true);
    expect(isRecipeCraftable(craftability, 'recipe')).toBe(false);
  });

  test('non-string names are not coerced into property keys', () => {
    const craftability = { '1': 1, true: 1, null: 1, undefined: 1, Recipe: 1 };
    const noCoercion = {
      toString() {
        throw new Error('A recipe name must not be coerced');
      },
    };
    const names = [
      1,
      0,
      true,
      false,
      null,
      undefined,
      1n,
      Object('Recipe'),
      ['Recipe'],
      Symbol('Recipe'),
      noCoercion,
    ];
    expectEquivalent(craftability, names);
    for (const name of names) {
      expect(isRecipeCraftable(craftability, name)).toBe(false);
    }
  });

  test('only own enumerable string properties count, including shadowed prototype values', () => {
    const craftability: Record<string, unknown> = Object.create({
      inherited: 1,
      shadowed: 1,
    });
    Object.defineProperties(craftability, {
      hidden: { value: 1 },
      visible: { value: 1, enumerable: true },
      shadowed: { value: 0, enumerable: true },
    });
    const symbol = Symbol('symbol');
    Object.defineProperty(craftability, symbol, { value: 1, enumerable: true });
    expectEquivalent(craftability, [
      'inherited',
      'hidden',
      'visible',
      'shadowed',
      symbol,
    ]);
    expect(isRecipeCraftable(craftability, 'visible')).toBe(true);
    for (const name of ['inherited', 'hidden', 'shadowed', symbol]) {
      expect(isRecipeCraftable(craftability, name)).toBe(false);
    }
  });

  test('prototype-like own names and null-prototype records do not bypass membership semantics', () => {
    const names = [
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
      'propertyIsEnumerable',
    ];
    for (const prototype of [Object.prototype, null]) {
      const craftability: Record<string, unknown> = Object.create(prototype);
      for (const name of names) {
        Object.defineProperty(craftability, name, {
          value: 1,
          enumerable: true,
        });
      }
      expectEquivalent(craftability, names);
      for (const name of names) {
        expect(isRecipeCraftable(craftability, name)).toBe(true);
      }
    }
  });

  test('duplicate recipe names remain separate recipes in original order and retain their paths', () => {
    const recipes = [
      { name: 'Ribbon', path: '/recipe/ribbon-second' },
      { name: 'Missing', path: '/recipe/missing' },
      { name: 'Ribbon', path: '/recipe/ribbon-first' },
      { name: 'Awl', path: '/recipe/awl' },
    ];
    const craftability = { Ribbon: 1, Awl: true };
    const original = originalLookup(craftability);
    const actual = recipes.filter((recipe) =>
      isRecipeCraftable(craftability, recipe.name),
    );
    expect(actual).toEqual(recipes.filter((recipe) => original(recipe.name)));
    expect(actual.map((recipe) => recipe.path)).toEqual([
      '/recipe/ribbon-second',
      '/recipe/ribbon-first',
    ]);
    expect(actual[0]).toBe(recipes[0]);
    expect(actual[1]).toBe(recipes[2]);
  });

  test('lookup never mutates craftability, descriptors, prototype, or recipe inputs', () => {
    const prototype = Object.freeze({ inherited: 1 });
    const craftability: Record<string, unknown> = Object.create(prototype);
    Object.defineProperties(craftability, {
      Recipe: { value: 1, enumerable: true },
      hidden: { value: 1 },
      propertyIsEnumerable: { value: 1, enumerable: true },
    });
    Object.freeze(craftability);
    const descriptors = Object.getOwnPropertyDescriptors(craftability);
    const recipes = Object.freeze([
      Object.freeze({ name: 'Recipe', path: '/recipe/one' }),
      Object.freeze({ name: 'Recipe', path: '/recipe/two' }),
      Object.freeze({ name: 'hidden', path: '/recipe/hidden' }),
      Object.freeze({ name: 'inherited', path: '/recipe/inherited' }),
    ]);
    const before = JSON.stringify(recipes);
    for (let repeat = 0; repeat < 3; repeat++) {
      expectEquivalent(
        craftability,
        recipes.map((recipe) => recipe.name),
      );
    }
    expect(Object.getOwnPropertyDescriptors(craftability)).toEqual(descriptors);
    expect(Object.getPrototypeOf(craftability)).toBe(prototype);
    expect(JSON.stringify(recipes)).toBe(before);
  });

  test('each fresh lookup observes changed values, ownership, and enumerability without caching', () => {
    const craftability: Record<string, unknown> = { Recipe: 1 };
    expectEquivalent(craftability, ['Recipe']);
    expect(isRecipeCraftable(craftability, 'Recipe')).toBe(true);
    craftability.Recipe = 0;
    expectEquivalent(craftability, ['Recipe']);
    expect(isRecipeCraftable(craftability, 'Recipe')).toBe(false);
    Object.defineProperty(craftability, 'Recipe', {
      value: 1,
      enumerable: false,
    });
    expectEquivalent(craftability, ['Recipe']);
    expect(isRecipeCraftable(craftability, 'Recipe')).toBe(false);
    Object.defineProperty(craftability, 'Recipe', { enumerable: true });
    expectEquivalent(craftability, ['Recipe']);
    expect(isRecipeCraftable(craftability, 'Recipe')).toBe(true);
    delete craftability.Recipe;
    expectEquivalent(craftability, ['Recipe']);
    expect(isRecipeCraftable(craftability, 'Recipe')).toBe(false);
  });

  test('deterministic mixed records preserve the original results across entry order and duplicate queries', () => {
    const names = [
      'Recipe',
      '1',
      '',
      'constructor',
      '__proto__',
      'propertyIsEnumerable',
      'é',
      ' spaced ',
    ];
    const values = [1, 0, true, '1', null, undefined, -1, 2];
    for (let iteration = 0; iteration < 48; iteration++) {
      const craftability: Record<string, unknown> = Object.create(
        iteration % 2 ? null : { inherited: 1 },
      );
      for (let index = 0; index < names.length; index++) {
        const name = names[(index + iteration) % names.length];
        Object.defineProperty(craftability, name, {
          value: values[(index * 3 + iteration) % values.length],
          enumerable: (index + iteration) % 3 !== 0,
        });
      }
      expectEquivalent(craftability, [
        ...names,
        ...names,
        'inherited',
        'Missing',
        1,
        null,
        Symbol('Recipe'),
      ]);
    }
  });
});

describe('MiaCraft per-path craftability overrides', () => {
  const path = '/recipe/variant';

  test('explicit zero overrides a craftable shared name and one overrides an uncraftable name', () => {
    expect(
      isRecipeCraftable({ Recipe: 1 }, 'Recipe', path, { [path]: 0 }),
    ).toBe(false);
    expect(
      isRecipeCraftable({ Recipe: 0 }, 'Recipe', path, { [path]: 1 }),
    ).toBe(true);
    expect(isRecipeCraftable({}, 'Missing', path, { [path]: 1 })).toBe(true);
  });

  test.each([
    ['numeric one', 1, true],
    ['zero', 0, false],
    ['negative one', -1, false],
    ['two', 2, false],
    ['true', true, false],
    ['false', false, false],
    ['string one', '1', false],
    ['empty string', '', false],
    ['null', null, false],
    ['undefined', undefined, false],
    ['NaN', NaN, false],
    ['infinity', Infinity, false],
    ['bigint one', 1n, false],
    ['boxed one', Object(1), false],
    ['array containing one', [1], false],
    ['ordinary object', {}, false],
  ])(
    'an existing path value requires strict numeric one: %s',
    (_label, value, expected) => {
      for (const legacy of [0, 1]) {
        expect(
          isRecipeCraftable({ Recipe: legacy }, 'Recipe', path, {
            [path]: value,
          }),
        ).toBe(expected);
      }
    },
  );

  test('missing, empty, and malformed optional maps retain the legacy lookup', () => {
    const malformed = [
      undefined,
      null,
      {},
      Object.create(null),
      [],
      [1],
      true,
      false,
      1,
      '1',
      Symbol('map'),
      1n,
      () => 1,
    ];
    for (const overrides of malformed) {
      for (const name of ['Recipe', 'Missing', '', 1, undefined]) {
        const legacy = { Recipe: 1, '': 1 };
        expect(isRecipeCraftable(legacy, name, path, overrides)).toBe(
          originalLookup(legacy)(name),
        );
      }
    }
    // Arrays and functions are not JSON records, even with matching own keys.
    for (const overrides of [[], () => 1]) {
      Object.defineProperty(overrides, path, { value: 0, enumerable: true });
      expect(isRecipeCraftable({ Recipe: 1 }, 'Recipe', path, overrides)).toBe(
        true,
      );
    }
  });

  test('missing, empty, and non-string paths are not coerced into override keys', () => {
    const noCoercion = {
      toString() {
        throw new Error('A recipe path must not be coerced');
      },
    };
    const paths = [
      undefined,
      null,
      '',
      0,
      1,
      true,
      false,
      1n,
      Object(path),
      [path],
      Symbol(path),
      noCoercion,
    ];
    const overrides = {
      '': 0,
      '1': 0,
      true: 0,
      null: 0,
      undefined: 0,
      [path]: 0,
    };
    for (const candidate of paths) {
      expect(
        isRecipeCraftable({ Recipe: 1 }, 'Recipe', candidate, overrides),
      ).toBe(true);
      expect(
        isRecipeCraftable({ Recipe: 0 }, 'Recipe', candidate, overrides),
      ).toBe(false);
    }
    expect(
      isRecipeCraftable({ Recipe: 1 }, 'Recipe', `${path} `, overrides),
    ).toBe(true);
    expect(
      isRecipeCraftable({ Recipe: 1 }, 'Recipe', path.toUpperCase(), overrides),
    ).toBe(true);
  });

  test('inherited and nonenumerable overrides fall back, but own enumerable shadows take priority', () => {
    const overrides = Object.create({ inherited: 0, shadowed: 1 });
    Object.defineProperties(overrides, {
      hidden: { value: 0 },
      shadowed: { value: 0, enumerable: true },
      visible: { value: 1, enumerable: true },
    });
    for (const candidate of ['inherited', 'hidden', 'missing']) {
      expect(
        isRecipeCraftable({ Recipe: 1 }, 'Recipe', candidate, overrides),
      ).toBe(true);
      expect(
        isRecipeCraftable({ Recipe: 0 }, 'Recipe', candidate, overrides),
      ).toBe(false);
    }
    expect(
      isRecipeCraftable({ Recipe: 1 }, 'Recipe', 'shadowed', overrides),
    ).toBe(false);
    expect(
      isRecipeCraftable({ Recipe: 0 }, 'Recipe', 'visible', overrides),
    ).toBe(true);
  });

  test('prototype-like own path keys work on ordinary and null-prototype records', () => {
    const keys = [
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
      'propertyIsEnumerable',
    ];
    for (const prototype of [Object.prototype, null]) {
      const overrides: Record<string, unknown> = Object.create(prototype);
      for (const key of keys) {
        Object.defineProperty(overrides, key, {
          value: 0,
          enumerable: true,
          writable: true,
        });
        expect(isRecipeCraftable({ Recipe: 1 }, 'Recipe', key, overrides)).toBe(
          false,
        );
        overrides[key] = 1;
        expect(isRecipeCraftable({ Recipe: 0 }, 'Recipe', key, overrides)).toBe(
          true,
        );
      }
    }
  });

  test('same-object changes to path values, ownership, and enumerability are observed without caching', () => {
    const legacy = { Recipe: 1 };
    const overrides: Record<string, unknown> = { [path]: 0 };
    expect(isRecipeCraftable(legacy, 'Recipe', path, overrides)).toBe(false);
    overrides[path] = 1;
    expect(isRecipeCraftable(legacy, 'Recipe', path, overrides)).toBe(true);
    overrides[path] = 0;
    Object.defineProperty(overrides, path, { enumerable: false });
    expect(isRecipeCraftable(legacy, 'Recipe', path, overrides)).toBe(true);
    Object.defineProperty(overrides, path, { enumerable: true });
    expect(isRecipeCraftable(legacy, 'Recipe', path, overrides)).toBe(false);
    delete overrides[path];
    expect(isRecipeCraftable(legacy, 'Recipe', path, overrides)).toBe(true);
    legacy.Recipe = 0;
    expect(isRecipeCraftable(legacy, 'Recipe', path, overrides)).toBe(false);
    overrides[path] = 1;
    expect(isRecipeCraftable(legacy, 'Recipe', path, overrides)).toBe(true);
  });

  test('duplicate and triple names retain individual paths and input order', () => {
    const recipes = [
      { name: 'Bolt', path: '/recipe/bolt-five' },
      { name: 'Ribbon', path: '/recipe/ribbon-two' },
      { name: 'Bolt', path: '/recipe/bolt-one' },
      { name: 'Ribbon', path: '/recipe/ribbon-one' },
      { name: 'Bolt', path: '/recipe/bolt-three' },
      { name: 'Awl', path: '/recipe/awl' },
    ];
    const legacy = { Bolt: 1, Ribbon: 0, Awl: 1 };
    const overrides = {
      '/recipe/bolt-five': 0,
      '/recipe/bolt-one': 1,
      '/recipe/bolt-three': 1,
      '/recipe/ribbon-two': 1,
      '/recipe/ribbon-one': 0,
    };
    const visible = recipes.filter((recipe) =>
      isRecipeCraftable(legacy, recipe.name, recipe.path, overrides),
    );
    expect(visible).toEqual([recipes[1], recipes[2], recipes[4], recipes[5]]);
    visible.forEach((recipe, index) =>
      expect(recipe).toBe(recipes[[1, 2, 4, 5][index]]),
    );
  });

  test('repeated paths override different names regardless of input or map order', () => {
    const recipes = [
      { name: 'Craftable', path: '/recipe/shared-on' },
      { name: 'Blocked', path: '/recipe/shared-off' },
      { name: 'Blocked', path: '/recipe/shared-on' },
      { name: 'Craftable', path: '/recipe/shared-off' },
    ];
    const legacy = { Craftable: 1, Blocked: 0 };
    const entries = [
      ['/recipe/shared-on', 1],
      ['/recipe/shared-off', 0],
    ];
    for (const input of [recipes, [...recipes].reverse()]) {
      for (const orderedEntries of [entries, [...entries].reverse()]) {
        const overrides = Object.fromEntries(orderedEntries);
        const expected = input.filter(
          (recipe) => recipe.path === '/recipe/shared-on',
        );
        const visible = input.filter((recipe) =>
          isRecipeCraftable(legacy, recipe.name, recipe.path, overrides),
        );
        expect(visible).toEqual(expected);
        expect(visible).toHaveLength(2);
        visible.forEach((recipe, index) =>
          expect(recipe).toBe(expected[index]),
        );
      }
    }
  });

  test('lookups do not mutate frozen records, descriptors, or recipe inputs', () => {
    const overrides = Object.freeze(
      Object.defineProperties(Object.create(null), {
        [path]: { value: 0, enumerable: true },
        hidden: { value: 1 },
      }),
    );
    const legacy = Object.freeze({ Recipe: 1 });
    const recipe = Object.freeze({ name: 'Recipe', path });
    const descriptors = Object.getOwnPropertyDescriptors(overrides);
    for (let repeat = 0; repeat < 3; repeat++) {
      expect(
        isRecipeCraftable(legacy, recipe.name, recipe.path, overrides),
      ).toBe(false);
    }
    expect(Object.getOwnPropertyDescriptors(overrides)).toEqual(descriptors);
    expect(Object.getPrototypeOf(overrides)).toBe(null);
    expect(legacy).toEqual({ Recipe: 1 });
    expect(recipe).toEqual({ name: 'Recipe', path });
  });
});
