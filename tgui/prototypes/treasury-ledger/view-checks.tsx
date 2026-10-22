import './test-network';
import './test-dom';

import { expect, test } from 'bun:test';
import { flushSync as reactFlush } from 'react-dom';

import { flushSync } from '../crafting-workbench/svelte/node_modules/svelte/src/index-client.js';
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
  type LedgerEntry,
  type LedgerPage,
  projectEntry,
} from './model';
import { assertDisconnected } from './network-guard';
import { preview } from './preview';
import { mountReact } from './react-mount';
import { buildSamplePage, createSample } from './sample';
import { mountSvelte } from './svelte-mount';
import { testClock } from './test-clock';
import { blockedAPIs, networkAttempts } from './test-network';

type Arm = 'react' | 'svelte';
const mount = { react: mountReact, svelte: mountSvelte };
test('test-only template correction retains semantic rows and leaves ordinary templates untouched', () => {
  const template = document.createElement('template');
  template.innerHTML =
    '<tr data-row="one"><td title="full">A &amp; B</td><td>42m</td></tr>';
  const row = template.content.firstChild as HTMLTableRowElement;
  expect(row instanceof HTMLTableRowElement).toBe(true);
  expect(row.getAttribute('data-row')).toBe('one');
  expect(row.cells).toHaveLength(2);
  expect(row.cells[0] instanceof HTMLTableCellElement).toBe(true);
  expect(row.cells[0].title).toBe('full');
  expect(row.cells[0].textContent).toBe('A & B');
  expect(row.cells[1].textContent).toBe('42m');
  template.innerHTML =
    '<p data-note="ordinary">Text <strong>kept</strong></p><!--same-->';
  expect(template.innerHTML).toBe(
    '<p data-note="ordinary">Text <strong>kept</strong></p><!--same-->',
  );
  expect(template.content.querySelector('table')).toBeNull();
});
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  flushSync();
  reactFlush(() => {});
};
async function session(
  arm: Arm,
  entries: readonly LedgerEntry[] = fiftyOneEntries,
) {
  const clock = testClock();
  const calls: LedgerCommand[] = [];
  const sample = createSample({ entries, ...clock });
  const controller = createController({
    ...clock,
    action: (...command) => {
      calls.push(command);
      sample.action(...command);
    },
    subscribe: sample.subscribe,
  });
  const clearFocus: Array<Element | null> = [];
  const clear = controller.clear;
  controller.clear = () => {
    clearFocus.push(document.activeElement);
    clear();
  };
  const host = document.createElement('div');
  document.body.append(host);
  let unmount!: () => void;
  reactFlush(() => {
    unmount = mount[arm](host, controller);
  });
  await settle();
  return {
    host,
    calls,
    sample,
    controller,
    clearFocus,
    clock,
    async advance(ms: number) {
      reactFlush(() => clock.advance(ms));
      await settle();
    },
    async input(value: string) {
      reactFlush(() => enter(host, value));
      await settle();
    },
    async click(label: string) {
      reactFlush(() => button(host, label).click());
      await settle();
    },
    async dispose() {
      reactFlush(unmount);
      await settle();
      sample.dispose();
      host.remove();
    },
  };
}

