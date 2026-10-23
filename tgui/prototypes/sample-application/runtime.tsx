import './bootstrap';

import { createElement, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

import { applyMiddleware, createStore } from '../../packages/common/redux';
import { storage } from '../../packages/common/storage';
import * as backend from '../../packages/tgui/backend';
import { cancelWindowInteraction } from '../../packages/tgui/drag';
import { Window } from '../../packages/tgui/layouts/Window';
import { createDemoData } from '../crafting-workbench/fixtures';
import type { WorkbenchData } from '../crafting-workbench/model';
import type { WorkbenchAction } from '../crafting-workbench/Workbench';
import { endpoint, validateBoundary } from './bootstrap';
import type {
  Route,
  ScreenFactory,
  ScreenLifecycle,
  ScreenRenderer,
} from './contracts';
import { observeSampleLifetime } from './host-lifetime';
import { createSessionManager } from './session-manager';
import { Shell } from './Shell';

export const sampleConfig = (key = 'sample-application-a') => ({
  title: 'Tithewood sample application',
  status: 2,
  interface: { name: 'SampleApplication', layout: 'Window' },
  refreshing: false,
  window: { key, fancy: true, locked: false, scale: true, theme: 'fixture' },
  user: { observer: 0 },
});
let ownedFixture: object | undefined;

/** Interpose a private in-memory store without clearing anybody else's data. */
function isolateStorage() {
  const methods = ['get', 'set', 'remove', 'clear'] as const;
  const descriptors = methods.map(
    (name) => [name, Object.getOwnPropertyDescriptor(storage, name)] as const,
  );
  const values = new Map<string, unknown>();
  const replacements = {
    async get(key: string) {
      return values.get(key);
    },
    async set(key: string, value: unknown) {
      values.set(key, value);
    },
    async remove(key: string) {
      values.delete(key);
    },
    async clear() {
      values.clear();
    },
  };
  const installed = new Set<string>();
  const restore = () => {
    values.clear();
    for (const [name, descriptor] of descriptors) {
      const current = Object.getOwnPropertyDescriptor(storage, name);
      if (
        !installed.has(name) ||
        current?.value !== replacements[name] ||
        current.configurable !== true ||
        current.writable !== true ||
        current.enumerable !== false
      )
        continue;
      if (descriptor) Object.defineProperty(storage, name, descriptor);
      else Reflect.deleteProperty(storage, name);
    }
    installed.clear();
  };
  try {
    for (const name of methods) {
      Object.defineProperty(storage, name, {
        configurable: true,
        writable: true,
        enumerable: false,
        value: replacements[name],
      });
      installed.add(name);
    }
  } catch (error) {
    restore();
    throw error;
  }
  return restore;
}

/** Only explicit fixture controls dispatch updates. There is no native listener. */
export function createFixture(
  target: HTMLElement,
  Screen: ScreenRenderer,
  createSession: ScreenFactory,
) {
  validateBoundary();
  if (ownedFixture)
    throw new Error(
      'Only one sample application fixture may own the production store.',
    );
  const owner = {};
  const originalStore = backend.globalStore;
  const originalClass = document.documentElement.className;
  const originalBodyStyle = document.body.getAttribute('style');
  const originalRootStyle = document.documentElement.getAttribute('style');
  ownedFixture = owner;
  const rollback: Array<() => void> = [
    () => {
      if (ownedFixture === owner) ownedFixture = undefined;
    },
  ];
  const restoreStyles = () => {
    document.documentElement.className = originalClass;
    for (const [element, style] of [
      [document.body, originalBodyStyle],
      [document.documentElement, originalRootStyle],
    ] as const) {
      if (style === null) element.removeAttribute('style');
      else element.setAttribute('style', style);
    }
  };
  rollback.push(restoreStyles);
  try {
    const restoreStorage = isolateStorage();
    rollback.push(restoreStorage);
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
        if (removed) return;
        removed = true;
        subscriptions--;
        remove();
      };
    };
    backend.setGlobalStore(store);
    rollback.push(() => {
      if (backend.globalStore === store) backend.setGlobalStore(originalStore);
    });
    rollback.push(() => {
      store.dispatch({ type: 'suspend' });
    });
    const lifetime = observeSampleLifetime(store);
    rollback.push(() => lifetime.dispose());
    let mounts = 0;
    let unmounts = 0;
    let lastAction: WorkbenchAction | undefined;
    const errors: string[] = [];
    const pending = new Set<Promise<unknown>>();
    const lifecycle: ScreenLifecycle = {
      mounted(action) {
        mounts++;
        if (action) lastAction = action;
      },
      unmounted() {
        unmounts++;
      },
      pending(disposal) {
        const tracked = Promise.resolve(disposal).catch((error) => {
          errors.push(String(error));
        });
        pending.add(tracked);
        void tracked.finally(() => pending.delete(tracked));
      },
      error(error) {
        errors.push(String(error));
      },
    };
    const sessionManager = createSessionManager({
      lifetime,
      createSession,
      lifecycle,
      validateBoundary,
      onWorkbenchAction: backend.sendAct,
    });
    rollback.push(() => sessionManager.dispose());
    let root: Root | undefined;
    let disposed = false;
    let disposing: Promise<void> | undefined;
    function StoreRoot() {
      const state = useSyncExternalStore(
        store.subscribe,
        store.getState,
      ).backend;
      const sessionState = useSyncExternalStore(
        sessionManager.subscribe,
        sessionManager.snapshot,
      );
      const snapshot: WorkbenchData = {
        ...state.data,
        crafting_recipes: state.data.crafting_recipes ?? {},
        craftability: state.data.craftability ?? {},
        showonlycraftable: state.data.showonlycraftable ?? false,
      };
      return (
        <Window width={1080} height={820}>
          <Window.Content fitted scrollable>
            <Shell
              manager={sessionManager}
              state={sessionState}
              Screen={Screen}
              snapshot={snapshot}
              lifecycle={lifecycle}
            />
          </Window.Content>
        </Window>
      );
    }
    const assertLive = () => {
      if (disposed || disposing)
        throw new Error('Sample application already disposed.');
      validateBoundary();
    };
    const mountRoot = () => {
      assertLive();
      if (root) return;
      sessionManager.resumeRoot();
      root = createRoot(target);
      flushSync(() => root!.render(createElement(StoreRoot)));
    };
    const dispatch = (type: string, payload?: object) => {
      assertLive();
      flushSync(() => store.dispatch({ type, payload }));
    };
    const update = (payload: object) => dispatch('update', payload);
    const resume = () => {
      // Acknowledge first, including any real middleware retry timers.
      dispatch('suspend');
      update({ config: sampleConfig(), data: createDemoData() });
    };
    const navigate = (route: Route) => {
      assertLive();
      let changed = false;
      flushSync(() => {
        changed = sessionManager.navigate(route);
      });
      return changed;
    };
    const unmountRoot = () => {
      // Controller retirement occurs synchronously, before React/Svelte disposal.
      sessionManager.retireRoot();
      const old = root;
      root = undefined;
      try {
        if (old) flushSync(() => old.unmount());
      } finally {
        cancelWindowInteraction();
      }
    };
    const settle = async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      while (pending.size) await Promise.allSettled([...pending]);
    };
    rollback.push(unmountRoot);
    const restore = () => {
      try {
        if (backend.globalStore === store)
          backend.setGlobalStore(originalStore);
      } finally {
        try {
          restoreStorage();
        } finally {
          try {
            restoreStyles();
          } finally {
            if (ownedFixture === owner) ownedFixture = undefined;
          }
        }
      }
    };
    mountRoot();
    return {
      target,
      store,
      endpoint,
      lifetime,
      sessionManager,
      update,
      dispatch,
      resume,
      navigate,
      mountRoot,
      unmountRoot,
      settle,
      get action() {
        return lastAction;
      },
      read() {
        const state = store.getState().backend;
        const session = sessionManager.snapshot();
        return {
          rootMounted: !!root,
          active: !!session.session?.lease.isCurrent(),
          route: session.route,
          hostEpoch: lifetime.hostEpoch,
          screenEpoch: session.screenEpoch,
          suspended: !!state.suspended,
          suspending: state.suspending,
          refreshing: !!state.config.refreshing,
          key: state.config.window?.key,
          status: state.config.status,
          mounts,
          unmounts,
          subscriptions,
          pendingDisposals: pending.size,
          errors: [...errors],
          nativeSubscriptionAttempts: endpoint.subscriptions,
          droppedCalls: endpoint.dropped,
          totalRecordedCalls: endpoint.totalRecordedCalls,
          calls: [...endpoint.calls],
        };
      },
      dispose() {
        if (disposing) return disposing;
        disposing = (async () => {
          const failures: unknown[] = [];
          const cleanup = (operation: () => void) => {
            try {
              operation();
            } catch (error) {
              failures.push(error);
              lifecycle.error(error);
            }
          };
          try {
            cleanup(unmountRoot);
            cleanup(() => sessionManager.dispose());
            cleanup(() => lifetime.dispose());
            // The real acknowledgement clears middleware retry/payload timers.
            cleanup(() => {
              store.dispatch({ type: 'suspend' });
            });
            await settle();
          } finally {
            disposed = true;
            cleanup(cancelWindowInteraction);
            cleanup(restore);
          }
          if (failures.length)
            throw new AggregateError(
              failures,
              'Sample application cleanup failed.',
            );
        })();
        return disposing;
      },
    };
  } catch (error) {
    // Constructor failures must not strand the singleton or partially installed
    // storage overrides. Continue cleanup even if another cleanup itself fails.
    for (const cleanup of rollback.reverse()) {
      try {
        cleanup();
      } catch {
        /* Preserve the original construction error. */
      }
    }
    throw error;
  }
}
export type Fixture = ReturnType<typeof createFixture>;
