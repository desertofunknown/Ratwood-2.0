import { expect, mock, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { createController, project } from './model';
import { sample } from './sample';

let context: { data: { dates: string[] }; act: (...args: any[]) => void };
let resolveAsset = (name: string) => name;
mock.module('../../packages/tgui/backend', () => ({
  useBackend: () => context,
}));
mock.module('../../packages/tgui/assets', () => ({
  resolveAsset: (name: string) => resolveAsset(name),
}));
const Shell = ({ children }: any) => <div>{children}</div>;
Shell.Content = Shell;
mock.module('../../packages/tgui/layouts', () => ({ Window: Shell }));
const { Changelog } = await import('../../packages/tgui/interfaces/Changelog');
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (value: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const body = (text: string) => ({ text: async () => text });

async function lifecycle(
  arm: 'original' | 'candidate',
  scenario: 'terminal' | 'race' | 'invalid' | 'body' | 'unmount',
) {
  const oldFetch = globalThis.fetch,
    oldSet = globalThis.setTimeout,
    oldClear = globalThis.clearTimeout;
  const timers = new Map<number, TimerCallback>(),
    delays: number[] = [],
    calls: any[] = [],
    urls: string[] = [];
  const a = deferred<any>(),
    b = deferred<any>();
  let serial = 0,
    fetches = 0,
    resolutions = 0;
  const action = (...args: any[]) => calls.push(args);
  const fetch = async (url: string) => {
    urls.push(url);
    fetches++;
    if (scenario === 'race' && fetches === 1) return a.promise;
    if (scenario === 'race' && fetches === 2) return b.promise;
    if (scenario === 'unmount') return a.promise;
    if (scenario === 'body' && fetches === 1) return { text: () => a.promise };
    if (scenario === 'terminal') return body('Cannot find archive');
    if (scenario === 'invalid' && fetches === 1) return body('invalid: [');
    return body(JSON.stringify(sample));
  };
  const schedule = (fn: () => void, delay: number) => {
    const id = ++serial;
    timers.set(id, fn);
    delays.push(delay);
    return id;
  };
  const cancel = (id: unknown) => {
    timers.delete(id as number);
  };
  resolveAsset = (name) => `${name}?sample=${++resolutions}`;
  context = { data: { dates: ['2026-10', '2026-09'] }, act: action };
  let original: any;
  let controller: ReturnType<typeof createController>;
  let current: () => any, select: (i: number) => void, stop: () => void;
  try {
    if (arm === 'original') {
      globalThis.fetch = fetch as any;
      globalThis.setTimeout = schedule as any;
      globalThis.clearTimeout = cancel as any;
      original = new Changelog({});
      original.setState = (patch: any, done?: () => void) => {
        original.state = {
          ...original.state,
          ...(typeof patch === 'function' ? patch(original.state) : patch),
        };
        done?.();
      };
      current = () => original.state;
      select = (i) => {
        original.setData('Loading changelog data...');
        original.setSelectedIndex(i);
        original.getData(context.data.dates[i]);
      };
      stop = () => original.componentWillUnmount();
      original.componentDidMount();
    } else {
      controller = createController({
        dates: context.data.dates,
        action,
        resolveAsset: (name) => resolveAsset(name),
        fetch,
        schedule,
        cancel,
      });
      current = controller.snapshot;
      select = controller.select;
      stop = controller.unmount;
      controller.mount();
    }
    await settle();
    const initial = current().data;
    if (scenario === 'race') {
      select(1);
      select(0);
      await settle();
      a.resolve(body('{invalid: []}'));
      b.reject(Error('old failure'));
      await settle();
    }
    if (scenario === 'body') {
      select(1);
      await settle();
      a.resolve('Cannot find stale body');
      await settle();
    }
    if (scenario === 'unmount') {
      stop();
      a.resolve(body(JSON.stringify(sample)));
      await settle();
    }
    while (timers.size) {
      const [id, fn] = [...timers][0];
      timers.delete(id);
      fn();
      await settle();
    }
    const result = {
      data: current().data,
      initial,
      calls,
      urls,
      delays,
      timers: timers.size,
    };
    stop();
    return result;
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.setTimeout = oldSet;
    globalThis.clearTimeout = oldClear;
  }
}
for (const scenario of [
  'terminal',
  'race',
  'invalid',
  'body',
  'unmount',
] as const) {
  test(`original observable loader parity: ${scenario}`, async () => {
    expect(await lifecycle('candidate', scenario)).toEqual(
      await lifecycle('original', scenario),
    );
  });
}

test('projection matches actual production rendered scalars, order, duplicates and exact credits', async () => {
  context = { data: { dates: [] }, act() {} };
  const original: any = new Changelog({});
  original.state.data = sample;
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(original.render());
  const candidate = document.createElement('div');
  candidate.innerHTML = await Bun.file(
    new URL('credits.html', import.meta.url),
  ).text();
  const normalize = (text: string | null | undefined) =>
    text?.replace(/\s+/g, ' ').trim();
  expect(normalize(candidate.textContent)).toBe(
    normalize(container.querySelector('.Changelog__credits')!.textContent)!,
  );
  expect(
    [...candidate.querySelectorAll('a')].map((a) => a.getAttribute('href')),
  ).toEqual(
    [...container.querySelectorAll('.Changelog__credits a')].map((a) =>
      a.getAttribute('href'),
    ),
  );
  expect(
    project({ data: sample, query: '', selectedIndex: 0 }).days.flatMap((d) =>
      d.authors.flatMap((a) => a.rows.map((r) => r.text)),
    ),
  ).toEqual(
    [...container.querySelectorAll('.Changelog__description')].map(
      (node) => node.textContent,
    ),
  );
  original.state.query = 'true';
  container.innerHTML = renderToStaticMarkup(original.render());
  const projection = project({ data: sample, query: 'true', selectedIndex: 0 });
  expect(projection.summary).toBe(
    normalize(
      container.querySelector('.Changelog__search-summary')!.textContent,
    )!,
  );
  expect(projection.days[0].authors[0].rows[0].text).toBe('');
});

test('captured action callback, fresh retry resolution, stale timer and query lifetime', async () => {
  const timers: Array<() => void> = [];
  const cancelled: unknown[] = [];
  const calls: string[] = [];
  const urls: string[] = [];
  let serial = 0;
  const deps = {
    dates: ['2026-10'],
    action: () => {
      calls.push('first');
    },
    resolveAsset: (name: string) => `${name}:${++serial}`,
    fetch: async (url: string) => {
      urls.push(url);
      return body('Cannot find sample');
    },
    schedule(fn: () => void) {
      timers.push(fn);
      return timers.length;
    },
    cancel(id: unknown) {
      cancelled.push(id);
    },
  };
  const controller = createController(deps);
  controller.mount();
  controller.query('retained');
  await settle();
  deps.action = () => {
    calls.push('replacement');
  };
  const stale = timers[0];
  timers[0]();
  await settle();
  expect(calls).toEqual(['first', 'first']);
  expect(urls).toEqual(['2026-10.yml:1', '2026-10.yml:2']);
  controller.select(0);
  await settle();
  stale();
  await settle();
  expect(calls).toEqual(['first', 'first', 'replacement']);
  expect(controller.snapshot().query).toBe('retained');
  expect(cancelled.length).toBeGreaterThan(0);
  controller.unmount();
  timers.at(-1)!();
  await settle();
  expect(calls).toHaveLength(3);
});

type TimerCallback = () => void;
