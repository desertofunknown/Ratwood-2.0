import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type {
  Data,
  MarketRegionOption,
  MarketRow,
} from '../interfaces/StewardTrade/types';

const nativeByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
if (!nativeByond)
  Reflect.set(globalThis, 'Byond', { windowId: 'steward-market' });
const backend = await import('../backend');
const { MarketView } = await import('../interfaces/StewardTrade/MarketView');
if (!nativeByond) Reflect.deleteProperty(globalThis, 'Byond');

let container: HTMLDivElement;
let root: Root;
let data: Data;
let backendSpy: ReturnType<typeof spyOn>;
const dispatch = mock((action: string, params?: Record<string, unknown>) => {});
const onTrade = mock(
  (request: {
    side: 'import' | 'export';
    regionId: string;
    goodId: string;
  }) => {},
);
const env = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousActEnvironment: boolean | undefined;

const route = (
  region_id: string,
  overrides: Partial<MarketRegionOption> = {},
): MarketRegionOption => ({
  region_id,
  unit_price: 4,
  capacity_today: 12,
  capacity_total: 20,
  batch_capacity: 5,
  is_blockaded: false,
  ...overrides,
});
const row = (
  good_id: string,
  overrides: Partial<MarketRow> = {},
): MarketRow => ({
  good_id,
  stock: 8,
  stock_limit: 50,
  event_tag: '',
  import_regions: [route('north'), route('south', { unit_price: 5 })],
  export_regions: [route('south', { unit_price: 8 }), route('north')],
  buy_price: 3,
  sell_price: 6,
  market_buy_price: 4,
  market_sell_price: 8,
  automatic_price: true,
  automatic_limit: true,
  accepting: true,
  withdraw_disabled: false,
  autoexport_disabled: false,
  margin_per_unit: 3,
  arbitrage_potential: 24,
  ...overrides,
});

