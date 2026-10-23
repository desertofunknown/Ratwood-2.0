import '../../test-network-guard';

import { afterEach, expect, test } from 'bun:test';
import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import type { WorkbenchData } from '../../../crafting-workbench/model';
import type {
  Route,
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
import { Shell } from '../../Shell';
import {
  type AuxModule,
  createDeferredScreens,
  type DeferredObservation,
  type DeferredSession,
} from '../deferred-screens';

// Deterministic source-model/Happy DOM checks, not native or browser ESM tests.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function drain() {
  for (let index = 0; index < 16; index++) await Promise.resolve();
}
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

type ProbeSession = ScreenSession & { action(): void };
function environment(
  options: {
    observe?(event: DeferredObservation): void;
    construct?(route: Route, context: SessionContext): ScreenSession | void;
    validate?(): void;
    lifecycle?: Partial<ScreenLifecycle>;
    load?(): Promise<AuxModule>;
    Screen?: ScreenRenderer;
  } = {},
) {
  const state = {
    backend: {
      config: {
        refreshing: false,
        interface: { name: 'SampleApplication', layout: 'Window' },
        window: { key: 'a' },
      },
      suspended: false as number | false,
      suspending: false,
    },
  };
  const subscriptions = new Set<() => void>();
  const source = {
    getState: () => state,
    subscribe(listener: () => void) {
      subscriptions.add(listener);
      return () => {
        subscriptions.delete(listener);
      };
    },
  };
  const host = observeSampleLifetime(source);
  const requests: ReturnType<typeof deferred<AuxModule>>[] = [];
  const created: ScreenSession[] = [];
  const contexts: SessionContext[] = [];
  const retired = new Map<ScreenSession, number>();
  const events: DeferredObservation[] = [];
  const errors: unknown[] = [];
  const pending: Promise<unknown>[] = [];
  const rendered: ScreenProps[] = [];
  let actions = 0;
  let mounts = 0;
  let unmounts = 0;
  let workbenchFactories = 0;
  const lifecycle: ScreenLifecycle = {
    mounted() {
      mounts++;
    },
    unmounted() {
      unmounts++;
    },
    pending(promise) {
      pending.push(promise);
    },
    error(error) {
      errors.push(error);
    },
    ...options.lifecycle,
  };
  const createSession: AuxModule['createSession'] = (route, context) => {
    contexts.push(context);
    const custom = options.construct?.(route, context);
    const session: ProbeSession = {
      route,
      lease: context.lease,
      action: () => context.onWorkbenchAction('craft', { item: 'fixture' }),
      retire() {
        retired.set(session, (retired.get(session) ?? 0) + 1);
      },
    };
    created.push(custom || session);
    return custom || session;
  };
  const Probe: ScreenRenderer = (props) => {
    rendered.push(props);
    const handleAction = (props.session as ProbeSession).action;
    return (
      <ReactScreenOwner session={props.session} lifecycle={props.lifecycle}>
        <button type="button" data-probe-action="" onClick={handleAction}>
          Value: {String(props.snapshot.showonlycraftable)}
        </button>
      </ReactScreenOwner>
    );
  };
  const module: AuxModule = { createSession, Screen: options.Screen ?? Probe };
  const adapter = createDeferredScreens({
    workbenchFactory(route, { lease }) {
      workbenchFactories++;
      return { route, lease, retire() {} };
    },
    WorkbenchScreen: () => <p data-eager-workbench="">Eager workbench</p>,
    loadAuxiliary:
      options.load ??
      (() => {
        const request = deferred<AuxModule>();
        requests.push(request);
        return request.promise;
      }),
    observe(event) {
      events.push(event);
      options.observe?.(event);
    },
  });
  const manager = createSessionManager({
    lifetime: host,
    lifecycle,
    validateBoundary: options.validate ?? (() => {}),
    onWorkbenchAction() {
      actions++;
    },
    createSession: adapter.createSession,
  });
  const dispose = () => {
    manager.dispose();
    host.dispose();
  };
  cleanups.push(dispose);
  return {
    adapter,
    manager,
    host,
    source,
    state,
    lifecycle,
    requests,
    created,
    contexts,
    retired,
    events,
    errors,
    pending,
    rendered,
    module,
    dispose,
    mutate(change: (value: typeof state) => void) {
      change(state);
      for (const notify of [...subscriptions]) notify();
    },
    open(route: Route = 'market') {
      manager.navigate(route);
      return manager.snapshot().session as DeferredSession;
    },
    current: () => manager.snapshot().session as DeferredSession,
    read: () => ({
      actions,
      mounts,
      unmounts,
      workbenchFactories,
      subscriptions: subscriptions.size,
    }),
  };
}

