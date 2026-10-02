import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, type ReactNode, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type {
  Data,
  Order,
  PetitionState,
} from '../interfaces/StewardTrade/types';

const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
Reflect.set(globalThis, 'Byond', { windowId: 'steward-orders-petitions' });
const backend = await import('../backend');
const { OrdersView } = await import('../interfaces/StewardTrade/OrdersView');
const { PetitionView } = await import(
  '../interfaces/StewardTrade/PetitionView'
);
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
const regionName = 'The Northern Coastal Commonwealth and its Outer Islands';
const goodName = 'Fine ceremonial garments and imported textiles';
const stewardData = (): Data => ({
  order_pool_cap: 5,
  good_catalog: {
    cloth: { name: goodName, importable: true, category: 'textiles' },
  },
  region_catalog: {
    north: { name: regionName, description: 'A distant trade hall.' },
  },
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
    essentials: [],
    others: [],
    history: [],
  },
  trade_quote: null,
  total_arbitrage_potential: 0,
  autoexport_percentage: 0,
  autoexport_barred: 0,
  shortage_goods_open: 0,
  petition_categories: [
    {
      id: 'construction',
      label: 'Construction materials and equipment',
      description: 'The builders request timber, tools and stone.',
      cost: 20,
    },
    {
      id: 'feast',
      label: 'The Great Feast',
      description: 'Food and drink for a royal celebration.',
      cost: 35,
    },
  ],
  petition_tax_pct: 15,
  petitions_per_day: 2,
  petition: {
    pledge_balance: 50,
    petitions_remaining: 2,
    is_steward_role: true,
    is_alderman_acting: false,
    eligibility: {
      construction: { north: '', south: 'road blockaded' },
      feast: { north: 'recovering from blockade', east: '' },
    },
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
  royal_custom_unlocked: false,
  royal_custom_margin: 100,
  royal_custom_threshold: 1000,
  royal_custom_volume: 0,
});
const order = (ref: string, overrides: Partial<Order> = {}): Order => ({
  ref,
  name: `Order ${ref}`,
  description: `Lore for ${ref}.`,
  region_id: 'north',
  region_blockaded: false,
  has_warehouse: false,
  has_stockpile: true,
  days_left: 3,
  payout: 100,
  items: [{ good_id: 'cloth', needed: 10, have: 10, route: 'stockpile' }],
  can_fulfill: true,
  shortfall_text: '',
  petitioned: false,
  can_partial: false,
  partial_pct: 0,
  partial_payout_preview: 0,
  pair_id: null,
  pair_label: null,
  ...overrides,
});

