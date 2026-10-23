import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, type ReactNode, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { CommissionerData } from '../interfaces/Commissioner/types';

const tguiRoot = resolve(import.meta.dir, '../../..');

if (!process.env.TGUI_COMMISSIONER_NOTE_TEST_CHILD) {
  test('commission note lifetime (isolated window shell)', () => {
    const result = spawnSync(
      process.execPath,
      [
        'test',
        '--tsconfig-override',
        resolve(tguiRoot, 'tsconfig.json'),
        import.meta.path,
      ],
      {
        cwd: tguiRoot,
        timeout: 30000,
        env: { ...process.env, TGUI_COMMISSIONER_NOTE_TEST_CHILD: '1' },
        encoding: 'utf8',
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
    expect(result.status).toBe(0);
  });
} else {
  const Shell = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  Shell.Content = Shell;
  // Only window chrome is replaced; all ledger tabs, inputs and backend are real.
  mock.module(resolve(tguiRoot, 'packages/tgui/layouts'), () => ({
    Window: Shell,
  }));
  const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  Reflect.set(globalThis, 'Byond', { windowId: 'commissioner-note' });
  let backend: typeof import('../backend');
  let Commissioner: typeof import('../interfaces/Commissioner').Commissioner;
  try {
    backend = await import(resolve(tguiRoot, 'packages/tgui/backend'));
    ({ Commissioner } = await import(
      resolve(tguiRoot, 'packages/tgui/interfaces/Commissioner')
    ));
  } finally {
    if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
    else Reflect.deleteProperty(globalThis, 'Byond');
  }

  type BackendState = NonNullable<Parameters<typeof backend.backendReducer>[0]>;
  const initialData = (): CommissionerData => ({
    locked: true,
    can_read: true,
    is_guildmaster: false,
    budget: 0,
    my_deposit: 100,
    item_cap_per_order: 10,
    my_manifest_items: 1,
    has_active_order: false,
    manifest_total: 10,
    percent_margin: 0,
    flat_margin: 0,
    manifest: [
      {
        ref: 'recipe1',
        name: 'Knife',
        category: 'Tools',
        qty: 1,
        unit_price: 10,
        line_total: 10,
      },
    ],
    catalog: [
      {
        ref: 'recipe1',
        name: 'Knife',
        category: 'Tools',
        price: 10,
        ingot: 'iron',
        materials: [],
      },
    ],
    categories: ['Tools'],
    ingots: ['iron'],
    group_order: ['Tools'],
    orders: [],
    materials: [],
  });
  const NOTE = 'For the militia. Urgent.';
  let store: Store;
  let previousStore: Store;
  let previousByond: PropertyDescriptor | undefined;
  let previousAct: PropertyDescriptor | undefined;
  let previousFocus: HTMLElement | null;
  let host: HTMLDivElement;
  let root: Root;
  let send: ReturnType<typeof mock>;
  const MountedCommissioner = () => {
    useSyncExternalStore(store.subscribe, store.getState);
    return <Commissioner />;
  };
  beforeEach(async () => {
    previousStore = backend.globalStore;
    previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
    previousAct = Object.getOwnPropertyDescriptor(
      globalThis,
      'IS_REACT_ACT_ENVIRONMENT',
    );
    previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    send = mock();
    Reflect.set(globalThis, 'Byond', {
      windowId: 'commissioner-note',
      sendMessage: send,
    });
    store = createStore<{ backend: BackendState }>((state, action) => ({
      backend: backend.backendReducer(state?.backend, action) as BackendState,
    }));
    backend.setGlobalStore(store);
    store.dispatch(backend.backendUpdate({ data: initialData() }));
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(<MountedCommissioner />));
  });
  afterEach(async () => {
    try {
      await act(async () => root.unmount());
    } finally {
      host.remove();
      backend.setGlobalStore(previousStore);
      if (previousFocus?.isConnected) previousFocus.focus();
      if (previousByond) {
        Object.defineProperty(globalThis, 'Byond', previousByond);
      } else Reflect.deleteProperty(globalThis, 'Byond');
      if (previousAct) {
        Object.defineProperty(
          globalThis,
          'IS_REACT_ACT_ENVIRONMENT',
          previousAct,
        );
      } else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    }
  });
  const button = (label: string) => {
    const found = [...host.querySelectorAll('button')].find(
      (b) =>
        (b.getAttribute('aria-label') || b.textContent?.trim()) === label ||
        (b.closest('nav') && b.textContent?.trim().startsWith(label)),
    );
    if (!found) throw new Error(`Missing button: ${label}`);
    return found;
  };
  const click = async (label: string) =>
    act(async () => {
      button(label).focus();
      button(label).click();
    });
  const input = () => {
    const field = host.querySelector<HTMLInputElement>(
      'input[placeholder="For the militia. Urgent."]',
    );
    if (!field) throw new Error('Missing production note input');
    return field;
  };
  const edit = async (value = NOTE) => {
    await act(async () => {
      input().focus();
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input(), value);
      input().dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(input().value).toBe(value);
  };
  const update = async (data: Partial<CommissionerData>) => {
    await act(async () => store.dispatch(backend.backendUpdate({ data })));
  };

  test('Catalogue add-item round-trip retains the note and exact add action', async () => {
    await click('Your manifest');
    await edit();
    await click('Catalogue');
    await click('Add Knife to manifest');
    expect(send.mock.calls).toEqual([
      ['act/manifest_inc', { ref: 'recipe1', delta: 1 }],
    ]);
    await update({
      my_manifest_items: 2,
      manifest_total: 20,
      manifest: [{ ...initialData().manifest[0], qty: 2, line_total: 20 }],
    });
    await click('Your manifest');
    expect(input().value).toBe(NOTE);
    expect(host.textContent).toContain('2 of 10');
  });
  test('Posted orders round-trip retains note without sending an action', async () => {
    await click('Your manifest');
    await edit();
    await click('Posted orders');
    await click('Your manifest');
    expect(input().value).toBe(NOTE);
    expect(send).not.toHaveBeenCalled();
  });
  test('item edits and empty/refill updates do not infer submission success', async () => {
    await click('Your manifest');
    await edit();
    await click('Add one Knife to manifest');
    await update({
      my_manifest_items: 2,
      manifest: [{ ...initialData().manifest[0], qty: 2 }],
    });
    expect(input().value).toBe(NOTE);
    await click('Remove Knife from manifest');
    await update({ manifest: [], my_manifest_items: 0, manifest_total: 0 });
    expect(host.textContent).toContain('Your manifest is empty');
    await click('Catalogue');
    await click('Add Knife to manifest');
    await update({
      manifest: initialData().manifest,
      my_manifest_items: 1,
      manifest_total: 10,
    });
    await click('Your manifest');
    expect(input().value).toBe(NOTE);
    expect(send.mock.calls).toEqual([
      ['act/manifest_inc', { ref: 'recipe1', delta: 1 }],
      ['act/manifest_remove', { ref: 'recipe1' }],
      ['act/manifest_inc', { ref: 'recipe1', delta: 1 }],
    ]);
  });
  test('submit retains exact payload and immediate clear, without resurrection', async () => {
    await click('Your manifest');
    await edit();
    await click('Post Commission');
    expect(send.mock.calls).toEqual([['act/submit_manifest', { note: NOTE }]]);
    expect(input().value).toBe('');
    // Deliberately preserve existing behavior even before success/rejection arrives.
    await click('Posted orders');
    await click('Your manifest');
    expect(input().value).toBe('');
    await update({
      manifest: [],
      my_manifest_items: 0,
      has_active_order: true,
    });
    await update({
      manifest: initialData().manifest,
      my_manifest_items: 1,
      has_active_order: false,
    });
    expect(input().value).toBe('');
    await edit('A new request');
    await click('Catalogue');
    await click('Your manifest');
    expect(input().value).toBe('A new request');
  });
  test('unmount and reopen discard unsent draft', async () => {
    await click('Your manifest');
    await edit();
    await act(async () => root.render(null));
    await act(async () => root.render(<MountedCommissioner />));
    await click('Your manifest');
    expect(input().value).toBe('');
    expect(send).not.toHaveBeenCalled();
  });
  test('disabled submission and closed-machine fieldset preserve draft and send nothing', async () => {
    await click('Your manifest');
    await edit();
    await update({ my_deposit: 0 });
    expect(button('Post Commission').disabled).toBe(true);
    await click('Post Commission');
    expect(input().value).toBe(NOTE);
    await update({ locked: false, my_deposit: 100 });
    expect(input().closest('fieldset')?.disabled).toBe(true);
    await click('Posted orders');
    await click('Your manifest');
    expect(input().value).toBe(NOTE);
    expect(send).not.toHaveBeenCalled();
  });
}
