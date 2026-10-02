import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, WheelEvent } from 'react';
import { Button, Input, NoticeBox } from 'tgui-core/components';

import { resolveAsset } from '../assets';
import { useBackend } from '../backend';
import { Window } from '../layouts';

type Point = [number, number];
type Position = { x: number; y: number; z: number };
type Feature = { kind: string; dir: number; open?: boolean };
type Page = Position & {
  tiles: Record<string, string>;
  features?: Record<string, Feature>;
};
type Mark = Position & {
  id: string;
  kind: 'stroke' | 'marker' | 'survey';
  color: string;
  text?: string;
  points?: Point[];
  erasable: boolean;
};
type Data = {
  readable: boolean;
  writable: boolean;
  pages: Record<string, Page>;
  marks: Mark[];
  position?: Position;
  survey?: Position & { text: string };
  max_x: number;
  max_y: number;
  tile_count: number;
  max_tiles: number;
  max_marks: number;
  max_points: number;
};
type Mode = 'read' | 'draw' | 'marker';
type MapFeature = Feature & { x: number; y: number; order: number };
type TileSketch = {
  x: number;
  y: number;
  terrain: string;
  group?: string;
  outline: string;
  retraced: string;
  hatching: string;
};
type Gesture = {
  id: number;
  mode: Mode;
  inverse: DOMMatrix;
  start: Point;
  center: Point;
  points: Point[];
};

const terrainColors: Record<string, string> = {
  ground: '#beb69f', grass: '#a9ad91', forest: '#899479',
  dirt: '#b0a18a', mud: '#928873', sand: '#c8bb98', snow: '#d1cfc1',
  floor: '#c4bba5', stone: '#b5b09c', wood: '#ada085', road: '#ccc2a9',
  water: '#9daea9', deep_water: '#768f90', rock: '#969383',
  wall: '#777262', drop: '#938c84',
};
const terrainPattern: Record<string, string> = {
  grass: 'grass', forest: 'grass', dirt: 'stipple', mud: 'stipple',
  sand: 'stipple', snow: 'snow', water: 'waves', deep_water: 'waves',
  wood: 'planks', stone: 'masonry', floor: 'paving', rock: 'hatch',
  wall: 'wall', drop: 'hatch',
};
const inkColors: Record<string, string> = {
  ink: '#30271d', red: '#792f24', blue: '#304e65',
};
const featureKinds = new Set([
  'tree', 'bush', 'rock', 'door', 'window', 'stairs', 'ladder',
  'fence', 'bridge', 'statue', 'well', 'grate',
]);
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const family = (terrain?: string) => {
  if (terrain === 'water' || terrain === 'deep_water') return 'water';
  if (terrain === 'wall' || terrain === 'rock') return 'solid';
  return terrain;
};
const rotation = (dir: number) => dir & 4 ? (dir & 1 ? 45 : dir & 2 ? 135 : 90)
  : dir & 8 ? (dir & 1 ? 315 : dir & 2 ? 225 : 270) : dir & 2 ? 180 : 0;

// Ink variation belongs to the chart coordinates, so it stays still while panning.
const inkSeed = (x: number, y: number) =>
  (Math.imul(Math.round(x * 2), 73856093) ^ Math.imul(Math.round(y * 2), 19349663)) >>> 0;
const sketchEdge = (x: number, y: number, vertical: boolean, second = false) => {
  const seed = inkSeed(x, y);
  const bend = (((seed % 19) - 9) * .004).toFixed(3);
  const offset = second ? .045 : 0;
  const sx = x + (vertical ? offset : 0);
  const sy = y + (vertical ? 0 : offset);
  return vertical ? `M${sx} ${sy}q${bend} .25 0 .5t0 .5`
    : `M${sx} ${sy}q.25 ${bend} .5 0t.5 0`;
};
const firstVisibleColumn = (row: readonly { x: number }[], minX: number) => {
  let low = 0;
  let high = row.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (row[middle].x < minX) low = middle + 1;
    else high = middle;
  }
  return low;
};