beforeEach(() => {
  previousActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  sendMessage = mock();
  Reflect.set(globalThis, 'Byond', {
    windowId: 'steward-orders-petitions',
    sendMessage,
  });
  previousStore = backend.globalStore;
  store = createStore<{ backend: BackendReducerState }>((state, action) => ({
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
const updatePetition = async (petition: Partial<PetitionState>) => {
  await update({
    petition: { ...store.getState().backend.data.petition, ...petition },
  });
};
const click = async (element: HTMLElement) => {
  await act(async () => element.click());
};
const ConnectedView = ({ kind }: { kind: 'orders' | 'petition' }) => {
  useSyncExternalStore(store.subscribe, store.getState);
  const { data } = backend.useBackend<Data>();
  return kind === 'orders' ? (
    <OrdersView data={data} />
  ) : (
    <PetitionView data={data} />
  );
};
const orderEntry = (ref: string) => {
  const found = Array.from(container.querySelectorAll('article')).find(
    (entry) => entry.querySelector('h3')?.textContent === `Order ${ref}`,
  );
  if (!found) throw new Error(`Missing order: ${ref}`);
  return found;
};
const hallRow = (name: string) => {
  const found = Array.from(container.querySelectorAll('tbody tr')).find(
    (entry) => entry.querySelector('th')?.textContent === name,
  );
  if (!found) throw new Error(`Missing hall: ${name}`);
  return found;
};
const categoryButton = (label: string) => {
  const found = Array.from(
    container.querySelectorAll<HTMLButtonElement>('nav button'),
  ).find((entry) => entry.querySelector('span')?.textContent === label);
  if (!found) throw new Error(`Missing category: ${label}`);
  return found;
};

describe('Standing orders register', () => {
  test('groups interleaved siblings under the first member and dispatches each exact ref', async () => {
    await update({
      active_orders: [
        order('a', { pair_id: 'pair', pair_label: 'Construction' }),
        order('single'),
        order('b', {
          pair_id: 'pair',
          pair_label: 'Sibling label',
          payout: 230,
        }),
      ],
    });
    await render(<ConnectedView kind="orders" />);
    expect(container.querySelector('h2')?.textContent).toBe(
      'Active Standing Orders (3/5)',
    );
    const pair = container.querySelector('.StewardOrders__pair')!;
    expect(pair.querySelector('h3')?.textContent).toContain(
      `Construction${regionName}330m total`,
    );
    expect(pair.textContent).toContain('(linked pair, one slot)');
    expect(
      Array.from(container.querySelectorAll('article h3')).map(
        (entry) => entry.textContent,
      ),
    ).toEqual(['Order a', 'Order b', 'Order single']);
    for (const ref of ['a', 'b', 'single']) {
      expect(orderEntry(ref).textContent).toContain(`Lore for ${ref}.`);
      expect(orderEntry(ref).textContent).toContain(goodName);
      await click(orderEntry(ref).querySelector('button')!);
    }
    expect(sendMessage.mock.calls).toEqual(
      ['a', 'b', 'single'].map((ref) => ['act/fulfill_order', { ref }]),
    );
  });

  test('preserves a surviving half, sibling label fallback, unknown catalog IDs and empty state', async () => {
    await update({
      active_orders: [
        order('a', { pair_id: 'pair' }),
        order('b', { pair_id: 'pair', pair_label: 'The Great Feast' }),
      ],
    });
    await render(<ConnectedView kind="orders" />);
    expect(
      container.querySelector('.StewardOrders__pairHeading')?.textContent,
    ).toContain('The Great Feast');
    await update({
      active_orders: [
        order('b', {
          pair_id: 'pair',
          region_id: 'unknown',
          items: [
            { good_id: 'unknown good', needed: 2, have: 1, route: 'stockpile' },
          ],
        }),
      ],
    });
    expect(
      container.querySelector('.StewardOrders__pairHeading')?.textContent,
    ).toContain('Linked Pairunknown100m total');
    expect(orderEntry('b').textContent).toContain(
      '2 unknown good (1 in stock)',
    );
    await click(orderEntry('b').querySelector('button')!);
    expect(sendMessage.mock.calls).toEqual([
      ['act/fulfill_order', { ref: 'b' }],
    ]);
    await update({ active_orders: [] });
    expect(container.textContent).toContain(
      'No active orders. Check back tomorrow.',
    );
    expect(container.querySelector('button')).toBeNull();
  });

  test.each([
    {
      name: 'warehouse',
      data: { has_warehouse: true, has_stockpile: false, can_fulfill: false },
      label: 'Fulfill from Warehouse',
      disabled: false,
    },
    {
      name: 'mixed',
      data: { has_warehouse: true },
      label: 'Fulfill (Warehouse + Stockpile)',
      disabled: false,
    },
    {
      name: 'stockpile',
      data: {},
      label: 'Fulfill from Stockpile',
      disabled: false,
    },
    {
      name: 'partial',
      data: {
        can_fulfill: false,
        can_partial: true,
        partial_pct: 70,
        partial_payout_preview: 60,
        shortfall_text: 'need 3 more textiles',
      },
      label: 'Fulfill Partial — 70% (60m)',
      disabled: false,
    },
    {
      name: 'short',
      data: { can_fulfill: false, shortfall_text: 'need 10 more textiles' },
      label: 'Fulfill — need 10 more textiles',
      disabled: true,
    },
    {
      name: 'empty',
      data: { can_fulfill: false },
      label: 'Fulfill — insufficient stock',
      disabled: true,
    },
    {
      name: 'blockaded warehouse',
      data: {
        region_blockaded: true,
        has_warehouse: true,
        has_stockpile: false,
      },
      label: 'Fulfill — road blockaded',
      disabled: true,
    },
    {
      name: 'blockaded partial',
      data: { region_blockaded: true, can_partial: true },
      label: 'Fulfill — road blockaded',
      disabled: true,
    },
  ])(
    '$name preserves fulfillment precedence and action',
    async ({ data, label, disabled }) => {
      await update({ active_orders: [order('current', data)] });
      await render(<ConnectedView kind="orders" />);
      const button = orderEntry('current').querySelector('button')!;
      expect(button.textContent).toBe(label);
      expect(button.disabled).toBe(disabled);
      await click(button);
      expect(sendMessage.mock.calls).toEqual(
        disabled ? [] : [['act/fulfill_order', { ref: 'current' }]],
      );
      if (data.can_partial && !data.region_blockaded) {
        expect(button.title).toContain(
          'paid at 85% of the delivered share. Missing: need 3 more textiles',
        );
      }
    },
  );

  test('keeps quality names, payout, petition mark, urgency and current blockade state', async () => {
    const current = order('quality', {
      has_warehouse: true,
      petitioned: true,
      days_left: 1,
    });
    await update({ active_orders: [current] });
    await render(<ConnectedView kind="orders" />);
    expect(container.textContent).toContain('Payout: 100m');
    expect(container.textContent).toContain('PETITIONED');
    expect(container.textContent).toContain('URGENT');
    expect(container.textContent).toContain('Warehouse goods pay -80% to +35%');
    const tooltip = container.querySelector('p[title]')!.getAttribute('title')!;
    for (const tier of [
      'scavenged 25%',
      'ruined 20%',
      'awful 35%',
      'crude 65%',
      'rough 85%',
      '(standard) 100%',
      'fine 110%',
      'flawless 120%',
      'masterwork 135%',
    ])
      expect(tooltip).toContain(tier);
    await update({ active_orders: [{ ...current, region_blockaded: true }] });
    expect(container.textContent).toContain('BLOCKADED');
    expect(container.textContent).not.toContain('URGENT');
    expect(orderEntry('quality').querySelector('button')!.disabled).toBe(true);
  });
});

describe('Petition writ', () => {
  test('uses native category selection and exact current category and region actions', async () => {
    await render(<ConnectedView kind="petition" />);
    const construction = categoryButton('Construction materials and equipment');
    expect(construction.type).toBe('button');
    expect(construction.tabIndex).toBe(0);
    expect(construction.getAttribute('aria-pressed')).toBe('true');
    construction.focus();
    expect(document.activeElement).toBe(construction);
    await click(hallRow(regionName).querySelector('button')!);
    expect(hallRow('south').textContent).toContain('road blockaded');
    expect(hallRow('south').querySelector('button')!.disabled).toBe(true);
    await click(hallRow('south').querySelector('button')!);
    await click(categoryButton('The Great Feast'));
    expect(construction.getAttribute('aria-pressed')).toBe('false');
    expect(categoryButton('The Great Feast').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(container.textContent).toContain(
      'Food and drink for a royal celebration.',
    );
    expect(hallRow(regionName).textContent).toContain(
      'recovering from blockade',
    );
    await click(hallRow('east').querySelector('button')!);
    expect(sendMessage.mock.calls).toEqual([
      [
        'act/petition_for_order',
        { region_id: 'north', category_id: 'construction' },
      ],
      ['act/petition_for_order', { region_id: 'east', category_id: 'feast' }],
    ]);
  });

  test.each([
    { state: { pledge_balance: 19 }, reason: 'pledge short 1p' },
    {
      state: { petitions_remaining: 0 },
      reason: 'no petitions remaining today',
    },
    {
      state: { is_steward_role: false },
      reason:
        'Only the Steward, Clerk, or Grand Duke may petition the trade hall.',
    },
    {
      state: { is_alderman_acting: true },
      reason:
        "The Alderman's writ does not extend to petitioning the trade hall.",
    },
  ])(
    'current blocker $reason disables existing selection',
    async ({ state, reason }) => {
      await render(<ConnectedView kind="petition" />);
      expect(hallRow(regionName).querySelector('button')!.disabled).toBe(false);
      await updatePetition(state);
      const button = hallRow(regionName).querySelector('button')!;
      expect(button.disabled).toBe(true);
      expect(button.title).toBe(reason);
      expect(container.textContent).toContain(reason);
      await click(button);
      expect(sendMessage).not.toHaveBeenCalled();
      await updatePetition(stewardData().petition);
      expect(hallRow(regionName).querySelector('button')!.disabled).toBe(false);
    },
  );

  test('removed selection and absent eligibility expose no actionable stale destination', async () => {
    await render(<ConnectedView kind="petition" />);
    await update({
      petition_categories: [stewardData().petition_categories[1]],
    });
    expect(container.textContent).toContain('Select a category at left.');
    expect(container.querySelector('tbody button')).toBeNull();
    expect(container.querySelector('[aria-pressed="true"]')).toBeNull();
    await updatePetition({ eligibility: {} });
    await click(categoryButton('The Great Feast'));
    expect(container.textContent).toContain('No regions configured.');
    expect(container.querySelector('tbody button')).toBeNull();
    await update({ petition_categories: [] });
    expect(container.textContent).toContain('No categories configured.');
    expect(container.querySelector('button')).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('refreshed category costs and eligibility govern preserved selection', async () => {
    await render(<ConnectedView kind="petition" />);
    await update({
      petition_categories: [
        { ...stewardData().petition_categories[0], cost: 60 },
      ],
    });
    expect(hallRow(regionName).textContent).toContain('pledge short 10p');
    expect(hallRow(regionName).querySelector('button')!.disabled).toBe(true);
    await updatePetition({ pledge_balance: 60 });
    expect(hallRow(regionName).querySelector('button')!.disabled).toBe(false);
    await updatePetition({
      eligibility: { construction: { north: 'order pool full' } },
    });
    expect(hallRow(regionName).textContent).toContain('order pool full');
    expect(hallRow(regionName).querySelector('button')!.disabled).toBe(true);
  });

  test.each([0, 15, 100])(
    'shows current %i percent tax and all petition explanations',
    async (tax) => {
      await update({ petition_tax_pct: tax, petitions_per_day: 1 });
      await render(<ConnectedView kind="petition" />);
      expect(container.textContent).toContain(
        `The hall takes a ${tax}% margin on petitioned orders`,
      );
      expect(container.textContent).toContain(
        'The exact item mix is still set by the hall.',
      );
      expect(container.textContent).toContain('Pledge balance: 50p');
      expect(container.textContent).toContain(
        'Petitions remaining today: 2 / 1',
      );
      expect(container.textContent).toContain('Limit: 1 petition per day');
      expect(container.textContent).toContain(
        'Regions freshly cleared of blockade need a recovery window',
      );
      expect(container.textContent).toContain(
        'tagged on the noticeboard and in the orders panel.',
      );
      await update({ petition_tax_pct: 25, petitions_per_day: 2 });
      expect(container.textContent).toContain('The hall takes a 25% margin');
      expect(container.textContent).toContain('Limit: 2 petitions per day');
    },
  );
});
