export type BuildableType = {
  name: string;
  category: string;
  layer_type: 'floor' | 'wall' | 'obj' | 'border';
  reqs_text: string;
  image: string;
};

export type GridCell = {
  x: number;
  y: number;
  z: number;
  type: string;
  dir?: number;
};

export type CellSummary = {
  floorTile?: GridCell;
  wallTile?: GridCell;
  objTile?: GridCell;
  lowerTile?: GridCell;
  borderTiles: GridCell[];
  hasNorthBorder: boolean;
  hasSouthBorder: boolean;
  hasEastBorder: boolean;
  hasWestBorder: boolean;
};

// Initialize every field so empty and populated summaries share one shape.
export const emptyCellSummary: CellSummary = {
  floorTile: undefined,
  wallTile: undefined,
  objTile: undefined,
  lowerTile: undefined,
  borderTiles: [],
  hasNorthBorder: false,
  hasSouthBorder: false,
  hasEastBorder: false,
  hasWestBorder: false,
};

export const emptyBuildableTypes: Record<string, BuildableType> = {};

export function buildCellSummaries(
  grid: readonly GridCell[],
  buildableTypes: Readonly<Record<string, BuildableType>>,
): Record<string, CellSummary> {
  const summaries: Record<string, CellSummary> = {};
  for (const cell of grid) {
    const key = `${cell.x}_${cell.y}_${cell.z}`;
    const summary = (summaries[key] ??= {
      ...emptyCellSummary,
      borderTiles: [],
    });
    summary.lowerTile ??= cell;
    switch (buildableTypes[cell.type]?.layer_type) {
      case 'floor':
        summary.floorTile ??= cell;
        break;
      case 'wall':
        summary.wallTile ??= cell;
        break;
      case 'obj':
        summary.objTile ??= cell;
        break;
      case 'border':
        summary.borderTiles.push(cell);
        // Diagonal values must not count as cardinal borders.
        summary.hasNorthBorder ||= cell.dir === 1;
        summary.hasSouthBorder ||= cell.dir === 2;
        summary.hasEastBorder ||= cell.dir === 4;
        summary.hasWestBorder ||= cell.dir === 8;
        break;
    }
  }
  // Keep the original first-match order and wall/floor/any lower-layer priority.
  for (const summary of Object.values(summaries)) {
    summary.lowerTile =
      summary.wallTile ?? summary.floorTile ?? summary.lowerTile;
  }
  return summaries;
}
