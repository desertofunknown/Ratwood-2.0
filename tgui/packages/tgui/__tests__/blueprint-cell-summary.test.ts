import { describe, expect, test } from 'bun:test';

import {
  type BuildableType,
  buildCellSummaries,
  type CellSummary,
  emptyCellSummary,
  type GridCell,
} from '../interfaces/BlueprintPlanner/cellSummary';

const DIRS = { NORTH: 1, SOUTH: 2, EAST: 4, WEST: 8 };
const makeType = (layer_type: BuildableType['layer_type']): BuildableType => ({
  name: layer_type,
  category: 'test',
  layer_type,
  reqs_text: '',
  image: '',
});
const types = {
  floor: makeType('floor'),
  wall: makeType('wall'),
  object: makeType('obj'),
  border: makeType('border'),
};
const tile = (type: string, extra: Partial<GridCell> = {}): GridCell => ({
  x: 0,
  y: 0,
  z: 0,
  type,
  ...extra,
});

// Independent oracle copied from BlueprintPlanner.tsx at
// b3b86e2f2b2417e0f51bb4424209354043fbec6a, lines 524-532 and 1088-1115.
// Keep the original grouping and find/filter/some expressions, not an alternate
// implementation of buildCellSummaries. Only the surrounding function is new.
function originalCellMap(grid: readonly GridCell[]) {
  const map: Record<string, GridCell[]> = {};
  grid.forEach((c) => {
    const key = `${c.x}_${c.y}_${c.z}`;
    if (!map[key]) map[key] = [];
    map[key].push(c);
  });
  return map;
}

function originalRenderCell(
  cellMap: Record<string, GridCell[]>,
  buildableTypes: Record<string, BuildableType>,
  cell: { x: number; y: number },
  activeZ: number,
): CellSummary {
  const currentLayerCells = cellMap[`${cell.x}_${cell.y}_${activeZ}`] || [];
  const lowerLayerCells =
    activeZ > 0 ? cellMap[`${cell.x}_${cell.y}_${activeZ - 1}`] || [] : [];

  const floorTile = currentLayerCells.find(
    (c) => buildableTypes[c.type]?.layer_type === 'floor',
  );
  const wallTile = currentLayerCells.find(
    (c) => buildableTypes[c.type]?.layer_type === 'wall',
  );
  const objTile = currentLayerCells.find(
    (c) => buildableTypes[c.type]?.layer_type === 'obj',
  );
  const borderTiles = currentLayerCells.filter(
    (c) => buildableTypes[c.type]?.layer_type === 'border',
  );
  const lowerTile =
    lowerLayerCells.find(
      (c) => buildableTypes[c.type]?.layer_type === 'wall',
    ) ||
    lowerLayerCells.find(
      (c) => buildableTypes[c.type]?.layer_type === 'floor',
    ) ||
    lowerLayerCells[0];
  const hasNorthBorder = borderTiles.some((b) => b.dir === DIRS.NORTH);
  const hasSouthBorder = borderTiles.some((b) => b.dir === DIRS.SOUTH);
  const hasEastBorder = borderTiles.some((b) => b.dir === DIRS.EAST);
  const hasWestBorder = borderTiles.some((b) => b.dir === DIRS.WEST);
  return {
    floorTile,
    wallTile,
    objTile,
    borderTiles,
    lowerTile,
    hasNorthBorder,
    hasSouthBorder,
    hasEastBorder,
    hasWestBorder,
  };
}

function summaryRenderCell(
  summaries: Record<string, CellSummary>,
  cell: { x: number; y: number },
  activeZ: number,
): CellSummary {
  return {
    ...(summaries[`${cell.x}_${cell.y}_${activeZ}`] || emptyCellSummary),
    lowerTile:
      activeZ > 0
        ? summaries[`${cell.x}_${cell.y}_${activeZ - 1}`]?.lowerTile
        : undefined,
  };
}

function expectSameIdentity(actual: CellSummary, expected: CellSummary) {
  for (const key of [
    'floorTile',
    'wallTile',
    'objTile',
    'lowerTile',
  ] as const) {
    if (expected[key] === undefined) expect(actual[key]).toBeUndefined();
    else expect(actual[key]).toBe(expected[key]);
  }
  expect(actual.borderTiles.length).toBe(expected.borderTiles.length);
  for (let i = 0; i < expected.borderTiles.length; i++) {
    expect(actual.borderTiles[i]).toBe(expected.borderTiles[i]);
  }
  expect(actual.hasNorthBorder).toBe(expected.hasNorthBorder);
  expect(actual.hasSouthBorder).toBe(expected.hasSouthBorder);
  expect(actual.hasEastBorder).toBe(expected.hasEastBorder);
  expect(actual.hasWestBorder).toBe(expected.hasWestBorder);
}

