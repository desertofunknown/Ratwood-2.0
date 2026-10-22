import { resolve } from 'node:path';
import { expect, mock, test } from 'bun:test';
import { createStore } from 'common/redux';
import React, { act, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { runScenarios, type Factory } from './scenarios';
import { installTripwires, attempted } from './tripwires';

// This file MUST run in its own process: no candidate code is imported here.
// Only native chrome is replaced; the real backend reducer/store, ListInputModal,
// InputButtons, Loader and repository-adapted tgui-core controls remain mounted.
installTripwires(false);
const tgui = resolve(import.meta.dir, '../../..');
function Shell({ children }: { children?: ReactNode }) {
  return <div>{children}</div>;
}
function Content({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props}>{children}</div>;
}
mock.module(resolve(tgui, 'packages/tgui/layouts'), () => ({
  Window: Object.assign(Shell, { Content }),
}));
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
let send: (...args: unknown[]) => void = () => {
  throw Error('Native call outside mounted oracle');
};
const native = {
  windowId: 'disconnected-selection-oracle',
  sendMessage: (...args: unknown[]) => send(...args),
  command: () => {
    throw Error('Unexpected native command');
  },
  winget: () => Promise.resolve({}),
};
Reflect.set(globalThis, 'Byond', native);
const backend = await import(resolve(tgui, 'packages/tgui/backend'));
const { ListInputModal } = await import(
  resolve(tgui, 'packages/tgui/interfaces/ListInputModal')
);
const make: Factory = async (data) => {
  const previous = backend.globalStore;
  const store = createStore((state: any, action: any) => ({
    backend: backend.backendReducer(state?.backend, action),
  }));
  backend.setGlobalStore(store);
  store.dispatch(backend.backendUpdate({ static_data: data }));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const calls: any[] = [];
  send = (type, params) => {
    if (typeof type !== 'string' || !type.startsWith('act/'))
      throw Error(`Unexpected ${type}`);
    calls.push([type.slice(4), params ?? {}]);
  };
  const Connected = () => {
    useSyncExternalStore(store.subscribe, store.getState);
    return <ListInputModal />;
  };
  const settle = async (action?: () => void) => {
    await act(async () => {
      action?.();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 12));
    });
  };
  await settle(() => root.render(<Connected />));
  return {
    host,
    calls,
    settle,
    update: async (partial) =>
      settle(() => store.dispatch(backend.backendUpdate({ data: partial }))),
    destroy: async () => {
      await settle(() => root.unmount());
      host.remove();
      backend.setGlobalStore(previous);
      send = () => {
        throw Error('Stale source callback');
      };
    },
  };
};
test('actual production React selection prompt oracle', async () => {
  const records = await runScenarios(make);
  expect(attempted()).toEqual([]);
  if (!process.env.SELECTION_ORACLE_PATH)
    throw Error('Run with tests/run.ts to save independent oracle records.');
  await Bun.write(
    process.env.SELECTION_ORACLE_PATH,
    JSON.stringify(records, null, 2),
  );
  console.log(
    `Production oracle recorded ${Object.keys(records).length} scenarios / ${Object.values(records).reduce((n, v) => n + v.length, 0)} observations.`,
  );
}, 30000);
