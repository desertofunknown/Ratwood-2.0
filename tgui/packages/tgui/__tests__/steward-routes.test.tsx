import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, type ReactNode, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { Data } from '../interfaces/StewardTrade/types';

// The real backend imports drag.ts, which reads the window ID at module load.
const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
Reflect.set(globalThis, 'Byond', { windowId: 'steward-routes' });
const backend = await import('../backend');
const { AutoImportView } = await import(
  '../interfaces/StewardTrade/AutoImportView'
);
const { RegionsView } = await import('../interfaces/StewardTrade/RegionsView');
if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
else Reflect.deleteProperty(globalThis, 'Byond');

let container: HTMLDivElement;
let root: Root;
type BackendReducerState = NonNullable<
  Parameters<typeof backend.backendReducer>[0]
>;
let store: Store;
let previousStore: Store;
let previousByond: PropertyDescriptor | undefined;
let sendMessage: ReturnType<typeof mock>;
const env = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousActEnvironment: boolean | undefined;

const stewardData = (overrides: Partial<Data> = {}): Data => ({
  order_pool_cap: 5,
  good_catalog: {
    wheat: { name: 'Wheat', importable: true, category: 'grain' },
    iron: { name: 'Iron', importable: true, category: 'basic_mineral' },
  },
  region_catalog: {},
  treasury: 1000,
  day: 1,
  expected_rural_revenue: 0,
  expected_wage_outlay: 0,
  blockaded_regions: [],
  banditry_projection: { total: 0, lines: [], debt: 0 },
  active_events: [],
  active_orders: [],
  market_rows: [],
  region_rows: [],
  is_alderman_acting: false,
  alderman_warrant: null,
  auto_import: {
    today_spent: 0,
    purse_floor: 100,
    floor_target: 10,
    batch_size: 5,
    max_price_mult: 2,
    essentials: [{ good_id: 'wheat', active: true, stock: 2 }],
    others: [{ good_id: 'iron', active: false, stock: 20 }],
    history: [],
  },
  trade_quote: null,
  total_arbitrage_potential: 0,
  autoexport_percentage: 0,
  autoexport_barred: 0,
  shortage_goods_open: 0,
  petition_categories: [],
  petition_tax_pct: 0,
  petitions_per_day: 0,
  petition: {
    pledge_balance: 0,
    petitions_remaining: 0,
    is_steward_role: true,
    is_alderman_acting: false,
    eligibility: {},
  },
  sequestration: { active: false, in_arrears: false, debt: 0, state_label: '' },
  atc_loan: {
    available: false,
    can_view: false,
    min: 0,
    max: 0,
    closed_day: 0,
    interest_pct: 0,
    blocker: '',
    arrears_consumed: false,
    loans_drawn: 0,
    outstanding: 0,
  },
  royal_custom_unlocked: true,
  royal_custom_margin: 100,
  royal_custom_threshold: 1000,
  royal_custom_volume: 1000,
  ...overrides,
});