const MapDefinitions = () => (
  <defs>
    <pattern id="atlas-grain" width="4" height="4" patternUnits="userSpaceOnUse">
      <path d="M.13.4l.08-.02m.48.53.035.01m.53-.67.09.02m.8.37.045-.015m.79.09.09.01M.4 1.7l.055.02m.62-.4.12.025m.71.38.045.015m.77-.51.08-.01M.24 2.8l.12-.02m.51-.31.045.01m.76.57.08-.03m.71-.48.055.015m.7.28.09.01M.6 3.64l.055-.015m.66-.31.08.02m.69.48.04-.01m.73-.37.12.015" stroke="#43331e" strokeOpacity=".22" strokeWidth=".018" strokeLinecap="round" />
      <path d="M.15 1.1q.2-.045.4-.025M2.4 2.5q.17.03.32.005M1.7 3.4l.23-.015" stroke="#eadbb2" strokeOpacity=".19" strokeWidth=".025" fill="none" />
    </pattern>
    <pattern id="atlas-grid" width="8" height="8" patternUnits="userSpaceOnUse">
      <path d="M8 0H0V8" fill="none" stroke="#5e482b" strokeOpacity=".1" strokeWidth=".018" strokeDasharray=".035 .1" />
      <path d="M.16 0H0V.16" fill="none" stroke="#57432a" strokeOpacity=".27" strokeWidth=".02" />
    </pattern>
    <pattern id="atlas-grass" width="2" height="2" patternUnits="userSpaceOnUse">
      <path d="M.3.8q-.01-.13-.1-.2m.1.2.025-.25m-.025.25q.1-.17.2-.16M1.4 1.6q-.02-.13-.09-.17m.09.17.01-.22m-.01.22.16-.14" stroke="#52603e" strokeOpacity=".65" strokeWidth=".027" fill="none" strokeLinecap="round" />
      <path d="M.13.87q.18-.04.39-.005m.76.81.29.02M1.1.39h.02M.55 1.45h.025" stroke="#5b5739" strokeOpacity=".38" strokeWidth=".022" fill="none" />
    </pattern>
    <pattern id="atlas-stipple" width="1.4" height="1.4" patternUnits="userSpaceOnUse">
      <path d="M.18.27h.025M.37.36h.015M.48.21h.01M.88.67h.025M1.08.59h.01M.72.91h.015M.3 1.17h.025M.51 1.24h.01M1.19 1.19h.015" stroke="#665337" strokeOpacity=".52" strokeWidth=".032" strokeLinecap="round" />
    </pattern>
    <pattern id="atlas-snow" width="2" height="2" patternUnits="userSpaceOnUse">
      <path d="M.5.5h.18m-.09-.09v.18" stroke="#b6b8ae" strokeWidth=".025" />
    </pattern>
    <pattern id="atlas-waves" width="2" height="1" patternUnits="userSpaceOnUse">
      <path d="M.12.4q.18-.1.38-.01t.42-.02m.29.43q.19-.1.42-.01" fill="none" stroke="#395d61" strokeOpacity=".68" strokeWidth=".028" strokeLinecap="round" />
      <path d="M.2.47q.18-.065.37-.005t.23-.008M1.23.9q.17-.06.32-.01" fill="none" stroke="#395d61" strokeOpacity=".35" strokeWidth=".015" />
    </pattern>
    <pattern id="atlas-planks" width="2" height="1" patternUnits="userSpaceOnUse">
      <path d="M0 .02Q.5-.01 1 .01T2 .02M0 .5Q.65.53 1.2.5T2 .5M.5.01.51.51M1.5.51 1.49 1" fill="none" stroke="#634b30" strokeOpacity=".62" strokeWidth=".025" />
      <path d="M.13.14q.29-.04.69.01m-.55.13q.48-.06 1.09-.01M.39.68q.4-.025.91.01m-.6.14.54-.01M1.34.21q.18-.11.36 0q-.18.11-.36 0" fill="none" stroke="#634b30" strokeOpacity=".38" strokeWidth=".016" />
    </pattern>
    <pattern id="atlas-masonry" width="4" height="4" patternUnits="userSpaceOnUse">
      <path d="M.12.38l.43-.035.17.07M.58.38l-.015.45.12.09M1.78.14l-.05.54.32.015M2.64.83l.47-.02.06.24M3.7.2l-.22.12.02.32M.23 1.81l.04.49.58.025M1.32 1.45l.67.04-.02.39M2.48 2.12l.04.31.61-.04M3.54 1.65l.29-.02M.85 3.14l.39-.03.045-.37M1.95 3.61l-.02-.46.38-.02M3.17 3.47l.035-.61.43.04" fill="none" stroke="#665d48" strokeOpacity=".39" strokeWidth=".024" strokeLinecap="round" />
      <path d="M.26.5l.21-.015M1.49 1.6l.29.015M2.69 2.52l.29-.03M3.27 3.58l.2-.035M.43 2.5l.11-.025M2.45.21l.06.035" fill="none" stroke="#665d48" strokeOpacity=".26" strokeWidth=".018" />
    </pattern>
    <pattern id="atlas-wall" width="3" height="3" patternUnits="userSpaceOnUse">
      <path d="M.12.59l.28-.36m-.15.4.33-.43m-.17.41.25-.3M1.24.83l.32-.45m-.15.46.27-.35M2.23.39l.2-.27m-.04.38.29-.37M.38 1.76l.32-.39m-.15.48.34-.45M1.62 1.73l.21-.3m-.03.4.29-.43m-.09.43.19-.28M2.65 1.39l.22-.34M.1 2.7l.24-.29M.98 2.64l.29-.38m-.1.44.27-.35M2.17 2.74l.32-.44m-.13.46.27-.35M.58.14l.26.09M1.1 1.14l.17.07M2.29 1.89l.23.12M.58 2.36l.16.08" fill="none" stroke="#302c23" strokeOpacity=".5" strokeWidth=".027" strokeLinecap="round" />
    </pattern>
    <pattern id="atlas-paving" width="4" height="3" patternUnits="userSpaceOnUse">
      <path d="M.16.31l.51-.02.025.3M1.61 1.14l.02-.35.58.015M2.82.18l.015.31.46-.02M.41 2.26l.03-.42.42-.025M2.2 2.54l.34.01.02-.28M3.51 1.83l-.37.025M1.11.52l.12-.015M1.43 2.67l.19.01" fill="none" stroke="#6c5c40" strokeOpacity=".29" strokeWidth=".022" strokeLinecap="round" />
    </pattern>
    <pattern id="atlas-hatch" width=".7" height=".7" patternUnits="userSpaceOnUse">
      <path d="M-.04.4.4-.04M.03.65.65.03M.29.73.73.29M.08.31.3.54M.38.06.62.3" stroke="#463a2b" strokeOpacity=".42" strokeWidth=".023" />
    </pattern>
    <g id="atlas-tree" stroke="#303a2b" strokeWidth=".04" strokeLinejoin="round" strokeLinecap="round">
      <path d="M-.065.15Q-.035.33-.09.48L.11.47Q.055.31.075.1" fill="#a5956b" />
      <path d="M-.31.2Q-.48.13-.35-.025Q-.49-.15-.27-.27Q-.31-.46-.13-.42Q.01-.64.15-.43Q.36-.48.32-.26Q.52-.19.37-.01Q.48.14.28.23Q.12.31-.01.21Q-.16.31-.31.2Z" fill="#879066" />
      <path d="M-.055.38.015-.17m-.04.41L-.23.03m.27.1.19-.2M-.32.1q.11.02.13-.09M-.26-.27q.06.1.14.06M.04-.37q.11.09.18.03M.24.15q.05-.05.04-.12M-.35-.09l.09-.08m-.06.17.1-.07m-.1.17.1-.065M.12.18l.07-.1m.015.12.07-.1" fill="none" strokeWidth=".023" />
      <path d="M-.22.49q.24-.055.44.005m-.49.045.39.005M-.39.14q.005.1.13.1M.18-.46q.14.005.14.15" fill="none" strokeWidth=".017" strokeOpacity=".6" />
    </g>
    <g id="atlas-bush" stroke="#475039" strokeWidth=".03" strokeLinecap="round">
      <path d="M-.3.17Q-.46-.05-.23-.16Q-.13-.43.08-.2Q.39-.3.33.09Q.16.3-.3.17Z" fill="#959b70" />
      <path d="M-.24.13l.085-.08m-.035.11.1-.095M.04.18l.07-.12m.015.13.1-.11M-.16-.15q.045.06.12.045m.09-.04q.12-.05.13.065M-.3.23q.28.05.59-.015" fill="none" strokeWidth=".02" />
    </g>
    <g id="atlas-rock" stroke="#4b4433" strokeWidth=".033" strokeLinejoin="round" strokeLinecap="round">
      <path d="M-.38.24l.08-.22.065-.21.19-.045.18-.08.17.19.085.23-.15.16-.37.015Z" fill="#aaa087" />
      <path d="M-.235-.19-.06.04.135-.315M-.06.04l.015.25m-.195-.09.08-.125m-.04.175.065-.075M.085.2.25-.01m-.09.245.13-.18M.22.27l.095-.1M-.43.3q.37.07.77-.01m-.57.065.36-.005" fill="none" strokeWidth=".021" />
    </g>
    <g id="atlas-door" stroke="#493522" strokeWidth=".045" strokeLinejoin="round">
      <path d="M-.45-.16h.09v.32h-.09Zm.81 0h.09v.32h-.09Z" fill="#b2a07b" /><path d="M-.34-.09.34-.08.335.105-.33.09Z" fill="#9c784b" />
      <path d="M-.3-.015.29.005M-.16-.07v.14M.06-.07v.14M.24-.05v.045M-.49.2h.14m.7-.4v.31" fill="none" strokeWidth=".022" />
    </g>
    <g id="atlas-door-open" stroke="#493522" strokeWidth=".045" fill="none">
      <path d="M-.45-.16h.09v.32h-.09Zm.81 0h.09v.32h-.09ZM-.34 0l-.015-.6h.09L-.27 0Z" fill="#a78d63" /><path d="M-.26-.6A.6.6 0 0 1 .34 0M-.305-.54v.45" strokeWidth=".021" strokeDasharray=".07 .055" />
    </g>
    <g id="atlas-window" stroke="#3b5354" strokeWidth=".04">
      <path d="M-.4-.12.4-.11.4.12-.4.13Z" fill="#a5b6a9" /><path d="M0-.12v.24M-.36.02.35.01M-.22-.08l-.09.16m.52-.17-.095.16" fill="none" strokeWidth=".022" />
    </g>
    <g id="atlas-stairs" stroke="#443b2c" strokeWidth=".035" fill="none" strokeLinecap="round">
      <path d="M-.35.37.35.36.34-.37-.34-.36Z" fill="#b3a480" /><path d="M-.34.2.34.19M-.34.02.34.025M-.34-.16.34-.17" />
      <path d="M-.32.25.31.245M-.32.065.3.07M-.3-.115.31-.12M-.28-.33l.1.07m.03-.07.1.07M-.3.11l.08.07m.065-.07.075.07M.39-.3.395.38-.28.405M0 .28v-.55m-.09.1L0-.28l.09.13" strokeWidth=".019" />
    </g>
    <g id="atlas-ladder" stroke="#563e27" strokeWidth=".045" fill="none">
      <path d="M-.22-.43-.2.44M.2-.43.215.44M-.2-.31.2-.3M-.2-.1.2-.105M-.2.1.2.11M-.2.31.2.3" /><path d="M-.16-.41-.14.41M.26-.41.275.41M-.19-.25h.36m-.36.2h.36m-.36.2h.36m-.36.2h.36" strokeWidth=".016" strokeOpacity=".7" />
    </g>
    <g id="atlas-fence" stroke="#604a2f" strokeWidth=".04" fill="none">
      <path d="M-.5-.07Q0-.085.5-.06M-.5.07.5.065M-.35-.18-.34.18M.35-.18.36.18" /><path d="M-.3-.17v.35M.4-.16v.35M-.25-.045.26.015" strokeWidth=".017" />
    </g>
    <g id="atlas-bridge" stroke="#60462b" strokeWidth=".035">
      <path d="M-.4-.5h.8v1h-.8Z" fill="#b39a6c" /><path d="M-.4-.3.4-.29M-.4-.1.4-.11M-.4.1.4.11M-.4.3.4.285M-.45-.5Q-.47 0-.45.5M.45-.5Q.47 0 .45.5" fill="none" />
      <path d="M-.34-.43.22-.42M-.24-.22.33-.21M-.34-.035.16-.02M-.23.17.31.175M-.32.38.23.37" fill="none" strokeWidth=".018" />
    </g>
    <g id="atlas-statue" stroke="#51452f" strokeWidth=".032" fill="#bdb08b">
      <path d="M-.11-.26q0-.16.13-.14q.14.04.09.19l-.065.07-.11-.035ZM-.055-.135.1-.14.21.26-.21.27ZM-.3.28h.6v.12h-.6Z" />
      <path d="M.01-.08-.07.23m.12-.2.08.2M-.26.34h.51M-.24.45l.55-.01M.02-.25l.065.01" fill="none" strokeWidth=".018" />
    </g>
    <g id="atlas-well" stroke="#504731" strokeWidth=".033">
      <path d="M-.31-.06v.23q.3.25.62 0v-.23" fill="#a39778" /><ellipse cy="-.06" rx=".31" ry=".23" fill="#c1b28c" /><ellipse cy="-.06" rx=".2" ry=".14" fill="#748d88" />
      <path d="M-.3-.06h.09m.41 0h.11M0-.28v.08M-.2-.23l.05.06m.36-.05-.055.05M-.25.19l.07-.085m.05.14.07-.1m.065.09.065-.1M-.4-.36q.4-.03.8 0M-.31-.36l.005.67M.31-.36.3.31M0-.35v.25m-.055-.01h.11v.075h-.11Z" fill="none" strokeWidth=".024" />
      <path d="M-.37.37q.37.08.75-.015" fill="none" strokeWidth=".017" strokeOpacity=".65" />
    </g>
    <g id="atlas-grate" stroke="#4f493a" strokeWidth=".031" fill="none">
      <path d="M-.43-.43h.86v.86h-.86ZM-.2-.43-.19.43M0-.43.01.43M.2-.43.19.43M-.43-.2.43-.19M-.43 0 .43-.01M-.43.2.43.21" /><path d="M-.38-.38h.76v.76M-.37.47h.83v-.81" strokeWidth=".016" strokeOpacity=".65" />
    </g>
  </defs>
);

