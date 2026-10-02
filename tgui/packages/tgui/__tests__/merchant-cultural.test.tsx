import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { CulturalStockTab } from '../interfaces/Goldface/CulturalStock/CulturalStockTab';
import type {
  CatalogData,
  CatalogEntry,
  CulturalStockEntry,
} from '../interfaces/Goldface/types';

let container: HTMLDivElement;
let root: Root;
const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousActEnvironment: boolean | undefined;
beforeEach(() => {
  previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});
const render = async (node: ReactNode) => {
  await act(async () => root.render(node));
};
const click = async (element: HTMLElement) => {
  await act(async () => element.click());
};
const buy = (label: string) => {
  const found = Array.from(container.querySelectorAll('button')).find(
    (element) => element.getAttribute('aria-label') === label,
  );
  if (!found) throw new Error(`Missing buy button: ${label}`);
  return found;
};
const disclosure = (name: string) => {
  const found = Array.from(
    container.querySelectorAll<HTMLButtonElement>('button[aria-expanded]'),
  ).find((element) => element.textContent?.includes(name));
  if (!found) throw new Error(`Missing disclosure: ${name}`);
  return found;
};
const cargo: CulturalStockEntry = {
  pack: '/datum/supply_pack/foreign_silks',
  name: 'Embroidered silk robes from the far coast',
  qty: 3,
  pack_qty: 2,
  base_cost: 50,
  price_base: 20,
  price_base_pre_kin: 25,
  price_tariff: 3,
  price: 23,
  is_kin: true,
  ship_id: 'ship-17',
  ship_name: 'The Peregrine',
};
const wares: CatalogEntry = {
  pack: '/datum/supply_pack/amber',
  name: 'Amber beads',
  pack_qty: 4,
  price_base: 18,
  price_base_pre_kin: 20,
  price_tariff: 2,
  price: 20,
  qty: 5,
  stock_max: 5,
};
const charter = (overrides: Partial<CatalogData> = {}): CatalogData => ({
  id: 'amber-charter',
  name: 'Amber Coast Charter',
  desc: 'A compact sealed with the amber merchants.',
  favor_cost: 35,
  home_label: 'Amber Coast',
  unlocked: false,
  origin_access: false,
  accessible: false,
  discount_pct: 10,
  entries: [wares],
  ...overrides,
});