async function runJourney(arm: Arm) {
  const s = await session(arm);
  const snapshots = [viewSnapshot(s.host)];
  expect(s.calls).toEqual([['ledger_open']]);
  expect(snapshots[0].message).toBe('Opening the ledger...');
  expect(snapshots[0].input).toBeNull();
  await s.advance(79);
  expect(viewSnapshot(s.host)).toEqual(snapshots[0]);
  await s.advance(1);
  const first = viewSnapshot(s.host);
  snapshots.push(first);
  expect(first.rows).toEqual(
    [...fiftyOneEntries]
      .reverse()
      .slice(0, 50)
      .map((entry) => {
        const row = projectEntry(entry);
        return [row.account, row.reason, row.amount];
      }),
  );
  expect(first.pagination).toBe('Page 1, 50 shown');
  expect(button(s.host, 'Newer').disabled).toBe(true);
  expect(button(s.host, 'Older').disabled).toBe(false);
  await s.advance(300);
  expect(s.calls).toEqual([['ledger_open']]);
  await s.click('Newer');
  expect(s.calls).toHaveLength(1);
  await s.click('Older');
  expect(s.calls.at(-1)).toEqual(['ledger_page', { page: 2 }]);
  await s.advance(80);
  snapshots.push(viewSnapshot(s.host));
  expect(viewSnapshot(s.host).pagination).toBe('Page 2, 1 shown');
  expect(viewSnapshot(s.host).rows[0][1]).toContain('boundary-only needle');
  expect(button(s.host, 'Older').disabled).toBe(true);
  await s.click('Older');
  expect(s.calls).toHaveLength(2);
  await s.click('Newer');
  await s.advance(80);
  await s.input('bound');
  await s.advance(100);
  await s.input('  BOUNDARY-only needle  ');
  await s.advance(249);
  expect(s.calls.filter((c) => c[0] === 'ledger_filter')).toHaveLength(0);
  await s.advance(1);
  expect(s.calls.at(-1)).toEqual([
    'ledger_filter',
    { filter: '  BOUNDARY-only needle  ' },
  ]);
  // Full-data filtering must reach the oldest row, absent from the first 50.
  await s.advance(80);
  expect(viewSnapshot(s.host).pagination).toBe('Page 1, 1 shown');
  expect(s.host.querySelector('input')!.value).toBe('  BOUNDARY-only needle  ');
  snapshots.push(viewSnapshot(s.host));
  await s.input('no such synthetic record');
  await s.advance(330);
  expect(viewSnapshot(s.host).message).toBe(
    'No ledger entries match that search.',
  );
  snapshots.push(viewSnapshot(s.host));
  await s.input('discard this pending query');
  await s.click('Clear');
  expect(s.host.querySelector('input')!.value).toBe('');
  expect(viewSnapshot(s.host).buttons.some((b) => b.text === 'Clear')).toBe(
    false,
  );
  await s.advance(249);
  expect(s.calls.at(-1)).toEqual([
    'ledger_filter',
    { filter: 'no such synthetic record' },
  ]);
  await s.advance(1);
  expect(s.calls.at(-1)).toEqual(['ledger_filter', { filter: '' }]);
  await s.advance(80);
  expect(viewSnapshot(s.host).rows).toHaveLength(50);
  await s.input('[.*]');
  await s.click('Refresh');
  expect(s.calls.at(-1)).toEqual(['ledger_refresh']);
  expect(s.host.querySelector('input')!.value).toBe('[.*]');
  await s.advance(330);
  expect(viewSnapshot(s.host).rows).toHaveLength(1);
  expect(s.host.querySelector('script')).toBeNull();
  snapshots.push(viewSnapshot(s.host));
  await s.input('cancel when leaving');
  const stale = [...s.clock.pending.values()].map((entry) => entry.callback);
  await s.dispose();
  expect(s.calls.at(-1)).toEqual(['ledger_close']);
  const closedCalls = [...s.calls];
  expect(s.clock.pending.size).toBe(0);
  stale.forEach((callback) => callback());
  await settle();
  expect(s.calls).toEqual(closedCalls);
  return { snapshots, calls: s.calls };
}

test('one mounted React/Svelte journey: exact rows, signs, controls, paging, debounce, filtering and teardown', async () => {
  expect(await runJourney('svelte')).toEqual(await runJourney('react'));
});

