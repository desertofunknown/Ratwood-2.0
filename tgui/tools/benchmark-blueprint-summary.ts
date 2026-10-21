/**
 * Run from tgui: bun tools/benchmark-blueprint-summary.ts [--json]
 * Optional: --samples=11 --batch-ms=12 --warmup-ms=25 --seed=1380013143
 *
 * ONLY grouping/classification or cached lookups, NOT React, DOM, paint,
 * browser responsiveness or whole-UI timings. The original expressions come
 * from BlueprintPlanner.tsx at b3b86e2f2b2417e0f51bb4424209354043fbec6a,
 * lines 524-532 and 1088-1115. The actual new production helper is imported.
 *
 * Displayed: default 7x7=49 and current radius cap 21x21=441. Stored z: 1 and 4.
 * These are synthetic fixtures, not captured player workloads.
 * Active z is the top stored floor (lower lookup is exercised with four z).
 * Sparse: seeded ~1/8 occupancy, one tile/occupied cell. Dense: floor, wall,
 * object and four cardinal borders/cell. Empty: zero stored entries.
 * Every build processes all stored z. Both render paths construct keys and
 * consume every output identically, including ordered borders. Input edit
 * creation is excluded equally: prebuilt immutable grid variants alternate.
 * Samples alternate old/new order after warmup with equal iteration counts.
 * Initial-build is the build workload with warmed code, not cold-start latency.
 * Distributions are batch-average microseconds/displayed grid, NOT individual
 * event latency percentiles. GC/JIT and host load remain measurement noise.
 */
import { cpus } from 'node:os';

import {
  type BuildableType,
  buildCellSummaries,
  type CellSummary,
  emptyCellSummary,
  type GridCell,
} from '../packages/tgui/interfaces/BlueprintPlanner/cellSummary';

const DIRS = { NORTH: 1, SOUTH: 2, EAST: 4, WEST: 8 };
const makeType = (layer_type: BuildableType['layer_type']): BuildableType => ({
  name: layer_type,
  category: 'benchmark',
  layer_type,
  reqs_text: '',
  image: '',
});
const buildableTypes: Record<string, BuildableType> = {
  floor: makeType('floor'),
  wall: makeType('wall'),
  object: makeType('obj'),
  border: makeType('border'),
};
type Position = { x: number; y: number };
type CellMap = Record<string, GridCell[]>;
type SummaryMap = Record<string, CellSummary>;
type Operation = (iteration: number) => number;
type Density = 'empty' | 'sparse' | 'dense';

function originalCellMap(grid: readonly GridCell[]): CellMap {
  const map: Record<string, GridCell[]> = {};
  grid.forEach((c) => {
    const key = `${c.x}_${c.y}_${c.z}`;
    if (!map[key]) map[key] = [];
    map[key].push(c);
  });
  return map;
}

function fingerprint(tile: GridCell | undefined): number {
  return tile
    ? (tile.x + 11) * 17 +
        (tile.y + 11) * 31 +
        tile.z * 67 +
        tile.type.charCodeAt(0) * 131 +
        (tile.dir || 0) * 257
    : 0;
}

// Identical output consumption, separate from the original expressions.
function consume(
  floor: GridCell | undefined,
  wall: GridCell | undefined,
  object: GridCell | undefined,
  borders: GridCell[],
  lower: GridCell | undefined,
  north: boolean,
  south: boolean,
  east: boolean,
  west: boolean,
): number {
  let value =
    fingerprint(floor) +
    fingerprint(wall) * 3 +
    fingerprint(object) * 5 +
    fingerprint(lower) * 7;
  for (const border of borders) {
    value = (Math.imul(value, 31) + fingerprint(border)) | 0;
  }
  return (
    (value +
      Number(north) +
      Number(south) * 2 +
      Number(east) * 4 +
      Number(west) * 8) |
    0
  );
}

function originalRender(cellMap: CellMap, cells: Position[], activeZ: number) {
  let checksum = 0;
  for (const cell of cells) {
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
    checksum =
      (checksum +
        consume(
          floorTile,
          wallTile,
          objTile,
          borderTiles,
          lowerTile,
          hasNorthBorder,
          hasSouthBorder,
          hasEastBorder,
          hasWestBorder,
        )) |
      0;
  }
  return checksum;
}

