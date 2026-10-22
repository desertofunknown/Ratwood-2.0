import { originalByond, originalContext } from './import-environment';

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test';
import {
  createElement,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { tick } from 'svelte';

import {
  applyMiddleware,
  createStore,
} from '../../../../packages/common/redux';
import type { WorkbenchData, WorkbenchRecipe } from '../../model';
import type { WorkbenchAction } from '../../Workbench';
import { mountWorkbench } from '../adapter';
import { ReactWorkbenchHost, type WorkbenchMount } from '../ReactHost';
import { observeWorkbenchLifetime } from './lifetime';

// Backend drag module reads Byond.windowId at import time. This child never loads
// helpers.js, creates a native subscription, opens a socket, or starts a server.
import * as backend from '../../../../packages/tgui/backend';
import { Window } from '../../../../packages/tgui/layouts/Window';
import { cancelWindowInteraction } from '../../../../packages/tgui/drag';
import { storage } from '../../../../packages/common/storage';
if (originalByond) Object.defineProperty(globalThis, 'Byond', originalByond);
else Reflect.deleteProperty(globalThis, 'Byond');
if (originalContext)
  Object.defineProperty(
    globalThis,
    '__disconnectedWebpackContext',
    originalContext,
  );
else Reflect.deleteProperty(globalThis, '__disconnectedWebpackContext');

const recipe = (
  name: string,
  path: string,
  req_text = '1 Iron',
): WorkbenchRecipe => ({ name, path, req_text });
const data = (): WorkbenchData => ({
  crafting_recipes: {
    General: {
      awl: recipe('Awl', '/awl'),
      silk: recipe('Ribbon', '/ribbon/silk'),
      hemp: recipe('Ribbon', '/ribbon/hemp', '2 Hemp'),
    },
  },
  craftability: { Awl: 1, Ribbon: 1 },
  showonlycraftable: false,
});
const config = () => ({
  title: 'crafting fixture',
  status: 2,
  interface: { name: 'MiaCraft', layout: 'Window' },
  window: { key: 'workbench-a', fancy: false, scale: false, locked: false },
  user: { observer: 0 },
});
const settle = async () => {
  await tick();
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  await tick();
};
let byond: {
  windowId: string;
  winset: ReturnType<typeof mock>;
  winget: ReturnType<typeof mock>;
  sendMessage: ReturnType<typeof mock>;
  subscribe: ReturnType<typeof mock>;
};
let previousByond: PropertyDescriptor | undefined;
let previousStore: typeof backend.globalStore;
let previousFocus: HTMLElement | null;
let previousClass: string;
let previousBodyStyle: string | null;
let previousRootStyle: string | null;
let hasFocus: ReturnType<typeof spyOn>;
let fixture: ReturnType<typeof makeFixture> | undefined;

beforeEach(() => {
  previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  previousStore = backend.globalStore;
  previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  previousClass = document.documentElement.className;
  previousBodyStyle = document.body.getAttribute('style');
  previousRootStyle = document.documentElement.getAttribute('style');
  hasFocus = spyOn(document, 'hasFocus').mockReturnValue(false);
  byond = {
    windowId: 'disconnected-workbench',
    winset: mock(() => Promise.resolve()),
    winget: mock(() => Promise.resolve({ x: 0, y: 0 })),
    sendMessage: mock(),
    subscribe: mock(() => {
      throw new Error(
        'Native transport subscription forbidden in this disconnected fixture',
      );
    }),
  };
  Reflect.set(globalThis, 'Byond', byond);
});
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
  cancelWindowInteraction();
  await settle();
  expect(byond.subscribe).not.toHaveBeenCalled();
  hasFocus.mockRestore();
  backend.setGlobalStore(previousStore);
  document.documentElement.className = previousClass;
  if (previousBodyStyle === null) document.body.removeAttribute('style');
  else document.body.setAttribute('style', previousBodyStyle);
  if (previousRootStyle === null)
    document.documentElement.removeAttribute('style');
  else document.documentElement.setAttribute('style', previousRootStyle);
  if (previousFocus?.isConnected) previousFocus.focus();
  if (previousByond) Object.defineProperty(globalThis, 'Byond', previousByond);
  else Reflect.deleteProperty(globalThis, 'Byond');
});
afterAll(async () => {
  await storage.clear();
});