describe('cultural cargo manifests', () => {
  test('requires the authoritative total and sends exact ship and pack identifiers', async () => {
    const dispatch = mock();
    const view = (budget: number) => (
      <CulturalStockTab stock={[cargo]} budget={budget} act={dispatch} />
    );
    await render(view(22));
    for (const text of [
      cargo.name,
      '×2',
      '20m + 3m duty',
      'Kinship −5m off base',
    ])
      expect(container.textContent).toContain(text);
    expect(container.querySelector('[title="Regular base 50m"]')).not.toBeNull();
    expect(buy(`Buy ${cargo.name} for 23m`).disabled).toBe(true);
    await click(buy(`Buy ${cargo.name} for 23m`));
    expect(dispatch).not.toHaveBeenCalled();
    await render(view(23));
    await click(buy(`Buy ${cargo.name} for 23m`));
    expect(dispatch.mock.calls).toEqual([
      ['cultural_buy', { pack: cargo.pack, ship_id: 'ship-17' }],
    ]);
  });
  test('groups ships independently and preserves native disclosure state after live updates and reordering', async () => {
    const dispatch = mock();
    const second = { ...cargo, ship_id: 'ship-24', ship_name: 'The Kestrel' };
    await render(
      <CulturalStockTab stock={[cargo, second]} budget={23} act={dispatch} />,
    );
    const toggle = disclosure('The Peregrine');
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelectorAll('table')).toHaveLength(0);
    const region = document.getElementById(
      toggle.getAttribute('aria-controls')!,
    ) as HTMLDivElement;
    expect(region.hidden).toBe(true);
    await click(toggle);
    expect(region.hidden).toBe(false);
    expect(container.querySelectorAll('table')).toHaveLength(1);
    await render(
      <CulturalStockTab
        stock={[second, { ...cargo, qty: 1, price: 26 }]}
        budget={25}
        act={dispatch}
      />,
    );
    expect(disclosure('The Peregrine').getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(disclosure('The Kestrel').getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(buy(`Buy ${cargo.name} for 26m`).disabled).toBe(true);
    expect(container.querySelector('[title="1 in stock"]')).not.toBeNull();
    await click(disclosure('The Peregrine'));
    expect(container.querySelectorAll('table')).toHaveLength(0);
    expect(dispatch).not.toHaveBeenCalled();
  });
  test('removes departed cargo while leaving charter purchases available', async () => {
    const dispatch = mock();
    const catalogs = [charter({ accessible: true, unlocked: true })];
    await render(
      <CulturalStockTab
        stock={[cargo]}
        catalogs={catalogs}
        budget={100}
        act={dispatch}
      />,
    );
    await render(
      <CulturalStockTab
        stock={[]}
        catalogs={catalogs}
        budget={100}
        act={dispatch}
      />,
    );
    expect(container.textContent).toContain(
      'No cultural stock is available at the pier.',
    );
    expect(container.textContent).not.toContain(cargo.name);
    await click(buy('Buy Amber beads for 20m'));
    expect(dispatch.mock.calls).toEqual([
      ['catalog_buy', { catalog: 'amber-charter', pack: wares.pack }],
    ]);
  });
  test('retains agent permissions and both kinship explanations in a native disclosure', async () => {
    await render(
      <CulturalStockTab
        stock={[]}
        budget={0}
        act={mock()}
        isAgent
        kinship={{
          realm_id: 'coast',
          realm_name: 'Amber Coast',
          origin_name: 'Coast',
          buy_pct: 20,
          sell_pct: 10,
          agent_realm_id: 'isles',
          agent_realm_name: 'The Isles',
        }}
      />,
    );
    const details = container.querySelector('details');
    expect(details?.querySelector('summary')?.textContent).toContain(
      'Chartered Agent',
    );
    expect(details?.textContent).toContain(
      'view and hail ships on behalf of the Factor',
    );
    expect(details?.textContent).toContain(
      'Cultural stock from Amber Coast ships costs 20% less.',
    );
    expect(details?.textContent).toContain(
      'your buys from The Isles ships cost 20% less.',
    );
  });
});

describe('cultural trade agreements', () => {
  test.each([
    [true, true, false, 'Agreement signed'],
    [true, false, true, 'Open to you, 10% off'],
    [false, false, false, 'Sealed, 35 favor to sign'],
    [false, true, true, 'Open to you, 10% off'],
  ] as const)(
    'honors authoritative access %s with unlocked %s and origin access %s',
    async (accessible, unlocked, origin_access, status) => {
      const dispatch = mock();
      await render(
        <CulturalStockTab
          stock={[]}
          catalogs={[charter({ accessible, unlocked, origin_access })]}
          budget={100}
          act={dispatch}
        />,
      );
      expect(disclosure('Amber Coast Charter').textContent).toContain(status);
      if (!accessible) await click(disclosure('Amber Coast Charter'));
      expect(container.textContent).toContain(
        'A compact sealed with the amber merchants.',
      );
      if (accessible) {
        expect(container.textContent).toContain('5 / 5');
        await click(buy('Buy Amber beads for 20m'));
        expect(dispatch.mock.calls).toEqual([
          ['catalog_buy', { catalog: 'amber-charter', pack: wares.pack }],
        ]);
      } else {
        expect(container.querySelector('table')).toBeNull();
        expect(container.textContent).toContain(
          'Open it in Management for 35 favor.',
        );
        expect(container.textContent).not.toContain('Amber beads');
        expect(dispatch).not.toHaveBeenCalled();
      }
    },
  );
  test('updates charter access in place without resetting an opened disclosure', async () => {
    const dispatch = mock();
    const view = (accessible: boolean) => (
      <CulturalStockTab
        stock={[]}
        catalogs={[charter({ accessible, unlocked: accessible })]}
        budget={100}
        act={dispatch}
      />
    );
    await render(view(false));
    await click(disclosure('Amber Coast Charter'));
    await render(view(true));
    expect(
      disclosure('Amber Coast Charter').getAttribute('aria-expanded'),
    ).toBe('true');
    expect(buy('Buy Amber beads for 20m').disabled).toBe(false);
    await render(view(false));
    expect(
      disclosure('Amber Coast Charter').getAttribute('aria-expanded'),
    ).toBe('true');
    expect(container.querySelector('table')).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });
  test('handles empty, sold-out, restocked and unaffordable catalogs without recalculating totals', async () => {
    const dispatch = mock();
    const view = (entries: CatalogEntry[], budget: number) => (
      <CulturalStockTab
        stock={[]}
        catalogs={[charter({ accessible: true, unlocked: true, entries })]}
        budget={budget}
        act={dispatch}
      />
    );
    await render(view([], 100));
    expect(container.textContent).toContain(
      'No goods are listed for this charter.',
    );
    await render(view([{ ...wares, qty: 0 }], 100));
    expect(container.textContent).toContain('0 / 5');
    await click(buy('Amber beads is out of stock'));
    expect(dispatch).not.toHaveBeenCalled();
    // A changed server total wins even before base/tariff data changes.
    await render(view([{ ...wares, qty: 1, price: 25 }], 24));
    expect(buy('Buy Amber beads for 25m').disabled).toBe(true);
    await click(buy('Buy Amber beads for 25m'));
    expect(dispatch).not.toHaveBeenCalled();
    await render(view([{ ...wares, qty: 5, price: 25 }], 25));
    expect(container.textContent).toContain('5 / 5');
    await click(buy('Buy Amber beads for 25m'));
    expect(dispatch.mock.calls).toEqual([
      ['catalog_buy', { catalog: 'amber-charter', pack: wares.pack }],
    ]);
  });
});
