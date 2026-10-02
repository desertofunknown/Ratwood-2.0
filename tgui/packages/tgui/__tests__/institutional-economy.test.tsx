import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { InstitutionalTab } from '../interfaces/MeisterPanel/InstitutionalTab';
import { PatronageTab } from '../interfaces/MeisterPanel/PatronageTab';
import { PaginatedLog } from '../interfaces/MeisterPanel/PaginatedLog';
import type { Data, FundEntry, LogEntry, PatronRoster } from '../interfaces/MeisterPanel/types';

let container: HTMLDivElement;
let root: Root;
const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let previous: boolean | undefined;
beforeEach(() => {
  previous = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  env.IS_REACT_ACT_ENVIRONMENT = previous;
});
const render = async (node: ReactNode) => { await act(async () => root.render(node)); };
const findButton = (label: string) => Array.from(container.querySelectorAll('button')).find(
  (el) => (el.getAttribute('aria-label') || el.textContent?.trim()) === label,
);
const button = (label: string) => {
  const el = findButton(label);
  if (!el) throw new Error(`Missing button: ${label}`);
  return el;
};
const input = (label: string) => {
  const el = Array.from(container.querySelectorAll('label')).find((el) => el.textContent?.trim() === label)?.querySelector('input');
  if (!el) throw new Error(`Missing input: ${label}`);
  return el;
};
const click = async (el: HTMLElement) => { await act(async () => el.click()); };
const enter = async (el: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const fund = (id: string, overrides: Partial<FundEntry> = {}): FundEntry => ({
  id, label: id, name: id, can_issue: true, can_withdraw: true, can_view: true,
  supports_loans: true, allow_zero_rate: false, authority_label: `Keeper of ${id}`,
  withdraw_rule: 'By the keeper’s authority.', has_patronage: true,
  patron_label: `${id} patrons`, patron_cap: 2, ...overrides,
});
const roster = (label: string, overrides: Partial<PatronRoster> = {}): PatronRoster => ({ label, cap: 2, can_manage: true, patrons: [], ...overrides });
const bankData = (overrides: Partial<Data> = {}): Data => ({
  funds: [fund('crown'), fund('church')], account_balance: 200, day: 1,
  max_issuance_day: 10, active_loan: null,
  poll_tax: { rate: 0, exempt: false, advance_days_held: 0 },
  poll_tax_static: { max_advance_days: 0, fallback_rate: 0 },
  poll_tax_user: { category: '', category_label: '' },
  fund_balances: {
    crown: { balance: 2000, outstanding_principal: 0 },
    church: { balance: 2000, outstanding_principal: 0 },
    bathhouse: { balance: 2000, outstanding_principal: 0 },
  }, institutional_loans: [], institutional_logs: {},
  patron_rosters: { crown: roster('Crown roster'), church: roster('Church roster') },
  patron_rosters_static: {
    crown: { explanation: 'Crown duties.\n\nCrown privileges. - Crown office' },
    church: { explanation: 'Church duties. - Church office' },
  }, personal_log: [], bathhouse_ordinance_available: false,
  bathhouse_ordinance_active: true, bathhouse_tithe_round_total: 5,
  bathhouse_ordinance_cooldown_seconds: 0, bathhouse_worker_withdraw_limit: 25,
  bathhouse_agent_withdraw_limit: 50, bathhouse_worker_suspended: false,
  bathhouse_agent_suspended: false, bathhouse_withdraw_remaining: 15,
  bathhouse_viewer_suspended: false, is_bathmaster: false, ...overrides,
});
const logs = (name: string, count: number): LogEntry[] => Array.from({ length: count }, (_, i) => ({
  kind: 'payment', direction: i % 2 ? 'out' : 'in', counterparty: `${name} ${i}`, amount: i + 1, reason: `Reason ${i}`,
}));

describe('Institutional selection and withdrawals', () => {
  test.each(['removed', 'inaccessible'] as const)('falls back when selected fund becomes %s, clearing its draft', async (change) => {
    const dispatch = mock();
    await render(<InstitutionalTab data={bankData()} act={dispatch} />);
    await enter(input('Withdraw mammon'), '100');
    const funds = change === 'removed' ? [fund('church')] : [fund('crown', { can_view: false, can_issue: false, can_withdraw: false }), fund('church')];
    await render(<InstitutionalTab data={bankData({ funds })} act={dispatch} />);
    expect(button('church').getAttribute('aria-pressed')).toBe('true');
    expect(input('Withdraw mammon').value).toBe('');
    expect(button('Draw coin').disabled).toBe(true);
    await enter(input('Withdraw mammon'), '1');
    await click(button('Draw coin'));
    expect(dispatch.mock.calls).toEqual([['withdraw_institutional', { fund_id: 'church', amount: 1 }]]);
  });
  test('explicit fund switches reset loan drafts and transaction pages', async () => {
    const data = bankData({ institutional_logs: { crown: logs('Crown', 21), church: logs('Church', 21) } });
    await render(<InstitutionalTab data={data} act={mock()} />);
    await enter(input('Principal'), '100');
    await click(button('Older'));
    expect(container.textContent).toContain('Crown 20');
    await click(button('church'));
    expect(input('Principal').value).toBe('');
    expect(button('Newer').disabled).toBe(true);
    expect(container.textContent).toContain('Church 0');
    expect(container.textContent).not.toContain('Church 20');
  });
  test('view-only and lost authority remove monetary action controls', async () => {
    const dispatch = mock();
    await render(<InstitutionalTab data={bankData()} act={dispatch} />);
    await enter(input('Principal'), '100');
    await render(<InstitutionalTab data={bankData({ funds: [fund('crown', { can_issue: false, can_withdraw: false })] })} act={dispatch} />);
    expect(findButton('Stamp writ')).toBeUndefined();
    expect(findButton('Draw coin')).toBeUndefined();
    expect(container.textContent).toContain('You may view these coffers');
    await render(<InstitutionalTab data={bankData({ funds: [] })} act={dispatch} />);
    expect(container.textContent).toContain('You hold no institutional authority.');
    expect(container.querySelector('button')).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });
  test('withdrawals require whole amounts within current coffers', async () => {
    const dispatch = mock();
    await render(<InstitutionalTab data={bankData({ fund_balances: { crown: { balance: 100, outstanding_principal: 0 } } })} act={dispatch} />);
    for (const value of ['', '0', '-1', '1.5', '101']) {
      await enter(input('Withdraw mammon'), value);
      expect(button('Draw coin').disabled).toBe(true);
      await click(button('Draw coin'));
    }
    expect(dispatch).not.toHaveBeenCalled();
    await enter(input('Withdraw mammon'), '100');
    await click(button('Draw coin'));
    expect(dispatch.mock.calls).toEqual([['withdraw_institutional', { fund_id: 'crown', amount: 100 }]]);
    expect(input('Withdraw mammon').value).toBe('');
  });
  test('Bathhouse workers obey daily allowance; the Bathmaster is uncapped', async () => {
    const dispatch = mock();
    await render(<InstitutionalTab data={bankData({ funds: [fund('bathhouse', { can_issue: false })] })} act={dispatch} />);
    await enter(input('Withdraw mammon'), '16');
    expect(button('Draw coin').disabled).toBe(true);
    await enter(input('Withdraw mammon'), '15');
    await click(button('Draw coin'));
    expect(dispatch.mock.calls).toEqual([['withdraw_institutional', { fund_id: 'bathhouse', amount: 15 }]]);
    await render(<InstitutionalTab data={bankData({ funds: [fund('bathhouse')], is_bathmaster: true })} act={dispatch} />);
    await enter(input('Withdraw mammon'), '16');
    expect(button('Draw coin').disabled).toBe(false);
  });
});

describe('Institutional loan drafts', () => {
  test('personal bounds, whole amounts, terms and rates reach the existing action', async () => {
    const dispatch = mock();
    await render(<InstitutionalTab data={bankData()} act={dispatch} />);
    for (const value of ['', '0', '49', '50.5', '501']) {
      await enter(input('Principal'), value);
      expect(button('Stamp writ').disabled).toBe(true);
      await click(button('Stamp writ'));
    }
    expect(dispatch).not.toHaveBeenCalled();
    await click(button('3 days'));
    await click(button('10%'));
    for (const amount of [50, 500]) {
      await enter(input('Principal'), String(amount));
      await click(button('Stamp writ'));
    }
    expect(dispatch.mock.calls).toEqual([50, 500].map((amount) => ['issue_personal', { fund_id: 'crown', amount, term: 3, rate: 10, target: undefined }]));
  });
  test('coffers and issuance window changes block an existing draft', async () => {
    const dispatch = mock();
    await render(<InstitutionalTab data={bankData()} act={dispatch} />);
    await enter(input('Principal'), '100');
    await render(<InstitutionalTab data={bankData({ fund_balances: { crown: { balance: 99, outstanding_principal: 0 } } })} act={dispatch} />);
    expect(button('Stamp writ').disabled).toBe(true);
    expect(container.textContent).toContain('The coffers cannot cover this principal.');
    await render(<InstitutionalTab data={bankData({ day: 11 })} act={dispatch} />);
    expect(button('Stamp writ').disabled).toBe(true);
    await click(button('Stamp writ'));
    expect(dispatch).not.toHaveBeenCalled();
    await render(<InstitutionalTab data={bankData({ day: 10 })} act={dispatch} />);
    expect(button('Stamp writ').disabled).toBe(false);
  });
  test('indentures require whole 501–2000m principals and a current target', async () => {
    const dispatch = mock();
    const view = (funds: FundEntry[]) => <InstitutionalTab data={bankData({ funds })} act={dispatch} />;
    await render(view([fund('crown'), fund('church')]));
    await click(button('Indenture'));
    for (const value of ['', '500', '501.5', '2001']) {
      await enter(input('Principal'), value);
      expect(button('Stamp writ').disabled).toBe(true);
    }
    await enter(input('Principal'), '501');
    await render(view([fund('crown'), fund('bathhouse')]));
    expect(button('Stamp writ').disabled).toBe(false);
    await click(button('Stamp writ'));
    expect(dispatch.mock.calls).toEqual([['issue_indenture', { fund_id: 'crown', target: 'bathhouse', amount: 501, term: 2, rate: 25 }]]);
    await enter(input('Principal'), '2000');
    await click(button('Stamp writ'));
    expect(dispatch.mock.calls[1][1].amount).toBe(2000);
    await enter(input('Principal'), '501');
    await render(view([fund('crown'), fund('bathhouse', { supports_loans: false })]));
    expect(button('Stamp writ').disabled).toBe(true);
    expect(container.textContent).toContain('No target institutions available.');
  });
  test('removing zero-rate eligibility replaces the stale selection', async () => {
    const dispatch = mock();
    await render(<InstitutionalTab data={bankData({ funds: [fund('church', { allow_zero_rate: true })] })} act={dispatch} />);
    await click(button('0%'));
    await enter(input('Principal'), '50');
    await render(<InstitutionalTab data={bankData({ funds: [fund('church')] })} act={dispatch} />);
    expect(findButton('0%')).toBeUndefined();
    expect(button('25%').getAttribute('aria-pressed')).toBe('true');
    await click(button('Stamp writ'));
    expect(dispatch.mock.calls[0][1].rate).toBe(25);
  });
});

describe('Patronage permissions and roster', () => {
  test('stale unauthorized roster is replaced before draft or revoke actions', async () => {
    const dispatch = mock();
    const church = roster('Church roster', { patrons: [{ ref: 'c-1', name: 'Cleric', job: 'Acolyte' }] });
    const crown = roster('Crown roster', { patrons: [{ ref: 'k-1', name: 'Knight', job: 'Knight' }] });
    await render(<PatronageTab data={bankData({ patron_rosters: { crown, church } })} act={dispatch} />);
    expect(findButton('Revoke patronage for Knight')).toBeDefined();
    await render(<PatronageTab data={bankData({ patron_rosters: { crown: { ...crown, can_manage: false }, church } })} act={dispatch} />);
    expect(findButton('Revoke patronage for Knight')).toBeUndefined();
    await click(button('Revoke patronage for Cleric'));
    await click(button('Draft writ'));
    expect(dispatch.mock.calls).toEqual([
      ['revoke_patronage', { fund_id: 'church', target_ref: 'c-1' }], ['issue_patronage', { fund_id: 'church' }],
    ]);
    await render(<PatronageTab data={bankData({ patron_rosters: { crown: { ...crown, can_manage: false }, church: { ...church, can_manage: false } } })} act={dispatch} />);
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).toContain('You hold no patronage authority.');
  });
  test('capacity blocks drafts while preserving revoke and complete lore', async () => {
    const dispatch = mock();
    const crown = roster('Crown roster', { cap: 1, patrons: [{ ref: 'k-1', name: 'Knight', job: '' }] });
    await render(<PatronageTab data={bankData({ patron_rosters: { crown } })} act={dispatch} />);
    expect(button('Draft writ').disabled).toBe(true);
    await click(button('Draft writ'));
    expect(dispatch).not.toHaveBeenCalled();
    const detail = container.querySelector('details')!;
    expect(detail.open).toBe(false);
    expect(detail.querySelector('summary')?.textContent).toBe('Terms of patronage');
    expect(detail.textContent).toContain('Crown duties.\n\nCrown privileges.');
    expect(detail.textContent).toContain('- Crown office');
    await click(button('Revoke patronage for Knight'));
    expect(dispatch.mock.calls).toEqual([['revoke_patronage', { fund_id: 'crown', target_ref: 'k-1' }]]);
  });
});

