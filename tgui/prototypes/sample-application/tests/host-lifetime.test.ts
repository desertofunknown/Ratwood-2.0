import { expect, test } from 'bun:test';
import { observeSampleLifetime, type HostSource } from '../host-lifetime';
import { createSessionManager } from '../session-manager';
import type { ScreenLease, ScreenLifecycle } from '../contracts';

function source() {
  let state = {
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
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    mutate(change: (value: typeof state) => void) {
      change(state);
      for (const listener of [...listeners]) listener();
    },
    count: () => listeners.size,
  } satisfies HostSource & Record<string, unknown>;
}
const lifecycle: ScreenLifecycle = {
  mounted() {},
  unmounted() {},
  pending() {},
  error(error) {
    throw error;
  },
};

test('host lifetime invalidates every host boundary, not data/status updates', () => {
  const store = source();
  const host = observeSampleLifetime(store);
  expect(host.active).toBe(true);
  let epoch = host.hostEpoch;
  store.mutate(() => {});
  expect(host.hostEpoch).toBe(epoch);
  for (const change of [
    (s: ReturnType<typeof store.getState>) => {
      s.backend.suspending = true;
    },
    (s: ReturnType<typeof store.getState>) => {
      s.backend.suspended = 1;
    },
    (s: ReturnType<typeof store.getState>) => {
      s.backend.config.refreshing = true;
    },
    (s: ReturnType<typeof store.getState>) => {
      s.backend.config.window.key = 'b';
    },
    (s: ReturnType<typeof store.getState>) => {
      s.backend.config.interface.name = 'Other';
    },
    (s: ReturnType<typeof store.getState>) => {
      s.backend.config.interface.layout = 'Other';
    },
  ]) {
    store.mutate(change);
    expect(host.hostEpoch).toBe(++epoch);
    expect(host.isCurrent(epoch - 1)).toBe(false);
  }
  host.dispose();
  host.dispose();
  expect(host.active).toBe(false);
  expect(store.count()).toBe(0);
});

test('local routes synchronously retire controllers before detached-view cleanup', () => {
  const store = source();
  const host = observeSampleLifetime(store);
  const events: string[] = [];
  const leases: ScreenLease[] = [];
  let actions = 0;
  let capturedAction: (() => void) | undefined;
  const manager = createSessionManager({
    lifetime: host,
    lifecycle,
    validateBoundary() {},
    onWorkbenchAction() {
      actions++;
    },
    createSession(route, context) {
      const { lease } = context;
      leases.push(lease);
      lease.onRetire(() => events.push(`detach:${route}:${lease.isCurrent()}`));
      if (route === 'workbench')
        capturedAction = () =>
          context.onWorkbenchAction('craft', { item: 'sample' });
      return {
        route,
        lease,
        retire() {
          events.push(`controller:${route}:${lease.isCurrent()}`);
        },
      };
    },
  });
  const initial = manager.snapshot().session;
  const staleAction = capturedAction!;
  expect(manager.navigate('workbench')).toBe(false);
  expect(manager.snapshot().session).toBe(initial);
  expect(manager.snapshot().screenEpoch).toBe(0);
  staleAction();
  expect(actions).toBe(1);
  manager.navigate('market');
  manager.navigate('workbench');
  expect(manager.snapshot().screenEpoch).toBe(2);
  expect(manager.snapshot().session).not.toBe(initial);
  expect(leases[0].isCurrent()).toBe(false);
  expect(leases[1].isCurrent()).toBe(false);
  expect(leases[2].isCurrent()).toBe(true);
  expect(events).toEqual([
    'controller:workbench:false',
    'detach:workbench:false',
    'controller:market:false',
    'detach:market:false',
  ]);
  staleAction();
  expect(actions).toBe(1);
  manager.dispose();
  manager.dispose();
  host.dispose();
  expect(leases.every((lease) => !lease.isCurrent())).toBe(true);
});

test('unmounted root cannot resurrect a controller on a host transition', () => {
  const store = source();
  const host = observeSampleLifetime(store);
  let created = 0;
  const manager = createSessionManager({
    lifetime: host,
    lifecycle,
    validateBoundary() {},
    onWorkbenchAction() {},
    createSession(route, { lease }) {
      created++;
      return { route, lease, retire() {} };
    },
  });
  manager.retireRoot();
  store.mutate((s) => {
    s.backend.config.window.key = 'b';
  });
  expect(manager.snapshot().session).toBeNull();
  expect(created).toBe(1);
  manager.resumeRoot();
  expect(created).toBe(2);
  expect(manager.snapshot().session?.lease.isCurrent()).toBe(true);
  manager.dispose();
  host.dispose();
});

