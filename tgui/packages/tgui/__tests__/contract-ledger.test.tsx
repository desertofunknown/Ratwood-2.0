import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type {
  Contract,
  ContractLedgerData,
} from '../interfaces/ContractLedger/ContractLedgerContent';

const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
Reflect.set(globalThis, 'Byond', { windowId: 'contract-ledger' });
const backend = await import('../backend');
const { ContractLedgerContent } = await import(
  '../interfaces/ContractLedger/ContractLedgerContent'
);
if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
else Reflect.deleteProperty(globalThis, 'Byond');

const deskData = (): ContractLedgerData => ({
  is_handler: false,
  balance: 300,
  has_account: true,
  active_count: 0,
  active_max: 3,
  active_max_base: 3,
  active_fellowship_bonus: 0,
  take_cooldown_remaining: 0,
  user_fellowship_size: 1,
  pool: [
    contract(),
    contract({
      ref: 'south',
      title: 'Southern Recovery',
      region: 'South',
      difficulty: 'Hard',
      is_standing: true,
    }),
  ],
  active: [],
  regions: ['North', 'South'],
  tax_rate: 0.15,
  guild_cut_rate: 0.1,
  can_proxy_turnin: false,
  dynamic_role: null,
  dynamic_roles: [],
});
const contract = (patch: Partial<Contract> = {}): Contract => ({
  ref: 'north',
  title: 'A very long contract name kept in full',
  type: 'Recovery',
  difficulty: 'Easy',
  reward: 101,
  deposit: 10,
  deposit_return: 25,
  area: 'Long northern valley',
  region: 'North',
  objective: 'Recover the missing cargo and return it to its rightful owner.',
  expected_count: 2,
  threat_bands: 1,
  levy_exempt: false,
  guild_cut_exempt: false,
  is_rumor: false,
  is_defense: true,
  is_towner: false,
  is_standing: false,
  required_fellowship_size: 0,
  lapse_minutes: 12,
  ...patch,
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
  Reflect.set(globalThis, 'Byond', {
    windowId: 'contract-ledger',
    sendMessage,
  });
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
  return <ContractLedgerContent />;
};
const render = async () => {
  await act(async () => root.render(<Connected />));
};
const update = async (
  data: Partial<ContractLedgerData> & Record<string, unknown>,
) => {
  await act(async () => store.dispatch(backend.backendUpdate({ data })));
};
const button = (label: string) => {
  const found = Array.from(
    container.querySelectorAll<HTMLButtonElement>('button, [role=button]'),
  ).find((element) => element.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
};
const click = async (element: HTMLElement) => {
  await act(async () => element.click());
};

test('filters retain region counts, standing selection and full objectives', async () => {
  await render();
  expect(container.querySelectorAll('article')).toHaveLength(2);
  expect(container.textContent).toContain('North (1)');
  await click(button('North (1)'));
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(container.textContent).toContain(
    'A very long contract name kept in full',
  );
  expect(container.textContent).toContain('Recover the missing cargo');
  await click(button('Hard (0)'));
  expect(container.textContent).toContain('No contracts match');
  await click(button('All (2)'));
  await click(button('Standing (1)'));
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(container.textContent).toContain('Southern Recovery');
});

test('sign blockers follow live account, funds, capacity, cooldown and fellowship; actions retain refs', async () => {
  await update({ pool: [contract()] });
  await render();
  for (const patch of [
    { has_account: false },
    { balance: 9 },
    { active_count: 3 },
    { take_cooldown_remaining: 1 },
    { pool: [contract({ required_fellowship_size: 3 })] },
  ]) {
    await update({ ...deskData(), pool: [contract()], ...patch });
    expect(button('Sign').disabled).toBe(true);
    await click(button('Sign'));
  }
  expect(sendMessage).not.toHaveBeenCalled();
  await update({
    ...deskData(),
    pool: [contract()],
    active: [
      {
        ref: 'active-ref',
        title: 'Held writ',
        type: 'Recovery',
        difficulty: 'Easy',
        area: 'Valley',
        region: 'North',
        progress_current: 1,
        progress_required: 2,
        complete: false,
      },
    ],
  });
  await click(button('Sign'));
  await click(button('Abandon'));
  expect(sendMessage.mock.calls).toEqual([
    ['act/sign', { ref: 'north' }],
    ['act/abandon', { ref: 'active-ref' }],
  ]);
  expect(container.textContent).toContain('1/2');
  expect(container.querySelector('dialog')).toBeNull();
  expect(
    Array.from(container.querySelectorAll('summary')).some(
      (s) => s.textContent === 'Fellowship benefits',
    ),
  ).toBe(true);
});

test('estimate uses returned deposit and explicit exemptions even for commissioned blockade grouping', async () => {
  await update({ pool: [contract()] });
  await render();
  const row = container.querySelector('article')!;
  expect(row.textContent).toContain('Estimated earnings74m');
  expect(row.textContent).toContain('Deposit to sign10m');
  expect(row.textContent).toContain('Returned deposit on completion25m');
  expect(row.textContent).toContain('Estimated total payment99m');
  expect(row.textContent).toContain('Recipient charters and carried tax');
  await update({
    pool: [contract({ guild_cut_exempt: true, levy_exempt: true })],
  });
  expect(row.textContent).toContain('Estimated earnings101m');
});

test('live role revocation closes the stale panel even when legacy role remains', async () => {
  await update({
    dynamic_roles: ['towner'],
    dynamic_role: 'towner',
    towner_postings: [],
  });
  await render();
  await click(button('Postings'));
  expect(container.textContent).toContain('Towner Postings');
  await update({ dynamic_roles: [] });
  expect(container.textContent).not.toContain('Towner Postings');
  expect(container.querySelectorAll('article')).toHaveLength(2);
});

const changeSelect = async (index: number, value: string) => {
  const select = container.querySelectorAll('select')[index];
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const rumorData = {
  dynamic_roles: ['innkeeper'],
  rumor_points: 20,
  rumor_refill_base: 5,
  rumor_refill_per_player: 0.5,
  rumor_active_players: 3,
  rumor_costs: { Recovery: 3, Hunt: 4 },
  rumor_regions_by_type: { Recovery: ['North'], Hunt: ['South'] },
  rumor_destinations: ['Town'],
  rumor_log: [],
  rumor_lucrative_mult: 1.5,
};

test('rumor draft survives backend refresh, floors price and sends exact compose payload', async () => {
  await update(rumorData);
  await render();
  await click(button('Rumors'));
  await changeSelect(1, 'North');
  await changeSelect(2, 'Town');
  await click(container.querySelector('input[type=checkbox]')!);
  await update({ rumor_points: 4 });
  const dispatch = Array.from(
    container.querySelectorAll<HTMLButtonElement>('button, [role=button]'),
  ).find((b) => b.textContent?.includes('Whisper Rumor'))!;
  expect(dispatch.textContent).toContain('4');
  expect(dispatch.disabled).toBe(false);
  expect(container.querySelectorAll('select')[2].value).toBe('Town');
  await click(dispatch);
  expect(sendMessage.mock.calls).toEqual([
    [
      'act/compose_rumor',
      {
        type: 'Recovery',
        region: 'North',
        destination: 'Town',
        in_hands: 0,
        lucrative: 1,
      },
    ],
  ]);
  await changeSelect(0, 'Hunt');
  expect(container.querySelectorAll('select')).toHaveLength(2);
  expect(container.querySelectorAll('select')[1].value).toBe('');
});

test('acting alderman with unavailable pledge does not loop or commission against crown', async () => {
  await update({
    dynamic_roles: ['steward'],
    pledge_available: false,
    is_alderman_acting: true,
    pledge_balance: 100,
    crown_purse_balance: 100,
    defense_costs: { Recovery: 3 },
    defense_regions_by_type: { Recovery: ['North'] },
    defense_destinations: ['Town'],
    defense_log: [],
    pledge_refill_base: 5,
    pledge_refill_per_player: 1,
    pledge_active_players: 2,
  });
  await render();
  await click(button('Commissions'));
  await changeSelect(1, 'North');
  await changeSelect(2, 'Town');
  const dispatch = button('Commission (3m)');
  expect(dispatch.disabled).toBe(true);
  expect(dispatch.title).toBe('The Burgher Pledge is unavailable.');
  expect(sendMessage).not.toHaveBeenCalled();
});

test('commission bonus floors cost, retains draft and sends authoritative recall and funding actions', async () => {
  await update({
    dynamic_roles: ['steward'],
    pledge_available: true,
    is_alderman_acting: false,
    pledge_balance: 100,
    crown_purse_balance: 100,
    defense_costs: { Recovery: 3, 'Blockade Defense': 5 },
    defense_regions_by_type: {
      Recovery: ['North'],
      'Blockade Defense': ['South'],
    },
    defense_destinations: ['Town'],
    defense_log: [],
    pledge_refill_base: 5,
    pledge_refill_per_player: 1,
    pledge_active_players: 2,
    directives_per_day: 2,
    directives_issued_today: 0,
    blockade_recall_list: [
      {
        region: 'South',
        recall_eligible: true,
        recall_blocker: null,
        seconds_until_recallable: 0,
        refund: 5,
        refund_fund: 'pledge',
      },
    ],
  });
  await render();
  await click(button('Commissions'));
  await changeSelect(1, 'North');
  await changeSelect(2, 'Town');
  const light = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.startsWith('Light'),
  )!;
  await click(light);
  await update({ pledge_balance: 3 });
  expect(container.querySelectorAll('select')[2].value).toBe('Town');
  await click(button('Commission (3m)'));
  expect(sendMessage.mock.calls[0]).toEqual([
    'act/commission_defense',
    {
      type: 'Recovery',
      region: 'North',
      destination: 'Town',
      in_hands: 0,
      levy_exempt: 0,
      bonus_pay_level: 1,
      funding: 'pledge',
    },
  ]);
  await changeSelect(0, 'Blockade Defense');
  await changeSelect(1, 'South');
  await click(button('Recall Writ (refund 5m)'));
  expect(sendMessage.mock.calls[1]).toEqual([
    'act/recall_blockade_writ',
    { region: 'South' },
  ]);
  await update({
    blockade_recall_list: [
      {
        region: 'South',
        recall_eligible: false,
        recall_blocker: 'Already answered',
        seconds_until_recallable: 0,
        refund: 0,
        refund_fund: null,
      },
    ],
  });
  expect(container.textContent).not.toContain('Recall Writ');
  expect(container.textContent).toContain('Already answered');
});

test('towner posting preserves tier, delivery and variety; losing eligibility removes its action', async () => {
  const posting = {
    type: 'Ore',
    label: 'Ore delivery',
    blurb: 'Bring ore to town.',
    eligible: true,
    eligible_jobs: ['Miner'],
    crown_funded: false,
    tiers: {
      medium: { cost: 10, bearer_summary: 'Small parcel' },
      hard: { cost: 20, bearer_summary: 'Large parcel' },
    },
    varieties: [
      {
        key: 'iron',
        label: 'Iron',
        blurb: 'Iron vein',
        poster_summaries: { medium: 'Iron small', hard: 'Iron large' },
      },
      {
        key: 'gold',
        label: 'Gold',
        blurb: 'Gold vein',
        poster_summaries: { medium: 'Gold small', hard: 'Gold large' },
      },
    ],
  };
  await update({ dynamic_roles: ['towner'], towner_postings: [posting] });
  await render();
  await click(button('Postings'));
  await click(button('Hard (20m)'));
  await click(button('Gold'));
  await click(button('Post to board'));
  await update({ balance: 19 });
  expect(button('Post (20m)').disabled).toBe(true);
  await update({ balance: 20 });
  await click(button('Post (20m)'));
  expect(sendMessage.mock.calls).toEqual([
    [
      'act/compose_towner',
      { type: 'Ore', tier: 'hard', delivery: 'board', variety: 'gold' },
    ],
  ]);
  await update({ towner_postings: [{ ...posting, eligible: false }] });
  expect(container.querySelector('.ContractLedger__SignButton')).toBeNull();
  expect(container.textContent).toContain('Miner');
});
