import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { NavigatorData } from '../interfaces/Navigator/NavigatorContent';

const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
Reflect.set(globalThis, 'Byond', { windowId: 'navigator-desk' });
const backend = await import('../backend');
const { NavigatorContent } = await import(
  '../interfaces/Navigator/NavigatorContent'
);
if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
else Reflect.deleteProperty(globalThis, 'Byond');

const deskData = (): NavigatorData => ({
  motto: "NAVIGATOR - Proprietor's berth.",
  next_airlift_seconds: 61,
  handler_fee_percent: 0,
  duty_rate: 0.15,
  pay_taxes: true,
  levy_rate: 5,
  pay_merchant_share: true,
  duty_collected_here: 27,
  duty_evaded_here: 9,
  levy_collected_here: 12,
  is_proprietor: false,
  is_smuggler: false,
  is_readable: true,
  facilitator_present: false,
  market_data: {
    categories: [
      {
        category: 'Valuables',
        capacity: 100,
        consumed: 85,
        fill_ratio: 0.85,
        refused: false,
        demand_mult: 1.25,
        pending_ship_demand: 20,
      },
    ],
    category_count: 1,
    pop_snapshot: 8,
    theme_dispatch: 'Demand rises in the north.',
    all_buckets: ['Valuables'],
    realm_demand_matrix: [
      { realm_id: 'north', name: 'Northern March', demanded: ['Valuables'] },
    ],
  },
});

type BackendState = NonNullable<Parameters<typeof backend.backendReducer>[0]>;
let store: Store;
let previousStore: Store;
let previousByond: PropertyDescriptor | undefined;
let container: HTMLDivElement;
let root: Root;
let sendMessage: ReturnType<typeof mock>;
const env = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousActEnvironment: boolean | undefined;