for (const arm of ['react', 'svelte'] as const) {
  test(`${arm}: focused Clear returns to its own search input after one callback and debounces one empty filter`, async () => {
    const otherSearch = document.createElement('input');
    otherSearch.type = 'search';
    document.body.prepend(otherSearch);
    const s = await session(arm);
    try {
      await s.advance(80);
      await s.input('discard this pending query');
      const input = s.host.querySelector('input')!;
      const clear = button(s.host, 'Clear');
      clear.focus();
      expect(document.activeElement).toBe(clear);

      await s.click('Clear');
      expect(s.clearFocus).toEqual([clear]);
      expect(s.controller.snapshot().draft).toBe('');
      expect(input.value).toBe('');
      expect(clear.isConnected).toBe(false);
      expect(s.host.querySelector('input')).toBe(input);
      expect(document.activeElement?.tagName).toBe('INPUT');
      expect(document.activeElement).toBe(input);
      expect(s.calls).toEqual([['ledger_open']]);
      await s.advance(249);
      expect(s.calls).toEqual([['ledger_open']]);
      await s.advance(1);
      expect(s.calls).toEqual([
        ['ledger_open'],
        ['ledger_filter', { filter: '' }],
      ]);
      await s.advance(1000);
      expect(s.clearFocus).toEqual([clear]);
      expect(s.calls).toEqual([
        ['ledger_open'],
        ['ledger_filter', { filter: '' }],
      ]);
      expect(document.activeElement).toBe(input);
    } finally {
      await s.dispose();
      otherSearch.remove();
    }
  });

  test(`${arm}: exactly 50, empty, duplicates, unknown kinds, scalar edges and long fields`, async () => {
    for (const entries of [
      fiftyOneEntries.slice(1),
      emptyEntries,
      duplicateEntries,
      edgeEntries,
      longEntries,
    ]) {
      const s = await session(arm, entries);
      await s.advance(80);
      const snapshot = viewSnapshot(s.host);
      expect(snapshot.rows).toEqual(
        [...entries].reverse().map((entry) => {
          const row = projectEntry(entry);
          return [row.account, row.reason, row.amount];
        }),
      );
      expect(button(s.host, 'Older').disabled).toBe(true);
      expect(button(s.host, 'Newer').disabled).toBe(true);
      if (!entries.length)
        expect(snapshot.message).toBe('The ledger is empty.');
      if (entries === edgeEntries) {
        expect(snapshot.rows.map((row) => row[2])).toContain('+-3m');
        expect(snapshot.rows.map((row) => row[2])).toContain('−1e-7m');
        expect(snapshot.tones).toContain('other');
      }
      await s.dispose();
    }
  });

  test(`${arm}: same-reference nested deliveries, close/reopen and old-generation delivery cannot overwrite`, async () => {
    const clock = testClock();
    const deliveries: DeliverPage[] = [];
    const calls: LedgerCommand[] = [];
    let subscriptions = 0;
    const controller = createController({
      ...clock,
      action: (...command) => {
        calls.push(command);
      },
      subscribe: (deliver) => {
        deliveries.push(deliver);
        subscriptions++;
        return () => {
          subscriptions--;
        };
      },
    });
    const host = document.createElement('div');
    document.body.append(host);
    let dispose!: () => void;
    const start = async () => {
      reactFlush(() => {
        dispose = mount[arm](host, controller);
      });
      await settle();
    };
    await start();
    const reused: LedgerPage = buildSamplePage(duplicateEntries);
    reactFlush(() => deliveries[0](reused));
    await settle();
    const oldSnapshot = controller.snapshot();
    reused.entries[0].reason = 'Nested same-reference delivery changed';
    reactFlush(() => deliveries[0](reused));
    await settle();
    expect(viewSnapshot(host).rows[0][1]).toBe(
      'Nested same-reference delivery changed',
    );
    expect(oldSnapshot.page!.entries[0].reason).not.toBe(
      reused.entries[0].reason,
    );
    reactFlush(() => enter(host, 'old pending'));
    await settle();
    const oldTimer = clock.callbacks.at(-1)!;
    reactFlush(dispose);
    await settle();
    expect(subscriptions).toBe(0);
    expect(clock.pending.size).toBe(0);
    await start();
    expect(controller.snapshot()).toEqual({
      open: true,
      draft: '',
      page: undefined,
    });
    expect(viewSnapshot(host).message).toBe('Opening the ledger...');
    reactFlush(() => {
      deliveries[0](reused);
      oldTimer();
    });
    await settle();
    expect(viewSnapshot(host).message).toBe('Opening the ledger...');
    reactFlush(() => deliveries[1](buildSamplePage(edgeEntries)));
    await settle();
    expect(viewSnapshot(host).rows).toHaveLength(edgeEntries.length);
    reactFlush(() => enter(host, 'new pending'));
    await settle();
    oldTimer();
    reactFlush(dispose);
    await settle();
    expect(clock.pending.size).toBe(0);
    expect(subscriptions).toBe(0);
    clock.callbacks.forEach((callback) => callback());
    expect(calls).toEqual([
      ['ledger_open'],
      ['ledger_close'],
      ['ledger_open'],
      ['ledger_close'],
    ]);
    host.remove();
  });

  test(`${arm}: sample selector and lifecycle controls remain outside the view and dispose cleanly`, async () => {
    const controls = document.createElement('header');
    controls.id = 'controls';
    const root = document.createElement('main');
    root.id = 'root';
    document.body.append(controls, root);
    let cleanup!: () => void;
    reactFlush(() => {
      cleanup = preview(mount[arm]);
    });
    await settle();
    expect(controls.textContent).toContain('Disconnected sample only');
    expect(root.contains(controls)).toBe(false);
    expect(controls.querySelectorAll('option')).toHaveLength(6);
    reactFlush(() => button(controls, 'Close ledger').click());
    await settle();
    expect(root.textContent).toBe('Sample ledger closed.');
    reactFlush(() => button(controls, 'Reopen ledger').click());
    await settle();
    expect(viewSnapshot(root).message).toBe('Opening the ledger...');
    controls.querySelector('select')!.value = '2';
    reactFlush(() => button(controls, 'Load sample').click());
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await settle();
    expect(viewSnapshot(root).message).toBe('The ledger is empty.');
    reactFlush(cleanup);
    await settle();
    expect(root.children).toHaveLength(0);
    expect(controls.children).toHaveLength(0);
    controls.remove();
    root.remove();
  });
}

