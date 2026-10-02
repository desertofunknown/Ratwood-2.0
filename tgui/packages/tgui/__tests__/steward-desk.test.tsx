import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, type ReactNode, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { ArrearsBanner } from '../interfaces/StewardTrade/ArrearsBanner';
import { BanditryBanner } from '../interfaces/StewardTrade/BanditryBanner';
import { BlockadeBanner } from '../interfaces/StewardTrade/BlockadeBanner';
import { EventsBanner } from '../interfaces/StewardTrade/EventsBanner';
import { SequestrationBanner } from '../interfaces/StewardTrade/SequestrationBanner';
import { TabBar } from '../interfaces/StewardTrade/TabBar';
import type { AtcLoanState, Data, LedgerPage, TabKey } from '../interfaces/StewardTrade/types';

// Backend initialization reads the native window ID through drag.ts.
const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
Reflect.set(globalThis, 'Byond', { windowId: 'steward-desk' });
const backend = await import('../backend');
const { ATCLoanBanner } = await import('../interfaces/StewardTrade/ATCLoanBanner');
const { LedgerView } = await import('../interfaces/StewardTrade/LedgerView');
const { AdvancedView } = await import('../interfaces/StewardTrade/AdvancedView');
if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
else Reflect.deleteProperty(globalThis, 'Byond');

const loan = (overrides: Partial<AtcLoanState> = {}): AtcLoanState => ({
  available: true, can_view: true, min: 1000, max: 5000, closed_day: 5,
  interest_pct: 25, blocker: '', arrears_consumed: false, loans_drawn: 0,
  outstanding: 0, ...overrides,
});
const ledgerPage = (overrides: Partial<LedgerPage> = {}): LedgerPage => ({
  entries: [], page: 1, page_size: 20, shown: 0, has_more: false,
  filtered: false, ...overrides,
});
const deskData = (): Data => ({
  order_pool_cap: 5, good_catalog: {}, region_catalog: {}, treasury: 1000, day: 1,
  expected_rural_revenue: 0, expected_wage_outlay: 0, blockaded_regions: [],
  banditry_projection: { total: 0, lines: [], debt: 0 }, active_events: [],
  active_orders: [], market_rows: [], region_rows: [], is_alderman_acting: false,
  alderman_warrant: null,
  auto_import: { today_spent: 0, purse_floor: 100, floor_target: 10, batch_size: 5,
    max_price_mult: 2, essentials: [], others: [], history: [] },
  trade_quote: null, total_arbitrage_potential: 0, autoexport_percentage: 0,
  autoexport_barred: 0, shortage_goods_open: 0, petition_categories: [],
  petition_tax_pct: 0, petitions_per_day: 0,
  petition: { pledge_balance: 0, petitions_remaining: 0, is_steward_role: true,
    is_alderman_acting: false, eligibility: {} },
  sequestration: { active: false, in_arrears: false, debt: 0, state_label: '' },
  atc_loan: loan(), royal_custom_unlocked: true, royal_custom_margin: 100,
  royal_custom_threshold: 1000, royal_custom_volume: 1000, ledger_page: ledgerPage(),
});

type BackendState = NonNullable<Parameters<typeof backend.backendReducer>[0]>;
let store: Store;
let previousStore: Store;
let previousByond: PropertyDescriptor | undefined;
let container: HTMLDivElement;
let root: Root;
let sendMessage: ReturnType<typeof mock>;
const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let previousActEnvironment: boolean | undefined;

beforeEach(() => {
  previousActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  sendMessage = mock();
  Reflect.set(globalThis, 'Byond', { windowId: 'steward-desk', sendMessage });
  previousStore = backend.globalStore;
  store = createStore<{ backend: BackendState }>((state, action) => ({
    // Inferred reducer returns widen suspended:false to boolean.
    backend: backend.backendReducer(state?.backend, action) as BackendState,
  }));
  backend.setGlobalStore(store);
  store.dispatch(backend.backendUpdate({ data: deskData() }));
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
const render = async (node: ReactNode) => { await act(async () => root.render(node)); };
const update = async (data: Partial<Data>) => {
  await act(async () => store.dispatch(backend.backendUpdate({ data })));
};
const updateLoan = (changes: Partial<AtcLoanState>) => update({
  atc_loan: { ...store.getState().backend.data.atc_loan, ...changes },
});
const button = (label: string) => {
  const found = Array.from(container.querySelectorAll('button')).find((element) => element.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
};
const input = () => {
  const found = container.querySelector('input');
  if (!found) throw new Error('Missing input');
  return found;
};
const click = async (element: HTMLElement) => { await act(async () => element.click()); };
const enter = async (value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), value);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const settleFilter = async (delay = 300) => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, delay)); });
};
const Connected = ({ view }: { view: 'loan' | 'ledger' | 'advanced' }) => {
  useSyncExternalStore(store.subscribe, store.getState);
  const { data } = backend.useBackend<Data>();
  if (view === 'loan') return <ATCLoanBanner atc_loan={data.atc_loan} />;
  if (view === 'ledger') return <LedgerView data={data} />;
  return <AdvancedView data={data} />;
};