function makeFixture({
  shell = false,
  mountOverride,
}: { shell?: boolean; mountOverride?: WorkbenchMount } = {}) {
  // Match the production Store's intentionally dynamic backend data envelope.
  const store = createStore<any>(
    (state, action) => ({
      backend: backend.backendReducer(state?.backend, action),
      debug: {},
    }),
    applyMiddleware(backend.backendMiddleware),
  );
  let subscriptions = 0;
  const subscribe = store.subscribe;
  store.subscribe = (listener) => {
    subscriptions++;
    const remove = subscribe(listener);
    let removed = false;
    return () => {
      if (!removed) {
        removed = true;
        subscriptions--;
        remove();
      }
    };
  };
  backend.setGlobalStore(store);
  // Install this tiny synchronous observer before React's ordinary StoreRoot.
  const lifetime = observeWorkbenchLifetime(store);
  const target = document.createElement('div');
  document.body.append(target);
  const root = createRoot(target);
  const actions: WorkbenchAction[] = [];
  const errors: unknown[] = [];
  const deliveries: WorkbenchData[] = [];
  const retired: Promise<unknown>[] = [];
  let mounts = 0;
  let unmounts = 0;
  let callback: WorkbenchAction = backend.sendAct;
  let rootDisposed = false;
  const mount: WorkbenchMount = (node, snapshot, action) => {
    mounts++;
    actions.push(action);
    const mounted = (mountOverride ?? mountWorkbench)(node, snapshot, action);
    return {
      update(next) {
        deliveries.push(next);
        return mounted.update(next);
      },
      unmount() {
        unmounts++;
        const pending = mounted.unmount();
        // Keep every teardown observable without swallowing its rejection.
        retired.push(Promise.resolve(pending).catch(() => undefined));
        return pending;
      },
    };
  };
  function StoreRoot() {
    const state = useSyncExternalStore(store.subscribe, store.getState).backend;
    const child = createElement(ReactWorkbenchHost, {
      snapshot: state.data,
      onAction: callback,
      active: lifetime.active,
      epoch: lifetime.epoch,
      isCurrent: lifetime.isCurrent,
      onError: (error: unknown) => errors.push(error),
      mount,
    });
    return shell
      ? createElement(
          Window,
          null,
          createElement(Window.Content, { scrollable: true }, child),
        )
      : child;
  }
  const render = (next = callback) => {
    callback = next;
    flushSync(() => root.render(createElement(StoreRoot)));
  };
  const update = async (payload: object) => {
    flushSync(() => store.dispatch({ type: 'update', payload }));
    await tick();
  };
  const start = async (
    payload: object = { config: config(), data: data() },
  ) => {
    render();
    await update(payload);
  };
  const disposeRoot = () => {
    if (rootDisposed) return;
    rootDisposed = true;
    flushSync(() => root.unmount());
  };
  const dispose = async () => {
    disposeRoot();
    lifetime.dispose();
    lifetime.dispose();
    // Real acknowledgement clears the real middleware's retry/payload timers.
    store.dispatch({ type: 'suspend' });
    await Promise.all(retired);
    await settle();
    target.remove();
    expect(subscriptions).toBe(0);
  };
  return {
    store,
    lifetime,
    target,
    render,
    start,
    update,
    disposeRoot,
    dispose,
    actions,
    errors,
    deliveries,
    get mounts() {
      return mounts;
    },
    get unmounts() {
      return unmounts;
    },
    get subscriptions() {
      return subscriptions;
    },
  };
}
const rows = () => [
  ...fixture!.target.querySelectorAll<HTMLButtonElement>('.Workbench__recipe'),
];
const names = () =>
  rows().map(
    (row) => row.querySelector('.Workbench__recipe-name')!.textContent,
  );
const button = (label: string) => {
  const result = [
    ...fixture!.target.querySelectorAll<HTMLButtonElement>('button'),
  ].find((node) => node.textContent === label);
  if (!result) throw new Error(`Missing button ${label}`);
  return result;
};
const click = async (node: HTMLElement) => {
  node.click();
  await tick();
};
const open = async (name: string, variant = 0) => {
  const result = rows().filter(
    (row) => row.querySelector('.Workbench__recipe-name')!.textContent === name,
  )[variant];
  if (!result) throw new Error(`Missing recipe ${name}`);
  await click(result);
};
const acts = () =>
  byond.sendMessage.mock.calls.filter(
    ([type]) => typeof type === 'string' && type.startsWith('act/'),
  );

