import './bootstrap';

import { createElement, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

import { applyMiddleware, createStore } from '../../../packages/common/redux';
import { storage } from '../../../packages/common/storage';
import * as backend from '../../../packages/tgui/backend';
import { cancelWindowInteraction } from '../../../packages/tgui/drag';
import { Window } from '../../../packages/tgui/layouts/Window';
import { createDemoData } from '../fixtures';
import type { WorkbenchData } from '../model';
import { observeWorkbenchLifetime } from '../svelte/bridge/lifetime';
import type { WorkbenchAction } from '../Workbench';
import { endpoint } from './bootstrap';
import type { Arm, Lifecycle } from './contracts';

export const sampleConfig = (key = 'sample-window-a') => ({
  title: 'Tithewood sample workbench',
  status: 2,
  interface: { name: 'MiaCraft', layout: 'Window' },
  refreshing: false,
  window: { key, fancy: true, locked: false, scale: true, theme: 'fixture' },
  user: { observer: 0 },
});

/** Only these explicit fixture controls dispatch updates. No native listener. */
export function createFixture(target: HTMLElement, Arm: Arm) {
  const originalStore = backend.globalStore;
  const originalClass = document.documentElement.className;
  const originalBodyStyle = document.body.getAttribute('style');
  const originalRootStyle = document.documentElement.getAttribute('style');
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
  const lifetime = observeWorkbenchLifetime(store);
  let mounts = 0;
  let unmounts = 0;
  let lastAction: WorkbenchAction | undefined;
  const errors: string[] = [];
  const retired = new Set<Promise<unknown>>();
  const lifecycle: Lifecycle = {
    mounted(action) {
      mounts++;
      lastAction = action;
    },
    unmounted() {
      unmounts++;
    },
    pending(promise) {
      retired.add(promise);
      void promise
        .finally(() => retired.delete(promise))
        .catch(() => undefined);
    },
    error(error) {
      errors.push(String(error));
    },
  };
  const handleAction = backend.sendAct;
  let root: Root | undefined;
  let disposed = false;
  function StoreRoot() {
    const state = useSyncExternalStore(store.subscribe, store.getState).backend;
    const snapshot: WorkbenchData = {
      ...state.data,
      crafting_recipes: state.data.crafting_recipes ?? {},
      craftability: state.data.craftability ?? {},
      showonlycraftable: state.data.showonlycraftable ?? false,
    };
    return (
      <Window width={1000} height={760}>
        <Window.Content fitted scrollable>
          <Arm
            snapshot={snapshot}
            active={lifetime.active}
            epoch={lifetime.epoch}
            isCurrent={lifetime.isCurrent}
            lifecycle={lifecycle}
            onAction={handleAction}
          />
          {!lifetime.active && (
            <p className="fixture-inactive">
              Workbench inactive: refresh, route or suspension transition.
            </p>
          )}
        </Window.Content>
      </Window>
    );
  }
  const mountRoot = () => {
    if (disposed || root) return;
    root = createRoot(target);
    flushSync(() => root!.render(createElement(StoreRoot)));
  };
  const dispatch = (type: string, payload?: object) => {
    if (disposed) throw new Error('Fixture already disposed.');
    flushSync(() => store.dispatch({ type, payload }));
  };
  const update = (payload: object) => dispatch('update', payload);
  const resume = () =>
    update({ config: sampleConfig(), data: createDemoData() });
  const unmountRoot = () => {
    if (!root) return;
    flushSync(() => root!.unmount());
    root = undefined;
    cancelWindowInteraction();
  };
  const settle = async () => {
    // Equal scheduling boundary in both arms, not a timing/paint measurement.
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    await Promise.all([...retired]);
  };
  mountRoot();
  return {
    target,
    store,
    endpoint,
    lifetime,
    update,
    dispatch,
    resume,
    mountRoot,
    unmountRoot,
    settle,
    get action() {
      return lastAction;
    },
    read() {
      const state = store.getState().backend;
      return {
        rootMounted: !!root,
        active: lifetime.active,
        epoch: lifetime.epoch,
        suspended: !!state.suspended,
        suspending: state.suspending,
        refreshing: !!state.config.refreshing,
        key: state.config.window?.key,
        status: state.config.status,
        mounts,
        unmounts,
        subscriptions,
        pendingDisposals: retired.size,
        errors: [...errors],
        nativeSubscriptionAttempts: endpoint.subscriptions,
        droppedCalls: endpoint.dropped,
        totalRecordedCalls: endpoint.totalRecordedCalls,
        calls: [...endpoint.calls],
      };
    },
    async dispose() {
      if (disposed) return;
      unmountRoot();
      lifetime.dispose();
      dispatch('suspend'); // Clear real middleware retry/payload timers.
      await settle();
      disposed = true;
      backend.setGlobalStore(originalStore);
      await storage.clear(); // Storage is guaranteed in-memory by bootstrap.
      document.documentElement.className = originalClass;
      for (const [element, style] of [
        [document.body, originalBodyStyle],
        [document.documentElement, originalRootStyle],
      ] as const) {
        if (style === null) element.removeAttribute('style');
        else element.setAttribute('style', style);
      }
    },
  };
}
export type Fixture = ReturnType<typeof createFixture>;
