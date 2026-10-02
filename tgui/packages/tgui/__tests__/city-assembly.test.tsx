import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { AssemblyData } from '../interfaces/CityAssembly/types';

const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
Reflect.set(globalThis, 'Byond', { windowId: 'city-assembly' });
const backend = await import('../backend');
const { AssemblyContent } = await import(
  '../interfaces/CityAssembly/AssemblyContent'
);
if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
else Reflect.deleteProperty(globalThis, 'Byond');

const deskData = (): AssemblyData => ({
  day: 2,
  session_number: 3,
  next_resolution: 'the next dawn',
  next_resolution_seconds: 61,
  current_alderman: 'Eleanor of the Very Long Northern March',
  is_alderman: false,
  is_censured: false,
  is_outlaw: false,
  can_stand: true,
  my_weight_doubled: 3,
  warrant: {
    trade_cap: 100,
    trade_remaining: 70,
    defense_cap: 12,
    defense_remaining: 4,
  },
  my_votes: {},
  voter_count: 4,
  quorate: true,
  candidates: [
    {
      ref: 'candidate-1',
      name: 'Eleanor of the Very Long Northern March',
      job: 'Guild Master',
      pledge: 'Bread for every household.',
      is_me: false,
      is_alderman: true,
    },
  ],
  tallies: {},
  history: [],
  trade_brackets: [0, 50, 100],
  defense_brackets: [0, 6, 12],
  poll_brackets: [],
  quorum_voters: 3,
  recall_threshold_pct: 66,
  censure_threshold_pct: 75,
  nae_veto_pct: 40,
  removal_voters: 2,
  removal_weight_doubled: 8,
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
  Reflect.set(globalThis, 'Byond', { windowId: 'city-assembly', sendMessage });
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
  return <AssemblyContent />;
};
const render = async () => {
  await act(async () => root.render(<Connected />));
};
const update = async (data: Partial<AssemblyData>) => {
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

const motion = (name: string) => {
  const element = Array.from(container.querySelectorAll('fieldset')).find(
    (entry) => entry.querySelector('legend')?.textContent === name,
  );
  if (!element) throw new Error(`Missing motion: ${name}`);
  return element;
};
const choice = (name: string, label: string) => {
  const element = Array.from(motion(name).querySelectorAll('button')).find(
    (entry) => entry.textContent?.trim().startsWith(label),
  );
  if (!element) throw new Error(`Missing choice: ${name}, ${label}`);
  return element;
};
const textarea = () => {
  const element = container.querySelector('textarea');
  if (!element) throw new Error('Missing pledge editor');
  return element;
};
const enterPledge = async (value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )!.set!.call(textarea(), value);
    textarea().dispatchEvent(new Event('input', { bubbles: true }));
  });
};

test('session uses live server countdown, fractional weight, and quorum copy', async () => {
  await render();
  expect(container.textContent).toContain('Session #3 • resolves in 1m 01s');
  expect(container.textContent).toContain('your weight 1.5');
  await update({ next_resolution_seconds: 58, quorate: false, voter_count: 1 });
  expect(container.textContent).toContain('resolves in 58s');
  expect(container.textContent).toContain(
    '3 voices required, only 1 cast. Status quo holds',
  );
  await update({ next_resolution_seconds: 0, session_number: 4 });
  expect(container.textContent).toContain(
    'Session #4 • resolves at the next dawn',
  );
  await update({ next_resolution_seconds: 600 });
  expect(container.textContent).toContain('resolves in 10m 00s');
});

test('time spent with the ballot open is not subtracted again from server updates', async () => {
  await render();
  await act(async () => {
    await Bun.sleep(1050);
  });
  await update({ next_resolution_seconds: 60 });
  expect(container.textContent).toContain('resolves in 1m 00s');
});

test('candidate vote and no-alderman vote wait for authoritative selection; clear sends exact action', async () => {
  await render();
  const candidate = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Vote for Eleanor of the Very Long Northern March"]',
  )!;
  await click(candidate);
  expect(candidate.getAttribute('aria-pressed')).toBe('false');
  await update({ my_votes: { election: 'candidate-1' } });
  expect(candidate.getAttribute('aria-pressed')).toBe('true');
  await click(
    container.querySelector<HTMLButtonElement>(
      'button[aria-label="Vote for no Alderman"]',
    )!,
  );
  await click(choice('Alderman', 'clear'));
  expect(sendMessage.mock.calls).toEqual([
    ['act/cast_vote', { motion: 'election', choice: 'candidate-1' }],
    ['act/cast_vote', { motion: 'election', choice: 'NO_ALDERMAN' }],
    ['act/retract_vote', { motion: 'election' }],
  ]);
});