test('REPRO: commit-only observation misses synchronous suspend/resume', async () => {
  fixture = makeFixture();
  const { store } = fixture;
  const target = document.createElement('div');
  fixture.target.append(target);
  const root = createRoot(target);
  let firstAction: WorkbenchAction | undefined;
  let mounts = 0;
  const pending: Promise<void>[] = [];
  function NaiveHost() {
    const state = useSyncExternalStore(store.subscribe, store.getState).backend;
    const node = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
      if (state.suspended) return;
      let active = true;
      const action: WorkbenchAction = (name, payload) => {
        if (active) backend.sendAct(name, payload);
      };
      firstAction ??= action;
      mounts++;
      const mounted = mountWorkbench(node.current!, state.data, action);
      return () => {
        active = false;
        pending.push(mounted.unmount());
      };
    }, [state.suspended]);
    return createElement('div', { ref: node });
  }
  try {
    store.dispatch({
      type: 'update',
      payload: { config: config(), data: data() },
    });
    flushSync(() => root.render(createElement(NaiveHost)));
    await tick();
    flushSync(() => {
      store.dispatch({ type: 'suspend' });
      store.dispatch({ type: 'update', payload: { data: data() } });
    });
    await tick();
    firstAction!('craft', { item: '/stale' });
    // Deliberately assert the unsafe baseline; the guarded counterpart follows.
    expect(mounts).toBe(1);
    expect(acts()).toEqual([['act/craft', { item: '/stale' }]]);
    console.log(
      'REPRO CONFIRMED: commit-only host retains the stale pre-suspend action.',
    );
  } finally {
    flushSync(() => root.unmount());
    await Promise.all(pending);
    target.remove();
  }
});

