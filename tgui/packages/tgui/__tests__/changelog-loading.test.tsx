import { spawnSync } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';

import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Isolate the layout module mock from the rest of the Bun test process.
// Changelog itself, React, backend and asset resolution remain production code.
if (!process.env.TGUI_CHANGELOG_TEST_CHILD) {
  test('mounted changelog loading lifecycle (isolated layout shell)', () => {
    const result = spawnSync(process.execPath, ['test', import.meta.path], {
      cwd: resolvePath(import.meta.dir, '../../..'),
      timeout: 30000,
      env: { ...process.env, TGUI_CHANGELOG_TEST_CHILD: '1' },
      encoding: 'utf8',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
    expect(result.status).toBe(0);
  });
} else {
  const WindowShell = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  WindowShell.Content = WindowShell;
  mock.module('../layouts', () => ({ Window: WindowShell }));
  // Real backend/assets avoid process-wide module mock contamination.
  const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  Reflect.set(globalThis, 'Byond', { windowId: 'changelog-loading' });
  const backend = await import('../backend');
  const { Changelog } = await import('../interfaces/Changelog');
  if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
  else Reflect.deleteProperty(globalThis, 'Byond');

  type BackendState = NonNullable<Parameters<typeof backend.backendReducer>[0]>;
  const dates = ['2026-10', '2026-09'];

  const response = (text: string) =>
    ({ text: () => Promise.resolve(text) }) as Response;
  const archive = (message: string) =>
    `2026-10-01:
  Tester:
    - bugfix: ${message}
`;
  let previousStore: Store;
  let previousByond: PropertyDescriptor | undefined;
  let previousHtmlClass: string;
  let container: HTMLDivElement;
  let root: Root;
  let sendMessage: ReturnType<typeof mock>;
  let fetchMock: ReturnType<typeof spyOn>;
  let timeoutMock: ReturnType<typeof spyOn>;
  let clearTimeoutMock: ReturnType<typeof spyOn>;
  let retries: Map<number, () => void>;
  let retryDelays: number[];
  let nextTimer: number;
  const env = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  let previousActEnvironment: boolean | undefined;

  beforeEach(() => {
    previousActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT = true;
    previousHtmlClass = document.documentElement.className;
    previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
    sendMessage = mock();
    Reflect.set(globalThis, 'Byond', {
      windowId: 'changelog-loading',
      sendMessage,
      winset: mock(() => Promise.resolve()),
    });
    previousStore = backend.globalStore;
    const store = createStore<{
      backend: BackendState;
      debug: Record<string, never>;
    }>((state, action) => ({
      backend: backend.backendReducer(state?.backend, action) as BackendState,
      debug: {},
    }));
    backend.setGlobalStore(store);
    store.dispatch(backend.backendUpdate({ data: { dates } }));
    fetchMock = spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise<Response>(() => {}),
    );
    retries = new Map();
    retryDelays = [];
    nextTimer = 100000;
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    // Capture only changelog backoff; React/Window scheduling stays real.
    timeoutMock = spyOn(globalThis, 'setTimeout').mockImplementation(((
      callback,
      delay,
      ...args
    ) => {
      if (typeof callback === 'function' && delay >= 100 && delay <= 350) {
        const id = nextTimer++;
        retries.set(id, () => callback(...args));
        retryDelays.push(delay);
        return id;
      }
      return realSetTimeout(callback, delay, ...args);
    }) as typeof setTimeout);
    clearTimeoutMock = spyOn(globalThis, 'clearTimeout').mockImplementation(((
      id,
    ) => {
      if (retries.delete(Number(id))) return;
      realClearTimeout(id);
    }) as typeof clearTimeout);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    retries.clear();
    timeoutMock.mockRestore();
    clearTimeoutMock.mockRestore();
    fetchMock.mockRestore();
    backend.setGlobalStore(previousStore);
    if (previousByond) {
      Object.defineProperty(globalThis, 'Byond', previousByond);
    } else Reflect.deleteProperty(globalThis, 'Byond');
    document.documentElement.className = previousHtmlClass;
    env.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });
  const render = async () => {
    await act(async () => root.render(<Changelog />));
  };
  const click = async (label: string) => {
    const element = container.querySelector<HTMLElement>(
      `[aria-label="${label}"]`,
    );
    if (!element) throw new Error(`Missing ${label}`);
    await act(async () => element.click());
  };
  const status = () =>
    container.querySelector('.Changelog__status')?.textContent;
  const descriptions = () =>
    Array.from(
      container.querySelectorAll('.Changelog__description'),
      (cell) => cell.textContent,
    );
  const calls = () =>
    sendMessage.mock.calls.filter(([type]) => type === 'act/get_month');
  const retry = async () => {
    expect(retries.size).toBe(1);
    const [id, callback] = [...retries][0];
    retries.delete(id);
    await act(async () => callback());
  };

  for (const failure of ['network', 'body', 'yaml'] as const) {
    test(`${failure} failure retries and recovers through the mounted component`, async () => {
      fetchMock
        .mockImplementationOnce(() => {
          if (failure === 'network') {
            return Promise.reject(new Error('Network unavailable'));
          }
          if (failure === 'body') {
            return Promise.resolve({
              text: () => Promise.reject(new Error('Body unavailable')),
            } as Response);
          }
          return Promise.resolve(response('invalid: [unterminated'));
        })
        .mockResolvedValue(response(archive('Recovered archive')));
      await render();
      await retry();
      expect(descriptions()).toContain('Recovered archive');
      expect(status()).toBeUndefined();
      expect(calls()).toEqual([
        ['act/get_month', { date: dates[0] }],
        ['act/get_month', { date: dates[0] }],
      ]);
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        `${dates[0]}.yml`,
        `${dates[0]}.yml`,
      ]);
      expect(retries.size).toBe(0);
    });
  }

  test('missing assets stop after exactly six requests and expose the existing failure text', async () => {
    fetchMock.mockResolvedValue(response('Cannot find archive'));
    await render();
    for (let index = 0; index < 6 && retries.size; index++) await retry();
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(calls()).toEqual(
      Array.from({ length: 6 }, () => ['act/get_month', { date: dates[0] }]),
    );
    expect(status()).toBe('Failed to load data after 6 attempts');
    expect(retries.size).toBe(0);
    expect(retryDelays.slice(0, 5)).toEqual([100, 150, 200, 250, 300]);
  });

  test('A/B/A navigation rejects an older response for the same date', async () => {
    const oldA = deferred<Response>();
    fetchMock
      .mockImplementationOnce(() => oldA.promise)
      .mockResolvedValueOnce(response(archive('September archive')))
      .mockResolvedValueOnce(response(archive('Current October archive')));
    await render();
    await click('Older month');
    await click('Newer month');
    await act(async () =>
      oldA.resolve(response(archive('Obsolete October archive'))),
    );
    expect(descriptions()).toContain('Current October archive');
    expect(descriptions()).not.toContain('Obsolete October archive');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(retries.size).toBe(0);
  });

  test('A/B/A navigation rejects an older body completion for the same date', async () => {
    const oldBody = deferred<string>();
    fetchMock
      .mockResolvedValueOnce({ text: () => oldBody.promise } as Response)
      .mockResolvedValueOnce(response(archive('September archive')))
      .mockResolvedValueOnce(response(archive('Current October archive')));
    await render();
    await click('Older month');
    await click('Newer month');
    await act(async () => oldBody.resolve('Cannot find obsolete archive'));
    expect(descriptions()).toContain('Current October archive');
    expect(retries.size).toBe(0);
    expect(calls()).toHaveLength(3);
  });

  test('switching dates cancels pending retries, including already queued callbacks after A/B/A', async () => {
    fetchMock
      .mockResolvedValueOnce(response('Cannot find archive'))
      .mockResolvedValue(response(archive('Current archive')));
    await render();
    expect(retries.size).toBe(1);
    const obsoleteCallback = [...retries.values()][0];
    await click('Older month');
    expect(retries.size).toBe(0);
    await click('Newer month');
    await act(async () => obsoleteCallback());
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(calls()).toHaveLength(3);
    expect(descriptions()).toContain('Current archive');
  });

  test('unmount cancels retries and old callbacks cannot affect a reopened changelog', async () => {
    fetchMock
      .mockResolvedValueOnce(response('Cannot find archive'))
      .mockResolvedValue(response(archive('Reopened archive')));
    await render();
    const obsoleteCallback = [...retries.values()][0];
    expect(obsoleteCallback).toBeFunction();
    await act(async () => root.render(null));
    expect(retries.size).toBe(0);
    await render();
    await act(async () => obsoleteCallback());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(calls()).toHaveLength(2);
    expect(descriptions()).toContain('Reopened archive');
  });

  test('in-flight completion after unmount does not schedule retries after reopen', async () => {
    const oldRequest = deferred<Response>();
    fetchMock
      .mockImplementationOnce(() => oldRequest.promise)
      .mockResolvedValue(response(archive('Reopened archive')));
    await render();
    await act(async () => root.render(null));
    await render();
    await act(async () => oldRequest.resolve(response('Cannot find archive')));
    expect(retries.size).toBe(0);
    expect(calls()).toHaveLength(2);
    expect(descriptions()).toContain('Reopened archive');
  });
  for (const failure of ['network', 'body', 'yaml'] as const) {
    test(`repeated ${failure} failures are bounded to six attempts`, async () => {
      fetchMock.mockImplementation(() => {
        if (failure === 'network') {
          return Promise.reject(new Error('Network unavailable'));
        }
        if (failure === 'body') {
          return Promise.resolve({
            text: () => Promise.reject(new Error('Body unavailable')),
          } as Response);
        }
        return Promise.resolve(response('invalid: [unterminated'));
      });
      await render();
      for (let index = 0; index < 6 && retries.size; index++) {
        await retry();
      }
      expect(fetchMock).toHaveBeenCalledTimes(6);
      expect(calls()).toHaveLength(6);
      expect(status()).toBe('Failed to load data after 6 attempts');
      expect(retries.size).toBe(0);
    });
  }

  test('empty date lists do not request an archive', async () => {
    backend.globalStore.dispatch(
      backend.backendUpdate({ data: { dates: [] } }),
    );
    await render();
    expect(status()).toBe('No changelog archives are available.');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls()).toHaveLength(0);
    expect(retries.size).toBe(0);
  });
  for (const stage of ['fetch', 'body'] as const) {
    test(`stale ${stage} rejection after unmount cannot retry into a reopened window`, async () => {
      const oldFetch = deferred<Response>();
      const oldBody = deferred<string>();
      fetchMock
        .mockImplementationOnce(() =>
          stage === 'fetch'
            ? oldFetch.promise
            : Promise.resolve({ text: () => oldBody.promise } as Response),
        )
        .mockResolvedValue(response(archive('Reopened archive')));
      await render();
      await act(async () => root.render(null));
      await render();
      await act(async () => {
        if (stage === 'fetch') oldFetch.reject(new Error('Stale fetch failed'));
        else oldBody.reject(new Error('Stale body failed'));
      });
      expect(retries.size).toBe(0);
      expect(calls()).toHaveLength(2);
      expect(descriptions()).toContain('Reopened archive');
    });
  }

  test('an obsolete queued callback cannot consume or clear the current request retry', async () => {
    fetchMock
      .mockResolvedValueOnce(response('Cannot find first archive'))
      .mockResolvedValueOnce(response('Cannot find second archive'))
      .mockResolvedValue(response(archive('Current archive')));
    await render();
    const obsoleteCallback = [...retries.values()][0];
    await click('Older month');
    const currentRetry = [...retries.entries()][0];
    await act(async () => obsoleteCallback());
    expect([...retries.entries()]).toEqual([currentRetry]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await retry();
    expect(calls()).toEqual([
      ['act/get_month', { date: dates[0] }],
      ['act/get_month', { date: dates[1] }],
      ['act/get_month', { date: dates[1] }],
    ]);
    expect(descriptions()).toContain('Current archive');
    expect(retries.size).toBe(0);
  });
  const searchInput = () => {
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search this month"]',
    );
    if (!input) throw new Error('Missing labeled current-month search input');
    return input;
  };
  const enterSearch = async (value: string) => {
    await act(async () => {
      searchInput().focus();
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(searchInput(), value);
      searchInput().dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const searchCount = () =>
    container.querySelector('.Changelog__matchCount')?.textContent;
  const noResults = () =>
    container.querySelector('.Changelog__noResults')?.textContent;
  const richArchive = `2026-10-01:
  Alice:
    - bugfix: Fixed iron gates
    - rscadd: Added BLUE lamps
  Bob:
    - map: Moved the harbor
2026-10-03:
  Carla:
    - sound: Quiet gates
`;

  test('real search input filters author, category and text without backend requests, and Clear restores focus', async () => {
    fetchMock.mockResolvedValue(response(richArchive));
    await render();
    const original = descriptions();
    expect(original).toEqual([
      'Quiet gates',
      'Fixed iron gates',
      'Added BLUE lamps',
      'Moved the harbor',
    ]);
    const originalCalls = sendMessage.mock.calls.slice();
    await enterSearch('  ALICE  ');
    expect(descriptions()).toEqual(['Fixed iron gates', 'Added BLUE lamps']);
    expect(searchCount()).toMatch(/2.*4/);
    await enterSearch('BUGFIX');
    expect(descriptions()).toEqual(['Fixed iron gates']);
    await enterSearch('gates');
    expect(descriptions()).toEqual(['Quiet gates', 'Fixed iron gates']);
    await enterSearch('nobody-matches-this');
    expect(descriptions()).toEqual([]);
    expect(searchCount()).toMatch(/0.*4/);
    expect(noResults()).toBeTruthy();
    expect(container.querySelectorAll('.Changelog__day')).toHaveLength(0);
    expect(
      container.querySelector('.Changelog__credits')?.textContent,
    ).toContain('Credits & licenses');
    await click('Clear search');
    expect(searchInput().value).toBe('');
    expect(document.activeElement).toBe(searchInput());
    expect(descriptions()).toEqual(original);
    expect(noResults()).toBeUndefined();
    for (const query of ['blue', 'BUGFIX']) {
      await enterSearch(query);
      expect(descriptions()).toHaveLength(1);
      const oldInput = searchInput();
      await click('Clear search');
      expect(searchInput().value).toBe('');
      expect(document.activeElement).toBe(searchInput());
      expect(oldInput.isConnected).toBe(false);
      expect(descriptions()).toEqual(original);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls).toEqual(originalCalls);
  });

  test('Enter and Escape preserve the typed filter and do not request data', async () => {
    fetchMock.mockResolvedValue(response(richArchive));
    await render();
    const originalCalls = sendMessage.mock.calls.slice();
    for (const key of ['Enter', 'Escape']) {
      await enterSearch('blue');
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
      });
      await act(async () => {
        searchInput().dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).not.toBe(searchInput());
      expect(searchInput().value).toBe('blue');
      expect(descriptions()).toEqual(['Added BLUE lamps']);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls).toEqual(originalCalls);
  });

  test('query survives month navigation, loading, terminal error and recovery with no stale match status', async () => {
    const september = deferred<Response>();
    fetchMock
      .mockResolvedValueOnce(response(richArchive))
      .mockImplementationOnce(() => september.promise)
      .mockResolvedValue(response('Cannot find archive'));
    await render();
    await enterSearch('gates');
    expect(searchCount()).toMatch(/2.*4/);
    await click('Older month');
    expect(searchInput().value).toBe('gates');
    expect(status()).toContain('Loading changelog data');
    expect(searchCount()).toBeUndefined();
    expect(noResults()).toBeUndefined();
    expect(descriptions()).toEqual([]);
    await enterSearch('blue');
    expect(calls()).toHaveLength(2);
    await act(async () => september.resolve(response('Cannot find archive')));
    for (let index = 0; index < 6 && retries.size; index++) await retry();
    expect(status()).toBe('Failed to load data after 6 attempts');
    expect(searchInput().value).toBe('blue');
    expect(searchCount()).toBeUndefined();
    expect(noResults()).toBeUndefined();
    expect(container.querySelector('.Changelog__credits')).not.toBeNull();
    expect(calls()).toHaveLength(7);
    await enterSearch('gates');
    expect(calls()).toHaveLength(7);
    fetchMock.mockResolvedValue(response(richArchive));
    await click('Newer month');
    expect(searchInput().value).toBe('gates');
    expect(descriptions()).toEqual(['Quiet gates', 'Fixed iron gates']);
    expect(searchCount()).toMatch(/2.*4/);
    expect(status()).toBeUndefined();
    expect(calls()).toHaveLength(8);
    expect(calls().map(([, data]) => data.date)).toEqual([
      dates[0],
      ...Array(6).fill(dates[1]),
      dates[0],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  test('filter applies to the newly loaded month rather than cached prior rows', async () => {
    const september = deferred<Response>();
    fetchMock
      .mockResolvedValueOnce(response(richArchive))
      .mockImplementationOnce(() => september.promise);
    await render();
    await enterSearch('gates');
    await click('Older month');
    await act(async () =>
      september.resolve(response(archive('September gates repaired'))),
    );
    expect(searchInput().value).toBe('gates');
    expect(descriptions()).toEqual(['September gates repaired']);
    expect(searchCount()).toMatch(/1.*1/);
    expect(calls()).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('whitespace restores every row and an empty loaded archive supports search without requests', async () => {
    fetchMock
      .mockResolvedValueOnce(response(richArchive))
      .mockResolvedValue(response('{}'));
    await render();
    const original = descriptions();
    await enterSearch('missing');
    await enterSearch('   ');
    expect(descriptions()).toEqual(original);
    expect(noResults()).toBeUndefined();
    await click('Older month');
    await enterSearch('missing');
    expect(descriptions()).toEqual([]);
    expect(searchCount()).toMatch(/0.*0/);
    expect(noResults()).toBeTruthy();
    expect(container.querySelector('.Changelog__credits')).not.toBeNull();
    expect(calls()).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('a reopened window starts unfiltered rather than retaining the previous session query', async () => {
    fetchMock.mockResolvedValue(response(richArchive));
    await render();
    await enterSearch('blue');
    expect(descriptions()).toEqual(['Added BLUE lamps']);
    await act(async () => root.render(null));
    await render();
    expect(searchInput().value).toBe('');
    expect(descriptions()).toHaveLength(4);
    expect(calls()).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
}