function summaryRender(
  cellSummaries: SummaryMap,
  cells: Position[],
  activeZ: number,
) {
  let checksum = 0;
  for (const cell of cells) {
    const {
      floorTile,
      wallTile,
      objTile,
      borderTiles,
      hasNorthBorder,
      hasSouthBorder,
      hasEastBorder,
      hasWestBorder,
    } = cellSummaries[`${cell.x}_${cell.y}_${activeZ}`] || emptyCellSummary;
    const lowerTile =
      activeZ > 0
        ? cellSummaries[`${cell.x}_${cell.y}_${activeZ - 1}`]?.lowerTile
        : undefined;
    checksum =
      (checksum +
        consume(
          floorTile,
          wallTile,
          objTile,
          borderTiles,
          lowerTile,
          hasNorthBorder,
          hasSouthBorder,
          hasEastBorder,
          hasWestBorder,
        )) |
      0;
  }
  return checksum;
}

function fixture(
  radius: number,
  zCount: number,
  density: Density,
  initialSeed: number,
) {
  let seed = initialSeed;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const cells: Position[] = [];
  for (let y = radius; y >= -radius; y--) {
    for (let x = -radius; x <= radius; x++) cells.push({ x, y });
  }
  const grid: GridCell[] = [];
  for (let z = 0; z < zCount; z++) {
    for (const cell of cells) {
      if (density === 'empty') continue;
      if (density === 'sparse') {
        if (random() >= 1 / 8) continue;
        const names = ['floor', 'wall', 'object', 'border', 'unknown'];
        grid.push({
          ...cell,
          z,
          type: names[Math.floor(random() * names.length)],
          dir: 1 << Math.floor(random() * 4),
        });
      } else {
        for (const type of ['floor', 'wall', 'object']) {
          grid.push({ ...cell, z, type });
        }
        for (const dir of [1, 2, 4, 8]) {
          grid.push({ ...cell, z, type: 'border', dir });
        }
      }
    }
  }
  // Empty edits alternate a cleared grid and one placed border. Others change
  // one tile's direction/z while retaining entry count, with new input identity.
  const edited = grid.length
    ? grid.map((cell, i) =>
        i === 0 ? { ...cell, dir: 8, z: zCount - 1 } : cell,
      )
    : [{ x: 0, y: 0, z: zCount - 1, type: 'border', dir: 8 }];
  return { cells, grid, edited, activeZ: zCount - 1 };
}

let sink = 0;
function batch(operation: Operation, iterations: number) {
  let value = 0;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) value = (value + operation(i)) | 0;
  const elapsed = performance.now() - start;
  sink = (sink ^ value) | 0;
  return elapsed;
}
function warmup(operation: Operation, milliseconds: number) {
  const end = performance.now() + milliseconds;
  do {
    batch(operation, 8);
  } while (performance.now() < end);
}
function estimate(operation: Operation) {
  let iterations = 1;
  let elapsed = batch(operation, iterations);
  while (elapsed < 4 && iterations < 131072) {
    iterations *= 2;
    elapsed = batch(operation, iterations);
  }
  return elapsed / iterations;
}
function distribution(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const quantile = (p: number) => sorted[Math.floor((sorted.length - 1) * p)];
  return {
    min: sorted[0],
    p10: quantile(0.1),
    median: quantile(0.5),
    p90: quantile(0.9),
    max: sorted[sorted.length - 1],
    samples,
  };
}
function numberOption(name: string, fallback: number, minimum = 1) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  const value = argument ? Number(argument.slice(prefix.length)) : fallback;
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`Invalid --${name}`);
  }
  return value;
}