describe('disconnected React-owned Svelte bridge', () => {
  test('starts suspended, tolerates missing recipes, and does not double-render initial data', async () => {
    fixture = makeFixture();
    fixture.render();
    expect(fixture.mounts).toBe(0);
    await fixture.update({ config: config(), data: { craftability: {} } });
    expect(names()).toEqual([]);
    expect(fixture.mounts).toBe(1);
    expect(fixture.deliveries).toHaveLength(0);
    await fixture.update({
      static_data: { crafting_recipes: data().crafting_recipes },
    });
    expect(names()).toEqual(['Awl', 'Ribbon', 'Ribbon']);
    expect(fixture.mounts).toBe(1);
  });

  test('passes merged static/dynamic/config updates, including explicit same-object mutation', async () => {
    fixture = makeFixture();
    await fixture.start({
      config: config(),
      static_data: { crafting_recipes: data().crafting_recipes },
      data: { craftability: { Awl: 1 }, showonlycraftable: false },
    });
    await open('Awl');
    const merged = fixture.store.getState().backend.data;
    merged.crafting_recipes.General.awl.req_text = '9 Fresh Iron';
    merged.craftability.Awl = 0;
    await fixture.update({ config: { title: 'new title' } });
    expect(fixture.store.getState().backend.data).toBe(merged);
    expect(fixture.target.textContent).toContain('9 Fresh Iron');
    expect(fixture.target.textContent).toContain(
      'Material match: not reported',
    );
    expect(fixture.deliveries).toHaveLength(1);
    await fixture.update({ data: { showonlycraftable: true } });
    expect(names()).toEqual([]);
    expect(fixture.store.getState().backend.data.crafting_recipes).toBe(
      merged.crafting_recipes,
    );
    expect(fixture.mounts).toBe(1);
    expect(fixture.errors).toEqual([]);
  });

  test('latest rapid deliveries win without skipping explicitly committed same-object deliveries', async () => {
    fixture = makeFixture();
    await fixture.start();
    const merged = fixture.store.getState().backend.data;
    for (let index = 0; index < 3; index++) {
      merged.crafting_recipes.General.awl.name = `Awl ${index}`;
      fixture.render();
    }
    await tick();
    expect(names()[0]).toBe('Awl 2');
    expect(fixture.deliveries).toHaveLength(3);
    flushSync(() => {
      fixture!.store.dispatch({
        type: 'update',
        payload: {
          data: {
            crafting_recipes: { Latest: [recipe('Earlier', '/earlier')] },
          },
        },
      });
      fixture!.store.dispatch({
        type: 'update',
        payload: {
          data: { crafting_recipes: { Latest: [recipe('Latest', '/latest')] } },
        },
      });
    });
    await tick();
    expect(names()).toEqual(['Latest']);
    expect(fixture.mounts).toBe(1);
  });

  test('same-name distinct paths retain exact craft 1/2/3/5/repeat/filter sendAct payloads', async () => {
    fixture = makeFixture();
    await fixture.start();
    await open('Ribbon', 1);
    for (const label of ['Craft 1', 'Craft 2', 'Craft 3', 'Craft 5', 'Repeat'])
      await click(button(label));
    const checkbox = fixture.target.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    await click(checkbox);
    expect(checkbox.checked).toBe(false);
    expect(acts()).toEqual([
      ['act/craft', { item: '/ribbon/hemp' }],
      ['act/craft', { item: '/ribbon/hemp', amount: 2 }],
      ['act/craft', { item: '/ribbon/hemp', amount: 3 }],
      ['act/craft', { item: '/ribbon/hemp', amount: 5 }],
      ['act/craft', { item: '/ribbon/hemp', auto: true }],
      ['act/checkboxonlycraftable', { state: true }],
    ]);
    await fixture.update({ data: { showonlycraftable: true } });
    expect(checkbox.checked).toBe(true);
    await click(checkbox);
    expect(acts().at(-1)).toEqual([
      'act/checkboxonlycraftable',
      { state: false },
    ]);
    expect(checkbox.checked).toBe(true);
  });

  test('stable forwarder switches only to the latest committed callback and preserves payload identity', async () => {
    fixture = makeFixture();
    await fixture.start();
    const forward = fixture.actions[0];
    const first = mock();
    const second = mock((name: string, payload: object) =>
      backend.sendAct(name, payload),
    );
    fixture.render(first);
    fixture.render(second);
    const payload = { item: '/ribbon/silk', extra: { unchanged: true } };
    forward('craft', payload);
    expect(first).not.toHaveBeenCalled();
    expect(second.mock.calls[0][1]).toBe(payload);
    expect(byond.sendMessage.mock.calls.at(-1)![1]).toBe(payload);
    expect(fixture.actions).toHaveLength(1);
  });

  test('selected recipe removal closes details and fences detached recipe buttons', async () => {
    fixture = makeFixture();
    await fixture.start();
    await open('Awl');
    const stale = button('Craft 1');
    await fixture.update({
      static_data: { crafting_recipes: { Other: [recipe('New', '/new')] } },
    });
    expect(fixture.target.querySelector('.Workbench__requirements')).toBeNull();
    await click(stale);
    expect(acts()).toEqual([]);
    await open('New');
    await click(button('Craft 1'));
    expect(acts()).toEqual([['act/craft', { item: '/new' }]]);
  });

  test('real sendAct retains oversize negotiation instead of bypassing it', async () => {
    fixture = makeFixture();
    await fixture.start();
    const payload = { item: `/${'🧵'.repeat(300)}` };
    fixture.actions[0]('craft', payload);
    const [type, request] = byond.sendMessage.mock.calls.at(-1)!;
    expect(type).toBe('oversizedPayloadRequest');
    expect(acts()).toEqual([]);
    expect(
      Object.keys(fixture.store.getState().backend.outgoingPayloadQueues),
    ).toEqual([request.id]);
    fixture.store.dispatch({
      type: 'oversizePayloadResponse',
      payload: { id: request.id, allow: true },
    });
    const chunks: string[] = [];
    while (fixture.store.getState().backend.outgoingPayloadQueues[request.id]) {
      const [chunkType, chunk] = byond.sendMessage.mock.calls.at(-1)!;
      expect(chunkType).toBe('payloadChunk');
      chunks.push(chunk.chunk);
      fixture.store.dispatch({
        type: 'acknowlegePayloadChunk',
        payload: { id: request.id },
      });
    }
    expect(JSON.parse(chunks.join(''))).toEqual(payload);
    expect(chunks).toHaveLength(request.chunkCount);
  });

  test('suspendStart fences immediately; updates do not invent an acknowledgement; ack then resume remounts', async () => {
    fixture = makeFixture();
    await fixture.start();
    await open('Awl');
    const staleAction = fixture.actions[0];
    const staleButton = button('Craft 1');
    fixture.store.dispatch(backend.backendSuspendStart());
    staleAction('craft', { item: '/stale' });
    staleButton.click();
    expect(acts()).toEqual([]);
    expect(byond.sendMessage.mock.calls).toContainEqual(['suspend']);
    await fixture.update({ data: data() });
    expect(fixture.store.getState().backend.suspending).toBe(true);
    expect(fixture.target.querySelector('.Workbench')).toBeNull();
    fixture.store.dispatch({ type: 'suspend' });
    await fixture.update({ config: config(), data: data() });
    expect(fixture.mounts).toBe(2);
    staleAction('craft', { item: '/stale' });
    await click(staleButton);
    expect(acts()).toEqual([]);
    await open('Awl');
    await click(button('Craft 1'));
    expect(acts()).toEqual([['act/craft', { item: '/awl' }]]);
  });

  test('notification epoch fences synchronous suspend/resume even before a React commit', async () => {
    fixture = makeFixture();
    await fixture.start();
    await open('Awl');
    const old = fixture.actions[0];
    const staleButton = button('Craft 1');
    flushSync(() => {
      fixture!.store.dispatch({ type: 'suspend' });
      fixture!.store.dispatch({
        type: 'update',
        payload: { config: config(), data: data() },
      });
      old('craft', { item: '/stale-before-commit' });
      staleButton.click();
    });
    await tick();
    expect(acts()).toEqual([]);
    expect(fixture.mounts).toBe(2);
    old('craft', { item: '/stale-after-commit' });
    await click(staleButton);
    expect(acts()).toEqual([]);
    await open('Awl');
    await click(button('Craft 1'));
    expect(acts()).toEqual([['act/craft', { item: '/awl' }]]);
  });

  test('pooled key and interface round trips invalidate actions before commit and never resurrect them', async () => {
    fixture = makeFixture();
    await fixture.start();
    const old = fixture.actions[0];
    flushSync(() => {
      fixture!.store.dispatch({
        type: 'update',
        payload: {
          config: { window: { ...config().window, key: 'workbench-b' } },
        },
      });
      old('craft', { item: '/old-key' });
    });
    expect(fixture.mounts).toBe(2);
    const middle = fixture.actions[1];
    flushSync(() => {
      fixture!.store.dispatch({
        type: 'update',
        payload: { config: { interface: { name: 'Other', layout: 'Window' } } },
      });
      fixture!.store.dispatch({
        type: 'update',
        payload: { config: { interface: config().interface } },
      });
      middle('craft', { item: '/old-route' });
    });
    await tick();
    expect(fixture.mounts).toBe(3);
    expect(acts()).toEqual([]);
    await fixture.update({
      config: { interface: { name: 'Other', layout: 'Window' } },
    });
    expect(fixture.target.querySelector('.Workbench')).toBeNull();
    fixture.actions[2]('craft', { item: '/inactive-route' });
    expect(acts()).toEqual([]);
  });

  test('real config.refreshing route replacement fences a coalesced refresh round trip', async () => {
    fixture = makeFixture();
    await fixture.start();
    const old = fixture.actions[0];
    flushSync(() => {
      fixture!.store.dispatch({
        type: 'update',
        payload: { config: { refreshing: true } },
      });
      fixture!.store.dispatch({
        type: 'update',
        payload: { config: { refreshing: false } },
      });
      old('craft', { item: '/pre-refresh' });
    });
    await tick();
    expect(fixture.mounts).toBe(2);
    expect(acts()).toEqual([]);
    await fixture.update({ config: { refreshing: true } });
    expect(fixture.target.querySelector('.Workbench')).toBeNull();
    fixture.actions[1]('craft', { item: '/while-refreshing' });
    expect(acts()).toEqual([]);
  });

  test('mount failure is reported and detached; only a later explicit commit retries', async () => {
    const failure = new Error('expected fixture mount failure');
    let attempt = 0;
    fixture = makeFixture({
      mountOverride(node, snapshot, action) {
        if (attempt++ === 0) throw failure;
        return mountWorkbench(node, snapshot, action);
      },
    });
    await fixture.start();
    expect(fixture.errors).toEqual([failure]);
    expect(
      fixture.target.querySelector('[data-disconnected-workbench-host]')!
        .childElementCount,
    ).toBe(0);
    fixture.actions[0]('craft', { item: '/failed-mount' });
    expect(acts()).toEqual([]);
    fixture.render();
    await tick();
    expect(names()).toEqual(['Awl', 'Ribbon', 'Ribbon']);
    expect(fixture.mounts).toBe(2);
  });

  test('update rejection fences the uncertain generation and reports the failure', async () => {
    const failure = new Error('expected fixture update failure');
    fixture = makeFixture({
      mountOverride(node, snapshot, action) {
        const mounted = mountWorkbench(node, snapshot, action);
        return { ...mounted, update: () => Promise.reject(failure) };
      },
    });
    await fixture.start();
    const old = fixture.actions[0];
    fixture.render();
    await tick();
    expect(fixture.errors).toEqual([failure]);
    expect(fixture.target.querySelector('.Workbench')).toBeNull();
    old('craft', { item: '/failed-update' });
    expect(acts()).toEqual([]);
    expect(fixture.unmounts).toBe(1);
  });

  test('late update rejection cannot dispose or act through a newer generation', async () => {
    let reject: ((reason: unknown) => void) | undefined;
    let count = 0;
    fixture = makeFixture({
      mountOverride(node, snapshot, action) {
        const mounted = mountWorkbench(node, snapshot, action);
        const first = count++ === 0;
        return {
          ...mounted,
          update(next) {
            if (!first) return mounted.update(next);
            return new Promise<void>((_, fail) => {
              reject = fail;
            });
          },
        };
      },
    });
    await fixture.start();
    fixture.render();
    const old = fixture.actions[0];
    await fixture.update({
      config: { window: { ...config().window, key: 'replacement' } },
    });
    const replacement = fixture.target.querySelector('.Workbench');
    const failure = new Error('expected delayed update failure');
    reject!(failure);
    await tick();
    expect(fixture.errors).toEqual([failure]);
    expect(fixture.target.querySelector('.Workbench')).toBe(replacement);
    old('craft', { item: '/stale-update' });
    expect(acts()).toEqual([]);
    await open('Awl');
    await click(button('Craft 1'));
    expect(acts()).toEqual([['act/craft', { item: '/awl' }]]);
  });

  test('unmount during tick fences work; repeated dispose/remount does not accumulate subscriptions', async () => {
    fixture = makeFixture();
    for (let index = 0; index < 4; index++) {
      await fixture.start();
      expect(fixture.subscriptions).toBe(2);
      const old = fixture.actions[0];
      const merged = fixture.store.getState().backend.data;
      merged.crafting_recipes.General.awl.req_text = 'pending tick';
      fixture.render();
      fixture.disposeRoot();
      fixture.disposeRoot();
      old('craft', { item: '/after-unmount' });
      await fixture.dispose();
      expect(fixture.subscriptions).toBe(0);
      expect(fixture.unmounts).toBe(1);
      expect(fixture.errors).toEqual([]);
      expect(acts()).toEqual([]);
      fixture = makeFixture();
    }
  });

  test('late rejected disposal stays fenced and cannot remove a replacement subtree', async () => {
    let reject: ((reason: unknown) => void) | undefined;
    let count = 0;
    fixture = makeFixture({
      mountOverride(node, snapshot, action) {
        const mounted = mountWorkbench(node, snapshot, action);
        const first = count++ === 0;
        return {
          ...mounted,
          unmount() {
            const actual = mounted.unmount();
            if (!first) return actual;
            return actual.then(
              () =>
                new Promise<void>((_, fail) => {
                  reject = fail;
                }),
            );
          },
        };
      },
    });
    await fixture.start();
    const old = fixture.actions[0];
    await fixture.update({
      config: { window: { ...config().window, key: 'replacement' } },
    });
    await tick();
    expect(fixture.mounts).toBe(2);
    const replacement = fixture.target.querySelector('.Workbench');
    expect(replacement).not.toBeNull();
    const failure = new Error('expected fixture teardown failure');
    reject!(failure);
    await tick();
    old('craft', { item: '/disposed' });
    expect(acts()).toEqual([]);
    expect(fixture.errors).toEqual([failure]);
    expect(fixture.target.querySelector('.Workbench')).toBe(replacement);
  });
});