beforeEach(() => {
  previousActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  sendMessage = mock();
  Reflect.set(globalThis, 'Byond', { windowId: 'steward-routes', sendMessage });
  previousStore = backend.globalStore;
  store = createStore<{ backend: BackendReducerState }>((state, action) => ({
    // The reducer's inferred return widens its literal suspended:false to boolean.
    backend: backend.backendReducer(
      state?.backend,
      action,
    ) as BackendReducerState,
  }));
  backend.setGlobalStore(store);
  store.dispatch(backend.backendUpdate({ data: stewardData() }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  backend.setGlobalStore(previousStore);
  if (previousByond) Object.defineProperty(globalThis, 'Byond', previousByond);
  else Reflect.deleteProperty(globalThis, 'Byond');
  env.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const render = async (node: ReactNode) => {
  await act(async () => root.render(node));
};
const update = async (data: Partial<Data>) => {
  await act(async () => store.dispatch(backend.backendUpdate({ data })));
};
const button = (label: string) => {
  const found = Array.from(container.querySelectorAll('button')).find(
    (element) => element.textContent?.trim() === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
};
const input = (label: string) => {
  const found = container.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`,
  );
  if (!found) throw new Error(`Missing input: ${label}`);
  return found;
};
const click = async (element: HTMLElement) => {
  await act(async () => element.click());
};

const Connected = ({ regions = false }: { regions?: boolean }) => {
  useSyncExternalStore(store.subscribe, store.getState);
  const { data } = backend.useBackend<Data>();
  return regions ? <RegionsView data={data} /> : <AutoImportView data={data} />;
};
const regionData = (): Partial<Data> => ({
  region_catalog: {
    north: {
      name: 'Northern Highlands and the Far Reaches',
      description: 'Cold valleys sheltered by the northern mountains.',
    },
    south: {
      name: 'Southern Coast',
      description: 'Harbors and fertile fields.',
    },
  },
  region_rows: [
    {
      region_id: 'south',
      blockaded: false,
      produces: [{ good_id: 'silk', total: 4, today: 2 }],
      demands: [],
    },
    {
      region_id: 'north',
      blockaded: true,
      produces: [{ good_id: 'wheat', total: 20, today: -3 }],
      demands: [{ good_id: 'iron', total: 8, today: 6 }],
    },
  ],
});
const importData = (): Data['auto_import'] => ({
  ...stewardData().auto_import,
  today_spent: 24,
  others: [
    { good_id: 'iron', active: false, stock: 20 },
    { good_id: 'silk', active: true, stock: 12 },
  ],
  history: [
    { day: 1, spent: 0, lines: [] },
    {
      day: 2,
      spent: 24,
      lines: ['Imported Winter wheat from the distant northern farmlands.'],
    },
  ],
});
const catalog = {
  ...stewardData().good_catalog,
  wheat: {
    name: 'Winter wheat from the distant northern farmlands',
    importable: true,
    category: 'grain',
  },
  silk: { name: 'Silk', importable: false, category: 'cloth' },
};
const disclosure = (name: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
const toggle = (name: string) => input(`Standing import: ${name}`);

test('regions put blockades first, preserve full lore and flow values, and keep blockade trade usable', async () => {
  await update({ ...regionData(), good_catalog: catalog });
  await render(<Connected regions />);
  const headings = container.querySelectorAll<HTMLButtonElement>(
    'button[aria-expanded]',
  );
  expect(headings[0].getAttribute('aria-label')).toBe(
    'Northern Highlands and the Far Reaches',
  );
  expect(headings[0].getAttribute('aria-expanded')).toBe('true');
  expect(headings[1].getAttribute('aria-expanded')).toBe('false');
  expect(container.textContent).toContain(
    'Cold valleys sheltered by the northern mountains.',
  );
  const production = container.querySelector(
    'table[aria-label="Northern Highlands and the Far Reaches produces"]',
  );
  expect(production?.textContent).toContain(
    'Winter wheat from the distant northern farmlands',
  );
  expect(
    Array.from(production!.querySelectorAll('td')).map(
      (cell) => cell.textContent,
    ),
  ).toEqual(['20', '-3']);
  await click(button('Import from Northern Highlands and the Far Reaches'));
  await click(button('Export to Northern Highlands and the Far Reaches'));
  expect(sendMessage.mock.calls).toEqual([
    ['act/trade_region_import', { region_id: 'north' }],
    ['act/trade_region_export', { region_id: 'north' }],
  ]);
  await click(headings[0]);
  expect(container.textContent).not.toContain(
    'Cold valleys sheltered by the northern mountains.',
  );
  await click(headings[1]);
  expect(container.textContent).toContain('Harbors and fertile fields.');
  expect(button('Import from Southern Coast').disabled).toBe(true);
  await click(button('Import from Southern Coast'));
  expect(sendMessage.mock.calls.length).toBe(2);
});

test('region refresh preserves disclosure state and updates flows and importability', async () => {
  await update({ ...regionData(), good_catalog: catalog });
  await render(<Connected regions />);
  await click(disclosure('Southern Coast'));
  const next = regionData();
  next.region_rows![1].blockaded = false;
  next.region_rows![1].produces[0].today = 14;
  await update({
    ...next,
    good_catalog: { ...catalog, silk: { ...catalog.silk, importable: true } },
  });
  expect(
    disclosure('Northern Highlands and the Far Reaches').getAttribute(
      'aria-expanded',
    ),
  ).toBe('true');
  expect(disclosure('Southern Coast').getAttribute('aria-expanded')).toBe(
    'true',
  );
  expect(container.textContent).not.toContain('Blockaded');
  expect(
    container.querySelector(
      'table[aria-label="Northern Highlands and the Far Reaches produces"]',
    )?.textContent,
  ).toContain('14');
  expect(button('Import from Southern Coast').disabled).toBe(false);
  await update({ region_rows: [] });
  expect(container.textContent).toContain(
    'No regional trade routes are available.',
  );
});

test('standing import controls dispatch exact actions and show explanations, full names and reverse tally', async () => {
  await update({ good_catalog: catalog, auto_import: importData() });
  await render(<Connected />);
  expect(container.textContent).toContain('Goods on standing import: 2');
  expect(container.textContent).toContain(
    'Tops up each good by 5 units every 6 minutes when stock is below 10',
  );
  expect(container.textContent).toContain('2x its base price');
  expect(toggle(catalog.wheat.name).checked).toBe(true);
  expect(container.textContent).toContain('Will top up');
  expect(container.textContent).toContain('Stocked');
  await click(toggle(catalog.wheat.name));
  await click(button('Basic Minerals (0/1)'));
  expect(toggle('Iron').checked).toBe(false);
  await click(toggle('Iron'));
  await click(button('Strike All'));
  expect(sendMessage.mock.calls).toEqual([
    ['act/toggle_auto_import', { good_id: 'wheat' }],
    ['act/toggle_auto_import', { good_id: 'iron' }],
    ['act/kill_switch_auto_import', {}],
  ]);
  const rows = container.querySelectorAll(
    'table[aria-label="Standing import history"] tbody tr',
  );
  expect(rows[0].textContent).toContain(
    'Day 224mImported Winter wheat from the distant northern farmlands.',
  );
  expect(rows[1].textContent).toContain('Day 10mNo auto-import activity.');
});

test('live category removal falls back truthfully and stock and active counts follow backend changes', async () => {
  await update({ good_catalog: catalog, auto_import: importData() });
  await render(<Connected />);
  await click(button('Basic Minerals (0/1)'));
  const next = importData();
  next.others = [{ good_id: 'silk', active: false, stock: 3 }];
  next.essentials[0].active = false;
  await update({ auto_import: next });
  expect(button('Textiles (0/1)').getAttribute('aria-pressed')).toBe('true');
  expect(toggle('Silk').checked).toBe(false);
  expect(container.textContent).toContain('3 / 10');
  expect(container.textContent).toContain('Goods on standing import: 0');
  await update({
    auto_import: { ...next, essentials: [], others: [], history: [] },
  });
  expect(container.textContent).toContain('No essentials configured.');
  expect(container.textContent).toContain(
    'No other goods may be placed on standing import at present.',
  );
  expect(container.textContent).toContain('No auto-import history yet.');
});

test('Alderman changes disable standing import actions without hiding categories or tally', async () => {
  await update({ good_catalog: catalog, auto_import: importData() });
  await render(<Connected />);
  await update({ is_alderman_acting: true });
  expect(button('Strike All').disabled).toBe(true);
  expect(button('Set').disabled).toBe(true);
  expect(container.textContent).toContain("Reserved to the Steward's office");
  await click(button('Basic Minerals (0/1)'));
  expect(toggle('Iron').disabled).toBe(true);
  await click(toggle('Iron'));
  await click(button('Strike All'));
  expect(sendMessage).not.toHaveBeenCalled();
  expect(container.textContent).toContain(
    'Imported Winter wheat from the distant northern farmlands.',
  );
  await update({ is_alderman_acting: false });
  expect(toggle('Iron').disabled).toBe(false);
  expect(button('Strike All').disabled).toBe(false);
});