test.each([
  ['Trade', 'trade_auth', '50m', '50'],
  ['Trade', 'trade_auth', 'NAE', 'NAE'],
  ['Defense', 'defense_auth', '0p', '0'],
  ['Defense', 'defense_auth', '12p', '12'],
  ['Recall', 'recall', 'YAE', 'YAE'],
  ['Censure', 'censure', 'NAY', 'NAY'],
])(
  '%s ballot sends exact %s choice %s and retracts',
  async (label, id, text, value) => {
    await render();
    await click(choice(label, text));
    expect(choice(label, text).getAttribute('aria-pressed')).toBe('false');
    await update({ my_votes: { [id]: value } });
    expect(choice(label, text).getAttribute('aria-pressed')).toBe('true');
    await click(choice(label, 'clear'));
    expect(sendMessage.mock.calls).toEqual([
      ['act/cast_vote', { motion: id, choice: value }],
      ['act/retract_vote', { motion: id }],
    ]);
  },
);

test.each([{ is_outlaw: true }, { my_weight_doubled: 0 }])(
  'ineligible voters cannot cast but can retract existing ballots: %j',
  async (role) => {
    await update({
      ...role,
      can_stand: false,
      my_votes: {
        election: 'candidate-1',
        trade_auth: '50',
        defense_auth: '0',
        recall: 'YAE',
        censure: 'NAY',
      },
    });
    await render();
    for (const label of ['Alderman', 'Trade', 'Defense', 'Recall', 'Censure']) {
      const buttons = motion(label).querySelectorAll('button[aria-pressed]');
      for (const element of buttons) {
        expect((element as HTMLButtonElement).disabled).toBe(true);
        await click(element as HTMLButtonElement);
      }
      expect(choice(label, 'clear').disabled).toBe(false);
      await click(choice(label, 'clear'));
    }
    expect(sendMessage.mock.calls.map(([message]) => message)).toEqual(
      Array(5).fill('act/retract_vote'),
    );
  },
);

test('server candidacy eligibility is independent of voting weight; refreshed roles remove editor', async () => {
  await update({ my_weight_doubled: 0, can_stand: true });
  await render();
  await click(button('Stand for the chair...'));
  expect(document.activeElement).toBe(textarea());
  await update({ can_stand: false });
  expect(container.querySelector('textarea')).toBeNull();
  expect(container.textContent).not.toContain('Stand for the chair...');
  await update({ can_stand: true });
  expect(container.querySelector('textarea')).toBeNull();
  expect(button('Stand for the chair...').getAttribute('aria-expanded')).toBe(
    'false',
  );
});

test('pledge editing prefills, preserves live draft, submits latest native input and restores focus on cancel', async () => {
  await update({ candidates: [{ ...deskData().candidates[0], is_me: true }] });
  await render();
  await click(button('Update my pledge...'));
  expect(textarea().value).toBe('Bread for every household.');
  expect(textarea().maxLength).toBe(300);
  await enterPledge('Fresh bread & safe streets.\nFor everyone.');
  await update({
    voter_count: 8,
    candidates: [
      { ...deskData().candidates[0], is_me: true, pledge: 'Server pledge' },
    ],
  });
  expect(textarea().value).toBe('Fresh bread & safe streets.\nFor everyone.');
  await click(button('Update'));
  expect(sendMessage.mock.calls).toEqual([
    [
      'act/declare_candidacy',
      { pledge: 'Fresh bread & safe streets.\nFor everyone.' },
    ],
  ]);
  expect(textarea().value).toBe('Fresh bread & safe streets.\nFor everyone.');
  await click(button('Cancel'));
  expect(document.activeElement).toBe(button('Update my pledge...'));
  await click(button('Update my pledge...'));
  expect(textarea().value).toBe('Server pledge');
});