export const FieldMap = () => {
  const { act, data } = useBackend<Data>();
  const [selectedZ, setSelectedZ] = useState<number>();
  const [center, setCenter] = useState<Point>();
  const [span, setSpan] = useState(24);
  const [aspect, setAspect] = useState(1);
  const [canvasHeight, setCanvasHeight] = useState(500);
  const [mode, setMode] = useState<Mode>('read');
  const [ink, setInk] = useState('ink');
  const [label, setLabel] = useState('');
  const [notebook, setNotebook] = useState(false);
  const [notebookPage, setNotebookPage] = useState<'notes' | 'key'>('notes');
  const [draft, setDraft] = useState<Point[]>([]);
  const [keyboardDraft, setKeyboardDraft] = useState<Point[]>([]);
  const [keyboardActive, setKeyboardActive] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const position = data.position ?? { x: 1, y: 1, z: 1 };
  const z = selectedZ ?? position.z;
  const page = data.pages?.[String(z)];
  const focus = z === position.z ? position : page;
  const [centerX, centerY] = center ?? [focus?.x ?? 1, focus?.y ?? 1];
  const width = span * aspect;
  const maxSpan = Math.max(192, data.max_y || 192, (data.max_x || 192) / aspect);
  const left = centerX - width / 2;
  const top = data.max_y - centerY - span / 2;

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const resize = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (width && height) {
        setAspect(width / height);
        setCanvasHeight(height);
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [data.readable]);

  const cancelGesture = (clearKeyboard = true) => {
    const current = gesture.current;
    gesture.current = null;
    setDraft([]);
    if (clearKeyboard) setKeyboardDraft([]);
    if (current && svg.current?.hasPointerCapture(current.id)) {
      svg.current.releasePointerCapture(current.id);
    }
  };
  useEffect(() => {
    cancelGesture();
  }, [z, mode, page, data.writable, data.readable, ink]);
  useEffect(() => {
    cancelGesture(false);
  }, [aspect]);

  const parsed = useMemo(() => {
    const tiles = Object.entries(page?.tiles ?? {}).map(([key, terrain]) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y, terrain };
    }).sort((a, b) => a.y - b.y || a.x - b.x);
    const featureRows = new Map<number, MapFeature[]>();
    Object.entries(page?.features ?? {}).forEach(([key, value], order) => {
      const [x, y] = key.split(',').map(Number);
      const row = featureRows.get(y) ?? [];
      row.push({ x, y, ...value, order });
      featureRows.set(y, row);
    });
    for (const row of featureRows.values()) row.sort((a, b) => a.x - b.x);
    return { tiles, featureRows };
  }, [page]);

  const detailBand = span <= 40 ? 0 : span <= 64 ? 1 : 2;
  // Page edges depend on charted neighbours, including those outside the view.
  const tileRows = useMemo(() => {
    const rows = new Map<number, TileSketch[]>();
    for (const tile of parsed.tiles) {
      const { x, y, terrain } = tile;
      const sketch: TileSketch = { ...tile, outline: '', retraced: '', hatching: '' };
      const row = rows.get(y) ?? [];
      row.push(sketch);
      rows.set(y, row);
      const group = family(terrain);
      if (group !== 'water' && group !== 'solid' && group !== 'road' && group !== 'drop' && group !== 'forest') continue;
      sketch.group = group;
      const sx = x - .5;
      const sy = data.max_y - y - .5;
      const edge = (ex: number, ey: number, vertical: boolean, inward: number) => {
        sketch.outline += detailBand < 2 ? sketchEdge(ex, ey, vertical) : `M${ex} ${ey}${vertical ? 'v' : 'h'}1`;
        if (detailBand < 2 && inkSeed(ex, ey) % 3 !== 0) {
          sketch.retraced += sketchEdge(ex, ey, vertical, true);
        }
        if (detailBand === 0 && (group === 'solid' || group === 'drop')) {
          for (let index = 0; index < 4; index++) {
            const along = .16 + index * .22;
            const depth = inward * (.12 + (inkSeed(ex + index, ey) % 5) * .012);
            sketch.hatching += vertical
              ? `M${ex} ${ey + along}l${depth} .065`
              : `M${ex + along} ${ey}l.065 ${depth}`;
          }
        }
      };
      if (family(page?.tiles[`${x},${y + 1}`]) !== group) edge(sx, sy, false, 1);
      if (family(page?.tiles[`${x},${y - 1}`]) !== group) edge(sx, sy + 1, false, -1);
      if (family(page?.tiles[`${x - 1},${y}`]) !== group) edge(sx, sy, true, 1);
      if (family(page?.tiles[`${x + 1},${y}`]) !== group) edge(sx + 1, sy, true, -1);
    }
    return rows;
  }, [parsed.tiles, page, data.max_y, detailBand]);

  const geometry = useMemo(() => {
    const fills: Record<string, string[]> = {};
    const edges: Record<string, string[]> = {};
    const retraced: Record<string, string[]> = {};
    const edgeHatching: string[] = [];
    const features: MapFeature[] = [];
    const minX = centerX - width / 2 - 1;
    const maxX = centerX + width / 2 + 1;
    const minY = Math.ceil(centerY - span / 2 - 1);
    const maxY = Math.floor(centerY + span / 2 + 1);
    let run: { x: number; y: number; end: number; terrain: string } | undefined;
    const flush = () => {
      if (!run) return;
      (fills[run.terrain] ??= []).push(`M${run.x - .5} ${data.max_y - run.y - .5}h${run.end - run.x + 1}v1H${run.x - .5}Z`);
    };
    for (let y = minY; y <= maxY; y++) {
      const row = tileRows.get(y);
      if (row) {
        for (let index = firstVisibleColumn(row, minX); index < row.length; index++) {
          const tile = row[index];
          if (tile.x > maxX) break;
          const { x, terrain, group } = tile;
          if (run && run.y === y && run.end + 1 === x && run.terrain === terrain) {
            run.end = x;
          } else {
            flush();
            run = { x, y, end: x, terrain };
          }
          if (!group) continue;
          (edges[group] ??= []).push(tile.outline);
          if (tile.retraced) (retraced[group] ??= []).push(tile.retraced);
          if (tile.hatching) edgeHatching.push(tile.hatching);
        }
      }
      const featureRow = parsed.featureRows.get(y);
      if (featureRow) {
        for (let index = firstVisibleColumn(featureRow, minX); index < featureRow.length; index++) {
          const feature = featureRow[index];
          if (feature.x > maxX) break;
          if (featureKinds.has(feature.kind) && (detailBand < 2 || (feature.kind !== 'bush' && feature.kind !== 'rock'))) {
            features.push(feature);
          }
        }
      }
    }
    flush();
    // Preserve the page's symbol order when neighbouring symbols overlap.
    features.sort((a, b) => a.order - b.order);
    return {
      fills: Object.entries(fills).map(([terrain, paths]) => ({ terrain, path: paths.join('') })),
      edges: Object.entries(edges).map(([kind, paths]) => ({ kind, path: paths.join(''), retraced: retraced[kind]?.join('') })),
      edgeHatching: edgeHatching.join(''),
      features,
    };
  }, [parsed.featureRows, tileRows, centerX, centerY, width, span, data.max_y, detailBand]);
  const marks = useMemo(() => (data.marks ?? []).filter((mark) => mark.z === z), [data.marks, z]);
  const svgPoints = (points: Point[]) => points.map(([x, y]) => `${x},${data.max_y - y}`).join(' ');

  const pointAt = (clientX: number, clientY: number, inverse?: DOMMatrix): Point | undefined => {
    const matrix = inverse ?? svg.current?.getScreenCTM()?.inverse();
    if (!matrix || !svg.current) return;
    const point = svg.current.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const result = point.matrixTransform(matrix);
    return [result.x, data.max_y - result.y];
  };
  const onMap = ([x, y]: Point) => x >= 1 && x <= data.max_x && y >= 1 && y <= data.max_y;
  const start = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || gesture.current) return;
    if (mode !== 'read' && (!data.writable || !page || (mode === 'marker' && !label.trim()))) return;
    const inverse = event.currentTarget.getScreenCTM()?.inverse();
    const point = pointAt(event.clientX, event.clientY, inverse);
    if (!inverse || !point || (mode !== 'read' && !onMap(point))) return;
    event.preventDefault();
    canvas.current?.focus({ preventScroll: true });
    setKeyboardActive(false);
    setKeyboardDraft([]);
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { id: event.pointerId, mode, inverse, start: point, center: [centerX, centerY], points: [point] };
    if (mode === 'draw') setDraft([point]);
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const point = pointAt(event.clientX, event.clientY, current.inverse);
    if (!point) return;
    if (current.mode === 'read') {
      setCenter([
        clamp(current.center[0] + current.start[0] - point[0], 1, data.max_x),
        clamp(current.center[1] + current.start[1] - point[1], 1, data.max_y),
      ]);
    } else if (current.mode === 'draw' && current.points.length < data.max_points) {
      const next: Point = [clamp(point[0], 1, data.max_x), clamp(point[1], 1, data.max_y)];
      const previous = current.points[current.points.length - 1];
      if (Math.hypot(next[0] - previous[0], next[1] - previous[1]) < .12) return;
      current.points.push(next);
      setDraft([...current.points]);
    }
  };
  const finish = (event: PointerEvent<SVGSVGElement>) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    move(event);
    if (current.mode === 'draw' && current.points.length > 1 && data.writable) {
      act('stroke', { z, color: ink, points: current.points });
    } else if (current.mode === 'marker' && data.writable && label.trim()) {
      const point = pointAt(event.clientX, event.clientY);
      if (point && onMap(point) && Math.hypot(point[0] - current.start[0], point[1] - current.start[1]) < span / 40) {
        act('marker', { z, x: point[0], y: point[1], color: ink, text: label });
      }
    }
    cancelGesture();
  };
  const zoom = (next: number, anchor: Point = [centerX, centerY]) => {
    cancelGesture(false);
    const value = clamp(next, 8, maxSpan);
    const ratio = value / span;
    setCenter([anchor[0] + (centerX - anchor[0]) * ratio, anchor[1] + (centerY - anchor[1]) * ratio]);
    setSpan(value);
  };
  const wheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const anchor = pointAt(event.clientX, event.clientY);
    if (anchor) zoom(span * (event.deltaY > 0 ? 1.2 : 1 / 1.2), anchor);
  };
  const fit = () => {
    if (!parsed.tiles.length) return;
    cancelGesture(false);
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (const { x, y } of parsed.tiles) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    setCenter([(minX + maxX) / 2, (minY + maxY) / 2]);
    setSpan(clamp(Math.max((maxX - minX + 3) / aspect, maxY - minY + 3), 8, maxSpan));
  };
  const chart = () => {
    cancelGesture();
    act('chart'); setSelectedZ(undefined); setCenter(undefined);
  };
  const refresh = () => {
    cancelGesture();
    act('refresh'); setSelectedZ(undefined); setCenter(undefined);
  };
  const cursor: Point = [clamp(Math.round(centerX), 1, data.max_x), clamp(Math.round(centerY), 1, data.max_y)];
  const saveKeyboardRoute = () => {
    if (!data.readable || !data.writable || !page || mode !== 'draw' || keyboardDraft.length < 2) return;
    act('stroke', { z, color: ink, points: keyboardDraft });
    setKeyboardDraft([]);
  };
  const mapKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '+', '=', '-', '_', 'Home', 'Enter', 'Backspace', 'Escape'];
  const mapKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !data.readable || gesture.current || event.altKey || event.metaKey) return;
    if (event.ctrlKey && !(event.key === 'Enter' && mode === 'draw')) return;
    if (!mapKeys.includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    setKeyboardActive(true);
    const step = (mode === 'read' ? Math.max(1, Math.round(span / 10)) : 1) * (event.shiftKey ? 5 : 1);
    if (event.key.startsWith('Arrow')) {
      const dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
      const dy = event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
      setCenter([clamp(cursor[0] + dx, 1, data.max_x), clamp(cursor[1] + dy, 1, data.max_y)]);
    } else if (event.key === '+' || event.key === '=') zoom(span / 1.2);
    else if (event.key === '-' || event.key === '_') zoom(span * 1.2);
    else if (event.key === 'Home') fit();
    else if (event.key === 'Escape') cancelGesture();
    else if (event.key === 'Backspace' && mode === 'draw') setKeyboardDraft((points) => points.slice(0, -1));
    else if (event.key === 'Enter' && !event.repeat && data.writable && page) {
      if (mode === 'marker' && label.trim()) {
        act('marker', { z, x: cursor[0], y: cursor[1], color: ink, text: label });
      } else if (mode === 'draw') {
        if (event.ctrlKey) saveKeyboardRoute();
        else setKeyboardDraft((points) => {
          const last = points[points.length - 1];
          return points.length >= data.max_points || (last && last[0] === cursor[0] && last[1] === cursor[1])
            ? points : [...points, cursor];
        });
      }
    }
  };
  const mapKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !event.altKey && !event.metaKey &&
      (!event.ctrlKey || (event.key === 'Enter' && mode === 'draw')) && mapKeys.includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const scale = span <= 16 ? 2 : span <= 40 ? 5 : span <= 80 ? 10 : 20;
  // Convert screen lettering to chart units so zoom never shrinks the ink.
  const labelSize = span * 14 / canvasHeight;
  const modeHint = !data.writable && mode !== 'read' ? 'Read only · Hold a feather or thorn, then locate yourself'
    : keyboardActive ? mode === 'read' ? 'Arrows move · Shift moves faster · +/− zoom · Home fits'
      : mode === 'draw' ? `Arrows move · Enter adds point (${keyboardDraft.length}/${data.max_points}) · Ctrl+Enter saves · Backspace undoes · Esc cancels`
        : label.trim() ? 'Arrows position the crosshair · Enter places the label · +/− zoom' : 'Write a label, then Tab to the chart'
      : mode === 'read' ? 'Drag to explore · Scroll to zoom · Tab to the chart for keyboard controls'
        : mode === 'draw' ? 'Drag to ink a route, or Tab to the chart and add points with Enter'
          : label.trim() ? 'Choose a place for your label, or Tab to the chart' : 'Write a label before placing it';

  return (
    <Window width={1050} height={760}>
      <Window.Content>
        {!data.readable ? <NoticeBox>Bring the atlas within reach and make sure you can read it.</NoticeBox> : (
          <div className="FieldMap">
            <header className="FieldMap__header">
              <div className="FieldMap__heading"><h1>Field atlas</h1><span className="FieldMap__subtitle">A record of travelled ground</span></div>
              <div className="FieldMap__headerActions">
                <Button className="FieldMap__chart" icon="compass" disabled={!data.writable} onClick={chart}>Chart surroundings</Button>
                <Button icon="location-arrow" onClick={refresh} tooltip="Refresh your position and return to it. Terrain changes only when charted.">Locate me</Button>
                <Button icon="book-open" selected={notebook} onClick={() => setNotebook(!notebook)}>Field notes</Button>
              </div>
            </header>
            <div className="FieldMap__tools">
              <label className="FieldMap__sheets">
                <span className="FieldMap__eyebrow">Sheet</span>
                <select aria-label="Atlas sheet" value={z} onChange={(event) => {
                  const sheet = data.pages[event.target.value];
                  if (!sheet) return;
                  cancelGesture(); setSelectedZ(sheet.z); setCenter([sheet.x, sheet.y]);
                }}>
                  {!page && <option value={z}>Level {z} · uncharted</option>}
                  {Object.values(data.pages ?? {}).sort((a, b) => a.z - b.z).map((sheet) => (
                    <option key={sheet.z} value={sheet.z}>Level {sheet.z}</option>
                  ))}
                </select>
              </label>
              <div className="FieldMap__toolGroup">
                <Button icon="hand-paper" selected={mode === 'read'} onClick={() => setMode('read')}>Explore</Button>
                <Button icon="route" selected={mode === 'draw'} disabled={!data.writable || !page} onClick={() => setMode('draw')} tooltip="Draw a route with a feather or thorn">Route</Button>
                <Button icon="map-pin" selected={mode === 'marker'} disabled={!data.writable || !page} onClick={() => setMode('marker')} tooltip="Name a place with a feather or thorn">Label</Button>
              </div>
              <span className={`FieldMap__permission${data.writable ? '' : ' FieldMap__permission--readonly'}`}>{data.writable ? 'Quill ready' : 'Read only'}</span>
              <div className="FieldMap__toolGroup FieldMap__zoom">
                <Button icon="minus" tooltip="Zoom out" disabled={span >= maxSpan} onClick={() => zoom(span * 1.5)} />
                <Button icon="plus" tooltip="Zoom in" disabled={span <= 8} onClick={() => zoom(span / 1.5)} />
                <Button icon="expand" tooltip="Fit charted ground" disabled={!parsed.tiles.length} onClick={fit}>Fit</Button>
              </div>
            </div>
            {mode !== 'read' && <div className="FieldMap__inkTools">
              <span className="FieldMap__eyebrow">Ink</span>
              {Object.entries(inkColors).map(([name, color]) => <Button key={name} selected={ink === name} disabled={!data.writable} onClick={() => setInk(name)} tooltip={`${name === 'ink' ? 'Black' : name} ink`}><span className="FieldMap__ink" style={{ background: color }} />{name === 'ink' ? 'Black' : name === 'red' ? 'Red' : 'Blue'}</Button>)}
              {mode === 'marker' ? <Input fluid disabled={!data.writable} maxLength={64} value={label} onChange={setLabel} placeholder="Name this place, then choose a point on the chart…" /> : <>
                <Button icon="check" disabled={!data.writable || keyboardDraft.length < 2} onClick={saveKeyboardRoute} tooltip="Save the route drawn with keyboard points (Ctrl+Enter on chart)">Save route</Button>
                <Button icon="undo" disabled={!keyboardDraft.length} onClick={() => setKeyboardDraft((points) => points.slice(0, -1))}>Undo point</Button>
                <Button icon="times" disabled={!keyboardDraft.length} onClick={() => setKeyboardDraft([])}>Cancel route</Button>
              </>}
            </div>}
            <div className="FieldMap__workspace">
              <main className="FieldMap__mapColumn">
                <div ref={canvas} className={`FieldMap__canvas FieldMap__canvas--${mode}`} style={{ backgroundImage: `url("${resolveAsset('field-atlas-vellum.png')}")` }}
                  tabIndex={0} role="region" aria-label={`Field atlas chart, level ${z}`} aria-describedby="atlas-keyboard-hint"
                  onFocus={(event) => { if (event.target === event.currentTarget) setKeyboardActive(true); }}
                  onBlur={(event) => { if (event.target === event.currentTarget) setKeyboardActive(false); }}
                  onKeyDown={mapKeyDown} onKeyUp={mapKeyUp}>
                  <svg ref={svg} className="FieldMap__drawing" viewBox={`${left} ${top} ${width} ${span}`} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => cancelGesture()} onLostPointerCapture={() => cancelGesture(false)} onWheel={wheel} aria-label={`Field atlas, level ${z}`}>
                    <MapDefinitions />
                    <rect className="FieldMap__paper" x={left} y={top} width={width} height={span} fill="#c6bea9" fillOpacity=".62" />
                    {geometry.fills.map(({ terrain, path }) => <g key={terrain}>
                      <path className="FieldMap__terrainWash" d={path} fill={terrainColors[terrain] ?? terrainColors.ground} fillOpacity=".82" />
                      {terrainPattern[terrain] && <path d={path} fill={`url(#atlas-${terrainPattern[terrain]})`} opacity={span > 64 ? .4 : 1} />}
                    </g>)}
                    <rect x={left} y={top} width={width} height={span} fill="url(#atlas-grain)" pointerEvents="none" />
                    <rect x={left} y={top} width={width} height={span} fill="url(#atlas-grid)" pointerEvents="none" />
                    {geometry.edges.map(({ kind, path, retraced }) => <g key={kind} fill="none" stroke={kind === 'water' ? '#3f5655' : kind === 'road' ? '#786e56' : kind === 'forest' ? '#48533c' : '#38352b'} strokeLinecap="round" strokeLinejoin="round">
                      <path d={path} strokeWidth={kind === 'solid' ? .075 : kind === 'drop' ? .055 : .035} strokeOpacity={kind === 'forest' ? .65 : .9} />
                      {retraced && <path d={retraced} strokeWidth=".016" strokeOpacity=".4" />}
                    </g>)}
                    {geometry.edgeHatching && <path d={geometry.edgeHatching} fill="none" stroke="#38352b" strokeWidth=".023" strokeOpacity=".7" strokeLinecap="round" />}
                    {geometry.features.map(({ x, y, kind, dir, open }) => {
                      const natural = kind === 'tree' || kind === 'bush' || kind === 'rock';
                      const seed = inkSeed(x, y);
                      const angle = natural ? seed % 11 - 5 : kind === 'statue' || kind === 'well' ? 0 : rotation(dir);
                      return <use key={`${x},${y}`} href={`#atlas-${kind}${kind === 'door' && open ? '-open' : ''}`} transform={`translate(${x} ${data.max_y - y}) rotate(${angle}) scale(${natural ? .92 + seed % 7 * .02 : 1})`} />;
                    })}
                    {marks.map((mark) => mark.kind === 'stroke' ? (
                      <polyline key={mark.id} points={svgPoints(mark.points ?? [])} fill="none" stroke={inkColors[mark.color]} strokeWidth={span / 350} strokeLinecap="round" strokeLinejoin="round"><title>Route #{mark.id}</title></polyline>
                    ) : (
                      <g key={mark.id} fill={inkColors[mark.color]}>
                        <title>{mark.text}</title>
                        <path d={`M${mark.x} ${data.max_y - mark.y}l${-span / 160} ${-span / 65}h${span / 80}Z`} />
                        <text className="FieldMap__mapLabel" x={mark.x + labelSize * .6} y={data.max_y - mark.y - labelSize * .3} fontSize={labelSize} strokeWidth={labelSize * 3 / 14}>{mark.kind === 'survey' ? 'Sounding' : mark.text}</text>
                      </g>
                    ))}
                    {draft.length > 1 && <polyline points={svgPoints(draft)} fill="none" stroke={inkColors[ink]} strokeWidth={span / 350} strokeLinecap="round" strokeLinejoin="round" />}
                    {keyboardDraft.length > 1 && <polyline points={svgPoints(keyboardDraft)} fill="none" stroke={inkColors[ink]} strokeWidth={span / 350} strokeLinecap="round" strokeLinejoin="round" />}
                    {keyboardDraft.map(([x, y], index) => <circle key={index} cx={x} cy={data.max_y - y} r={span * 3 / canvasHeight} fill={inkColors[ink]} pointerEvents="none" />)}
                    {parsed.tiles.length > 0 && z === position.z && <g transform={`translate(${position.x} ${data.max_y - position.y})`}>
                      <title>Your last refreshed position</title>
                      <circle r={span / 65} fill="#d2c198" fillOpacity=".65" stroke="#783a2c" strokeWidth={span / 550} />
                      <path d={`M0 ${-span / 85}L${span / 140} ${span / 110}L0 ${span / 230}L${-span / 140} ${span / 110}Z`} fill="#793024" stroke="#dfcba0" strokeWidth={span / 650} />
                    </g>}
                    {keyboardActive && <g className="FieldMap__cursor" transform={`translate(${cursor[0]} ${data.max_y - cursor[1]}) scale(${span / canvasHeight})`} pointerEvents="none" aria-hidden="true">
                      <path d="M-12 0h8m8 0h8M0-12v8m0 8v8" fill="none" stroke="#f5e7bf" strokeWidth="4" />
                      <path d="M-12 0h8m8 0h8M0-12v8m0 8v8" fill="none" stroke="#4b271f" strokeWidth="2" />
                      <circle r="2" fill="#4b271f" stroke="#f5e7bf" strokeWidth="1" />
                    </g>}
                  </svg>
                  <div className="FieldMap__compass" aria-hidden="true"><span>N</span><svg viewBox="0 0 40 52"><g stroke="#574229" fill="none" strokeWidth=".65"><circle cx="20" cy="30" r="11" /><circle cx="20" cy="30" r="13" strokeDasharray="1 2" /><path d="M7 17L33 43M7 43L33 17M2 30H38M20 3V50" /></g><path d="M20 2L25 25L37 30L25 34L20 49L16 34L3 30L16 26Z" fill="#bfa87a" stroke="#574229" strokeWidth=".7" /><path d="M20 2V30L16 26ZM20 30L37 30L25 34ZM20 30V49L16 34ZM20 30H3L16 26Z" fill="#574229" /><circle cx="20" cy="30" r="2" fill="#c4b086" stroke="#574229" strokeWidth=".6" /></svg></div>
                  <div className="FieldMap__scale" style={{ width: `${scale / width * 100}%` }}><span>{scale} paces</span></div>
                  {!parsed.tiles.length && <div className="FieldMap__empty"><span className="FieldMap__inscription">Terra incognita · Level {z}</span><h2>Here begins the unknown</h2><p>No ground is recorded on this sheet.<br />Chart what lies within sight, then leave your paths and discoveries in ink.</p><Button icon="compass" disabled={!data.writable} onClick={chart}>Chart surroundings</Button><p className="FieldMap__muted">Take up a feather or thorn to write.<br />Use Locate me after changing tools.</p></div>}
                </div>
                <footer className="FieldMap__status"><span id="atlas-keyboard-hint">{modeHint}</span><span>{keyboardActive ? 'Cursor ' : ''}{keyboardActive ? cursor[0] : Math.round(centerX)}, {keyboardActive ? cursor[1] : Math.round(centerY)} · Level {z}</span></footer>
              </main>
              {notebook && <aside className="FieldMap__notebook">
                <div className="FieldMap__notebookTitle"><div><span className="FieldMap__eyebrow">In the margin · Level {z}</span><h2>Field notes</h2></div><Button icon="times" tooltip="Close notebook" onClick={() => setNotebook(false)} /></div>
                <div className="FieldMap__notebookTabs">
                  <Button selected={notebookPage === 'notes'} onClick={() => setNotebookPage('notes')}>Notes ({marks.length})</Button>
                  <Button selected={notebookPage === 'key'} onClick={() => setNotebookPage('key')}>Key</Button>
                </div>
                <div key={notebookPage} className="FieldMap__notebookBody" tabIndex={0} role="region" aria-label={notebookPage === 'notes' ? 'Field notes' : 'Chart key'}
                  onKeyDown={(event) => { if (event.target === event.currentTarget && ['PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) event.stopPropagation(); }}
                  onKeyUp={(event) => { if (event.target === event.currentTarget && ['PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) event.stopPropagation(); }}>
                  {notebookPage === 'notes' ? <>
                    <p className="FieldMap__muted">Terrain is a record of your last charting. The red compass marks your last refreshed position.</p>
                    {!data.writable && <p className="FieldMap__note">Hold a feather or thorn, then use Locate me to begin writing.</p>}
                    {data.survey && <section><h3>Latest sounding</h3><p>{data.survey.text}</p><Button icon="pen" disabled={!data.writable} onClick={() => {
                      cancelGesture(); act('record_survey'); setSelectedZ(data.survey!.z); setCenter([data.survey!.x, data.survey!.y]);
                    }}>Record on atlas</Button></section>}
                    <section><h3>Annotations <span>{marks.length}</span></h3>
                      {!marks.length && <p className="FieldMap__muted">Choose Route to draw a path, or Label to name a place.</p>}
                      {marks.map((mark) => <div key={mark.id} className="FieldMap__annotation">
                        <Button icon={mark.kind === 'stroke' ? 'route' : 'map-pin'} tooltip="Find annotation" onClick={() => { cancelGesture(); setCenter(mark.kind === 'stroke' && mark.points?.length ? mark.points[0] : [mark.x, mark.y]); }}>{mark.kind === 'stroke' ? `Route #${mark.id}` : mark.kind === 'survey' ? 'Recorded sounding' : mark.text}</Button>
                        <Button icon="eraser" disabled={!data.writable || !mark.erasable} onClick={() => act('erase', { id: mark.id })} tooltip={mark.erasable ? 'Erase your annotation' : 'Only its author can erase this annotation'} />
                        {mark.kind === 'survey' && <p>{mark.text}</p>}
                      </div>)}
                    </section>
                  </> : <>
                    <h3>Reading the chart</h3>
                    <p className="FieldMap__muted">Terrain washes and landmark symbols.</p>
                    <div className="FieldMap__legend">
                      {[['ground', 'Ground'], ['grass', 'Meadow'], ['forest', 'Woodland'], ['dirt', 'Dirt'], ['mud', 'Mud'], ['sand', 'Sand'], ['snow', 'Snow'], ['road', 'Road or path'], ['water', 'Shallows'], ['deep_water', 'Deep water'], ['floor', 'Floor'], ['wall', 'Wall'], ['stone', 'Stonework'], ['wood', 'Timber floor'], ['rock', 'Rock'], ['drop', 'Open drop']].map(([kind, name]) => <div key={kind}><svg viewBox="0 0 2 1.2"><rect width="2" height="1.2" fill={terrainColors[kind]} />{terrainPattern[kind] && <rect width="2" height="1.2" fill={`url(#atlas-${terrainPattern[kind]})`} />}</svg><span>{name}</span></div>)}
                      {[['tree', 'Tree'], ['bush', 'Bush'], ['rock', 'Boulder'], ['door', 'Door'], ['door-open', 'Open door'], ['window', 'Window'], ['stairs', 'Stairs'], ['ladder', 'Ladder'], ['fence', 'Fence'], ['bridge', 'Bridge'], ['well', 'Well'], ['statue', 'Statue'], ['grate', 'Grate']].map(([kind, name]) => <div key={kind}><svg viewBox="-.7 -.7 1.4 1.4"><use href={`#atlas-${kind}`} /></svg><span>{name}</span></div>)}
                    </div>
                  </>}
                </div>
              </aside>}
            </div>
            <div className="FieldMap__footnote"><span>Terrain remembers your last charting; the red compass, your last location.</span>{!data.writable && <span>Hold a feather or thorn to write.</span>}</div>
          </div>
        )}
      </Window.Content>
    </Window>
  );
};
