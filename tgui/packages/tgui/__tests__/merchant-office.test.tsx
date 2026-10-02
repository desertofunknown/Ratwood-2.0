import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { LedgerTab } from '../interfaces/Goldface/Ledger/LedgerTab';
import { ManagementTab } from '../interfaces/Goldface/Management/ManagementTab';
import type { HarborData } from '../interfaces/Goldface/types';

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

const button = (label: string) => {
  const found = Array.from(container.querySelectorAll('button')).find(
    (element) => (element.getAttribute('aria-label') || element.textContent?.trim()) === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
};

const click = async (element: HTMLElement) => {
  await act(async () => element.click());
};

const rateInput = (title: string) => {
  const found = Array.from(container.querySelectorAll('input')).find(
    (element) => element.getAttribute('aria-label') === `New ${title.toLowerCase()}`,
  );
  if (!found) throw new Error(`Missing rate: ${title}`);
  return found;
};

const rateButton = (title: string) => rateInput(title).closest('section')!.querySelector('button')!;

const enter = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const harborData = (): HarborData => ({
  bulk_tariff_rate: 5, ships_docked: [], ships_pool: [], realms: [],
  hails_remaining: 2, hails_per_day: 2, dock_spots_used: 0, dock_spots_max: 2,
  cultural_stock: [],
  catalogs: [{
    id: 'northern-charter', name: 'Northern Charter', desc: 'Goods from the northern ports.',
    favor_cost: 20, home_label: 'northern origin', unlocked: false,
    origin_access: false, accessible: false, discount_pct: 10, entries: [],
  }],
  merchant_levy_percent: 10, merchant_levy_cap: 30,
  merchant_levy_collected: 60, merchant_levy_taxed: 3,
  favor: {
    current: 20, high_water: 100, triumph_bonus: 1, triumph_cap: 5,
    bracket_floor: 100, bracket_next: 200, ledger: [], brackets: [100, 200],
    gnome_cost: 20, gnome_unlocked: false, pier_cost: 20, pier_rented: false,
    auto_hailer_cost: 20, auto_hailer_unlocked: false, auto_hailer_on: false,
    from_sendoffs: 80, from_navigator: 20, from_goldface: 10,
    from_silverface: 5, penalties: 15,
  },
  ledger: {
    merchant_fund_balance: 150, levy_collected: 60, levy_taxed: 3,
    gnome_margin_collected: 12, silverface_margin_percent: 10, fund_log: [],
  },
  market_data: { categories: [], pop_snapshot: 0, category_count: 0 },
  kinship: { realm_id: null, realm_name: null, origin_name: null, buy_pct: 0, sell_pct: 0 },
});

const purchases = [
  "Spend favor: Rent the fishermen's pier",
  'Spend favor: Call in the Company Gnomes',
  'Spend favor: Retain the Harbor Crew',
  'Spend favor: Open the Northern Charter',
];

describe('merchant favor purchases', () => {
  test('purchases require the full favor cost and dispatch exact actions at the boundary', async () => {
    const dispatch = mock();
    const harbor = harborData();
    await render(<ManagementTab harbor={{ ...harbor, favor: { ...harbor.favor, current: 19 } }} act={dispatch} />);
    for (const label of purchases) {
      expect(button(label).disabled).toBe(true);
      await click(button(label));
    }
    expect(dispatch).not.toHaveBeenCalled();
    await render(<ManagementTab harbor={harbor} act={dispatch} />);
    for (const label of purchases) {
      expect(button(label).disabled).toBe(false);
      await click(button(label));
    }
    expect(dispatch.mock.calls).toEqual([
      ['rent_pier', undefined],
      ['unlock_gnomes', undefined],
      ['unlock_auto_hailer', undefined],
      ['unlock_catalog', { catalog: 'northern-charter' }],
    ]);
  });

  test('completed purchases cannot spend favor again', async () => {
    const dispatch = mock();
    const harbor = harborData();
    harbor.favor = { ...harbor.favor, pier_rented: true, gnome_unlocked: true, auto_hailer_unlocked: true };
    harbor.catalogs[0].unlocked = true;
    await render(<ManagementTab harbor={harbor} act={dispatch} />);
    for (const label of [purchases[0], purchases[1], purchases[3]]) {
      expect(button(label).disabled).toBe(true);
      await click(button(label));
    }
    expect(container.querySelector('[aria-label="Spend favor: Retain the Harbor Crew"]')).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('origin access still permits opening a charter to the whole company', async () => {
    const dispatch = mock();
    const harbor = harborData();
    harbor.catalogs[0] = { ...harbor.catalogs[0], origin_access: true, accessible: true };
    await render(<ManagementTab harbor={harbor} act={dispatch} />);
    expect(container.textContent).toContain('pay to extend the charter to the whole company');
    expect(button(purchases[3]).disabled).toBe(false);
    await click(button(purchases[3]));
    expect(dispatch.mock.calls).toEqual([['unlock_catalog', { catalog: 'northern-charter' }]]);
  });

  test('the retained harbor crew displays server state and toggles in both directions', async () => {
    const dispatch = mock();
    const harbor = harborData();
    harbor.favor.auto_hailer_unlocked = true;
    await render(<ManagementTab harbor={harbor} act={dispatch} />);
    expect(container.textContent).toContain('Standing down');
    await click(button('Set the crew to work'));
    await render(<ManagementTab harbor={{ ...harbor, favor: { ...harbor.favor, auto_hailer_on: true } }} act={dispatch} />);
    expect(container.textContent).toContain('Working');
    await click(button('Stand down'));
    expect(dispatch.mock.calls).toEqual([['toggle_auto_hailer'], ['toggle_auto_hailer']]);
  });
});

const rates = [
  ["Merchant's levy", 'set_levy', 30],
  ['Silverface margin', 'set_gnome_margin', 100],
] as const;

describe('merchant rate controls', () => {
  test.each(rates)('%s rejects invalid and unchanged rates and accepts zero and the cap', async (title, action, cap) => {
    const dispatch = mock();
    const harbor = harborData();
    harbor.favor.gnome_unlocked = true;
    await render(<ManagementTab harbor={harbor} act={dispatch} />);
    for (const value of ['', '-1', '1.5', String(cap + 1), '10', '10.0']) {
      await enter(rateInput(title), value);
      expect(rateButton(title).disabled).toBe(true);
      await click(rateButton(title));
    }
    expect(dispatch).not.toHaveBeenCalled();
    for (const percent of [0, cap]) {
      await enter(rateInput(title), String(percent));
      expect(rateButton(title).disabled).toBe(false);
      await click(rateButton(title));
    }
    expect(dispatch.mock.calls).toEqual([
      [action, { percent: 0 }],
      [action, { percent: cap }],
    ]);
  });

  test.each(rates)('%s syncs untouched values, preserves edits, and resumes sync after acknowledgement', async (title, action, _cap) => {
    const dispatch = mock();
    const harbor = harborData();
    harbor.favor.gnome_unlocked = true;
    const view = (current: number) => <ManagementTab harbor={{
      ...harbor,
      merchant_levy_percent: current,
      ledger: { ...harbor.ledger, silverface_margin_percent: current },
    }} act={dispatch} />;
    await render(view(10));
    await render(view(15));
    expect(rateInput(title).value).toBe('15');
    expect(rateButton(title).disabled).toBe(true);
    await enter(rateInput(title), '25');
    await render(view(20));
    expect(rateInput(title).value).toBe('25');
    expect(rateButton(title).disabled).toBe(false);
    await click(rateButton(title));
    expect(dispatch.mock.calls).toEqual([[action, { percent: 25 }]]);
    await render(view(25));
    expect(rateInput(title).value).toBe('25');
    expect(rateButton(title).disabled).toBe(true);
    await render(view(30));
    expect(rateInput(title).value).toBe('30');
    expect(rateButton(title).disabled).toBe(true);
  });

  test.each(rates)('%s resumes backend synchronization after a numeric alias is acknowledged', async (title, action, _cap) => {
    const dispatch = mock();
    const harbor = harborData();
    harbor.favor.gnome_unlocked = true;
    const view = (current: number) => <ManagementTab harbor={{
      ...harbor,
      merchant_levy_percent: current,
      ledger: { ...harbor.ledger, silverface_margin_percent: current },
    }} act={dispatch} />;
    await render(view(10));
    await enter(rateInput(title), '25.0');
    await render(view(20));
    expect(rateInput(title).value).toBe('25.0');
    expect(rateButton(title).disabled).toBe(false);
    await click(rateButton(title));
    expect(dispatch.mock.calls).toEqual([[action, { percent: 25 }]]);
    await render(view(25));
    expect(Number(rateInput(title).value)).toBe(25);
    expect(rateButton(title).disabled).toBe(true);
    await render(view(30));
    expect(rateInput(title).value).toBe('30');
    expect(rateButton(title).disabled).toBe(true);
  });

  test.each(rates)('%s keeps a cleared draft blank and invalid across a zero backend value', async (title, _action, _cap) => {
    const dispatch = mock();
    const harbor = harborData();
    harbor.favor.gnome_unlocked = true;
    const view = (current: number) => <ManagementTab harbor={{
      ...harbor,
      merchant_levy_percent: current,
      ledger: { ...harbor.ledger, silverface_margin_percent: current },
    }} act={dispatch} />;
    await render(view(10));
    await enter(rateInput(title), '');
    for (const value of [0, 20]) {
      await render(view(value));
      expect(rateInput(title).value).toBe('');
      expect(rateButton(title).disabled).toBe(true);
      await click(rateButton(title));
    }
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('losing gnome eligibility removes the margin input and its pending edit', async () => {
    const dispatch = mock();
    const harbor = harborData();
    const eligible = { ...harbor, favor: { ...harbor.favor, gnome_unlocked: true } };
    await render(<ManagementTab harbor={eligible} act={dispatch} />);
    await enter(rateInput('Silverface margin'), '40');
    await render(<ManagementTab harbor={harbor} act={dispatch} />);
    expect(container.querySelector('[aria-label="New silverface margin"]')).toBeNull();
    expect(rateInput("Merchant's levy")).toBeDefined();
    expect(dispatch).not.toHaveBeenCalled();
    await render(<ManagementTab harbor={eligible} act={dispatch} />);
    expect(rateInput('Silverface margin').value).toBe('10');
    expect(rateButton('Silverface margin').disabled).toBe(true);
  });
});

describe('merchant ledger', () => {
  test('preserves full movement source text and credit, debit, and zero signs', async () => {
    const harbor = harborData();
    const source = 'Navigator export: exceptionally long cargo description from the northern company warehouse, delivered by Captain Alder';
    harbor.ledger.fund_log = [
      { source, amount: 32 },
      { source: 'Crown export duty', amount: -3 },
      { source: 'Account reconciliation', amount: 0 },
    ];
    await render(<LedgerTab harbor={harbor} />);
    const rows = Array.from(container.querySelectorAll('tbody tr')).map(
      (row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent),
    );
    expect(rows).toEqual([[source, '+32m'], ['Crown export duty', '-3m'], ['Account reconciliation', '+0m']]);
    const audit = Array.from(container.querySelectorAll('dl > div')).map(
      (row) => [row.querySelector('dt')?.textContent, row.querySelector('dd')?.textContent],
    );
    expect(audit).toEqual([
      ["Merchant's levy collected", '+60m'],
      ['Crown duty paid on levy', '-3m'],
      ['Company Gnomes margin', '+12m'],
    ]);
    expect(container.textContent).toContain('All credits deposit into the Merchant Fund at your Jawbank.');
    expect(container.textContent).toContain('Most recent first. Older entries roll off after twelve.');
  });

  test('margin lore reflects whether the gnomes are retained and the actual rate', async () => {
    const harbor = harborData();
    await render(<LedgerTab harbor={harbor} />);
    expect(container.textContent).toContain('By standing pact, the Ferentian Guild of Porters and Stevedores');
    expect(container.textContent).toContain('No movements recorded yet this week.');
    await render(<LedgerTab harbor={{ ...harbor,
      favor: { ...harbor.favor, gnome_unlocked: true },
      ledger: { ...harbor.ledger, silverface_margin_percent: 27 },
    }} />);
    expect(container.querySelector('summary')?.textContent).toBe('Silverface margin (+27%)');
    expect(container.textContent).toContain('By writ of the Ferentian Guild of Gnomes Porters');
    expect(container.textContent).toContain('remit the margin of +27% on every sale unto the Merchant Fund');
    expect(container.textContent).not.toContain('By standing pact');
  });
});
