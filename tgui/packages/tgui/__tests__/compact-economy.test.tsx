import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { BrowseTab } from '../interfaces/Commissioner/BrowseTab';
import type { CatalogEntry, CommissionerData } from '../interfaces/Commissioner/types';
import { PackRow } from '../interfaces/Goldface/PackRow';
import type { VendingPack } from '../interfaces/Goldface/types';
import { LedgerTab } from '../interfaces/MeisterPanel/LedgerTab';
import { PersonalTab } from '../interfaces/MeisterPanel/PersonalTab';
import { PollTaxTab } from '../interfaces/MeisterPanel/PollTaxTab';
import type { Data } from '../interfaces/MeisterPanel/types';

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

const input = (label: string) => {
  const found = Array.from(container.querySelectorAll('label')).find(
    (element) => element.textContent?.trim() === label,
  )?.querySelector('input');
  if (!found) throw new Error(`Missing input: ${label}`);
  return found;
};

const enter = async (element: HTMLInputElement, value: string) => {
  await act(async () => {
    // Use the native setter so React sees the same change as user input.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const pack: VendingPack = {
  ref: 'pack-iron-tools', name: 'Iron tools', category: 'Tools', qty: 2,
  price: 15, price_base: 12, price_tariff: 3,
};

const personalData = (overrides: Partial<Data> = {}): Data => ({
  funds: [], account_balance: 200, day: 1, max_issuance_day: 10,
  active_loan: null,
  poll_tax: { rate: 0, exempt: false, advance_days_held: 0 },
  poll_tax_static: { max_advance_days: 0, fallback_rate: 0 },
  poll_tax_user: { category: '', category_label: '' },
  fund_balances: {}, institutional_loans: [], institutional_logs: {},
  patron_rosters: {}, patron_rosters_static: {}, personal_log: [],
  bathhouse_ordinance_available: false, bathhouse_ordinance_active: false,
  bathhouse_tithe_round_total: 0, bathhouse_ordinance_cooldown_seconds: 0,
  bathhouse_worker_withdraw_limit: 0, bathhouse_agent_withdraw_limit: 0,
  bathhouse_worker_suspended: false, bathhouse_agent_suspended: false,
  bathhouse_withdraw_remaining: 0, bathhouse_viewer_suspended: false,
  is_bathmaster: false,
  ...overrides,
});

const recipes: CatalogEntry[] = Array.from({ length: 41 }, (_, index) => ({
  ref: `recipe-${index}`, name: `Sword ${index + 1}`, category: 'Weapons (Swords)',
  price: 10, ingot: 'Iron', materials: [{ name: 'Iron ingot', qty: 2 }],
}));

const commissionerData = (overrides: Partial<CommissionerData> = {}): CommissionerData => ({
  locked: true, can_read: true, is_guildmaster: false, budget: 100,
  my_deposit: 0, percent_margin: 0, flat_margin: 0, item_cap_per_order: 20,
  my_manifest_items: 0, has_active_order: false, catalog: recipes,
  categories: ['Weapons (Swords)', 'Armor (Helmets)'], ingots: ['Iron', 'Steel'],
  group_order: ['Armor', 'Weapons', 'Other'], manifest: [], manifest_total: 0,
  orders: [], materials: [], ...overrides,
});

describe('Goldface purchase controls', () => {
  test('requires the full tariff-inclusive price and sends the exact pack ref', async () => {
    const dispatch = mock();
    const view = (budget: number) => <PackRow pack={pack} budget={budget} canRead showCategory browseOnly={false} act={dispatch} />;
    await render(view(14));
    expect(button('Buy Iron tools for 15m').disabled).toBe(true);
    await click(button('Buy Iron tools for 15m'));
    expect(dispatch).not.toHaveBeenCalled();
    await render(view(15));
    expect(button('Buy Iron tools for 15m').disabled).toBe(false);
    await click(button('Buy Iron tools for 15m'));
    expect(dispatch.mock.calls).toEqual([['buy', { ref: 'pack-iron-tools' }]]);
  });

  test('browse-only rows offer no purchase action even with sufficient funds', async () => {
    const dispatch = mock();
    await render(<PackRow pack={pack} budget={100} canRead showCategory browseOnly act={dispatch} />);
    expect(container.textContent).toContain('browse');
    expect(container.querySelector('button')).toBeNull();
    await click(container);
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('illiterate buyers receive masked names in visible text, titles, and accessible labels', async () => {
    const dispatch = mock();
    await render(<PackRow pack={pack} budget={15} canRead={false} showCategory browseOnly={false} act={dispatch} />);
    expect(container.textContent).not.toContain('Iron tools');
    expect(container.textContent).not.toContain('Tools');
    const buy = button('Buy **** ***** for 15m');
    expect(Array.from(container.querySelectorAll('[title]')).some((element) => element.getAttribute('title')?.includes('Iron tools'))).toBe(false);
    await click(buy);
    expect(dispatch.mock.calls).toEqual([['buy', { ref: 'pack-iron-tools' }]]);
  });
});

describe('Meister personal account controls', () => {
  test.each([
    ['Gold 10m', 'GOLD', 10],
    ['Silver 5m', 'SILVER', 5],
    ['Bronze 1m', 'BRONZE', 1],
  ] as const)('%s withdraws coin counts at the exact balance limit', async (label, denomination, value) => {
    const dispatch = mock();
    await render(<PersonalTab data={personalData({ account_balance: value * 2 })} act={dispatch} />);
    await click(button(label));
    expect(button(label).getAttribute('aria-pressed')).toBe('true');
    await enter(input('Coins'), '3');
    expect(button('Draw coin').disabled).toBe(true);
    await click(button('Draw coin'));
    expect(dispatch).not.toHaveBeenCalled();
    await enter(input('Coins'), '2');
    expect(container.textContent).toContain(`Total${value * 2}m`);
    expect(button('Draw coin').disabled).toBe(false);
    await click(button('Draw coin'));
    expect(dispatch.mock.calls).toEqual([['withdraw_personal', { denomination, amount: 2 }]]);
    expect(input('Coins').value).toBe('');
    expect(button('Draw coin').disabled).toBe(true);
  });

  test('withdrawals accept only whole counts from 1 through 20', async () => {
    const dispatch = mock();
    await render(<PersonalTab data={personalData()} act={dispatch} />);
    for (const value of ['', '0', '-1', '1.5', '21']) {
      await enter(input('Coins'), value);
      expect(button('Draw coin').disabled).toBe(true);
      await click(button('Draw coin'));
    }
    expect(dispatch).not.toHaveBeenCalled();
    for (const amount of [1, 20]) {
      await enter(input('Coins'), String(amount));
      expect(button('Draw coin').disabled).toBe(false);
      await click(button('Draw coin'));
    }
    expect(dispatch.mock.calls).toEqual([
      ['withdraw_personal', { denomination: 'GOLD', amount: 1 }],
      ['withdraw_personal', { denomination: 'GOLD', amount: 20 }],
    ]);
  });

  test.each([[12, 20, 12], [20, 12, 12]])('repayment respects balance %i and remaining debt %i', async (balance, remaining, limit) => {
    const dispatch = mock();
    await render(<PersonalTab data={personalData({ account_balance: balance, active_loan: {
      principal: 30, remaining, interest_pct: 5, days_total: 5,
      due_on_day: 6, days_until_due: 5, minutes_until_due: 100,
      defaulted: false, creditor: 'Town treasury',
    } })} act={dispatch} />);
    for (const value of ['', '0', '-1', '1.5', String(limit + 1)]) {
      await enter(input('Repayment in mammon'), value);
      expect(button('Repay loan').disabled).toBe(true);
      await click(button('Repay loan'));
    }
    expect(dispatch).not.toHaveBeenCalled();
    await enter(input('Repayment in mammon'), String(limit));
    expect(button('Repay loan').disabled).toBe(false);
    await click(button('Repay loan'));
    expect(dispatch.mock.calls).toEqual([['repay_loan', { amount: limit }]]);
    expect(input('Repayment in mammon').value).toBe('');
    expect(button('Repay loan').disabled).toBe(true);
  });

  test('an empty account and no loan expose no usable money actions', async () => {
    const dispatch = mock();
    await render(<PersonalTab data={personalData({ account_balance: 0 })} act={dispatch} />);
    await enter(input('Coins'), '1');
    expect(button('Draw coin').disabled).toBe(true);
    await click(button('Draw coin'));
    expect(container.textContent).toContain('No outstanding loan.');
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('Meister tax and institutional repayment controls', () => {
  test.each([[12, 0, 2], [100, 3, 1]])('advance days respect balance %i and %i days already held', async (balance, held, limit) => {
    const dispatch = mock();
    const data = personalData({
      account_balance: balance,
      poll_tax: { rate: 5, exempt: false, advance_days_held: held },
      poll_tax_static: { max_advance_days: 4, fallback_rate: 5 },
      poll_tax_user: { category: 'citizen', category_label: 'Citizen' },
    });
    await render(<PollTaxTab data={data} act={dispatch} />);
    for (const value of ['', '0', '-1', '1.5', String(limit + 1)]) {
      await enter(input('Advance days'), value);
      expect(button('Pay forward').disabled).toBe(true);
      await click(button('Pay forward'));
    }
    expect(dispatch).not.toHaveBeenCalled();
    await enter(input('Advance days'), String(limit));
    expect(button('Pay forward').disabled).toBe(false);
    await click(button('Pay forward'));
    expect(dispatch.mock.calls).toEqual([['advance_poll_tax', { days: limit }]]);
    expect(input('Advance days').value).toBe('');
    expect(button('Pay forward').disabled).toBe(true);
  });

  test('institutional repayments reject fractions and send the target fund with the whole amount', async () => {
    const dispatch = mock();
    const data = personalData({ institutional_loans: [{
      creditor_id: 'treasury', creditor_label: 'Treasury', debtor: '',
      is_institutional: true, target_id: 'smiths', target_label: 'Smiths Guild',
      minutes_until_due: 100, principal: 30, interest_pct: 5,
      due_on_day: 6, days_until_due: 5, remaining: 12, defaulted: false,
    }] });
    await render(<LedgerTab data={data} act={dispatch} />);
    for (const value of ['', '0', '-1', '1.5', '13']) {
      await enter(input('Repayment in mammon'), value);
      expect(button('Repay').disabled).toBe(true);
      await click(button('Repay'));
    }
    expect(dispatch).not.toHaveBeenCalled();
    await enter(input('Repayment in mammon'), '12');
    expect(button('Repay').disabled).toBe(false);
    await click(button('Repay'));
    expect(dispatch.mock.calls).toEqual([['repay_indenture', { fund_id: 'smiths', amount: 12 }]]);
    expect(input('Repayment in mammon').value).toBe('');
    expect(button('Repay').disabled).toBe(true);
  });
});

describe('Commissioner catalogue controls', () => {
  test('pages all recipes and sends the selected recipe ID', async () => {
    const dispatch = mock();
    await render(<BrowseTab data={commissionerData()} act={dispatch} canRead />);
    expect(button('Previous').disabled).toBe(true);
    expect(container.querySelectorAll('button[aria-label^="Add "]')).toHaveLength(40);
    expect(container.textContent).toContain('1–40 of 41');
    await click(button('Next'));
    expect(container.querySelectorAll('button[aria-label^="Add "]')).toHaveLength(1);
    expect(container.textContent).toContain('41–41 of 41');
    expect(button('Next').disabled).toBe(true);
    await click(button('Add Sword 41 to manifest'));
    expect(dispatch.mock.calls).toEqual([['manifest_inc', { ref: 'recipe-40', delta: 1 }]]);
    await click(button('Previous'));
    expect(button('Add Sword 1 to manifest')).toBeDefined();
  });

  test('category, material, and name filters combine and reset from a later page', async () => {
    const dispatch = mock();
    const catalog = [...recipes,
      { ...recipes[0], ref: 'steel-helm', name: 'Guard helmet', category: 'Armor (Helmets)', ingot: 'Steel' },
      { ...recipes[0], ref: 'iron-helm', name: 'Guard helmet', category: 'Armor (Helmets)' },
      { ...recipes[0], ref: 'steel-crown', name: 'Crown', category: 'Armor (Helmets)', ingot: 'Steel' },
    ];
    await render(<BrowseTab data={commissionerData({ catalog })} act={dispatch} canRead />);
    await click(button('Next'));
    const armor = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')).find((element) => element.textContent?.includes('Armor'))!;
    await click(armor);
    expect(armor.getAttribute('aria-expanded')).toBe('true');
    await click(button('Helmets'));
    expect(button('Helmets').getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain('1–3 of 3');
    const material = container.querySelector('select')!;
    await act(async () => {
      material.value = 'Steel';
      material.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await enter(input('Find a recipe'), 'GUARD');
    expect(container.querySelectorAll('button[aria-label^="Add "]')).toHaveLength(1);
    await click(button('Add Guard helmet to manifest'));
    expect(dispatch.mock.calls).toEqual([['manifest_inc', { ref: 'steel-helm', delta: 1 }]]);
    await enter(input('Find a recipe'), 'missing recipe');
    expect(container.textContent).toContain('No matching recipes');
    expect(container.querySelector('button[aria-label^="Add "]')).toBeNull();
    await click(button('Reset filters'));
    expect(input('Find a recipe').value).toBe('');
    expect(material.value).toBe('__all__');
    expect(container.textContent).toContain('1–40 of 44');
    expect(button('Previous').disabled).toBe(true);
  });

  test('guild adjustment lock prevents Add and literacy masking preserves recipe identity', async () => {
    const dispatch = mock();
    const data = commissionerData({ locked: false, catalog: [recipes[0]] });
    await render(<BrowseTab data={data} act={dispatch} canRead={false} />);
    const label = 'Add ***** * to manifest';
    expect(button(label).disabled).toBe(true);
    expect(container.textContent).not.toContain('Sword 1');
    expect(container.textContent).not.toContain('Iron ingot');
    await click(button(label));
    expect(dispatch).not.toHaveBeenCalled();
    await render(<BrowseTab data={{ ...data, locked: true }} act={dispatch} canRead={false} />);
    expect(button(label).disabled).toBe(false);
    await click(button(label));
    expect(dispatch.mock.calls).toEqual([['manifest_inc', { ref: 'recipe-0', delta: 1 }]]);
  });
});