test('late retired callbacks cannot alter a resumed host session', async () => {
  const store = source();
  const host = observeSampleLifetime(store);
  let dispatches = 0;
  const manager = createSessionManager({
    lifetime: host,
    lifecycle,
    validateBoundary() {},
    onWorkbenchAction() {
      dispatches++;
    },
    createSession(route, { lease }) {
      return { route, lease, retire() {} };
    },
  });
  const retired = manager.snapshot().session!.lease;
  const late = Promise.resolve().then(() => {
    if (retired.isCurrent()) dispatches++;
  });
  store.mutate((s) => {
    s.backend.config.refreshing = true;
  });
  store.mutate((s) => {
    s.backend.config.refreshing = false;
  });
  const fresh = manager.snapshot().session;
  await late;
  expect(dispatches).toBe(0);
  expect(fresh?.lease.isCurrent()).toBe(true);
  manager.dispose();
  host.dispose();
});

test('navigation from controller retirement cannot install the superseded route', () => {
  const store = source();
  const host = observeSampleLifetime(store);
  let manager: ReturnType<typeof createSessionManager>;
  let triggered = false;
  const created: string[] = [];
  manager = createSessionManager({
    lifetime: host,
    lifecycle,
    validateBoundary() {},
    onWorkbenchAction() {},
    createSession(route, { lease }) {
      created.push(route);
      return {
        route,
        lease,
        retire() {
          if (!triggered) {
            triggered = true;
            manager.navigate('readability');
          }
        },
      };
    },
  });
  manager.navigate('market');
  expect(manager.snapshot().route).toBe('readability');
  expect(manager.snapshot().session?.route).toBe('readability');
  expect(created).toEqual(['workbench', 'readability']);
  expect(manager.snapshot().session?.lease.isCurrent()).toBe(true);
  manager.dispose();
  host.dispose();
});

test('navigation during factory construction retires its stale candidate', () => {
  const store = source();
  const host = observeSampleLifetime(store);
  let manager: ReturnType<typeof createSessionManager>;
  const events: string[] = [];
  manager = createSessionManager({
    lifetime: host,
    lifecycle,
    validateBoundary() {},
    onWorkbenchAction() {},
    createSession(route, { lease }) {
      if (route === 'market') manager.navigate('treasury');
      lease.onRetire(() => events.push(`detach:${route}:${lease.isCurrent()}`));
      return {
        route,
        lease,
        retire() {
          events.push(`controller:${route}:${lease.isCurrent()}`);
        },
      };
    },
  });
  manager.navigate('market');
  expect(manager.snapshot().route).toBe('treasury');
  expect(manager.snapshot().session?.route).toBe('treasury');
  expect(manager.snapshot().session?.lease.isCurrent()).toBe(true);
  expect(events).toEqual([
    'controller:workbench:false',
    'detach:workbench:false',
    'controller:market:false',
    'detach:market:false',
  ]);
  manager.dispose();
  host.dispose();
});

test('a throwing retirement still revokes and detaches every registered view', () => {
  const store = source();
  const host = observeSampleLifetime(store);
  const errors: unknown[] = [];
  let detached = 0;
  const manager = createSessionManager({
    lifetime: host,
    lifecycle: {
      ...lifecycle,
      error(error) {
        errors.push(error);
      },
    },
    validateBoundary() {},
    onWorkbenchAction() {},
    createSession(route, { lease }) {
      lease.onRetire(() => {
        detached++;
        throw new Error('view cleanup');
      });
      lease.onRetire(() => {
        detached++;
      });
      return {
        route,
        lease,
        retire() {
          throw new Error('controller cleanup');
        },
      };
    },
  });
  const lease = manager.snapshot().session!.lease;
  manager.navigate('market');
  expect(lease.isCurrent()).toBe(false);
  expect(detached).toBe(2);
  expect(errors).toHaveLength(2);
  expect(manager.snapshot().session?.lease.isCurrent()).toBe(true);
  manager.dispose();
  host.dispose();
});