beforeEach(() => {
  previousActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  sendMessage = mock();
  Reflect.set(globalThis, 'Byond', { windowId: 'navigator-desk', sendMessage });
  previousStore = backend.globalStore;
  store = createStore<{ backend: BackendState }>((state, action) => ({
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

const Connected = () => {
  useSyncExternalStore(store.subscribe, store.getState);
  return <NavigatorContent />;
};
const render = async () => {
  await act(async () => root.render(<Connected />));
};
const update = async (data: Partial<NavigatorData>) => {
  await act(async () => store.dispatch(backend.backendUpdate({ data })));
};
const button = (label: string) => {
  const found = Array.from(container.querySelectorAll('button')).find(
    (element) => element.textContent?.trim() === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
};
const click = async (element: HTMLElement) => {
  await act(async () => element.click());
};

test('public rates and zero handler fee remain visible; private controls and tallies stay hidden', async () => {
  await render();
  expect(container.textContent).toContain("Handler's fee 0%");
  expect(container.textContent).toContain('Crown export duty15%');
  expect(container.textContent).toContain("Merchant's levy5%");
  expect(container.textContent).not.toContain('Private tally');
  expect(container.textContent).not.toContain('Crown paid');
  expect(container.textContent).not.toContain('PAYING');
  expect(container.textContent).not.toContain('Stop paying');
  expect(container.textContent).not.toContain('Waive levy');
  await click(button('Refresh market'));
  await click(button('Guidebook'));
  expect(sendMessage.mock.calls).toEqual([
    ['act/refresh_market', {}],
    ['act/help', {}],
  ]);
});

test('proprietor actions use exact backend messages and wait for authoritative state', async () => {
  await update({ is_proprietor: true });
  await render();
  expect(container.textContent).toContain('Crown paid: 27m');
  expect(container.textContent).toContain('Crown evaded: 9m');
  expect(container.textContent).toContain('Levy paid: 12m');
  await click(button('Stop paying'));
  await click(button('Waive levy'));
  expect(button('Stop paying')).toBeDefined();
  expect(button('Waive levy')).toBeDefined();
  await update({
    pay_taxes: false,
    pay_merchant_share: false,
    duty_rate: 0.23,
    levy_rate: 7,
    duty_collected_here: 33,
    duty_evaded_here: 14,
    levy_collected_here: 19,
  });
  expect(container.textContent).toContain('Crown export duty23%DODGING');
  expect(container.textContent).toContain("Merchant's levy7%WAIVED");
  expect(container.textContent).toContain('Crown paid: 33m');
  expect(container.textContent).toContain('Crown evaded: 14m');
  expect(container.textContent).toContain('Levy paid: 19m');
  await click(button('Resume paying'));
  await click(button('Resume levy'));
  expect(sendMessage.mock.calls).toEqual([
    ['act/toggle_duty', {}],
    ['act/toggle_levy', {}],
    ['act/toggle_duty', {}],
    ['act/toggle_levy', {}],
  ]);
  await update({ is_proprietor: false });
  expect(container.textContent).not.toContain('Private tally');
  expect(container.textContent).not.toContain('Resume paying');
  expect(container.textContent).not.toContain('Resume levy');
  await update({ is_proprietor: true });
  expect(button('Resume paying')).toBeDefined();
  expect(sendMessage).toHaveBeenCalledTimes(4);
});

test('smuggler hides legitimate controls even for proprietors and follows facilitator updates', async () => {
  await update({
    is_smuggler: true,
    is_proprietor: true,
    handler_fee_percent: 50,
  });
  await render();
  expect(container.textContent).toContain("Handler's fee 50%");
  expect(container.textContent).toContain('Absent - handler skimming 50%');
  expect(container.textContent).toContain('None - the balloon flies dark.');
  expect(container.textContent).toContain('State of the Shadow Market');
  expect(container.textContent).toContain('Shadow pool - off the books');
  expect(container.textContent).not.toContain('Private tally');
  expect(container.textContent).not.toContain("Merchant's levy");
  expect(container.textContent).not.toContain('Stop paying');
  expect(container.querySelector('.NavigatorDesk__guidance')).toBeNull();
  await update({ facilitator_present: true, handler_fee_percent: 0 });
  expect(container.textContent).toContain('Present - handler waiving fee');
  expect(container.textContent).toContain("Handler's fee 0%");
  expect(container.textContent).not.toContain('Absent - handler skimming 50%');
  expect(sendMessage).not.toHaveBeenCalled();
});

test.each([0, -1, 9, 60, 61, 3599])(
  'countdown displays current server seconds %i',
  async (seconds) => {
    await render();
    await update({ next_airlift_seconds: seconds });
    const expected = new Map([
      [0, '00:00'],
      [-1, '00:00'],
      [9, '00:09'],
      [60, '01:00'],
      [61, '01:01'],
      [3599, '59:59'],
    ]);
    expect(container.textContent).toContain(
      `Next balloon in ${expected.get(seconds)}`,
    );
    expect(sendMessage).not.toHaveBeenCalled();
  },
);

test('authored motto is exact and obscured without altering whitespace when unreadable', async () => {
  const motto = 'NA?!G@#OR - ████  ██████\nFREEDOM OF TRANSACTION.';
  await update({ motto });
  await render();
  expect(container.querySelector('h1')?.textContent).toBe(motto);
  await update({ is_readable: false });
  expect(container.querySelector('h1')?.textContent).toBe(
    motto.replace(/[^\s]/g, '?'),
  );
  expect(container.textContent).not.toContain('FREEDOM OF TRANSACTION');
  await update({ is_readable: true });
  expect(container.querySelector('h1')?.textContent).toBe(motto);
});

test('saturated guidance opens natively and market receives fresh complete payloads', async () => {
  await render();
  const guidance = container.querySelector<HTMLDetailsElement>(
    '.NavigatorDesk__guidance',
  )!;
  expect(guidance.open).toBe(false);
  await click(guidance.querySelector('summary')!);
  expect(guidance.open).toBe(true);
  expect(guidance.textContent).toContain(
    "consider the Stewardry's stockpile for minting, the bathhouse, or a shadier facilitator willing to take such things off your hands.",
  );
  expect(container.textContent).toContain('Demand rises in the north.');
  await click(button('Show realms demand matrix'));
  expect(
    container.querySelector('table[aria-label="Realm demand"]')?.textContent,
  ).toContain('Northern MarchValuablesDemanded');
  const freshMarket = deskData().market_data;
  freshMarket.categories[0] = {
    ...freshMarket.categories[0],
    consumed: 100,
    fill_ratio: 1,
    refused: true,
    demand_mult: 1,
  };
  freshMarket.theme_dispatch = 'The north is supplied.';
  freshMarket.realm_demand_matrix![0].demanded = [];
  await update({ market_data: freshMarket });
  expect(container.textContent).toContain('The north is supplied.');
  expect(container.textContent).toContain('Refusing (full)');
  expect(
    container.querySelector('table[aria-label="Realm demand"]')?.textContent,
  ).toContain('No demand');
  expect(container.textContent).not.toContain('Demand rises in the north.');
  expect(guidance.open).toBe(true);
  await act(async () => root.render(null));
  await render();
  expect(
    container.querySelector<HTMLDetailsElement>('.NavigatorDesk__guidance')
      ?.open,
  ).toBe(false);
  expect(button('Show realms demand matrix')).toBeDefined();
  expect(container.textContent).toContain('The north is supplied.');
  expect(sendMessage).not.toHaveBeenCalled();
});