function mount(env: ReturnType<typeof environment>) {
  const target = document.createElement('div');
  document.body.append(target);
  const root = createRoot(target);
  let disposed = false;
  let snapshot: WorkbenchData = {
    crafting_recipes: {},
    craftability: {},
    showonlycraftable: false,
  };
  function Harness() {
    const state = useSyncExternalStore(
      env.manager.subscribe,
      env.manager.snapshot,
    );
    return (
      <Shell
        manager={env.manager}
        state={state}
        Screen={env.adapter.Screen}
        snapshot={snapshot}
        lifecycle={env.lifecycle}
      />
    );
  }
  const render = () => flushSync(() => root.render(<Harness />));
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
    update(next: WorkbenchData) {
      snapshot = next;
      render();
    },
    snapshot: () => snapshot,
    navigate(route: Route) {
      flushSync(() => env.manager.navigate(route));
    },
  };
}

test('workbench stays eager; first auxiliary opening has no factory before resolve', async () => {
  const env = environment();
  expect(env.read().workbenchFactories).toBe(1);
  expect(env.requests).toHaveLength(0);
  const wrapper = env.open();
  expect(wrapper.lease.isCurrent()).toBe(true);
  expect(wrapper.snapshot().status).toBe('loading');
  expect(env.created).toHaveLength(0);
  expect(env.requests).toHaveLength(0);
  await drain();
  expect(env.requests).toHaveLength(1);
  expect(env.created).toHaveLength(0);
  env.requests[0].resolve(env.module);
  await drain();
  expect(wrapper.snapshot().status).toBe('ready');
  expect(env.created).toHaveLength(1);
  expect(env.created[0].lease).toBe(wrapper.lease);
  expect(env.pending).toEqual([]);
  expect(env.events.map((event) => event.kind)).toEqual([
    'requested',
    'loading',
    'ready',
  ]);
});

test('rapid auxiliary visits share one in-flight group and same-route is a no-op', async () => {
  const env = environment();
  const first = env.open('treasury');
  await drain();
  const second = env.open('market');
  expect(env.manager.navigate('market')).toBe(false);
  expect(env.current()).toBe(second);
  await drain();
  expect(env.requests).toHaveLength(1);
  env.requests[0].resolve(env.module);
  await drain();
  expect(first.snapshot().status).toBe('retired');
  expect(second.snapshot().status).toBe('ready');
  expect(env.created.map((session) => session.route)).toEqual(['market']);
  env.open('archive');
  expect(env.created).toHaveLength(1);
  await drain();
  expect(env.requests).toHaveLength(1);
  expect(env.created.map((session) => session.route)).toEqual([
    'market',
    'archive',
  ]);
  expect(env.retired.get(env.created[0])).toBe(1);
});

test('departure before import microtask never invokes loader', async () => {
  const env = environment();
  const first = env.open();
  env.manager.navigate('workbench');
  await drain();
  expect(first.snapshot().status).toBe('retired');
  expect(env.requests).toEqual([]);
  expect(env.created).toEqual([]);
  expect(env.events.map((event) => event.kind)).toEqual(['requested']);
});

test('loading observation can navigate away without starting the import', async () => {
  let env!: ReturnType<typeof environment>;
  env = environment({
    observe(event) {
      if (event.kind === 'loading') env.manager.navigate('workbench');
    },
  });
  const wrapper = env.open();
  await drain();
  expect(wrapper.snapshot().status).toBe('retired');
  expect(env.requests).toEqual([]);
  expect(env.created).toEqual([]);
});