const sampleCount = Math.floor(numberOption('samples', 11, 3));
const batchMilliseconds = numberOption('batch-ms', 12);
const warmupMilliseconds = numberOption('warmup-ms', 25);
const seed = numberOption('seed', 0x52415457, 0) >>> 0;
const json = process.argv.includes('--json');
const results: Record<string, unknown>[] = [];
if (!json) {
  console.log(
    `Bun ${Bun.version}; ${sampleCount} samples; ${warmupMilliseconds} ms warmup/path; target ${batchMilliseconds} ms/batch; seed ${seed}`,
  );
  console.log(
    'Classification only, not React/DOM/browser/whole-UI. Microseconds per displayed grid.',
  );
  console.log(
    'cells\tz\tdensity\tentries\tphase\told median [p10,p90]\tnew median [p10,p90]\told/new',
  );
}
for (const radius of [3, 10]) {
  for (const zCount of [1, 4]) {
    for (const density of ['empty', 'sparse', 'dense'] as const) {
      const { cells, grid, edited, activeZ } = fixture(
        radius,
        zCount,
        density,
        seed,
      );
      const originalMap = originalCellMap(grid);
      const summaries = buildCellSummaries(grid, buildableTypes);
      for (const variant of [grid, edited]) {
        if (
          originalRender(originalCellMap(variant), cells, activeZ) !==
          summaryRender(
            buildCellSummaries(variant, buildableTypes),
            cells,
            activeZ,
          )
        ) {
          throw new Error(
            `Output mismatch: radius=${radius} z=${zCount} ${density}`,
          );
        }
      }
      const phases: { phase: string; old: Operation; next: Operation }[] = [
        {
          phase: 'initial-build+classification',
          old: () => originalRender(originalCellMap(grid), cells, activeZ),
          next: () =>
            summaryRender(
              buildCellSummaries(grid, buildableTypes),
              cells,
              activeZ,
            ),
        },
        {
          phase: 'grid-edit-rebuild+classification',
          old: (i) =>
            originalRender(
              originalCellMap(i % 2 ? edited : grid),
              cells,
              activeZ,
            ),
          next: (i) =>
            summaryRender(
              buildCellSummaries(i % 2 ? edited : grid, buildableTypes),
              cells,
              activeZ,
            ),
        },
        {
          phase: 'hover-only-cached-classification',
          old: () => originalRender(originalMap, cells, activeZ),
          next: () => summaryRender(summaries, cells, activeZ),
        },
      ];
      for (const { phase, old, next } of phases) {
        warmup(old, warmupMilliseconds);
        warmup(next, warmupMilliseconds);
        const perIteration = Math.max(estimate(old), estimate(next));
        const iterations = Math.max(
          1,
          Math.ceil(batchMilliseconds / perIteration),
        );
        const oldSamples: number[] = [];
        const newSamples: number[] = [];
        for (let sample = 0; sample < sampleCount; sample++) {
          const oldSample = () =>
            oldSamples.push((batch(old, iterations) * 1000) / iterations);
          const newSample = () =>
            newSamples.push((batch(next, iterations) * 1000) / iterations);
          if (sample % 2) {
            newSample();
            oldSample();
          } else {
            oldSample();
            newSample();
          }
        }
        const original = distribution(oldSamples);
        const optimized = distribution(newSamples);
        const ratio = original.median / optimized.median;
        results.push({
          displayedCells: cells.length,
          storedZ: zCount,
          activeZ,
          density,
          entries: grid.length,
          editedEntries: edited.length,
          phase,
          iterations,
          unit: 'microseconds/displayed-grid',
          original,
          optimized,
          medianOldOverNew: ratio,
        });
        if (!json) {
          const show = (values: typeof original) =>
            `${values.median.toFixed(2)} [${values.p10.toFixed(2)},${values.p90.toFixed(2)}]`;
          console.log(
            `${cells.length}\t${zCount}\t${density}\t${grid.length}\t${phase}\t${show(original)}\t${show(optimized)}\t${ratio.toFixed(2)}`,
          );
        }
      }
    }
  }
}
const report = {
  baselineCommit: 'b3b86e2f2b2417e0f51bb4424209354043fbec6a',
  runtime: {
    bun: Bun.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model,
  },
  settings: { sampleCount, batchMilliseconds, warmupMilliseconds, seed },
  scope:
    'Grouping/classification and cached lookups only. No React, DOM, paint, browser or whole-UI measurement. Distributions describe batch averages, not event latencies.',
  sink,
  results,
};
if (json) console.log(JSON.stringify(report, null, 2));
else console.log(`Consumed checksum: ${sink}`);
