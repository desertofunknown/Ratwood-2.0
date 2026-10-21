import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// The production component/backend/core controls run with an isolated layout shell.
if (!process.env.TGUI_BLUEPRINT_IMPORT_TEST_CHILD) {
  test('mounted blueprint import (isolated layout shell)', () => {
    const result = spawnSync(process.execPath, ['test', import.meta.path], {
      cwd: resolve(import.meta.dir, '../../..'),
      timeout: 30000,
      env: { ...process.env, TGUI_BLUEPRINT_IMPORT_TEST_CHILD: '1' },
      encoding: 'utf8',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
    expect(result.status).toBe(0);
  });
} else {
  const Shell = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  Shell.Content = Shell;
  mock.module('../layouts', () => ({ Window: Shell }));
  const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  Reflect.set(globalThis, 'Byond', { windowId: 'blueprint-import' });
  const backend = await import('../backend');
  const { BlueprintPlanner } = await import('../interfaces/BlueprintPlanner');
  if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
  else Reflect.deleteProperty(globalThis, 'Byond');
  type BackendState = NonNullable<Parameters<typeof backend.backendReducer>[0]>;
  let previousStore: Store;
  let previousByond: PropertyDescriptor | undefined;
  let container: HTMLDivElement;
  let root: Root;
  let sendMessage: ReturnType<typeof mock>;
  const env = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  let previousAct: boolean | undefined;
  beforeEach(() => {
    previousAct = env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT = true;
    previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
    sendMessage = mock();
    Reflect.set(globalThis, 'Byond', {
      windowId: 'blueprint-import',
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
    store.dispatch(
      backend.backendUpdate({
        data: { max_radius: 10, buildable_types: {}, saved_grid: [] },
      }),
    );
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    backend.setGlobalStore(previousStore);
    if (previousByond) {
      Object.defineProperty(globalThis, 'Byond', previousByond);
    } else Reflect.deleteProperty(globalThis, 'Byond');
    env.IS_REACT_ACT_ENVIRONMENT = previousAct;
  });
  const click = async (text: string) => {
    const button = [...document.querySelectorAll<HTMLElement>('.Button')].find(
      (node) => node.textContent?.trim() === text,
    );
    if (!button) throw new Error(`Missing button ${text}`);
    await act(async () => button.click());
  };
  const paste = async (value: unknown) => {
    await act(async () => root.render(<BlueprintPlanner />));
    await click('Paste Blueprint');
    const input = document.querySelector<HTMLInputElement>(
      'input[placeholder="Paste BP:... code here"]',
    );
    if (!input) throw new Error('Missing import input');
    await act(async () => {
      input.focus();
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, `BP:${btoa(JSON.stringify(value))}`);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('Load into Editor');
  };
  test('null imported cells show a recoverable error instead of throwing', async () => {
    await paste({ max_floors: 2, grid: [null] });
    expect(document.body.textContent).toContain(
      'No valid tiles found in blueprint!',
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });
  for (const [name, grid] of [
    ['primitives', [false, true, 5, 'tile']],
    ['arrays', [[], [0, 0, 0, 'floor']]],
    ['missing fields', [{}, { x: 0, y: 0, type: 'floor' }]],
    [
      'out of bounds',
      [
        { x: 11, y: 0, z: 0, type: 'floor' },
        { x: 0, y: 0, z: 4, type: 'floor' },
      ],
    ],
  ] as const) {
    test(`${name} keep the import dialog open with the existing error`, async () => {
      await paste({ grid });
      expect(document.body.textContent).toContain(
        'No valid tiles found in blueprint!',
      );
      expect(
        document.querySelector('input[placeholder="Paste BP:... code here"]'),
      ).not.toBeNull();
      expect(sendMessage).not.toHaveBeenCalled();
    });
  }
  test('mixed cells retain valid tile order, directions and floors without automatic backend actions', async () => {
    await paste({
      max_floors: 3,
      grid: [
        null,
        { x: 1, y: 2, z: 0, type: 'floor', dir: 4 },
        [],
        { x: -1, y: 0, z: 2, type: 'floor' },
        false,
      ],
    });
    expect(
      document.querySelector('input[placeholder="Paste BP:... code here"]'),
    ).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
    await click('Finish Blueprint');
    expect(sendMessage.mock.calls).toEqual([
      [
        'act/save_design',
        { packed_data: { floor: ['1,2,0,4', '-1,0,2,2'] }, max_floors: 3 },
      ],
    ]);
  });
  test('failed import can be corrected and does not erase the current design', async () => {
    await paste({ grid: [{ x: 0, y: 0, z: 0, type: 'floor' }] });
    await paste({ grid: [null] });
    await click('Cancel');
    await click('Finish Blueprint');
    expect(sendMessage.mock.calls).toEqual([
      [
        'act/save_design',
        { packed_data: { floor: ['0,0,0,2'] }, max_floors: 2 },
      ],
    ]);
    sendMessage.mockClear();
    await paste({ grid: [{ x: 2, y: 1, z: 0, type: 'wall', dir: 8 }] });
    await click('Finish Blueprint');
    expect(sendMessage.mock.calls).toEqual([
      [
        'act/save_design',
        { packed_data: { wall: ['2,1,0,8'] }, max_floors: 2 },
      ],
    ]);
  });
  test('uncoercible floor metadata is rejected without replacing the design', async () => {
    await paste({
      max_floors: { toString: null },
      grid: [{ x: 0, y: 0, z: 0, type: 'floor' }],
    });
    expect(document.body.textContent).toContain(
      'Invalid blueprint string or empty design!',
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });
  test('structured directions cannot enter the design and crash its save', async () => {
    await paste({
      grid: [{ x: 0, y: 0, z: 0, type: 'floor', dir: { toString: null } }],
    });
    if (
      !document.querySelector('input[placeholder="Paste BP:... code here"]')
    ) {
      await click('Finish Blueprint');
    }
    expect(document.body.textContent).toContain(
      'No valid tiles found in blueprint!',
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('type names matching object properties are packed as own entries', async () => {
    await paste({
      grid: ['__proto__', 'constructor', 'toString'].map((type, x) => ({
        x,
        y: 0,
        z: 0,
        type,
      })),
    });
    await click('Finish Blueprint');
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const packed = sendMessage.mock.calls[0][1].packed_data;
    for (const [index, name] of [
      '__proto__',
      'constructor',
      'toString',
    ].entries()) {
      expect(Object.prototype.hasOwnProperty.call(packed, name)).toBe(true);
      expect(packed[name]).toEqual([`${index},0,0,2`]);
    }
  });

  for (const [name, dir] of [
    ['object', {}],
    ['array', [4]],
    ['string', '4'],
    ['boolean', true],
    ['null', null],
  ] as const) {
    test(`invalid ${name} direction is skipped while valid neighboring tiles remain`, async () => {
      await paste({
        grid: [
          { x: 0, y: 0, z: 0, type: 'floor', dir },
          { x: 1, y: 0, z: 0, type: 'wall', dir: 8 },
        ],
      });
      await click('Finish Blueprint');
      expect(sendMessage.mock.calls).toEqual([
        [
          'act/save_design',
          { packed_data: { wall: ['1,0,0,8'] }, max_floors: 2 },
        ],
      ]);
    });
  }
  for (const [name, max_floors, expected] of [
    ['number', 3, 3],
    ['numeric string', '4', 4],
    ['missing', undefined, 2],
    ['null', null, 2],
    ['invalid string', 'not a number', 2],
    ['large', 20, 4],
    ['small', 1, 2],
    ['coercible array', [3], 3],
  ] as const) {
    test(`existing ${name} floor conversion is preserved`, async () => {
      await paste({
        max_floors,
        grid: [{ x: 0, y: 0, z: 0, type: 'floor', dir: 4 }],
      });
      await click('Finish Blueprint');
      expect(sendMessage.mock.calls).toEqual([
        [
          'act/save_design',
          { packed_data: { floor: ['0,0,0,4'] }, max_floors: expected },
        ],
      ]);
    });
  }
  test('floor conversion failure leaves an existing design intact and can recover', async () => {
    await paste({ max_floors: 3, grid: [{ x: 0, y: 0, z: 0, type: 'floor' }] });
    await paste({
      max_floors: { toString: null },
      grid: [{ x: 8, y: 8, z: 0, type: 'wall' }],
    });
    await click('Cancel');
    await click('Finish Blueprint');
    expect(sendMessage.mock.calls).toEqual([
      [
        'act/save_design',
        { packed_data: { floor: ['0,0,0,2'] }, max_floors: 3 },
      ],
    ]);
    sendMessage.mockClear();
    await paste({
      max_floors: 4,
      grid: [{ x: 2, y: 1, z: 0, type: 'wall', dir: 8 }],
    });
    await click('Finish Blueprint');
    expect(sendMessage.mock.calls).toEqual([
      [
        'act/save_design',
        { packed_data: { wall: ['2,1,0,8'] }, max_floors: 4 },
      ],
    ]);
  });
}