describe('Company emergency loans', () => {
  test('hides inaccessible and unused unavailable loans, but retains outstanding debt', async () => {
    await updateLoan({ can_view: false });
    await render(<Connected view="loan" />);
    expect(container.textContent).toBe('');
    await updateLoan({ can_view: true, available: false });
    expect(container.textContent).toBe('');
    await updateLoan({ arrears_consumed: true, loans_drawn: 1, outstanding: 1252 });
    expect(container.querySelector('summary')?.textContent).toContain('1252m outstanding');
    expect(container.textContent).toContain('Loans drawn this week: 1.');
    expect(container.querySelector('button')).toBeNull();
  });

  test.each([
    { blocker: 'A previous writ remains unpaid.' },
    { arrears_consumed: true, loans_drawn: 1, outstanding: 1252 },
  ])('refuses another loan despite available=true when blocked by %j', async (restriction) => {
    await updateLoan(restriction);
    await render(<Connected view="loan" />);
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('Alderman can read the restriction but cannot draw against the Crown', async () => {
    await update({ is_alderman_acting: true });
    await render(<Connected view="loan" />);
    expect(container.textContent).toContain("The Alderman's writ does not extend to drawing loans against the Crown.");
    expect(container.querySelector('button')).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test.each(['', '999', '5001', '1000.5'])('rejects loan draft %j', async (draft) => {
    await render(<Connected view="loan" />);
    await enter(draft);
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(button('Approach the Clerk').disabled).toBe(true);
    await click(button('Approach the Clerk'));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test.each([1000, 1002, 5000])('requires a second click and sends the exact %im principal', async (amount) => {
    await render(<Connected view="loan" />);
    await enter(String(amount));
    if (amount === 1002) expect(container.textContent).toContain('Owe 1252m');
    expect(button('Approach the Clerk').disabled).toBe(false);
    await click(button('Approach the Clerk'));
    expect(sendMessage).not.toHaveBeenCalled();
    await click(button(`Confirm ${amount}m loan`));
    expect(sendMessage.mock.calls).toEqual([['act/take_atc_loan', { amount }]]);
    expect(button('Approach the Clerk')).toBeDefined();
  });

  test('Cancel and draft edits both require fresh confirmation', async () => {
    await render(<Connected view="loan" />);
    await click(button('Approach the Clerk'));
    await click(button('Cancel loan'));
    await click(button('Approach the Clerk'));
    await enter('1002');
    expect(button('Approach the Clerk')).toBeDefined();
    await click(button('Approach the Clerk'));
    expect(button('Confirm 1002m loan')).toBeDefined();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test.each([{ min: 1001 }, { max: 4000 }, { interest_pct: 30 }])(
    'changed loan terms %j cancel confirmation', async (changes) => {
      await render(<Connected view="loan" />);
      await enter('1002');
      await click(button('Approach the Clerk'));
      await updateLoan(changes);
      expect(button('Approach the Clerk')).toBeDefined();
      await click(button('Approach the Clerk'));
      expect(button('Confirm 1002m loan')).toBeDefined();
      expect(sendMessage).not.toHaveBeenCalled();
    },
  );

  test.each(['available', 'blocker', 'arrears_consumed', 'alderman', 'can_view'] as const)(
    'losing then restoring %s eligibility requires fresh confirmation', async (restriction) => {
      await render(<Connected view="loan" />);
      await click(button('Approach the Clerk'));
      if (restriction === 'alderman') await update({ is_alderman_acting: true });
      else await updateLoan({ [restriction]: restriction === 'blocker' ? 'Office closed.' : restriction === 'arrears_consumed' });
      expect(container.querySelector('button')).toBeNull();
      if (restriction === 'alderman') await update({ is_alderman_acting: false });
      else await updateLoan({ [restriction]: restriction === 'blocker' ? '' : restriction !== 'arrears_consumed' });
      expect(button('Approach the Clerk')).toBeDefined();
      expect(sendMessage).not.toHaveBeenCalled();
    },
  );
});

describe('Treasury ledger', () => {
  test('debounces the latest typed search, Clear replaces pending text, and unmount cancels it', async () => {
    await render(<Connected view="ledger" />);
    expect(input().type).toBe('search');
    await settleFilter();
    expect(sendMessage).not.toHaveBeenCalled();
    await enter('Cro');
    await settleFilter(100);
    await enter('Crown wages');
    await settleFilter(180);
    expect(sendMessage).not.toHaveBeenCalled();
    await settleFilter(120);
    expect(sendMessage.mock.calls).toEqual([['act/ledger_filter', { filter: 'Crown wages' }]]);
    await enter('pending reason');
    await click(button('Clear'));
    expect(input().value).toBe('');
    await settleFilter();
    expect(sendMessage.mock.calls).toEqual([
      ['act/ledger_filter', { filter: 'Crown wages' }], ['act/ledger_filter', { filter: '' }],
    ]);
    await enter('discarded after leaving');
    await render(null);
    await settleFilter();
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  test('preserves full account names and reasons with mint, burn, and transfer signs', async () => {
    const account = 'The Crown treasury and northern warehouse clearing account';
    const recipient = 'The Burghers of Rotwood Vale payroll repayment account';
    const reason = 'Full explanation of a long treasury movement after the latest grain delivery and payroll settlement';
    await update({ ledger_page: ledgerPage({ shown: 3, entries: [
      { kind: 'mint', from: '', to: account, amount: 20, reason },
      { kind: 'burn', from: account, to: '', amount: 7, reason: 'Destroyed coin' },
      { kind: 'transfer', from: account, to: recipient, amount: 13, reason: 'Payroll settlement' },
    ] }) });
    await render(<Connected view="ledger" />);
    const rows = Array.from(container.querySelectorAll('tbody tr')).map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent));
    expect(rows).toEqual([
      [account, reason, '+20m'], [account, 'Destroyed coin', '−7m'],
      [`${account} → ${recipient}`, 'Payroll settlement', '13m'],
    ]);
  });

  test('distinguishes loading, empty, and filtered-empty states and observes page boundaries', async () => {
    await update({ ledger_page: undefined });
    await render(<Connected view="ledger" />);
    expect(container.textContent).toContain('Opening the ledger...');
    await update({ ledger_page: ledgerPage() });
    expect(container.textContent).toContain('The ledger is empty.');
    expect(button('Newer').disabled).toBe(true);
    expect(button('Older').disabled).toBe(true);
    await click(button('Newer'));
    await click(button('Older'));
    expect(sendMessage).not.toHaveBeenCalled();
    await update({ ledger_page: ledgerPage({ filtered: true, has_more: true, page: 2 }) });
    expect(container.textContent).toContain('No ledger entries match that search.');
    await click(button('Newer'));
    await click(button('Older'));
    await click(button('Refresh'));
    expect(sendMessage.mock.calls).toEqual([
      ['act/ledger_page', { page: 1 }], ['act/ledger_page', { page: 3 }], ['act/ledger_refresh', {}],
    ]);
  });
});

test('all eight stewardship tabs are native buttons with current selection and exact callbacks', async () => {
  const tabs: [TabKey, string][] = [
    ['orders', 'Standing Orders'], ['market', 'Market'], ['regions', 'Regions'],
    ['auto_import', 'Imports'], ['petition', 'Petition'], ['ledger', 'Ledger'],
    ['royal_custom', 'Royal Custom'], ['advanced', 'Advanced'],
  ];
  const onSwitch = mock();
  for (const [key, label] of tabs) {
    await render(<TabBar tab={key} onSwitch={onSwitch} />);
    expect(container.querySelectorAll('nav[aria-label="Stewardship"] button').length).toBe(8);
    expect(container.querySelectorAll('button[aria-pressed="true"]').length).toBe(1);
    expect(button(label).getAttribute('aria-pressed')).toBe('true');
    expect(button(label).type).toBe('button');
    await click(button(label));
  }
  expect(onSwitch.mock.calls).toEqual(tabs.map(([key]) => [key]));
});

test('autoexport actions require relevant goods and Steward authority', async () => {
  await render(<Connected view="advanced" />);
  expect(button('Bar Autoexport On Shortages (0)').disabled).toBe(true);
  expect(button('Allow Autoexport On All').disabled).toBe(true);
  await click(button('Bar Autoexport On Shortages (0)'));
  await click(button('Allow Autoexport On All'));
  await update({ shortage_goods_open: 2, autoexport_barred: 0 });
  expect(button('Bar Autoexport On Shortages (2)').disabled).toBe(false);
  expect(button('Allow Autoexport On All').disabled).toBe(true);
  await update({ shortage_goods_open: 0, autoexport_barred: 3 });
  expect(button('Bar Autoexport On Shortages (0)').disabled).toBe(true);
  expect(button('Allow Autoexport On All').disabled).toBe(false);
  await update({ shortage_goods_open: 2, autoexport_barred: 3, is_alderman_acting: true });
  expect(button('Bar Autoexport On Shortages (2)').disabled).toBe(true);
  expect(button('Allow Autoexport On All').disabled).toBe(true);
  await click(button('Bar Autoexport On Shortages (2)'));
  await click(button('Allow Autoexport On All'));
  expect(sendMessage).not.toHaveBeenCalled();
  await update({ is_alderman_acting: false });
  await click(button('Bar Autoexport On Shortages (2)'));
  await click(button('Allow Autoexport On All'));
  expect(sendMessage.mock.calls).toEqual([
    ['act/bar_autoexport_shortages', {}], ['act/allow_autoexport_all', {}],
  ]);
});

describe('Stewardship alerts', () => {
  test('inactive alerts disappear', async () => {
    const state = deskData().sequestration;
    await render(<>
      <SequestrationBanner sequestration={state} /><ArrearsBanner sequestration={state} />
      <BanditryBanner projection={{ total: 0, debt: 0, lines: [] }} />
      <BlockadeBanner regions={[]} /><EventsBanner events={[]} goodCatalog={{}} />
    </>);
    expect(container.textContent).toBe('');
  });

  test('collapsed notices retain current debt, payroll consequences, blockade names and loss totals', async () => {
    const view = (debt: number) => <>
      <SequestrationBanner sequestration={{ active: true, in_arrears: false, debt, state_label: 'Sequestered' }} />
      <ArrearsBanner sequestration={{ active: false, in_arrears: true, debt: debt + 5, state_label: 'Arrears' }} />
      <BanditryBanner projection={{ debt: 30, total: 17, lines: ['Northern road losses: 17m.'] }} />
      <BlockadeBanner regions={['Northern March', 'Southern Coast']} />
    </>;
    await render(view(200));
    await render(view(250));
    const summaries = Array.from(container.querySelectorAll('summary')).map((summary) => summary.textContent);
    expect(summaries).toEqual([
      'Sequestration declared: 250m debt. Trade controls and stockpile pricing locked.',
      'Arrears with the Burghers: 255m. Another missed payroll brings sequestration.',
      'Banditry: 30m debt skimming all inflow; projected losses −17m next dawn',
    ]);
    expect(container.textContent).toContain('Blockaded Regions: Northern March, Southern Coast');
    expect(container.textContent).toContain('Northern road losses: 17m.');
    expect(container.textContent).toContain('Petitions, taxation, and the lash of fines remain.');
    for (const details of container.querySelectorAll('details')) expect(details.open).toBe(false);
  });

  test('event details preserve relief progress, accepted goods, remaining days and the oversupply explanation', async () => {
    await render(<EventsBanner events={[
      { name: 'Failed harvest', description: 'Hungry villages require grain.', event_type: 'shortage',
        days_left: 3, saturation_target: 100, saturation_progress: 125, affected_goods: ['wheat', 'unknown_grain'] },
      { name: 'Abundant iron', description: 'New ore burdens the market.', event_type: 'oversupply',
        days_left: 2, saturation_target: 100, saturation_progress: 50, affected_goods: ['iron'] },
    ]} goodCatalog={{ wheat: { name: 'Golden wheat', category: 'grain', importable: true } }} />);
    const details = container.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent).toBe('Active Economic Events (2): 1 shortage, 1 glut');
    await click(details.querySelector('summary')!);
    expect(details.open).toBe(true);
    expect(details.textContent).toContain('Failed harvest (3d left)');
    expect(details.textContent).toContain('Relief: 125 / 100 units delivered (100%). Accepts: Golden wheat, unknown_grain');
    expect(details.textContent).toContain('Abundant iron (2d left)');
    expect(details.textContent).toContain('New ore burdens the market.');
    expect(details.querySelectorAll('dd p').length).toBe(1);
  });
});