function expectEquivalent(
  grid: readonly GridCell[],
  buildableTypes: Record<string, BuildableType> = types,
) {
  const original = originalCellMap(grid);
  const summaries = buildCellSummaries(grid, buildableTypes);
  expect(Object.keys(summaries).sort()).toEqual(Object.keys(original).sort());
  const positions = new Map<string, { x: number; y: number }>();
  for (const cell of [...grid, tile('missing', { x: 100, y: -100 })]) {
    positions.set(`${cell.x}_${cell.y}`, cell);
  }
  for (const cell of positions.values()) {
    // Includes z=0 (no lower layer), every stored z, and z=4 (lower-only).
    for (let activeZ = 0; activeZ <= 4; activeZ++) {
      expectSameIdentity(
        summaryRenderCell(summaries, cell, activeZ),
        originalRenderCell(original, buildableTypes, cell, activeZ),
      );
    }
  }
  return summaries;
}

describe('Blueprint cell summary equivalence', () => {
  test('preserves first matching object identity and all borders in input order', () => {
    const firstFloor = tile('floor');
    const firstWall = tile('wall');
    const firstObject = tile('object');
    const borders = [
      tile('border', { dir: 8 }),
      tile('border', { dir: 1 }),
      tile('border', { dir: 8 }),
    ];
    const grid = [
      tile('unknown'),
      borders[0],
      firstObject,
      firstFloor,
      firstWall,
      borders[1],
      tile('floor'),
      tile('wall'),
      tile('object'),
      borders[2],
    ];
    const summary = expectEquivalent(grid)['0_0_0'];
    expect(summary.floorTile).toBe(firstFloor);
    expect(summary.wallTile).toBe(firstWall);
    expect(summary.objTile).toBe(firstObject);
    expect(summary.lowerTile).toBe(firstWall);
    borders.forEach((border, i) => expect(summary.borderTiles[i]).toBe(border));
  });

  test.each([undefined, 0, 3, 5, 6, 7, 9, 10, 12, 15, -1, '1'])(
    'non-cardinal direction %p is not treated as a direction bitmask',
    (dir) => {
      const summary = expectEquivalent([
        tile('border', { dir: dir as number | undefined }),
      ])['0_0_0'];
      expect([
        summary.hasNorthBorder,
        summary.hasSouthBorder,
        summary.hasEastBorder,
        summary.hasWestBorder,
      ]).toEqual([false, false, false, false]);
    },
  );

  test.each([
    [1, true, false, false, false],
    [2, false, true, false, false],
    [4, false, false, true, false],
    [8, false, false, false, true],
  ])(
    'cardinal direction %p sets only its matching border flag',
    (dir, ...flags) => {
      const summary = expectEquivalent([
        tile('border', { dir: dir as number }),
        tile('border', { dir: 3 }),
      ])['0_0_0'];
      expect([
        summary.hasNorthBorder,
        summary.hasSouthBorder,
        summary.hasEastBorder,
        summary.hasWestBorder,
      ]).toEqual(flags);
    },
  );

  test('lower preview prioritizes first wall, then first floor, then first-any', () => {
    const unknown = tile('removed-type');
    const object = tile('object');
    const floor = tile('floor');
    const wall = tile('wall');
    for (const [grid, expected] of [
      [[unknown, object, floor, wall, tile('wall')], wall],
      [[unknown, object, floor, tile('floor')], floor],
      [[unknown, object, tile('border')], unknown],
      [[object, tile('border'), unknown], object],
    ] as [GridCell[], GridCell][]) {
      expect(expectEquivalent(grid)['0_0_0'].lowerTile).toBe(expected);
    }
  });

  test('empty grid and unknown-only cells preserve empty rendering and fallback', () => {
    expect(expectEquivalent([])).toEqual({});
    const unknown = tile('removed-type');
    const summary = expectEquivalent([unknown])['0_0_0'];
    expect(summary.lowerTile).toBe(unknown);
    expect(summary.floorTile).toBeUndefined();
    expect(summary.wallTile).toBeUndefined();
    expect(summary.objTile).toBeUndefined();
    expect(summary.borderTiles).toEqual([]);
  });

  test('keeps negative coordinates and all four stored z levels separate', () => {
    const grid: GridCell[] = [];
    for (let z = 0; z < 4; z++) {
      grid.push(tile('floor', { x: -10, y: 10, z }));
      grid.push(tile('border', { x: 10, y: -10, z, dir: 1 << z }));
      grid.push(tile('unknown', { x: -1, y: -1, z }));
    }
    const summaries = expectEquivalent(grid);
    expect(Object.keys(summaries)).toHaveLength(12);
    expect(
      summaryRenderCell(summaries, { x: -10, y: 10 }, 0).lowerTile,
    ).toBeUndefined();
  });

  test('new type definitions reclassify unchanged grid and preserve earlier results', () => {
    const grid = [
      tile('floor'),
      tile('wall'),
      tile('object'),
      tile('border', { dir: 1 }),
    ];
    const previous = expectEquivalent(grid);
    const remapped = {
      floor: makeType('wall'),
      wall: makeType('border'),
      object: makeType('floor'),
      border: makeType('obj'),
    };
    const next = expectEquivalent(grid, remapped)['0_0_0'];
    expect(next.wallTile).toBe(grid[0]);
    expect(next.floorTile).toBe(grid[2]);
    expect(next.objTile).toBe(grid[3]);
    expect(next.borderTiles[0]).toBe(grid[1]);
    expect(next.hasNorthBorder).toBe(false);
    expect(previous['0_0_0'].wallTile).toBe(grid[1]);
    expect(previous['0_0_0'].borderTiles[0]).toBe(grid[3]);
    expectEquivalent(grid, {});
    expectEquivalent(grid, { floor: types.floor });
  });

  test('add, remove, reorder, rotate, move and clear edits rebuild correctly', () => {
    const firstFloor = tile('floor');
    const secondFloor = tile('floor');
    const border = tile('border', { dir: 1 });
    const original = [firstFloor, secondFloor, border];
    const before = expectEquivalent(original);
    const edits = [
      [...original, tile('wall')],
      original.filter((cell) => cell !== firstFloor),
      [secondFloor, firstFloor, border],
      [firstFloor, secondFloor, { ...border, dir: 8 }],
      [firstFloor, secondFloor, { ...border, x: -3, y: 2, z: 3 }],
      [],
    ];
    for (const edited of edits) expectEquivalent(edited);
    expect(before['0_0_0'].floorTile).toBe(firstFloor);
    expect(before['0_0_0'].borderTiles[0]).toBe(border);
    expect(before['0_0_0'].hasNorthBorder).toBe(true);
    expect(before['0_0_0'].hasWestBorder).toBe(false);
  });

  test('does not mutate inputs or share border arrays between cells and rebuilds', () => {
    const grid = Object.freeze([
      Object.freeze(tile('border', { dir: 1 })),
      Object.freeze(tile('border', { x: 1, dir: 8 })),
    ]);
    const frozenTypes = Object.freeze(
      Object.fromEntries(
        Object.entries(types).map(([key, value]) => [
          key,
          Object.freeze({ ...value }),
        ]),
      ),
    );
    const first = expectEquivalent(grid, frozenTypes);
    const second = expectEquivalent(grid, frozenTypes);
    expect(first['0_0_0'].borderTiles).not.toBe(first['1_0_0'].borderTiles);
    expect(first['0_0_0'].borderTiles).not.toBe(second['0_0_0'].borderTiles);
    expect(first['0_0_0'].borderTiles).not.toBe(emptyCellSummary.borderTiles);
    expect(emptyCellSummary.borderTiles).toEqual([]);
  });

  test('seeded differential inputs, remappings and edits match the original render', () => {
    let seed = 0x52415457;
    const random = (limit: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % limit;
    };
    const names = ['floor', 'wall', 'object', 'border', 'unknown', 'other'];
    const directions = [undefined, 0, 1, 2, 3, 4, 5, 8, 12, 15];
    const layers: BuildableType['layer_type'][] = [
      'floor',
      'wall',
      'obj',
      'border',
    ];
    for (let trial = 0; trial < 160; trial++) {
      const grid: GridCell[] = [];
      const length = random(160);
      for (let i = 0; i < length; i++) {
        grid.push(
          tile(names[random(names.length)], {
            x: random(7) - 3,
            y: random(7) - 3,
            z: random(4),
            dir: directions[random(directions.length)],
          }),
        );
      }
      expectEquivalent(grid);
      const remapped = Object.fromEntries(
        names
          .slice(0, random(names.length + 1))
          .map((name) => [name, makeType(layers[random(layers.length)])]),
      );
      expectEquivalent(grid, remapped);
      const edited = grid.filter((_, i) => i % 3 !== 0).reverse();
      edited.push(
        tile('border', {
          x: random(7) - 3,
          y: random(7) - 3,
          z: random(4),
          dir: 3,
        }),
      );
      expectEquivalent(edited, remapped);
    }
  });
});