test('pre-import boundary failure does not fetch or construct auxiliary code', async () => {
  let lost = false;
  const env = environment({
    validate() {
      if (lost) throw new Error('lost boundary');
    },
  });
  const wrapper = env.open();
  lost = true;
  await drain();
  expect(wrapper.snapshot().status).toBe('failed');
  expect(env.requests).toEqual([]);
  expect(env.created).toEqual([]);
});

for (const outcome of ['resolve', 'reject'] as const) {
  test(`stale import ${outcome} neither creates a session nor reports a current failure`, async () => {
    const env = environment();
    const old = env.open();
    await drain();
    env.manager.navigate('workbench');
    if (outcome === 'resolve') env.requests[0].resolve(env.module);
    else env.requests[0].reject(new Error('stale fixture rejection'));
    await drain();
    expect(old.snapshot().status).toBe('retired');
    expect(env.created).toEqual([]);
    expect(env.errors).toEqual([]);
    expect(
      env.events.some((event) => ['ready', 'failed'].includes(event.kind)),
    ).toBe(false);
    expect(old.retry()).toBe(false);
  });
}

test('manual retry recovers injected transient rejection and deduplicates repeated clicks', async () => {
  const env = environment();
  const wrapper = env.open();
  await drain();
  const error = new Error(
    'injected transient loader rejection, not ESM evaluation',
  );
  env.requests[0].reject(error);
  await drain();
  expect(wrapper.snapshot()).toEqual({ status: 'failed', attempt: 1, error });
  expect(wrapper.retry()).toBe(true);
  expect(wrapper.retry()).toBe(false);
  expect(wrapper.retry()).toBe(false);
  await drain();
  expect(env.requests).toHaveLength(2);
  expect(wrapper.retry()).toBe(false);
  env.requests[1].resolve(env.module);
  await drain();
  expect(wrapper.snapshot().status).toBe('ready');
  expect(env.created).toHaveLength(1);
  expect(env.events.map((event) => [event.kind, event.attempt])).toEqual([
    ['requested', 1],
    ['loading', 1],
    ['failed', 1],
    ['loading', 2],
    ['ready', 2],
  ]);
  expect(wrapper.retry()).toBe(false);
});

test('a shared rejected request reports failure only for the current visit', async () => {
  const env = environment();
  const first = env.open('treasury');
  await drain();
  const current = env.open('market');
  await drain();
  const error = new Error('shared injected rejection');
  env.requests[0].reject(error);
  await drain();
  expect(env.errors).toEqual([error]);
  expect(first.snapshot().status).toBe('retired');
  expect(current.snapshot().status).toBe('failed');
  expect(
    env.events
      .filter((event) => event.kind === 'failed')
      .map((event) => event.route),
  ).toEqual(['market']);
});

test('a repeat-rejecting module loader stays failed without automatic retry or reload', async () => {
  let calls = 0;
  const error = new Error('simulated cached evaluation failure');
  const env = environment({
    load: () => {
      calls++;
      return Promise.reject(error);
    },
  });
  const wrapper = env.open();
  await drain();
  expect(calls).toBe(1);
  wrapper.retry();
  await drain();
  expect(calls).toBe(2);
  expect(wrapper.snapshot()).toEqual({ status: 'failed', attempt: 2, error });
  expect(env.created).toEqual([]);
  expect(env.pending).toEqual([]);
});

test('sync loader throws are failed attempts rather than unhandled microtasks', async () => {
  const error = new Error('sync loader throw');
  const env = environment({
    load() {
      throw error;
    },
  });
  const wrapper = env.open();
  await drain();
  expect(wrapper.snapshot()).toEqual({ status: 'failed', attempt: 1, error });
  expect(env.errors).toEqual([error]);
});

test('navigation triggered by auxiliary construction retires stale candidate exactly once', async () => {
  let env!: ReturnType<typeof environment>;
  env = environment({
    construct(route) {
      if (route === 'market') env.manager.navigate('treasury');
    },
  });
  const old = env.open();
  await drain();
  env.requests[0].resolve(env.module);
  await drain();
  expect(env.manager.snapshot().route).toBe('treasury');
  expect(old.snapshot().status).toBe('retired');
  expect(env.current().snapshot().status).toBe('ready');
  expect(env.created.map((session) => session.route)).toEqual([
    'market',
    'treasury',
  ]);
  expect(env.retired.get(env.created[0])).toBe(1);
  expect(env.retired.get(env.created[1])).toBeUndefined();
  env.dispose();
  expect(env.retired.get(env.created[0])).toBe(1);
  expect(env.retired.get(env.created[1])).toBe(1);
});