test('controller preserves debounce deadline, missing-page draft and same-session delivery ordering', () => {
  const clock = testClock();
  const calls: LedgerCommand[] = [];
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
  controller.open();
  controller.clear();
  clock.advance(100);
  controller.clear();
  clock.advance(149);
  expect(calls).toEqual([['ledger_open']]);
  clock.advance(1);
  expect(calls.at(-1)).toEqual(['ledger_filter', { filter: '' }]);
  controller.draft('pending');
  deliver(undefined);
  expect(controller.snapshot().draft).toBe('pending');
  const newer = buildSamplePage(edgeEntries, 2);
  const older = buildSamplePage(duplicateEntries, 1);
  deliver(newer);
  deliver(older);
  expect(controller.snapshot().page).toEqual(older);
  clock.advance(250);
  expect(calls.at(-1)).toEqual(['ledger_filter', { filter: 'pending' }]);
  controller.close();
});

test('sample searches full from/to/reason text only, and close/reopen cancels stale deliveries and resets filters', () => {
  for (const [query, count] of [
    [' sample mill guild ', 1],
    ['SAMPLE ARCHIVE', 1],
    ['[.*]', 1],
    ['future-kind', 0],
  ] as const) {
    expect(buildSamplePage(edgeEntries, 1, query).shown).toBe(count);
  }
  expect(buildSamplePage(edgeEntries, 1, '   ').filtered).toBe(false);
  const clock = testClock();
  const sample = createSample({ ...clock, entries: fiftyOneEntries });
  const pages: Array<LedgerPage | undefined> = [];
  sample.subscribe((page) => pages.push(page));
  sample.action('ledger_open');
  const stale = clock.callbacks.at(-1)!;
  sample.action('ledger_filter', { filter: 'absent' });
  sample.action('ledger_page', { page: 2 });
  sample.action('ledger_close');
  expect(clock.pending.size).toBe(0);
  sample.action('ledger_open');
  stale();
  expect(pages).toEqual([]);
  clock.advance(80);
  expect(pages).toHaveLength(1);
  expect(pages[0]).toEqual(buildSamplePage(fiftyOneEntries));
  sample.dispose();
  const count = pages.length;
  clock.callbacks.forEach((callback) => callback());
  expect(pages).toHaveLength(count);
});

test('all host-property presence forms fail closed and late host injection blocks local commands', () => {
  for (const scope of [
    { Byond: undefined },
    { hubStorage: undefined },
    Object.create({ Byond: undefined }),
    Object.create({ hubStorage: undefined }),
    { window: { Byond: undefined } },
    { window: { hubStorage: undefined } },
  ])
    expect(() => assertDisconnected(scope)).toThrow();
  expect(() => assertDisconnected({})).not.toThrow();
  const calls: LedgerCommand[] = [];
  const clock = testClock();
  const sample = createSample({ ...clock });
  const controller = createController({
    ...clock,
    action: (...command) => {
      calls.push(command);
    },
    subscribe: () => () => {},
  });
  for (const name of ['Byond', 'hubStorage']) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: undefined,
    });
    try {
      expect(() => createSample()).toThrow();
      expect(() =>
        createController({ action() {}, subscribe: () => () => {} }),
      ).toThrow();
      expect(() => controller.open()).toThrow();
      expect(() => sample.action('ledger_open')).toThrow();
      for (const arm of ['react', 'svelte'] as const) {
        expect(() =>
          mount[arm](document.createElement('div'), controller),
        ).toThrow();
      }
    } finally {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
  expect(calls).toEqual([]);
  sample.dispose();
});

test('mounted runs made zero network/worker attempts; every tripwire is active', () => {
  expect(networkAttempts()).toBe(0);
  for (const name of blockedAPIs)
    expect(() =>
      Reflect.construct((globalThis as any)[name], ['unused']),
    ).toThrow();
  expect(() => navigator.sendBeacon('unused')).toThrow();
  expect(networkAttempts()).toBe(blockedAPIs.length + 1);
});
