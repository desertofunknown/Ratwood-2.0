import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { MarketTab } from '../interfaces/Goldface/Market/MarketTab';
import type { HarborData } from '../interfaces/Goldface/types';
import { MarketView } from '../interfaces/Noticeboard/AvisaSections/MarketSection';
import type { MarketCategory, MarketData } from '../interfaces/Noticeboard/types';

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
  const element = Array.from(container.querySelectorAll('button')).find(
    (entry) => entry.textContent === label,
  );
  if (!element) throw new Error(`Missing button: ${label}`);
  return element;
};
const category = (
  name: string,
  overrides: Partial<MarketCategory> = {},
): MarketCategory => ({
  category: name,
  capacity: 1000,
  consumed: 100,
  fill_ratio: 0.1,
  refused: false,
  demand_mult: 1,
  pending_ship_demand: 0,
  ...overrides,
});
const realmName = 'The Northern Coastal Commonwealth and its Outer Islands';
const longName = 'Rare ceremonial garments and imported textiles';
const market: MarketData = {
  categories: [
    category('Valuables', { demand_mult: 1.25 }),
    category(longName),
    category('Metals', { consumed: 900, fill_ratio: 0.9 }),
    category('Food', { consumed: 1000, fill_ratio: 1, refused: true }),
  ],
  pop_snapshot: 20,
  category_count: 4,
  theme_dispatch: 'Foreign vessels bring demand for valuables.',
  realm_demand_matrix: [{ realm_id: 'north', name: realmName, demanded: ['Metals'] }],
  all_buckets: ['Metals', longName],
};
const ledger = () => container.querySelector('.MarketRegister__ledger')!;
const row = (name: string) => {
  const result = Array.from(ledger().querySelectorAll('tbody tr')).find(
    (entry) => entry.querySelector('th')?.textContent === name,
  );
  if (!result) throw new Error(`Missing category: ${name}`);
  return result;
};