test('full disposal triggered during auxiliary construction fences and retires returned candidate', async () => {
  let env!: ReturnType<typeof environment>;
  env = environment({
    construct() {
      env.dispose();
    },
  });
  const wrapper = env.open();
  await drain();
  env.requests[0].resolve(env.module);
  await drain();
  expect(wrapper.snapshot().status).toBe('retired');
  expect(env.created).toHaveLength(1);
  expect(env.retired.get(env.created[0])).toBe(1);
  expect(env.manager.snapshot().session).toBeNull();
  expect(env.events.some((event) => event.kind === 'ready')).toBe(false);
});

test('post-factory boundary loss retires candidate and cannot publish it', async () => {
  const error = new Error('boundary replaced');
  let lost = false;
  const env = environment({
    construct() {
      lost = true;
    },
    validate() {
      if (lost) throw error;
    },
  });
  const wrapper = env.open();
  await drain();
  env.requests[0].resolve(env.module);
  await drain();
  expect(wrapper.snapshot().status).toBe('failed');
  expect(env.retired.get(env.created[0])).toBe(1);
  expect(env.events.some((event) => event.kind === 'ready')).toBe(false);
  env.dispose();
  expect(env.retired.get(env.created[0])).toBe(1);
});

test('mismatched original session is retired and shown as failed', async () => {
  let retirements = 0;
  const env = environment({
    construct(_route, context) {
      return {
        route: 'dialogs',
        lease: context.lease,
        retire() {
          retirements++;
        },
      };
    },
  });
  const wrapper = env.open();
  await drain();
  env.requests[0].resolve(env.module);
  await drain();
  expect(wrapper.snapshot().status).toBe('failed');
  expect(retirements).toBe(1);
  env.dispose();
  expect(retirements).toBe(1);
});

test('invalid module contracts are rejected without caching and can be manually retried', async () => {
  const env = environment();
  const wrapper = env.open();
  await drain();
  env.requests[0].resolve({ createSession: 4 } as unknown as AuxModule);
  await drain();
  expect(wrapper.snapshot().status).toBe('failed');
  expect(wrapper.retry()).toBe(true);
  await drain();
  env.requests[1].resolve(env.module);
  await drain();
  expect(wrapper.snapshot().status).toBe('ready');
});

for (const transition of ['suspend', 'identity', 'root', 'dispose'] as const) {
  test(`${transition} fences pending resolution; lifecycle never awaits an unresolved import`, async () => {
    const env = environment();
    const old = env.open();
    await drain();
    if (transition === 'suspend') {
      env.mutate((state) => {
        state.backend.suspended = 1;
      });
    }
    if (transition === 'identity') {
      env.mutate((state) => {
        state.backend.config.window.key = 'b';
      });
    }
    if (transition === 'root') env.manager.retireRoot();
    if (transition === 'dispose') env.dispose();
    expect(old.snapshot().status).toBe('retired');
    expect(old.lease.isCurrent()).toBe(false);
    expect(env.pending).toEqual([]);
    env.requests[0].resolve(env.module);
    await drain();
    expect(env.created.map((session) => session.lease.hostEpoch)).toEqual(
      transition === 'identity' ? [env.host.hostEpoch] : [],
    );
    if (transition === 'root') {
      env.mutate((state) => {
        state.backend.config.window.key = 'after-root';
      });
      await drain();
      expect(env.created).toEqual([]);
      env.manager.resumeRoot();
      await drain();
      expect(env.created).toHaveLength(1);
    }
    if (transition === 'suspend') {
      env.mutate((state) => {
        state.backend.suspended = false;
      });
      await drain();
      expect(env.created).toHaveLength(1);
    }
  });
}

