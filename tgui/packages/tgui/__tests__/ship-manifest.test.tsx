import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type {
  DemandLine,
  Manifest,
  ShipManifestData,
} from '../interfaces/ShipFulfillment/ShipManifest';

const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
Reflect.set(globalThis, 'Byond', { windowId: 'ship-manifest' });
const backend = await import('../backend');
const { ShipManifest } = await import(
  '../interfaces/ShipFulfillment/ShipManifest'
);
if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
else Reflect.deleteProperty(globalThis, 'Byond');

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

const longName = 'Ceremonial silks woven for the northern royal household';
const realmName = 'The Northern Coastal Commonwealth and its Outer Islands';
const line = (overrides: Partial<DemandLine> = {}): DemandLine => ({
  good: 'silks',
  good_name: longName,
  qty_target: 12,
  qty_fulfilled: 3,
  offered_price: 17,
  kin_offered_price: 21,
  producer_payout: 13,
  ...overrides,
});
const vessel = (overrides: Partial<Manifest> = {}): Manifest => ({
  ship_id: 'northbound',
  ship_name: 'The Wandering Star of the Northern Seas',
  realm_id: 'north',
  realm_name: realmName,
  is_kin: 1,
  typical_provisions: 'Dried fish, fresh bread and warming spirits.',
  lines: [line()],
  ...overrides,
});
const initialData = (): ShipManifestData => ({
  manifests: [vessel()],
  middleman_cut_percent: 20,
  can_manage: 0,
  duty_suspended: 0,
  duty_rate_pct: 10,
  duty_collected_here: 37,
  duty_evaded_here: 19,
});