test('new candidacy submits empty pledge and eligibility loss still permits withdrawing existing candidacy', async () => {
  await render();
  await click(button('Stand for the chair...'));
  await click(button('Declare'));
  await update({
    can_stand: false,
    candidates: [{ ...deskData().candidates[0], is_me: true }],
  });
  await click(button('Withdraw my candidacy'));
  expect(sendMessage.mock.calls).toEqual([
    ['act/declare_candidacy', { pledge: '' }],
    ['act/withdraw_candidacy', {}],
  ]);
});

test('tallies, veto, zero bracket, leader and removal floors reflect server data and quorum', async () => {
  await update({
    quorate: false,
    tallies: {
      election: {
        tally: { 'candidate-1': 3 },
        total: 3,
        leader_key: 'candidate-1',
      },
      trade_auth: {
        tally: {},
        nae: 4,
        total: 8,
        winning_bracket: 50,
        vetoed: true,
      },
      defense_auth: {
        tally: { '0': 3 },
        nae: 0,
        total: 3,
        winning_bracket: 0,
        vetoed: false,
      },
      recall: { yae: 6, nay: 2, total: 8, count: 2, would_pass: true },
      censure: { yae: 2, nay: 6, total: 8, count: 2, would_pass: false },
    },
  });
  await render();
  expect(container.textContent).toContain(
    'Eleanor of the Very Long Northern March leads (1.5 total weight)',
  );
  expect(container.textContent).toContain(
    'If quorum is met: Would be vetoed (NAE >= 40% of 4 cast)',
  );
  expect(container.textContent).toContain(
    'If quorum is met: Would carry at 0p/day (1.5 cast)',
  );
  expect(container.textContent).toContain('Would pass (3 YAE vs 1 NAY)');
  expect(container.textContent).toContain('Would fail (1 YAE vs 3 NAY)');
  expect(container.textContent).toContain(
    'Requires 2 voters and 4 total weight.',
  );
  expect(container.textContent).toContain('66% YAE carries.');
  expect(container.textContent).toContain('75% YAE carries.');
  await update({
    quorate: true,
    tallies: { election: { tally: {}, total: 2, leader_key: 'NO_ALDERMAN' } },
  });
  expect(container.textContent).toContain('NO ALDERMAN leads (1 total weight)');
  expect(container.textContent).not.toContain('If quorum is met:');
});

test('missing alderman hides removal; no candidates and no votes retain empty wording', async () => {
  await update({ current_alderman: null, candidates: [] });
  await render();
  expect(container.querySelectorAll('fieldset')).toHaveLength(3);
  expect(container.textContent).toContain('No one has stood yet.');
  expect(container.textContent).toContain('No votes yet.');
});

test('writ is role-gated, trade respects remaining coin, resignation and back retain action names', async () => {
  await render();
  expect(container.textContent).not.toContain("Alderman's Writ");
  await update({ is_alderman: true });
  expect(container.textContent).toContain('70m of 100m remaining today');
  expect(container.textContent).toContain('4p of 12p remaining today');
  await click(button('Alderman — Trade'));
  await click(button('Resign the seat'));
  await click(button('◄ Back to the Noticeboard'));
  await update({ warrant: { ...deskData().warrant!, trade_remaining: 0 } });
  expect(button('Alderman — Trade').disabled).toBe(true);
  await click(button('Alderman — Trade'));
  expect(sendMessage.mock.calls).toEqual([
    ['act/alderman_trade', {}],
    ['act/resign_alderman', {}],
    ['act/back_to_noticeboard', {}],
  ]);
  await update({ warrant: null });
  expect(container.textContent).not.toContain("Alderman's Writ");
});

test('record disclosure preserves formatted summaries and responds to session updates', async () => {
  await render();
  await click(button('Show record (0)'));
  expect(button('Hide record (0)').getAttribute('aria-expanded')).toBe('true');
  expect(container.textContent).toContain(
    'No sessions have yet been written into the record.',
  );
  await update({
    history: [
      {
        session: 2,
        day: 1,
        text: '<b>No Alderman elected.</b><br>Trade unchanged.',
      },
    ],
  });
  expect(container.textContent).toContain('Session 2 — Day 1');
  expect(container.querySelector('#assembly-record b')?.textContent).toBe(
    'No Alderman elected.',
  );
  await click(button('Hide record (1)'));
  expect(container.querySelector('#assembly-record')).toBeNull();
  expect(sendMessage).not.toHaveBeenCalled();
});
