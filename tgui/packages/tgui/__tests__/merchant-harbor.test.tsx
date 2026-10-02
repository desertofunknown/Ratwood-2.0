import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { HarborTab } from '../interfaces/Goldface/Harbor/HarborTab';
import { RealmRow } from '../interfaces/Goldface/Harbor/RealmRow';
import { ShipsView } from '../interfaces/Goldface/Harbor/ShipsView';
import type {
  BulkLine,
  HarborRealm,
  HarborShip,
} from '../interfaces/Goldface/types';

let container: HTMLDivElement;
let root: Root;
const environment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousEnvironment: boolean | undefined;
beforeEach(() => {
  previousEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  environment.IS_REACT_ACT_ENVIRONMENT = previousEnvironment;
});
const render = async (node: ReactNode) => {
  await act(async () => root.render(node));
};
const click = async (element: HTMLElement) => {
  await act(async () => element.click());
};
const button = (label: string) => {
  const result = Array.from(container.querySelectorAll('button')).find(
    (element) =>
      (element.getAttribute('aria-label') || element.textContent?.trim()) ===
      label,
  );
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
};
const quantity = () => {
  const result = container.querySelector('input');
  if (!result) throw new Error('Missing quantity input');
  return result;
};
const enter = async (value: string) => {
  await act(async () => {
    const element = quantity();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const supply: BulkLine = {
  good: 'iron_bar_ref',
  good_name: 'iron bars',
  qty_target: 10,
  qty_fulfilled: 0,
  offered_price: 25,
};
const ship: HarborShip = {
  ship_id: 'ship-17',
  ship_name: 'The Long Road Home to the Northern Shore',
  captain_name: 'Mara',
  port_of_origin: 'Northern Anchorage',
  realm_id: 'nr',
  ship_type: 'Galleon',
  tonnage: 800,
  tonnage_mult: 2,
  expected_favor: 100,
  favor_earned: 50,
  can_send_away: true,
  seconds_until_departure: 125,
};
const realm: HarborRealm = {
  id: 'nr',
  name: 'The Northern Coastal Commonwealth',
  cultural_goods: [],
  cultural_pack_names: ['Northern ceremonial robes'],
  basic_buys: [
    { name: 'Iron bars', delta: 1, removed: false, added_only: false },
  ],
  rare_buys: [],
  basic_sells: [],
  rare_sells: [],
  demanded_categories: ['Metals'],
  market_conditions: [
    {
      name: 'Famine',
      description: 'The harvest has failed and the granaries are empty.',
      tone: 'bad',
    },
  ],
};
const view = (
  dispatch: ReturnType<typeof mock>,
  overrides: Partial<Parameters<typeof ShipsView>[0]> = {},
) => (
  <ShipsView
    docked={[]}
    pool={[]}
    dockSpotsUsed={0}
    dockSpotsMax={2}
    hailsRemaining={2}
    budget={100}
    tariffRate={0}
    realms={[realm]}
    act={dispatch}
    {...overrides}
  />
);
const buy = () =>
  button('Buy Iron Bars from The Long Road Home to the Northern Shore');

describe('Harbor shipping register', () => {
  test('hails the exact vessel and responds to full pier and exhausted daily hails', async () => {
    const dispatch = mock();
    await render(view(dispatch, { pool: [ship] }));
    expect(container.textContent).toContain(ship.ship_name);
    expect(container.textContent).toContain(realm.name);
    await click(button('Hail'));
    expect(dispatch.mock.calls).toEqual([['hail', { ship_id: 'ship-17' }]]);
    dispatch.mockClear();
    await render(view(dispatch, { pool: [ship], dockSpotsUsed: 2 }));
    expect(button('Hail').disabled).toBe(true);
    expect(button('Hail').title).toBe('The pier is full.');
    await click(button('Hail'));
    await render(view(dispatch, { pool: [ship], hailsRemaining: 0 }));
    expect(button('Hail').disabled).toBe(true);
    expect(button('Hail').title).toBe('No hails left today.');
    await click(button('Hail'));
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('departure action follows server eligibility including drifted vessels', async () => {
    const dispatch = mock();
    await render(
      view(dispatch, { docked: [{ ...ship, can_send_away: false }] }),
    );
    expect(button('Send Away').disabled).toBe(true);
    expect(container.textContent).toContain('Departs in 2 minutes');
    await click(button('Send Away'));
    expect(dispatch).not.toHaveBeenCalled();
    await render(
      view(dispatch, {
        docked: [{ ...ship, auto_hailed: true, seconds_until_departure: 0 }],
      }),
    );
    expect(button('Send Away').title).toContain('no penalty');
    expect(container.textContent).toContain('Departs now');
    await click(button('Send Away'));
    expect(dispatch.mock.calls).toEqual([
      ['send_away', { ship_id: 'ship-17' }],
    ]);
  });

  test('whole quantities use exact good/ship refs and tariff-inclusive affordability', async () => {
    const dispatch = mock();
    const supplied = { ...ship, bulk_supplies: [supply] };
    await render(
      view(dispatch, { docked: [supplied], budget: 54, tariffRate: 0.1 }),
    );
    await enter('2');
    expect(buy().textContent).toBe('Buy 55m');
    expect(buy().disabled).toBe(true);
    await click(buy());
    expect(dispatch).not.toHaveBeenCalled();
    await render(
      view(dispatch, { docked: [supplied], budget: 55, tariffRate: 0.1 }),
    );
    await click(buy());
    expect(dispatch.mock.calls).toEqual([
      ['bulk_buy', { ship_id: 'ship-17', good: 'iron_bar_ref', qty: 2 }],
    ]);
  });

  test('fractions, empty, zero, and negative quantities cannot dispatch purchases', async () => {
    const dispatch = mock();
    await render(
      view(dispatch, {
        docked: [{ ...ship, bulk_supplies: [supply] }],
        budget: 1000,
      }),
    );
    for (const value of ['1.5', '', '0', '-3']) {
      await enter(value);
      expect(buy().disabled).toBe(true);
      expect(quantity().getAttribute('aria-invalid')).toBe('true');
      await click(buy());
    }
    expect(dispatch).not.toHaveBeenCalled();
    await enter('3');
    expect(buy().disabled).toBe(false);
    await click(buy());
    expect(dispatch.mock.calls[0][1].qty).toBe(3);
  });

  test('live stock, kinship price, tariff and budget changes update the retained order', async () => {
    const dispatch = mock();
    await render(
      view(dispatch, {
        docked: [{ ...ship, bulk_supplies: [supply] }],
        budget: 1000,
      }),
    );
    await enter('8');
    const discounted = {
      ...ship,
      bulk_supplies: [{ ...supply, qty_fulfilled: 7, kin_offered_price: 20 }],
    };
    await render(
      view(dispatch, { docked: [discounted], tariffRate: 0.1, budget: 65 }),
    );
    expect(quantity().value).toBe('3');
    expect(buy().textContent).toBe('Buy 66m');
    expect(buy().disabled).toBe(true);
    expect(container.querySelector('del')?.textContent).toBe('25m');
    await render(
      view(dispatch, { docked: [discounted], tariffRate: 0, budget: 60 }),
    );
    await click(buy());
    expect(dispatch.mock.calls).toEqual([
      ['bulk_buy', { ship_id: 'ship-17', good: 'iron_bar_ref', qty: 3 }],
    ]);
    await render(
      view(dispatch, {
        docked: [
          { ...ship, bulk_supplies: [{ ...supply, qty_fulfilled: 10 }] },
        ],
      }),
    );
    expect(container.querySelector('input')).toBeNull();
    expect(container.textContent).toContain('Sold out');
    expect(
      container.querySelector(
        '[aria-label="Buy Iron Bars from The Long Road Home to the Northern Shore"]',
      ),
    ).toBeNull();
  });

  test('duty matches BYOND single precision at the 29 percent boundary', async () => {
    const dispatch = mock();
    await render(
      view(dispatch, {
        docked: [
          { ...ship, bulk_supplies: [{ ...supply, offered_price: 100 }] },
        ],
        tariffRate: 0.29,
        budget: 128,
      }),
    );
    expect(buy().textContent).toBe('Buy 129m');
    expect(buy().disabled).toBe(true);
    await render(
      view(dispatch, {
        docked: [
          { ...ship, bulk_supplies: [{ ...supply, offered_price: 100 }] },
        ],
        tariffRate: 0.29,
        budget: 129,
      }),
    );
    expect(buy().disabled).toBe(false);
  });

  test('realm details use native disclosures and retain authored conditions and stock', async () => {
    await render(<RealmRow realm={realm} />);
    const details = container.querySelector('details')!;
    const summary = details.querySelector('summary')!;
    expect(details.open).toBe(false);
    await click(summary);
    expect(details.open).toBe(true);
    expect(container.textContent).toContain('Northern ceremonial robes');
    expect(container.textContent).toContain(
      'The harvest has failed and the granaries are empty.',
    );
    await click(summary);
    expect(details.open).toBe(false);
  });

  test('missing harbor data retains the agent explanation without exposing actions', async () => {
    const dispatch = mock();
    await render(<HarborTab budget={20} isAgent act={dispatch} />);
    expect(container.textContent).toContain(
      'The harbor reports are not yet drawn up.',
    );
    expect(container.textContent).toContain('Ferentian Trading Company');
    expect(container.querySelector('button')).toBeNull();
  });
});