describe('Shared market register', () => {
  test('renders one sorted semantic ledger with full names, quantities and statuses', async () => {
    await render(<MarketView market={market} />);
    expect(container.querySelectorAll('table').length).toBe(1);
    expect(container.querySelector('h2')?.textContent).toBe('State of the Markets');
    expect(container.textContent).toContain(market.theme_dispatch!);
    expect(Array.from(ledger().querySelectorAll('thead th')).map((cell) => cell.textContent))
      .toEqual(['Category', 'Consumed', 'Capacity', 'Demand', 'Status']);
    expect(Array.from(ledger().querySelectorAll('tbody th')).map((cell) => cell.textContent))
      .toEqual(['Food', 'Metals', longName, 'Valuables']);
    expect(row(longName).querySelector('th')?.getAttribute('scope')).toBe('row');
    expect(Array.from(row('Food').querySelectorAll('td')).map((cell) => cell.textContent))
      .toEqual(['1000m', '1000m', '1.00x', 'Refusing (full)']);
    expect(row('Metals').textContent).toContain('Filling Up 90%');
    expect(row('Valuables').textContent).toContain('1.25xHot');
    expect(container.querySelector('.MarketRegisterTheme--dark')).toBeNull();
  });

  test('limits hot and filling annotations to the original top five rankings', async () => {
    const categories = Array.from({ length: 7 }, (_, index) => category(`Goods ${index}`, {
      demand_mult: 1.1 + index / 10,
      fill_ratio: 0.5 + index / 20,
    }));
    await render(<MarketView market={{ ...market, categories }} />);
    const statuses = Array.from(ledger().querySelectorAll('.MarketRegister__status span'));
    expect(statuses.filter((entry) => entry.textContent === 'Hot').length).toBe(5);
    expect(statuses.filter((entry) => entry.textContent?.startsWith('Filling Up')).length).toBe(5);
    expect(row('Goods 0').querySelector('.MarketRegister__status')?.textContent).toBe('-');
    expect(row('Goods 6').textContent).toContain('HotFilling Up 80%');
  });

  test('handles absent and empty market data and missing Goldface harbor data', async () => {
    for (const empty of [undefined, null, { ...market, categories: [] }]) {
      await render(<MarketView market={empty} />);
      expect(container.textContent).toContain('The factors have nothing to report just yet.');
      expect(container.querySelector('table')).toBeNull();
      expect(container.querySelector('button')).toBeNull();
    }
    await render(<MarketTab />);
    expect(container.textContent).toContain('The market ledgers are not yet drawn up.');
    expect(container.querySelector('.MarketRegisterTheme--dark')).not.toBeNull();
  });

  test('preserves custom black-market headings and consumes the supplied shadow pool', async () => {
    const shadow = { ...market, categories: [category('Metals', {
      consumed: 320, capacity: 500, fill_ratio: 0.64, demand_mult: 0.75,
    })] };
    await render(<MarketView market={shadow} headerLabel="State of the Black Market" headerNote="Shadow pool - off the books" />);
    expect(container.querySelector('h2')?.textContent).toBe('State of the Black Market');
    expect(container.textContent).toContain('Shadow pool - off the books');
    expect(row('Metals').textContent).toContain('320m500m0.75x');
    expect(row('Metals').textContent).not.toContain('Hot');
    await render(<MarketTab harbor={{ market_data: shadow } as HarborData} />);
    expect(container.querySelector('.MarketRegisterTheme--dark .MarketRegister')).not.toBeNull();
    expect(row('Metals').textContent).toContain('320m500m0.75x');
  });

  test('keeps two focusable native button disclosures with expanded state and controlled panels', async () => {
    await render(<MarketView market={market} />);
    const notes = button('How the markets work');
    const matrix = button('Show realms demand matrix');
    expect(container.querySelectorAll('button').length).toBe(2);
    for (const control of [notes, matrix]) {
      expect(control.type).toBe('button');
      expect(control.tabIndex).toBe(0);
      expect(control.getAttribute('aria-expanded')).toBe('false');
      expect(document.getElementById(control.getAttribute('aria-controls')!)?.hidden).toBe(true);
      control.focus();
      expect(document.activeElement).toBe(control);
    }
    // Happy DOM checks the native button click contract; Enter/Space require a browser.
    await click(notes);
    expect(notes.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(notes.getAttribute('aria-controls')!)?.hidden).toBe(false);
    expect(container.textContent).toContain('Ferentian Trading Company');
    expect(container.textContent).toContain('takes no demand boost from foreign ships');
    await click(notes);
    expect(notes.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).not.toContain('Ferentian Trading Company');
  });

  test('lazy mounts a full-name accessible realm matrix and removes it when closed', async () => {
    await render(<MarketView market={market} />);
    expect(container.querySelector('.MarketRegister__matrix')).toBeNull();
    await click(button('Show realms demand matrix'));
    const scroller = container.querySelector<HTMLElement>('[role="region"]')!;
    expect(scroller.getAttribute('aria-label')).toBe('Realm demand matrix');
    expect(scroller.tabIndex).toBe(0);
    scroller.focus();
    expect(document.activeElement).toBe(scroller);
    const matrix = container.querySelector('.MarketRegister__matrix')!;
    expect(matrix.textContent).toContain(realmName);
    expect(matrix.textContent).toContain(longName);
    expect(Array.from(matrix.querySelectorAll('tbody td')).map((cell) => cell.textContent))
      .toEqual(['Demanded', 'No demand']);
    expect(container.textContent).toContain('every other category pays only half');
    await click(button('Hide realms demand matrix'));
    expect(container.querySelector('.MarketRegister__matrix')).toBeNull();
  });

  test('shows missing realm intelligence and neutral warehouse messages', async () => {
    await render(<MarketView market={{ ...market, categories: [category('Metals')], realm_demand_matrix: [] }} />);
    expect(container.textContent).toContain('No category is in special demand right now.');
    expect(container.textContent).toContain('No warehouse near capacity. Plenty of room to sell.');
    await click(button('Show realms demand matrix'));
    expect(container.textContent).toContain('The factors have no realm intelligence to share.');
    expect(container.querySelector('.MarketRegister__matrix')).toBeNull();
  });

  test('updates quantities, demand, refusal and matrix rows without resetting disclosures', async () => {
    await render(<MarketView market={market} />);
    await click(button('Show realms demand matrix'));
    await click(button('How the markets work'));
    const updated = { ...market,
      categories: [category('Metals', { consumed: 600, capacity: 600, fill_ratio: 1, refused: true, demand_mult: 1.6 })],
      realm_demand_matrix: [{ realm_id: 'south', name: 'Southern Kingdom', demanded: [longName] }],
    };
    await render(<MarketView market={updated} />);
    expect(row('Metals').textContent).toContain('600m600m1.60xHotRefusing (full)');
    expect(ledger().querySelectorAll('tbody tr').length).toBe(1);
    expect(button('Hide market notes').getAttribute('aria-expanded')).toBe('true');
    expect(button('Hide realms demand matrix').getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.MarketRegister__matrix')?.textContent).toContain('Southern Kingdom');
    expect(container.querySelector('.MarketRegister__matrix')?.textContent).not.toContain(realmName);
  });
});