beforeEach(() => {
  previousActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  dispatch.mockClear();
  onTrade.mockClear();
  data = {
    good_catalog: {
      wheat: { name: 'Winter Wheat', category: 'grain', importable: true },
      iron: { name: 'Iron', category: 'basic_mineral', importable: false },
    },
    region_catalog: {
      north: {
        name: 'Northern March and the Outer Provinces',
        description: '',
      },
      south: { name: 'Southern Coast', description: '' },
    },
    market_rows: [
      row('wheat'),
      row('iron', { import_regions: [], export_regions: [] }),
    ],
    is_alderman_acting: false,
    total_arbitrage_potential: 24,
    autoexport_percentage: 75,
  } as unknown as Data;
  backendSpy = spyOn(backend, 'useBackend').mockImplementation((() => ({
    data,
    act: dispatch,
  })) as unknown as typeof backend.useBackend);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  backendSpy.mockRestore();
  env.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const render = async () => {
  await act(async () =>
    root.render(<MarketView data={data} onTrade={onTrade} />),
  );
};
const click = async (element: HTMLElement) => {
  await act(async () => element.click());
};
const button = (label: string, within: ParentNode = container) => {
  const found = Array.from(within.querySelectorAll('button')).find(
    (element) =>
      element.getAttribute('aria-label') === label ||
      element.textContent?.trim() === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
};
const group = (label: string) => {
  const found = Array.from(container.querySelectorAll('[role="group"]')).find(
    (element) => element.getAttribute('aria-label') === label,
  );
  if (!found) throw new Error(`Missing group: ${label}`);
  return found;
};

test('renders named stockpile fields, full names, and native category selection', async () => {
  await render();
  expect(
    Array.from(container.querySelectorAll('thead th')).map(
      (cell) => cell.textContent,
    ),
  ).toEqual(['Good', 'Stock', 'Crown buy', 'Crown sell', 'Cap', 'Permissions']);
  expect(container.querySelector('th[scope="row"]')?.textContent).toBe(
    'Winter Wheat',
  );
  expect(container.textContent).toContain(
    'Northern March and the Outer Provinces',
  );
  expect(container.textContent).toContain('8/50');
  expect(button('Grains (1)').getAttribute('aria-pressed')).toBe('true');
  await click(button('Basic Minerals (1)'));
  expect(button('Basic Minerals (1)').getAttribute('aria-pressed')).toBe(
    'true',
  );
  expect(container.querySelector('th[scope="row"]')?.textContent).toBe('Iron');
  expect(container.textContent).toContain('not importable');
  expect(container.textContent).toContain('no demanding region');
});

test('routes to the best regions and lazily expands other regions with exact modal requests', async () => {
  await render();
  const buys = group('Buy Winter Wheat');
  const sells = group('Sell Winter Wheat');
  expect(buys.querySelectorAll('.StewardMarket__route').length).toBe(1);
  await click(button('Import', buys));
  await click(button('Export', sells));
  expect(onTrade.mock.calls).toEqual([
    [{ side: 'import', regionId: 'north', goodId: 'wheat' }],
    [{ side: 'export', regionId: 'south', goodId: 'wheat' }],
  ]);
  const toggle = button('Other regions (1)', buys);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  await click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(
    container
      .querySelector(`#${toggle.getAttribute('aria-controls')}`)
      ?.hasAttribute('hidden'),
  ).toBe(false);
  await click(button('Import Winter Wheat from Southern Coast', buys));
  expect(onTrade.mock.calls.at(-1)).toEqual([
    { side: 'import', regionId: 'south', goodId: 'wheat' },
  ]);
  await click(button('Other regions (1)', sells));
  await click(
    button(
      'Export Winter Wheat to Northern March and the Outer Provinces',
      sells,
    ),
  );
  expect(onTrade.mock.calls.at(-1)).toEqual([
    { side: 'export', regionId: 'north', goodId: 'wheat' },
  ]);
  expect(dispatch).not.toHaveBeenCalled();
  await click(toggle);
  expect(buys.querySelectorAll('.StewardMarket__route').length).toBe(1);
});

test('retains every global action payload', async () => {
  await render();
  const actions = group('All stockpile actions');
  const expected = [
    ['Threshold 75%', 'set_autoexport_percentage'],
    ['Export Surplus', 'export_surplus_all'],
    ['Auto-Price All', 'autoprice_all'],
    ['Auto-Limit All', 'autolimit_all'],
    ['Buy ×', 'multiply_all_buy'],
    ['Sell ×', 'multiply_all_sell'],
  ];
  for (const [label, action] of expected) {
    await click(button(label, actions));
    expect(dispatch.mock.calls.at(-1)).toEqual([action]);
  }
});

test('retains every selected category action and permission payload', async () => {
  await render();
  await click(button('Basic Minerals (1)'));
  const actions = group('Basic Minerals actions');
  const permissions = group('Basic Minerals permissions');
  for (const [label, action] of [
    ['Export Surplus', 'export_surplus_category'],
    ['Auto-Price', 'autoprice_category'],
    ['Auto-Limit', 'autolimit_category'],
    ['Buy ×', 'multiply_category_buy'],
    ['Sell ×', 'multiply_category_sell'],
    ['Open All', 'accept_category'],
    ['Close All', 'reject_category'],
    ['Draws On', 'allow_withdraw_category'],
    ['Draws Off', 'bar_withdraw_category'],
    ['Auto-Export On', 'allow_autoexport_category'],
    ['Auto-Export Off', 'bar_autoexport_category'],
  ]) {
    await click(
      button(
        label,
        action.includes('category') &&
          [
            'Export Surplus',
            'Auto-Price',
            'Auto-Limit',
            'Buy ×',
            'Sell ×',
          ].includes(label)
          ? actions
          : permissions,
      ),
    );
    expect(dispatch.mock.calls.at(-1)).toEqual([
      action,
      {
        category: 'basic_mineral',
        ...(action.startsWith('multiply')
          ? { category_label: 'Basic Minerals' }
          : {}),
      },
    ]);
  }
});

test('retains every per-good stockpile action payload and flag meaning', async () => {
  await render();
  for (const [label, action] of [
    ['Set Winter Wheat buy price', 'set_buy_price'],
    ['Set Winter Wheat sell price', 'set_sell_price'],
    ['Set Winter Wheat stockpile limit', 'set_stockpile_limit'],
    ['Winter Wheat automatic pricing', 'toggle_auto_price'],
    ['Winter Wheat automatic limit', 'toggle_auto_limit'],
    ['Winter Wheat deposits', 'toggle_stockpile_accept'],
    ['Winter Wheat withdrawals', 'toggle_withdraw_disabled'],
    ['Winter Wheat auto-export', 'toggle_autoexport_disabled'],
  ]) {
    await click(button(label));
    expect(dispatch.mock.calls.at(-1)).toEqual([action, { good_id: 'wheat' }]);
  }
  for (const label of [
    'Winter Wheat automatic pricing',
    'Winter Wheat automatic limit',
    'Winter Wheat deposits',
    'Winter Wheat withdrawals',
    'Winter Wheat auto-export',
  ]) {
    expect(button(label).getAttribute('aria-pressed')).toBe('true');
  }
});

test('Alderman stockpile controls are read-only while trading and disclosure remain available', async () => {
  data = { ...data, is_alderman_acting: true };
  await render();
  const stockpileButtons = [
    ...group('All stockpile actions').querySelectorAll('button'),
    ...group('Grains actions').querySelectorAll('button'),
    ...group('Grains permissions').querySelectorAll('button'),
    ...container.querySelectorAll<HTMLButtonElement>(
      'tbody tr:first-child button',
    ),
  ];
  expect(stockpileButtons.length).toBe(25);
  for (const control of stockpileButtons) {
    expect(control.disabled).toBe(true);
    await click(control);
  }
  expect(dispatch).not.toHaveBeenCalled();
  expect(container.textContent).toContain('8/50');
  await click(button('Import', group('Buy Winter Wheat')));
  await click(button('Export', group('Sell Winter Wheat')));
  expect(onTrade).toHaveBeenCalledTimes(2);
  await click(button('Other regions (1)', group('Buy Winter Wheat')));
  expect(button('Import Winter Wheat from Southern Coast').disabled).toBe(
    false,
  );
});

test('live data updates prices, capacities and permissions while preserving expanded state and category fallback', async () => {
  await render();
  await click(button('Other regions (1)', group('Buy Winter Wheat')));
  await click(button('Basic Minerals (1)'));
  await click(button('Grains (1)'));
  expect(
    button('Hide regions (1)', group('Buy Winter Wheat')).getAttribute(
      'aria-expanded',
    ),
  ).toBe('true');
  data = {
    ...data,
    autoexport_percentage: 80,
    total_arbitrage_potential: 70,
    market_rows: [
      row('wheat', {
        stock: 17,
        stock_limit: 90,
        buy_price: 11,
        sell_price: 15,
        automatic_price: false,
        automatic_limit: false,
        accepting: false,
        withdraw_disabled: true,
        autoexport_disabled: true,
        event_tag: 'SHORTAGE',
        import_regions: [
          route('south', {
            unit_price: 12,
            capacity_today: 0,
            is_blockaded: true,
          }),
          route('north'),
        ],
      }),
      row('iron'),
    ],
  };
  await render();
  expect(button('Threshold 80%')).toBeDefined();
  expect(container.textContent).toContain('17/90');
  expect(button('Set Winter Wheat buy price').textContent).toBe('11m');
  expect(button('Set Winter Wheat sell price').textContent).toBe('15m');
  expect(container.textContent).toContain('SHORTAGE');
  expect(container.textContent).toContain('BLOCKADED');
  expect(container.textContent).toContain('SATURATED');
  expect(group('Buy Winter Wheat').textContent).toContain('@ 12m/u');
  expect(group('Buy Winter Wheat').textContent).toContain('[0/20]');
  for (const label of [
    'Winter Wheat automatic pricing',
    'Winter Wheat automatic limit',
    'Winter Wheat deposits',
    'Winter Wheat withdrawals',
    'Winter Wheat auto-export',
  ]) {
    expect(button(label).getAttribute('aria-pressed')).toBe('false');
  }
  await click(button('Import', group('Buy Winter Wheat')));
  expect(onTrade.mock.calls.at(-1)).toEqual([
    { side: 'import', regionId: 'south', goodId: 'wheat' },
  ]);
  data = { ...data, market_rows: [row('iron')] };
  await render();
  expect(button('Basic Minerals (1)').getAttribute('aria-pressed')).toBe(
    'true',
  );
  expect(container.querySelector('th[scope="row"]')?.textContent).toBe('Iron');
});

test('handles empty markets, missing catalog entries and nonproducing regions', async () => {
  data = { ...data, market_rows: [] };
  await render();
  expect(container.textContent).toContain('No goods accepted at present.');
  data = {
    ...data,
    market_rows: [
      row('unknown', { import_regions: [route('unknown_region')] }),
      row('wheat', { import_regions: [] }),
    ],
  };
  await render();
  expect(container.textContent).toContain('no producing region');
  await click(button('Misc (1)'));
  expect(container.querySelector('th[scope="row"]')?.textContent).toBe(
    'unknown',
  );
  expect(container.textContent).toContain('unknown_region');
});
