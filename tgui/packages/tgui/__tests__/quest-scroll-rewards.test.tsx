import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, type ReactNode, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  PaymentTerms,
  RewardClause,
} from '../interfaces/QuestScroll/RewardClause';
import type { QuestScrollData } from '../interfaces/QuestScroll/shared';
import { TownerWrit } from '../interfaces/QuestScroll/TownerWrit';

const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
Reflect.set(globalThis, 'Byond', { windowId: 'quest-scroll-rewards' });
const backend = await import('../backend');
const { QuestScrollContent } = await import(
  '../interfaces/QuestScroll/QuestScrollContent'
);
if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
else Reflect.deleteProperty(globalThis, 'Byond');

type BackendState = NonNullable<Parameters<typeof backend.backendReducer>[0]>;
let store: Store;
let previousStore: Store;
let previousByond: PropertyDescriptor | undefined;
let container: HTMLDivElement;
let root: Root;
let previousHtmlClass: string;
let previousHtmlStyle: string | null;
let previousBodyStyle: string | null;
const env = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousActEnvironment: boolean | undefined;

const terms = {
  reward: 103,
  deposit: 20,
  levyRate: 0.1,
  levyExempt: false,
  guildCutRate: 0.15,
};
const scrollData = (): QuestScrollData => ({
  title: 'Writ of the Northern Road',
  realm_name: 'Northmarch',
  ruler_title: 'Duke',
  issued_by: 'Mara',
  issued_to: 'Alden',
  reward: 103,
  deposit: 20,
  levy_rate: 0.1,
  guild_cut_rate: 0.15,
  levy_exempt: false,
  guild_cut_exempt: false,
  crimes: ['robbed the northern road'],
});