beforeEach(() => {
  previousActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  sendMessage = mock();
  Reflect.set(globalThis, 'Byond', { windowId: 'ship-manifest', sendMessage });
  previousStore = backend.globalStore;
  store = createStore<{ backend: BackendState }>((state, action) => ({
    backend: backend.backendReducer(state?.backend, action) as BackendState,
  }));
  backend.setGlobalStore(store);
  store.dispatch(backend.backendUpdate({ data: initialData() }));
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
  return <ShipManifest />;
};
const render = async () => {
  await act(async () => root.render(<Connected />));
};
const update = async (data: Partial<ShipManifestData>) => {
  await act(async () => store.dispatch(backend.backendUpdate({ data })));
};
const button = (label: string) => {
  const element = Array.from(container.querySelectorAll('button')).find(
    (entry) => entry.textContent === label,
  );
  if (!element) throw new Error(`Missing button: ${label}`);
  return element;
};
const row = (name: string) => {
  const element = Array.from(container.querySelectorAll('tbody tr')).find(
    (entry) => entry.querySelector('th[scope="row"]')?.textContent === name,
  );
  if (!element) throw new Error(`Missing goods: ${name}`);
  return element;
};
const cells = (name: string) =>
  Array.from(row(name).querySelectorAll('td')).map((cell) => cell.textContent);

test('shows full names, provisions, semantic headings, remaining quantities and server estimates', async () => {
  await render();
  expect(container.querySelector('h1')?.textContent).toBe(
    'Manifest of Bulk Demands',
  );
  expect(container.querySelector('summary')?.textContent).toContain(
    vessel().ship_name,
  );
  expect(container.querySelector('summary')?.textContent).toContain(realmName);
  expect(container.textContent).toContain(vessel().typical_provisions!);
  expect(container.textContent).toContain(
    'The Merchant takes 20% as middleman.',
  );
  expect(container.textContent).toContain('Posted Crown duty: 10%.');
  expect(
    Array.from(container.querySelectorAll('thead th')).map(
      (cell) => cell.textContent,
    ),
  ).toEqual(['Goods', 'Delivered', 'Offer / unit', 'Est. net']);
  expect(row(longName).querySelector('th')?.getAttribute('scope')).toBe('row');
  expect(cells(longName)).toEqual([
    '3 / 129 remaining',
    '21mBase 17m · Kin +4m',
    '13m',
  ]);
  expect(container.textContent).toContain(
    'Net estimates use posted duty and one standard-quality unit.',
  );
  expect(container.textContent).toContain(
    'Quality, bundled sales, rounding, and collected duty can change payment.',
  );
  expect(container.textContent).toContain(
    'The first matching ship receives your deposit.',
  );
  expect(sendMessage).not.toHaveBeenCalled();
});

test('groups every demand including unknown tags in stable known-first order', async () => {
  await update({
    manifests: [
      vessel({
        lines: [
          line({
            good: 'odd',
            good_name: 'Unusual wares',
            tag: 'special_cargo',
          }),
          line({
            good: 'ale',
            good_name: 'Voyage ale',
            tag: 'victualling_drinks',
          }),
          line({
            good: 'bread',
            good_name: 'Fresh bread',
            tag: 'victualling_fresh',
          }),
          line({
            good: 'fish',
            good_name: 'Salted fish',
            tag: 'victualling_preserved',
          }),
          line(),
          line({
            good: 'odd2',
            good_name: 'Other unusual wares',
            tag: 'special_cargo',
          }),
          line({
            good: 'proto',
            good_name: 'Unrecognized tagged cargo',
            tag: '__proto__',
          }),
        ],
      }),
    ],
  });
  await render();
  expect(
    Array.from(container.querySelectorAll('th[scope="rowgroup"] strong')).map(
      (entry) => entry.textContent,
    ),
  ).toEqual([
    'Bulk trade',
    'Fresh provisions',
    'Preserved provisions',
    'Drinks',
    'special_cargo',
    '__proto__',
  ]);
  expect(container.querySelectorAll('table').length).toBe(1);
  expect(container.querySelectorAll('thead').length).toBe(1);
  expect(container.querySelectorAll('tbody').length).toBe(6);
  expect(container.querySelectorAll('th[scope="row"]').length).toBe(7);
  expect(row('Unusual wares').closest('tbody')).toBe(
    row('Other unusual wares').closest('tbody'),
  );
  expect(row('Unrecognized tagged cargo')).toBeTruthy();
});

test('distinguishes bottle and keg orders and keeps kin offers for provisions', async () => {
  await update({
    manifests: [
      vessel({
        lines: [
          line({
            good: 'ale',
            good_name: 'Voyage ale',
            tag: 'victualling_drinks',
            by_bottle: 0,
          }),
          line({
            good: 'spirit',
            good_name: 'Warming spirits',
            tag: 'victualling_drinks',
            by_bottle: 1,
          }),
          line({
            good: 'bread',
            good_name: 'Fresh bread',
            tag: 'victualling_fresh',
          }),
        ],
      }),
    ],
  });
  await render();
  expect(cells('Voyage ale')[1]).toBe('21mper kegBase 17m · Kin +4m');
  expect(cells('Warming spirits')[1]).toBe('21mper bottleBase 17m · Kin +4m');
  expect(cells('Fresh bread')[1]).toContain('Kin +4m');
  expect(container.textContent).toContain('Spirits are sold by the bottle.');
  expect(container.textContent).toContain(
    'finished, untapped fermentation keg',
  );
  expect(container.textContent).toContain(
    'loose bottles cannot fill keg orders',
  );
  expect(
    container
      .querySelector('summary .ShipManifest__kin')
      ?.getAttribute('title'),
  ).toBe('Kin ship — demand payouts get the Kinship bonus');
});

test('applies live fulfillment and price updates without recomputing the server payout', async () => {
  await render();
  await update({
    middleman_cut_percent: 75,
    manifests: [
      vessel({
        lines: [
          line({
            qty_fulfilled: 12,
            kin_offered_price: 30,
            producer_payout: 7,
          }),
        ],
      }),
    ],
  });
  expect(cells(longName)).toEqual([
    '12 / 12Fulfilled',
    '30mBase 17m · Kin +13m',
    '7m',
  ]);
  expect(row(longName).classList.contains('ShipManifest__fulfilled')).toBe(
    true,
  );
  await update({
    manifests: [
      vessel({
        lines: [
          line({
            qty_fulfilled: 14,
            kin_offered_price: 17,
            producer_payout: 0,
          }),
        ],
      }),
    ],
  });
  expect(cells(longName)).toEqual(['14 / 12Fulfilled', '17m', '0m']);
  expect(container.textContent).not.toContain('-2 remaining');
  expect(sendMessage).not.toHaveBeenCalled();
});

test('hides all private duty controls and tallies until authority arrives and removes them on revocation', async () => {
  await render();
  expect(container.querySelector('.ShipManifest__underledger')).toBeNull();
  expect(container.textContent).not.toContain('37m');
  expect(container.textContent).not.toContain('19m');
  await update({ can_manage: 1 });
  expect(button('Crown Duty: PAYING').getAttribute('aria-pressed')).toBe(
    'false',
  );
  expect(container.textContent).toContain('Paid here: 37m. Dodged here: 19m.');
  await act(async () => button('Crown Duty: PAYING').click());
  expect(sendMessage.mock.calls).toEqual([['act/toggle_duty', {}]]);
  expect(button('Crown Duty: PAYING')).toBeTruthy();
  await update({ duty_suspended: 1, duty_evaded_here: 24 });
  expect(button('Crown Duty: DODGING').getAttribute('aria-pressed')).toBe(
    'true',
  );
  expect(container.textContent).toContain('Dodged here: 24m.');
  await update({ can_manage: 0 });
  expect(container.querySelector('.ShipManifest__underledger')).toBeNull();
  expect(container.textContent).not.toContain('24m');
  expect(container.querySelectorAll('button').length).toBe(1);
});

test('guidebook stays available to producers and managers with its exact payload', async () => {
  await render();
  await act(async () => button('Guidebook').click());
  await update({ can_manage: 1 });
  await act(async () => button('Guidebook').click());
  expect(sendMessage.mock.calls).toEqual([
    ['act/help', {}],
    ['act/help', {}],
  ]);
});

test('supports no ships, empty manifests and arrival/departure updates with realm-id fallback', async () => {
  await update({ manifests: [] });
  await render();
  expect(container.textContent).toContain(
    'No vessels at the pier are buying. Hail one to open a market.',
  );
  expect(container.querySelector('table')).toBeNull();
  await update({ manifests: [vessel({ realm_name: '', lines: [] })] });
  expect(
    container.querySelector('summary .ShipManifest__realm')?.textContent,
  ).toBe('north');
  expect(container.textContent).toContain('This vessel has no listed demands.');
  await update({
    manifests: [
      vessel({
        is_kin: 0,
        typical_provisions: '',
        lines: [line({ kin_offered_price: undefined })],
      }),
    ],
  });
  expect(container.querySelector('summary .ShipManifest__kin')).toBeNull();
  expect(container.textContent).not.toContain('Typical provisions:');
  expect(cells(longName)[1]).toBe('17m');
  await update({ manifests: [] });
  expect(container.querySelector('.ShipManifest__vessel')).toBeNull();
  expect(sendMessage).not.toHaveBeenCalled();
});

test('native ship disclosures retain their state during backend updates without sending actions', async () => {
  await render();
  const details = container.querySelector<HTMLDetailsElement>(
    '.ShipManifest__vessel',
  )!;
  expect(details.open).toBe(true);
  await act(async () => details.querySelector('summary')!.click());
  expect(details.open).toBe(false);
  await update({
    manifests: [vessel({ lines: [line({ qty_fulfilled: 5 })] })],
  });
  expect(details.open).toBe(false);
  await act(async () => details.querySelector('summary')!.click());
  expect(details.open).toBe(true);
  expect(cells(longName)[0]).toBe('5 / 127 remaining');
  expect(sendMessage).not.toHaveBeenCalled();
});
