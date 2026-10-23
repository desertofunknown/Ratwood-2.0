import '../../test-network-guard';

import { afterEach, expect, test } from 'bun:test';
import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import type { WorkbenchData } from '../../../crafting-workbench/model';
import type {
  Route,
  ScreenFactory,
  ScreenLifecycle,
  ScreenProps,
  ScreenRenderer,
  ScreenSession,
  SessionContext,
} from '../../contracts';
import { observeSampleLifetime } from '../../host-lifetime';
import { ReactScreenOwner } from '../../screens/react-owner';
import { SvelteScreenOwner } from '../../screens/svelte-owner';
import { createSessionManager } from '../../session-manager';
import {
  type AuxModule,
  createDeferredScreens,
  type DeferredSession,
  type DeferredState,
} from '../deferred-screens';
import { measureRoutes } from '../route-measurement-core';

// Injected clocks + source-mounted Happy DOM. These are NOT speed measurements.
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
async function drain() {
  for (let index = 0; index < 16; index++) await Promise.resolve();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function environment(
  options: {
    lazy?: boolean;
    factory?: ScreenFactory;
    Screen?: ScreenRenderer;
    lifecycle?: Partial<ScreenLifecycle>;
    now?: () => number;
  } = {},
) {
  let clock = 10;
  const subscriptions = new Set<() => void>();
  const host = observeSampleLifetime({
    getState: () => ({
      backend: {
        config: {
          interface: { name: 'SampleApplication', layout: 'Window' },
          window: { key: 'measurement-fixture' },
        },
        suspended: false,
        suspending: false,
      },
    }),
    subscribe(listener) {
      subscriptions.add(listener);
      return () => {
        subscriptions.delete(listener);
      };
    },
  });
  const contexts: SessionContext[] = [];
  const created: ScreenSession[] = [];
  const rendered: ScreenProps[] = [];
  const forwarded: Array<{ kind: string; value?: unknown }> = [];
  const lifecycle: ScreenLifecycle = {
    mounted: (action) => forwarded.push({ kind: 'mounted', value: action }),
    unmounted: () => forwarded.push({ kind: 'unmounted' }),
    pending: (promise) => forwarded.push({ kind: 'pending', value: promise }),
    error: (error) => forwarded.push({ kind: 'error', value: error }),
    ...options.lifecycle,
  };
  const action = () => {};
  const factory: ScreenFactory = (route, context) => {
    contexts.push(context);
    const session = options.factory?.(route, context) ?? {
      route,
      lease: context.lease,
      retire() {},
    };
    created.push(session);
    return session;
  };
  const Probe: ScreenRenderer = (props) => {
    rendered.push(props);
    if (options.Screen) {
      const Original = options.Screen;
      return <Original {...props} />;
    }
    return (
      <ReactScreenOwner
        session={props.session}
        lifecycle={props.lifecycle}
        action={action}
      >
        <p>{String(props.snapshot.showonlycraftable)}</p>
      </ReactScreenOwner>
    );
  };
  const loads: ReturnType<typeof deferred<AuxModule>>[] = [];
  const source = options.lazy
    ? createDeferredScreens({
        workbenchFactory: factory,
        WorkbenchScreen: Probe,
        loadAuxiliary() {
          const load = deferred<AuxModule>();
          loads.push(load);
          return load.promise;
        },
      })
    : { createSession: factory, Screen: Probe };
  const measured = measureRoutes(
    source.Screen,
    source.createSession,
    'react',
    options.lazy ? 'lazy' : 'eager',
    options.now ?? (() => clock),
  );
  const manager = createSessionManager({
    lifetime: host,
    createSession: measured.createSession,
    lifecycle,
    onWorkbenchAction: action,
    validateBoundary() {},
  });
  const dispose = () => {
    manager.dispose();
    host.dispose();
    measured.dispose();
  };
  cleanups.push(dispose);
  return {
    measured,
    manager,
    lifecycle,
    contexts,
    created,
    rendered,
    forwarded,
    action,
    loads,
    module: { createSession: factory, Screen: Probe },
    dispose,
    clock: (value: number) => {
      clock = value;
    },
    records: (route?: Route) =>
      measured
        .read()
        .records.filter((entry) => !route || entry.route === route),
    subscriptions: () => subscriptions.size,
  };
}
function mount(env: ReturnType<typeof environment>) {
  const target = document.createElement('div');
  document.body.append(target);
  const root = createRoot(target);
  let snapshot: WorkbenchData = {
    crafting_recipes: {},
    craftability: {},
    showonlycraftable: false,
  };
  let lifecycle = env.lifecycle;
  function Harness() {
    const state = useSyncExternalStore(
      env.manager.subscribe,
      env.manager.snapshot,
    );
    const Screen = env.measured.Screen;
    return state.session ? (
      <Screen
        session={state.session}
        snapshot={snapshot}
        lifecycle={lifecycle}
      />
    ) : null;
  }
  const render = () => flushSync(() => root.render(<Harness />));
  let disposed = false;
  const unmount = () => {
    if (disposed) return;
    disposed = true;
    flushSync(() => {
      env.manager.retireRoot();
      root.unmount();
    });
    target.remove();
  };
  cleanups.push(unmount);
  render();
  return {
    target,
    render,
    unmount,
    snapshot: () => snapshot,
    update(next: WorkbenchData, nextLifecycle = lifecycle) {
      snapshot = next;
      lifecycle = nextLifecycle;
      render();
    },
    navigate: (route: Route) => flushSync(() => env.manager.navigate(route)),
  };
}

test('matched eager request includes factory work and only original owner mount commits', () => {
  let now = 12;
  let originalContext: SessionContext | undefined;
  const env = environment({
    now: () => now,
    factory(route, context) {
      originalContext = context;
      now = 38;
      return { route, lease: context.lease, retire() {} };
    },
    lifecycle: {
      mounted() {
        now = 100; // Original diagnostics work must not change the event time.
      },
    },
  });
  expect(env.records().map((record) => record.kind)).toEqual(['requested']);
  expect(env.contexts[0]).toBe(originalContext!);
  expect(env.manager.snapshot().session).toBe(env.created[0]);
  now = 50;
  const view = mount(env);
  expect(env.rendered[0].snapshot).toBe(view.snapshot());
  expect(env.rendered[0].session).toBe(env.created[0]);
  expect(env.records().at(-1)).toMatchObject({
    kind: 'committed-ready',
    requestedAtMs: 12,
    atMs: 50,
    requestToOwnerMountedMs: 38,
    routeVisit: 1,
    auxiliaryVisit: null,
    attempt: 1,
    includesManualRetryWait: false,
  });
  view.render();
  expect(
    env.records().filter((record) => record.kind === 'committed-ready'),
  ).toHaveLength(1);
});

test('stable lifecycle forwards latest callbacks, exact arguments and same-object updates', () => {
  let mounted = 0;
  let disposed = 0;
  const updates: WorkbenchData[] = [];
  const original = deferred<void>();
  const env = environment({
    Screen(props) {
      return (
        <SvelteScreenOwner
          {...props}
          action={() => {}}
          mountContent={(_target, _session, snapshot) => {
            mounted++;
            updates.push(snapshot);
            return {
              update: (next) => {
                updates.push(next);
              },
              unmount: () => {
                disposed++;
                return original.promise;
              },
            };
          }}
        />
      );
    },
  });
  const view = mount(env);
  const first = env.rendered.at(-1)!;
  const latestCalls: Array<{ kind: string; value?: unknown }> = [];
  const latest: ScreenLifecycle = {
    mounted: (value) => latestCalls.push({ kind: 'mounted', value }),
    unmounted: () => latestCalls.push({ kind: 'unmounted' }),
    pending: (value) => latestCalls.push({ kind: 'pending', value }),
    error: (value) => latestCalls.push({ kind: 'error', value }),
  };
  const same = view.snapshot();
  same.showonlycraftable = true;
  view.update(same, latest);
  expect(env.rendered.at(-1)!.lifecycle).toBe(first.lifecycle);
  expect(env.rendered.at(-1)!.snapshot).toBe(same);
  expect(updates).toEqual([same, same]);
  expect(mounted).toBe(1);
  const pending = Promise.resolve('exact disposal');
  const error = new Error('exact diagnostic');
  first.lifecycle.pending(pending);
  first.lifecycle.error(error);
  first.lifecycle.mounted(env.action); // Forward duplicates, never count twice.
  expect(latestCalls.slice(0, 3)).toEqual([
    { kind: 'pending', value: pending },
    { kind: 'error', value: error },
    { kind: 'mounted', value: env.action },
  ]);
  view.unmount();
  expect(disposed).toBe(1);
  expect(latestCalls.filter((call) => call.kind === 'unmounted')).toHaveLength(
    1,
  );
  expect(latestCalls.at(-1)).toEqual({
    kind: 'pending',
    value: original.promise,
  });
  expect(
    env.records().filter((record) => record.kind === 'committed-ready'),
  ).toHaveLength(1);
  expect(env.measured.read().trackedSessions).toBe(0);
  original.resolve();
});

test('lazy module resolution is distinct from current original owner readiness', async () => {
  const env = environment({ lazy: true });
  env.clock(100);
  env.manager.navigate('market');
  await drain();
  expect(env.records('market').map((record) => record.kind)).toEqual([
    'requested',
    'loading',
  ]);
  env.clock(140);
  env.loads[0].resolve(env.module);
  await drain();
  expect(env.records('market').at(-1)!.kind).toBe('module-ready');
  expect(
    env.records('market').some((record) => record.kind === 'committed-ready'),
  ).toBe(false);
  env.clock(160);
  const view = mount(env);
  expect(env.records('market').at(-1)).toMatchObject({
    kind: 'committed-ready',
    requestToOwnerMountedMs: 60,
    auxiliaryVisit: 1,
    routeVisit: 1,
  });
  view.navigate('workbench');
  env.clock(200);
  view.navigate('market');
  await drain();
  view.render();
  expect(env.loads).toHaveLength(1);
  expect(env.records('market').at(-1)).toMatchObject({
    kind: 'committed-ready',
    auxiliaryVisit: 2,
    routeVisit: 2,
  });
});

test('failures and retry wait remain explicit and retain the original request time', async () => {
  const env = environment({ lazy: true });
  env.clock(100);
  env.manager.navigate('archive');
  const session = env.manager.snapshot().session as DeferredSession;
  await drain();
  env.clock(130);
  env.loads[0].reject(new Error('injected transient loader failure'));
  await drain();
  expect(env.records('archive').at(-1)).toMatchObject({
    kind: 'failed',
    failureSeen: true,
    attempt: 1,
  });
  expect(
    env.records('archive').some((record) => record.kind === 'committed-ready'),
  ).toBe(false);
  env.clock(1000);
  expect(session.retry()).toBe(true);
  expect(env.records('archive').at(-1)).toMatchObject({
    kind: 'loading',
    attempt: 2,
    includesManualRetryWait: true,
    sinceRequestMs: 900,
  });
  await drain();
  env.clock(1100);
  env.loads[1].resolve(env.module);
  await drain();
  env.clock(1120);
  mount(env);
  expect(env.records('archive').at(-1)).toMatchObject({
    kind: 'committed-ready',
    requestedAtMs: 100,
    requestToOwnerMountedMs: 1020,
    attempt: 2,
    failureSeen: true,
    includesManualRetryWait: true,
  });
  expect(env.records('archive').map((record) => record.kind)).toEqual([
    'requested',
    'loading',
    'failed',
    'loading',
    'module-ready',
    'committed-ready',
  ]);
});

test('reentrant original mounted callback and retained callbacks cannot commit a retired lease', () => {
  let env!: ReturnType<typeof environment>;
  env = environment({
    lifecycle: {
      mounted() {
        env.manager.navigate('market');
      },
    },
  });
  const view = mount(env);
  const old = env.rendered.find(
    (props) => props.session.route === 'workbench',
  )!;
  expect(
    env
      .records('workbench')
      .some((record) => record.kind === 'committed-ready'),
  ).toBe(false);
  const before = env.records().length;
  old.lifecycle.mounted(env.action);
  expect(env.records().length).toBe(before);
  expect(old.session.lease.isCurrent()).toBe(false);
  expect(env.records('workbench').at(-1)!.kind).toBe('retired-before-ready');
  view.unmount();
});

test('reentrant factory navigation and throwing observers still release all tracking', () => {
  let env!: ReturnType<typeof environment>;
  env = environment({
    factory(route, context) {
      if (route === 'market') env.manager.navigate('archive');
      return { route, lease: context.lease, retire() {} };
    },
  });
  const remove = env.measured.subscribe(() => {
    throw new Error('broken observer');
  });
  env.manager.navigate('market');
  expect(env.manager.snapshot().route).toBe('archive');
  expect(env.records('market').at(-1)!.kind).toBe('retired-before-ready');
  mount(env);
  expect(
    env.records('market').some((record) => record.kind === 'committed-ready'),
  ).toBe(false);
  expect(env.measured.read().diagnosticErrors).toBeGreaterThan(0);
  env.dispose();
  remove();
  expect(env.measured.read()).toMatchObject({
    trackedSessions: 0,
    subscriptions: 0,
  });
  expect(env.subscriptions()).toBe(0);
});

test('bounded chronological history reports total and dropped samples, not selective deletion', () => {
  const env = environment();
  for (let index = 0; index < 150; index++) {
    env.manager.navigate(index % 2 ? 'archive' : 'market');
  }
  const report = env.measured.read();
  expect(report.capacity).toBe(200);
  expect(report.records).toHaveLength(200);
  expect(report.totalRecords).toBe(301);
  expect(report.droppedRecords).toBe(101);
  expect(report.records[0].sequence).toBe(102);
  expect(report.records.at(-1)!.sequence).toBe(301);
});

test('loading, failed, missing and mismatched sessions never report committed-ready', () => {
  let state: DeferredState = { status: 'loading', attempt: 1 };
  const subscribers = new Set<() => void>();
  const env = environment({
    Screen: () => null,
    factory(route, { lease }): DeferredSession {
      return {
        route,
        lease,
        retire() {},
        retry: () => false,
        snapshot: () => state,
        subscribe(listener) {
          subscribers.add(listener);
          return () => {
            subscribers.delete(listener);
          };
        },
      };
    },
  });
  mount(env);
  const props = env.rendered.at(-1)!;
  const ownerMounted = props.lifecycle.mounted;
  ownerMounted();
  state = { status: 'failed', attempt: 1, error: new Error('fixture') };
  for (const listener of [...subscribers]) listener();
  ownerMounted();
  state = {
    status: 'ready',
    attempt: 1,
    session: { route: 'archive', lease: props.session.lease, retire() {} },
  };
  for (const listener of [...subscribers]) listener();
  ownerMounted();
  expect(
    env.records().some((record) => record.kind === 'committed-ready'),
  ).toBe(false);

  // An otherwise current session not created by this observer has no request.
  const target = document.createElement('div');
  document.body.append(target);
  const root = createRoot(target);
  const Screen = env.measured.Screen;
  const foreign = {
    route: props.session.route,
    lease: props.session.lease,
    retire() {},
  };
  flushSync(() =>
    root.render(
      <Screen {...props} session={foreign} lifecycle={env.lifecycle} />,
    ),
  );
  const absent = env.rendered.at(-1)!;
  absent.lifecycle.mounted();
  expect(
    env.records().some((record) => record.kind === 'committed-ready'),
  ).toBe(false);
  flushSync(() => root.unmount());
  target.remove();

  state = { status: 'retired', attempt: 1 };
  for (const listener of [...subscribers]) listener();
  ownerMounted();
  expect(env.records().at(-1)!.kind).toBe('retired-before-ready');
  expect(env.measured.read().trackedSessions).toBe(0);
  expect(subscribers.size).toBe(0);
});

test('throwing measurement cleanup cannot skip original owner cleanup or pending forwarding', () => {
  let state: DeferredState;
  let removed = 0;
  let originalRetirements = 0;
  const listeners = new Set<() => void>();
  const env = environment({
    factory(route, { lease }): DeferredSession {
      const session = {
        route,
        lease,
        retire() {
          originalRetirements++;
        },
        retry: () => false,
        snapshot: () => state,
        subscribe(listener: () => void) {
          listeners.add(listener);
          return () => {
            removed++;
            listeners.delete(listener);
            throw new Error('broken diagnostic unsubscribe');
          };
        },
      };
      state = { status: 'ready', attempt: 1, session };
      return session;
    },
  });
  const view = mount(env);
  const props = env.rendered.at(-1)!;
  const promise = Promise.resolve();
  view.unmount();
  props.lifecycle.pending(promise);
  expect(removed).toBe(1);
  expect(listeners.size).toBe(0);
  expect(originalRetirements).toBe(1);
  expect(
    env.forwarded.filter((call) => call.kind === 'unmounted'),
  ).toHaveLength(1);
  expect(env.forwarded.at(-1)).toEqual({ kind: 'pending', value: promise });
  expect(env.measured.read()).toMatchObject({
    trackedSessions: 0,
    diagnosticErrors: 1,
  });
});

test('original mounted failure is forwarded unchanged and never counted as readiness', () => {
  const failure = new Error('original callback failure');
  const env = environment({
    Screen: () => null,
    lifecycle: {
      mounted() {
        throw failure;
      },
    },
  });
  mount(env);
  expect(() => env.rendered.at(-1)!.lifecycle.mounted()).toThrow(failure);
  expect(env.records().at(-1)!.kind).toBe('mount-callback-failed');
  expect(
    env.records().some((record) => record.kind === 'committed-ready'),
  ).toBe(false);
});

test('invalid or throwing clocks yield explicit null times, never non-finite JSON numbers', () => {
  let value = NaN;
  const env = environment({
    now: () => {
      if (value === Infinity) throw new Error('clock unavailable');
      return value;
    },
  });
  value = Infinity;
  mount(env);
  expect(env.records().at(-1)).toMatchObject({
    kind: 'committed-ready',
    requestedAtMs: null,
    atMs: null,
    sinceRequestMs: null,
    requestToOwnerMountedMs: null,
  });
  expect(env.measured.read().diagnosticErrors).toBeGreaterThan(0);
  const visit = (value: unknown) => {
    if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
    else if (value && typeof value === 'object') {
      for (const child of Object.values(value)) visit(child);
    }
  };
  visit(env.measured.read());
  expect(() => JSON.stringify(env.measured.read())).not.toThrow();
});