beforeEach(() => {
  previousActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  previousHtmlClass = document.documentElement.className;
  previousHtmlStyle = document.documentElement.getAttribute('style');
  previousBodyStyle = document.body.getAttribute('style');
  previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  Reflect.set(globalThis, 'Byond', {
    windowId: 'quest-scroll-rewards',
    winset: mock(),
    sendMessage: mock(),
  });
  previousStore = backend.globalStore;
  store = createStore<{ backend: BackendState; debug: object }>(
    (state, action) => ({
      backend: backend.backendReducer(state?.backend, action) as BackendState,
      debug: {},
    }),
  );
  backend.setGlobalStore(store);
  store.dispatch(
    backend.backendUpdate({
      config: { status: 2, window: { fancy: false } },
      data: scrollData(),
    }),
  );
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
  document.documentElement.className = previousHtmlClass;
  for (const [element, style] of [
    [document.documentElement, previousHtmlStyle],
    [document.body, previousBodyStyle],
  ] as const) {
    if (style === null) element.removeAttribute('style');
    else element.setAttribute('style', style);
  }
  env.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const Connected = () => {
  useSyncExternalStore(store.subscribe, store.getState);
  return <QuestScrollContent />;
};
const render = async (node: ReactNode) => {
  await act(async () => root.render(node));
};
const update = async (data: Partial<QuestScrollData>) => {
  await act(async () => store.dispatch(backend.backendUpdate({ data })));
};
const text = () => container.textContent?.replace(/\s+/g, ' ') || '';

describe('scroll reward clause', () => {
  test('separates estimated earnings and returned deposit, including its guild fee', async () => {
    await render(
      <>
        <RewardClause {...terms} />
        <PaymentTerms {...terms} />
      </>,
    );
    expect(text()).toContain('103 mammon (estimated earnings: 75 mammon');
    expect(text()).toContain("Crown's Levy: 10 mammon");
    expect(text()).toContain("Guild's cut: 18 mammon on bounty and deposit");
    expect(text()).toContain(
      'Returned deposit, separate from earnings: 20 mammon',
    );
    expect(text()).toContain(
      'recipient charter rights and carried tax may alter payment',
    );
    expect(text()).not.toContain('estimated earnings: 95 mammon');
    expect(text()).toContain('Estimated total payment: 95 mammon');
    expect(container.querySelector('details')?.open).toBe(false);
  });

  test('floors each deduction separately instead of rounding net pay', async () => {
    await render(
      <>
        <RewardClause {...terms} reward={5} deposit={0} levyRate={0.15} />
        <PaymentTerms {...terms} reward={5} deposit={0} levyRate={0.15} />
      </>,
    );
    expect(text()).toContain('estimated earnings: 5 mammon');
    expect(text()).toContain("Crown's Levy: 0 mammon");
    expect(text()).toContain("Guild's cut: 0 mammon on bounty");
    expect(text()).not.toContain('Returned deposit');
  });

  test('levy exemption does not erase the guild cut', async () => {
    await render(
      <>
        <RewardClause {...terms} levyExempt />
        <PaymentTerms {...terms} levyExempt />
      </>,
    );
    expect(text()).toContain('estimated earnings: 85 mammon');
    expect(text()).not.toContain("Crown's Levy");
    expect(text()).toContain("Guild's cut: 18 mammon");
  });

  test('towner uses the same deductions while preserving poster prose and seal', async () => {
    await render(
      <TownerWrit
        {...terms}
        rulerTitle="Duke"
        issuedBy="Mara"
        bearer="Alden"
        intro="Bring back my family chest."
        sealNote="The wax bears a raven."
      />,
    );
    expect(text()).toContain('Bring back my family chest.');
    expect(text()).toContain('The wax bears a raven.');
    expect(text()).toContain('estimated earnings: 75 mammon');
    expect(text()).toContain('plus 20 mammon deposit return');
    expect(text()).toContain('Mara');
    expect(text()).toContain('Alden');
  });
});

describe('scroll data and writ forwarding', () => {
  const branches: [string, Partial<QuestScrollData>][] = [
    ['recovery', { writ_type: 'recovery', fetch_item: 'parcel' }],
    ['carriage', { writ_type: 'carriage', delivery_item: 'sealed chest' }],
    ['towner', { writ_type: 'towner', towner_intro: 'Recover my chest.' }],
    ['beast', { faction_category: 'beast' }],
    ['undead', { faction_category: 'undead' }],
    ['goblinoid', { faction_category: 'goblinoid' }],
    ['gronn', { faction_category: 'gronn' }],
    ['drow', { faction_category: 'drow' }],
    ['humanoid', { faction_category: 'humanoid' }],
  ];
  for (const [name, data] of branches) {
    test(`${name} carries all reward terms through its actual scroll branch`, async () => {
      await update(data);
      await render(<Connected />);
      expect(text()).toContain('estimated earnings: 75 mammon');
      expect(text()).toContain("Guild's cut: 18 mammon on bounty and deposit");
      expect(text()).toContain(
        'Returned deposit, separate from earnings: 20 mammon',
      );
      expect(text()).toContain('Writ of the Northern Road');
      expect(text()).toContain('Alden');
    });
  }

  test('posted deductions and deposit refresh without replacing the writ', async () => {
    await render(<Connected />);
    expect(text()).toContain('estimated earnings: 75 mammon');
    await update({ levy_rate: 0.2, guild_cut_rate: 0.25, deposit: 40 });
    expect(text()).toContain('estimated earnings: 48 mammon');
    expect(text()).toContain("Crown's Levy: 20 mammon");
    expect(text()).toContain("Guild's cut: 35 mammon on bounty and deposit");
    expect(text()).toContain(
      'Returned deposit, separate from earnings: 40 mammon',
    );
    expect(text()).toContain('Robbed the northern road');
  });

  test('defense and refreshed guild exemption suppress only the guild deduction', async () => {
    await render(<Connected />);
    await update({ guild_cut_exempt: true });
    expect(text()).toContain('estimated earnings: 93 mammon');
    expect(text()).not.toContain("Guild's cut");
    await update({ guild_cut_exempt: false, is_defense: true });
    expect(text()).toContain('estimated earnings: 93 mammon');
    await update({ is_defense: false, levy_exempt: true });
    expect(text()).toContain('estimated earnings: 85 mammon');
  });

  test('completion and towner recovery instructions retain physical handoff semantics', async () => {
    await update({ writ_type: 'towner', is_towner: true });
    await render(<Connected />);
    expect(text()).toContain(
      'Only Mara can open what you recover - carry it back to them.',
    );
    await update({ complete: true });
    expect(text()).toContain('THIS WORK IS DONE');
    expect(text()).toContain(
      'Return this writ to the Contract Ledger to claim the bounty.',
    );
    expect(text()).toContain(
      'Place it on the marked area or put it on the ledger.',
    );
  });
});