describe('Bathhouse employment and ordinance', () => {
  test('deposits reject fractional and unaffordable amounts; employment loss removes controls', async () => {
    const dispatch = mock();
    await render(<InstitutionalTab data={bankData({ funds: [fund('bathhouse', { can_issue: false, can_withdraw: false })] })} act={dispatch} />);
    for (const value of ['', '0', '-1', '1.5', '201']) {
      await enter(input('Deposit mammon'), value);
      expect(button('Render unto the Bathhouse').disabled).toBe(true);
      await click(button('Render unto the Bathhouse'));
    }
    expect(dispatch).not.toHaveBeenCalled();
    await enter(input('Deposit mammon'), '200');
    await click(button('Render unto the Bathhouse'));
    expect(dispatch.mock.calls).toEqual([['deposit_institutional', { fund_id: 'bathhouse', amount: 200 }]]);
    expect(input('Deposit mammon').value).toBe('');
    await render(<InstitutionalTab data={bankData({ funds: [] })} act={dispatch} />);
    expect(findButton('Render unto the Bathhouse')).toBeUndefined();
  });
  test('Bathmaster limits accept 0–10000 whole mammon and refresh from server', async () => {
    const dispatch = mock();
    const data = bankData({ funds: [fund('bathhouse')], is_bathmaster: true });
    await render(<InstitutionalTab data={data} act={dispatch} />);
    for (const value of ['', '-1', '1.5', '10001']) {
      await enter(input('Workers'), value);
      expect(button('Set worker limit').disabled).toBe(true);
      await click(button('Set worker limit'));
    }
    expect(dispatch).not.toHaveBeenCalled();
    for (const amount of [0, 10000]) {
      await enter(input('Workers'), String(amount));
      await click(button('Set worker limit'));
    }
    await click(button('Suspend agent payments'));
    expect(dispatch.mock.calls).toEqual([
      ['set_bathhouse_limit', { group: 'worker', amount: 0 }], ['set_bathhouse_limit', { group: 'worker', amount: 10000 }], ['toggle_bathhouse_suspension', { group: 'agent' }],
    ]);
    await render(<InstitutionalTab data={{ ...data, bathhouse_worker_withdraw_limit: 40, bathhouse_agent_suspended: true }} act={dispatch} />);
    expect(input('Workers').value).toBe('40');
    expect(findButton('Resume agent payments')).toBeDefined();
    await render(<InstitutionalTab data={{ ...data, is_bathmaster: false }} act={dispatch} />);
    expect(findButton('Set worker limit')).toBeUndefined();
    expect(findButton('Suspend agent payments')).toBeUndefined();
  });
  test('ordinance confirmation, cooldown, and current state govern action', async () => {
    const dispatch = mock();
    const data = bankData({ funds: [fund('church')], bathhouse_ordinance_available: true });
    await render(<InstitutionalTab data={data} act={dispatch} />);
    await click(button('Break the Ordinance'));
    expect(dispatch).not.toHaveBeenCalled();
    await click(button('Cancel'));
    expect(findButton('Break the Ordinance')).toBeDefined();
    await click(button('Break the Ordinance'));
    await render(<InstitutionalTab data={{ ...data, bathhouse_ordinance_cooldown_seconds: 61 }} act={dispatch} />);
    expect(button('Confirm: Break the Ordinance').disabled).toBe(true);
    expect(container.textContent).toContain('2 minutes');
    await click(button('Confirm: Break the Ordinance'));
    expect(dispatch).not.toHaveBeenCalled();
    await render(<InstitutionalTab data={{ ...data, bathhouse_ordinance_active: false }} act={dispatch} />);
    expect(findButton('Confirm: Restore the Ordinance')).toBeUndefined();
    await click(button('Restore the Ordinance'));
    await click(button('Confirm: Restore the Ordinance'));
    expect(dispatch.mock.calls).toEqual([['toggle_bathhouse_ordinance']]);
  });
  test('Bathhouse ordinance updates keep one employment section and reset only ordinance confirmation', async () => {
    const errors = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const dispatch = mock();
      const data = bankData({
        funds: [fund('bathhouse')], is_bathmaster: true,
        bathhouse_ordinance_available: true, bathhouse_ordinance_active: true,
      });
      const expectSingleSections = () => {
        const headings = Array.from(container.querySelectorAll('h2')).map((el) => el.textContent);
        for (const title of ['Employment terms', 'Render coin', 'Daily withdrawal limits', 'Ordinance of the Baths']) {
          expect(headings.filter((heading) => heading === title).length).toBe(1);
        }
      };
      await render(<InstitutionalTab data={data} act={dispatch} />);
      expectSingleSections();
      await enter(input('Deposit mammon'), '10');
      await enter(input('Workers'), '60');
      await click(button('Break the Ordinance'));
      expect(findButton('Confirm: Break the Ordinance')).toBeDefined();
      await render(<InstitutionalTab data={{ ...data, bathhouse_ordinance_active: false }} act={dispatch} />);
      expectSingleSections();
      expect(findButton('Confirm: Restore the Ordinance')).toBeUndefined();
      expect(findButton('Cancel')).toBeUndefined();
      expect(input('Deposit mammon').value).toBe('10');
      expect(input('Workers').value).toBe('60');
      await click(button('Restore the Ordinance'));
      await render(<InstitutionalTab data={data} act={dispatch} />);
      expectSingleSections();
      expect(findButton('Confirm: Break the Ordinance')).toBeUndefined();
      expect(findButton('Break the Ordinance')).toBeDefined();
      expect(input('Deposit mammon').value).toBe('10');
      expect(input('Workers').value).toBe('60');
      expect(dispatch).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });
  test('ordinance requires availability, eligible institution, and issuance authority', async () => {
    const dispatch = mock();
    for (const data of [
      bankData({ funds: [fund('church')], bathhouse_ordinance_available: false }),
      bankData({ funds: [fund('crown')], bathhouse_ordinance_available: true }),
      bankData({ funds: [fund('church', { can_issue: false })], bathhouse_ordinance_available: true }),
    ]) {
      await render(<InstitutionalTab data={data} act={dispatch} />);
      expect(findButton('Break the Ordinance')).toBeUndefined();
    }
    expect(dispatch).not.toHaveBeenCalled();
  });
});

test('transaction pages clamp after shrink and preserve complete entry text', async () => {
  const entries = logs('Merchant', 21);
  entries[0].reason = 'A long transaction reason that should remain available without a tooltip.';
  await render(<PaginatedLog entries={entries} />);
  expect(container.textContent).toContain(entries[0].reason);
  expect(container.textContent).toContain('+1m');
  expect(container.textContent).toContain('-2m');
  await click(button('Older'));
  expect(container.querySelectorAll('tbody tr').length).toBe(1);
  await render(<PaginatedLog entries={entries.slice(0, 1)} />);
  expect(container.textContent).toContain('Merchant 0');
  expect(container.querySelectorAll('tbody tr').length).toBe(1);
  expect(findButton('Older')).toBeUndefined();
  await render(<PaginatedLog entries={[]} />);
  expect(container.textContent).toBe('No transactions on record.');
});
