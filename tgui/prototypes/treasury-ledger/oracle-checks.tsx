import './test-network';

import { expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Data } from '../../packages/tgui/interfaces/StewardTrade/types';
import { button, enter, viewSnapshot } from './dom-snapshot';
import {
  duplicateEntries,
  edgeEntries,
  emptyEntries,
  fiftyOneEntries,
  longEntries,
} from './fixtures';
import {
  createController,
  type DeliverPage,
  type LedgerCommand,
  type LedgerPage,
} from './model';
import { mountReact } from './react-mount';
import { ReactView } from './ReactView';
import { buildSamplePage } from './sample';
import { testClock } from './test-clock';
import { networkAttempts } from './test-network';

let action = (..._args: unknown[]) => {};
mock.module('../../packages/tgui/backend', () => ({
  useBackend: () => ({ act: action }),
}));
const { LedgerView } = await import(
  '../../packages/tgui/interfaces/StewardTrade/LedgerView'
);
const data = (page?: LedgerPage) => ({ ledger_page: page }) as Data;
const props = (page?: LedgerPage) => ({
  page,
  draft: '',
  onDraft() {},
  onClear() {},
  onPage() {},
  onRefresh() {},
});

test('actual unchanged LedgerView renders the same text, order, signs, unknown kinds, scalar fields and states', () => {
  const pages = [
    undefined,
    buildSamplePage(emptyEntries),
    buildSamplePage(emptyEntries, 1, 'absent'),
    ...[fiftyOneEntries, duplicateEntries, edgeEntries, longEntries].map(
      (entries) => buildSamplePage(entries),
    ),
    buildSamplePage(fiftyOneEntries, 2),
    {
      ...buildSamplePage(emptyEntries),
      page: 2,
      filtered: 1 as const,
      has_more: 1 as const,
    },
  ];
  for (const page of pages) {
    const original = document.createElement('div');
    original.innerHTML = renderToStaticMarkup(<LedgerView data={data(page)} />);
    const candidate = document.createElement('div');
    candidate.innerHTML = renderToStaticMarkup(<ReactView {...props(page)} />);
    expect(viewSnapshot(candidate)).toEqual(viewSnapshot(original));
    expect(candidate.querySelector('script')).toBeNull();
  }
});

async function observedCommands(arm: 'original' | 'candidate') {
  const environment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const wasActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const clock = testClock();
  const calls: LedgerCommand[] = [];
  const host = document.createElement('div');
  document.body.append(host);
  const oldSet = window.setTimeout;
  const oldClear = window.clearTimeout;
  const page = { ...buildSamplePage(edgeEntries), page: 2, has_more: true };
  const snapshots: ReturnType<typeof viewSnapshot>[] = [];
  let dispose!: () => void;
  let closed = false;
  const advance = async (ms: number) => act(async () => clock.advance(ms));
  const input = async (value: string) => act(async () => enter(host, value));
  const click = async (label: string) =>
    act(async () => button(host, label).click());
  try {
    if (arm === 'original') {
      action = (...command) => {
        calls.push(command as LedgerCommand);
      };
      window.setTimeout = clock.schedule as typeof window.setTimeout;
      window.clearTimeout = clock.cancel as typeof window.clearTimeout;
      const root = createRoot(host);
      await act(async () => root.render(<LedgerView data={data(page)} />));
      dispose = () => root.unmount();
    } else {
      let deliver!: DeliverPage;
      const controller = createController({
        ...clock,
        action: (...command) => {
          calls.push(command);
        },
        subscribe: (next) => {
          deliver = next;
          return () => {};
        },
      });
      await act(async () => {
        dispose = mountReact(host, controller);
      });
      expect(calls.shift()).toEqual(['ledger_open']);
      await act(async () => deliver(page));
    }
    await advance(300);
    expect(calls).toEqual([]);
    await input('Cro');
    await advance(100);
    await input('Crown wages');
    await advance(249);
    expect(calls).toEqual([]);
    await advance(1);
    expect(calls).toEqual([['ledger_filter', { filter: 'Crown wages' }]]);
    snapshots.push(viewSnapshot(host));
    await input('Crown wages');
    await advance(250);
    expect(calls).toHaveLength(1);
    await input('pending query');
    await click('Older');
    await click('Newer');
    await click('Refresh');
    expect(calls.slice(1)).toEqual([
      ['ledger_page', { page: 3 }],
      ['ledger_page', { page: 1 }],
      ['ledger_refresh'],
    ]);
    expect(host.querySelector('input')!.value).toBe('pending query');
    await click('Clear');
    snapshots.push(viewSnapshot(host));
    await advance(249);
    expect(calls).toHaveLength(4);
    await advance(1);
    expect(calls.at(-1)).toEqual(['ledger_filter', { filter: '' }]);
    await input('discard on unmount');
    await act(async () => dispose());
    closed = true;
    if (arm === 'candidate') expect(calls.pop()).toEqual(['ledger_close']);
    await advance(500);
    expect(clock.pending.size).toBe(0);
    expect(calls).toHaveLength(5);
    return { calls, snapshots };
  } finally {
    if (!closed && dispose) await act(async () => dispose());
    window.setTimeout = oldSet;
    window.clearTimeout = oldClear;
    environment.IS_REACT_ACT_ENVIRONMENT = wasActEnvironment;
    host.remove();
  }
}

test('actual LedgerView oracle: exact latest-draft debounce, unchanged draft, Clear, page, refresh and cancellation', async () => {
  expect(await observedCommands('candidate')).toEqual(
    await observedCommands('original'),
  );
});

test('isolated actual-component oracle made zero network attempts', () => {
  expect(networkAttempts()).toBe(0);
});