test('never-settling import cannot hold full disposal open or retain subscriptions', async () => {
  const env = environment({ load: () => new Promise(() => {}) });
  const old = env.open();
  await drain();
  env.dispose();
  await Promise.allSettled(env.pending);
  expect(env.pending).toEqual([]);
  expect(env.read().subscriptions).toBe(0);
  expect(old.snapshot().status).toBe('retired');
  expect(env.created).toEqual([]);
});

test('throwing observers, listeners and error reporting do not orphan a session', async () => {
  const env = environment({
    observe() {
      throw new Error('broken observation');
    },
    lifecycle: {
      error() {
        throw new Error('broken error reporting');
      },
    },
  });
  const wrapper = env.open();
  let laterNotifications = 0;
  wrapper.subscribe(() => {
    throw new Error('broken subscriber');
  });
  wrapper.subscribe(() => {
    laterNotifications++;
  });
  await drain();
  env.requests[0].resolve(env.module);
  await drain();
  expect(wrapper.snapshot().status).toBe('ready');
  expect(laterNotifications).toBe(1);
  env.dispose();
  expect(laterNotifications).toBe(2);
  expect(wrapper.snapshot().status).toBe('retired');
  expect(env.retired.get(env.created[0])).toBe(1);
});

test('throwing original retirement and error reporting still complete lease cleanup', async () => {
  let retirements = 0;
  let detached = 0;
  const env = environment({
    construct(route, context) {
      context.lease.onRetire(() => {
        detached++;
      });
      return {
        route,
        lease: context.lease,
        retire() {
          retirements++;
          throw new Error('broken original retirement');
        },
      };
    },
    lifecycle: {
      error() {
        throw new Error('broken error reporting');
      },
    },
  });
  const wrapper = env.open();
  await drain();
  env.requests[0].resolve(env.module);
  await drain();
  env.dispose();
  env.dispose();
  expect(wrapper.snapshot().status).toBe('retired');
  expect(retirements).toBe(1);
  expect(detached).toBe(1);
  expect(env.read().subscriptions).toBe(0);
});

test('ready observer navigation retires constructed session before any mounted readiness', async () => {
  let env!: ReturnType<typeof environment>;
  env = environment({
    observe(event) {
      if (event.kind === 'ready') env.manager.navigate('workbench');
    },
  });
  const wrapper = env.open();
  await drain();
  env.requests[0].resolve(env.module);
  await drain();
  expect(wrapper.snapshot().status).toBe('retired');
  expect(env.retired.get(env.created[0])).toBe(1);
  expect(env.events.some((event) => event.kind === 'committed-ready')).toBe(
    false,
  );
});

test('original renderer gets exact ready session, latest snapshot and real mounted observation', async () => {
  const env = environment();
  const ui = mount(env);
  ui.navigate('market');
  expect(
    ui.target
      .querySelector('[data-deferred-screen]')
      ?.getAttribute('data-deferred-screen'),
  ).toBe('loading');
  expect(document.activeElement).toBe(ui.target.querySelector('h1'));
  const latest = { ...ui.snapshot(), showonlycraftable: true };
  ui.update(latest);
  await drain();
  env.requests[0].resolve(env.module);
  await drain();
  ui.render();
  expect(env.rendered.at(-1)?.session).toBe(env.created[0]);
  expect(env.rendered.at(-1)?.snapshot).toBe(latest);
  expect(ui.target.querySelector('[data-probe-action]')?.textContent).toBe(
    'Value: true',
  );
  expect(env.read().mounts).toBe(1);
  expect(env.events.map((event) => event.kind)).toEqual([
    'requested',
    'loading',
    'ready',
    'committed-ready',
  ]);
  latest.showonlycraftable = false;
  ui.update(latest);
  expect(env.rendered.at(-1)?.snapshot).toBe(latest);
  expect(ui.target.querySelector('[data-probe-action]')?.textContent).toBe(
    'Value: false',
  );
  expect(env.read().mounts).toBe(1);
  ui.navigate('workbench');
  expect(env.read().unmounts).toBe(1);
  expect(env.retired.get(env.created[0])).toBe(1);
});