describe('real React Window shell, captured native calls only', () => {
  test('retains title, native visibility/close lifecycle, and observer dimmer thresholds', async () => {
    fixture = makeFixture({ shell: true });
    await fixture.start();
    await settle();
    expect(fixture.target.querySelector('.TitleBar__title')!.textContent).toBe(
      'Crafting Fixture',
    );
    expect(byond.winset.mock.calls).toContainEqual([
      byond.windowId,
      { 'is-visible': false },
    ]);
    expect(byond.winset.mock.calls).toContainEqual([
      byond.windowId,
      { 'is-visible': true },
    ]);
    expect(byond.sendMessage.mock.calls).toContainEqual(['visible']);
    expect(fixture.target.querySelector('.Window__dimmer')).toBeNull();
    // Existing policy: non-observer needs UI_INTERACTIVE (2), observer UI_DISABLED (0).
    for (const [observer, status, dimmer] of [
      [0, 1, true],
      [0, 0, true],
      [1, 0, false],
      [1, -1, true],
    ] as const) {
      await fixture.update({ config: { user: { observer }, status } });
      expect(Boolean(fixture.target.querySelector('.Window__dimmer'))).toBe(
        dimmer,
      );
    }
    // Neither sendAct nor this host adds status authorization; native pointer
    // blocking/server ui_act are separate. A DOM programmatic click is not hit testing.
    await open('Awl');
    await click(button('Craft 1'));
    expect(acts()).toEqual([['act/craft', { item: '/awl' }]]);
    await fixture.update({
      config: {
        window: { ...config().window, fancy: true },
        status: 2,
        user: { observer: 0 },
      },
    });
    await settle();
    const close = fixture.target.querySelector<HTMLElement>(
      '[aria-label="Close window"]',
    )!;
    expect(close).not.toBeNull();
    close.click();
    await settle();
    expect(fixture.store.getState().backend.suspending).toBe(true);
    fixture.store.dispatch({ type: 'suspend' });
    await settle();
    expect(fixture.target.querySelector('.Window')).toBeNull();
    expect(byond.winset.mock.calls.at(-1)).toEqual([
      byond.windowId,
      { 'is-visible': false },
    ]);
    expect(fixture.errors).toEqual([]);
  });

  test('shell remounts remove owned drag listeners and keep subscription count flat', async () => {
    const tracked = new Map<string, Set<unknown>>();
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    const added = spyOn(document, 'addEventListener').mockImplementation(
      (type, listener, options) => {
        if (['mousemove', 'mouseup'].includes(type)) {
          if (!tracked.has(type)) tracked.set(type, new Set());
          tracked.get(type)!.add(listener);
        }
        add(type, listener, options);
      },
    );
    const removed = spyOn(document, 'removeEventListener').mockImplementation(
      (type, listener, options) => {
        tracked.get(type)?.delete(listener);
        remove(type, listener, options);
      },
    );
    const blurListeners = new Set<unknown>();
    const addWindow = window.addEventListener.bind(window);
    const removeWindow = window.removeEventListener.bind(window);
    const addedWindow = spyOn(window, 'addEventListener').mockImplementation(
      (type, listener, options) => {
        if (type === 'blur') blurListeners.add(listener);
        addWindow(type, listener, options);
      },
    );
    const removedWindow = spyOn(
      window,
      'removeEventListener',
    ).mockImplementation((type, listener, options) => {
      if (type === 'blur') blurListeners.delete(listener);
      removeWindow(type, listener, options);
    });
    try {
      fixture = makeFixture({ shell: true });
      for (let index = 0; index < 4; index++) {
        await fixture.start({
          config: { ...config(), window: { ...config().window, fancy: true } },
          data: data(),
        });
        await settle();
        const zone = fixture.target.querySelector<HTMLElement>(
          '.TitleBar__dragZone',
        )!;
        zone.dispatchEvent(
          new MouseEvent('mousedown', { button: 0, buttons: 1, bubbles: true }),
        );
        expect(tracked.get('mousemove')?.size).toBe(1);
        expect(blurListeners.size).toBe(1);
        expect(fixture.subscriptions).toBe(2);
        flushSync(() => fixture!.store.dispatch({ type: 'suspend' }));
        await settle();
        expect(tracked.get('mousemove')?.size).toBe(0);
        expect(tracked.get('mouseup')?.size).toBe(0);
        expect(blurListeners.size).toBe(0);
        expect(fixture.subscriptions).toBe(2);
      }
      await fixture.dispose();
      expect(fixture.subscriptions).toBe(0);
    } finally {
      added.mockRestore();
      removed.mockRestore();
      addedWindow.mockRestore();
      removedWindow.mockRestore();
    }
  });
});