test('retry UI is manual, repeated retained clicks cannot create competing attempts', async () => {
  const env = environment();
  const ui = mount(env);
  ui.navigate('market');
  await drain();
  env.requests[0].reject(new Error('injected temporary rejection'));
  await drain();
  ui.render();
  expect(ui.target.querySelector('[role="alert"]')?.textContent).toContain(
    'Could not load',
  );
  expect(ui.target.textContent).toContain('cached browser module failure');
  const retry = ui.target.querySelector<HTMLButtonElement>(
    '[data-deferred-retry]',
  )!;
  flushSync(() => {
    retry.click();
    retry.click();
    retry.click();
  });
  await drain();
  expect(env.requests).toHaveLength(2);
  expect(ui.target.querySelector('[data-deferred-retry]')).toBeNull();
  env.requests[1].resolve(env.module);
  await drain();
  ui.render();
  expect(env.created).toHaveLength(1);
  expect(env.read().mounts).toBe(1);
});

test('retained action callbacks and late resolution cannot affect replacement focus or authority', async () => {
  const env = environment();
  const ui = mount(env);
  ui.navigate('market');
  await drain();
  env.requests[0].resolve(env.module);
  await drain();
  ui.render();
  const captured = (env.created[0] as ProbeSession).action;
  const oldButton = ui.target.querySelector<HTMLButtonElement>(
    '[data-probe-action]',
  )!;
  captured();
  expect(env.read().actions).toBe(1);
  ui.navigate('workbench');
  const heading = ui.target.querySelector('h1');
  expect(document.activeElement).toBe(heading);
  captured();
  oldButton.click();
  expect(env.read().actions).toBe(1);
  expect(oldButton.isConnected).toBe(false);
  expect(document.activeElement).toBe(heading);
  ui.navigate('archive');
  ui.navigate('workbench');
  await drain();
  ui.render();
  expect(env.created).toHaveLength(1);
  expect(document.activeElement).toBe(heading);
});

test('original Svelte owner keeps actual delayed disposal separate from import readiness', async () => {
  const disposal = deferred<void>();
  let unmountCalls = 0;
  const SvelteLike: ScreenRenderer = (props) => (
    <SvelteScreenOwner
      {...props}
      mountContent={(target) => {
        target.textContent = 'Svelte owner source-model view';
        return {
          update() {},
          unmount() {
            unmountCalls++;
            return disposal.promise;
          },
        };
      }}
    />
  );
  const env = environment({ Screen: SvelteLike });
  const ui = mount(env);
  ui.navigate('archive');
  await drain();
  expect(env.pending).toEqual([]);
  env.requests[0].resolve(env.module);
  await drain();
  ui.render();
  expect(env.read().mounts).toBe(1);
  expect(env.events.at(-1)?.kind).toBe('committed-ready');
  ui.navigate('workbench');
  expect(ui.target.textContent).not.toContain('Svelte owner source-model view');
  expect(env.pending).toEqual([disposal.promise]);
  expect(unmountCalls).toBe(1);
  env.dispose();
  expect(unmountCalls).toBe(1);
  disposal.resolve();
  await Promise.allSettled(env.pending);
  expect(env.read().mounts).toBe(env.read().unmounts);
});

test('throwing mounted/unmounted diagnostics cannot skip real owner disposal', async () => {
  let unmounts = 0;
  const disposal = Promise.resolve();
  const SvelteLike: ScreenRenderer = (props) => (
    <SvelteScreenOwner
      {...props}
      mountContent={() => ({
        update() {},
        unmount() {
          unmounts++;
          return disposal;
        },
      })}
    />
  );
  const env = environment({
    Screen: SvelteLike,
    lifecycle: {
      mounted() {
        throw new Error('mounted diagnostic');
      },
      unmounted() {
        throw new Error('unmounted diagnostic');
      },
      error() {
        throw new Error('error diagnostic');
      },
    },
  });
  const ui = mount(env);
  ui.navigate('market');
  await drain();
  env.requests[0].resolve(env.module);
  await drain();
  ui.render();
  expect(env.events.at(-1)?.kind).toBe('committed-ready');
  ui.navigate('workbench');
  expect(unmounts).toBe(1);
  expect(env.pending).toEqual([disposal]);
  await Promise.allSettled(env.pending);
});
