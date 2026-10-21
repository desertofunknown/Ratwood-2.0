import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const tguiRoot = resolve(import.meta.dir, '../../..');

if (!process.env.TGUI_NUMBER_VALIDITY_TEST_CHILD) {
  test('number input validity and recovery (isolated layout shell)', () => {
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
        env: { ...process.env, TGUI_NUMBER_VALIDITY_TEST_CHILD: '1' },
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
  const Content = ({
    children,
    className,
    onKeyDown,
  }: {
    children?: ReactNode;
    className?: string;
    onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  }) => (
    <div className={className} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
  Shell.Content = Content;
  // Only native window chrome is replaced. The production modal, backend,
  // RestrictedInput, keyboard button adapter, core buttons, and footer are real.
  // The subprocess keeps this layout mock isolated from other test files.
  mock.module(resolve(tguiRoot, 'packages/tgui/layouts'), () => ({
    Window: Shell,
  }));
  const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  Reflect.set(globalThis, 'Byond', { windowId: 'number-validity' });
  const backend: typeof import('../backend') = await import(
    resolve(tguiRoot, 'packages/tgui/backend')
  );
  const { NumberInputModal }: typeof import('../interfaces/NumberInputModal') =
    await import(
      resolve(tguiRoot, 'packages/tgui/interfaces/NumberInputModal')
    );
  if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
  else Reflect.deleteProperty(globalThis, 'Byond');

  type BackendState = NonNullable<Parameters<typeof backend.backendReducer>[0]>;
  let previousStore: Store;
  let store: Store;
  let previousByond: PropertyDescriptor | undefined;
  let previousAct: PropertyDescriptor | undefined;
  let previousFocus: HTMLElement | null;
  let container: HTMLDivElement;
  let root: Root;
  let sendMessage: ReturnType<typeof mock>;
  const initialData = (float = false) => ({
    title: 'Number input validity',
    message: 'Enter a value.',
    timeout: 0,
    init_value: float ? 1 : 5,
    min_value: float ? 0.8 : 0,
    max_value: float ? 1.35 : 10,
    round_value: !float,
    large_buttons: false,
    swapped_buttons: false,
  });

  beforeEach(() => {
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
    sendMessage = mock();
    Reflect.set(globalThis, 'Byond', {
      windowId: 'number-validity',
      sendMessage,
    });
    previousStore = backend.globalStore;
    store = createStore<{ backend: BackendState }>((state, action) => ({
      backend: backend.backendReducer(state?.backend, action) as BackendState,
    }));
    backend.setGlobalStore(store);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    try {
      await act(async () => root.unmount());
    } finally {
      container.remove();
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

  const input = (): HTMLInputElement => {
    const element = container.querySelector<HTMLInputElement>(
      'input.RestrictedInput',
    );
    if (!element) throw new Error('Missing production RestrictedInput');
    return element;
  };
  const render = async (
    float = false,
    overrides: Partial<ReturnType<typeof initialData>> = {},
  ) => {
    await act(async () => {
      store.dispatch(
        backend.backendUpdate({
          data: { ...initialData(float), ...overrides },
        }),
      );
      root.render(<NumberInputModal />);
    });
    // Let the core input's deferred autofocus settle before editing.
    await act(async () => {
      await new Promise((done) => setTimeout(done, 10));
    });
    expect(document.activeElement).toBe(input());
  };
  const recoveryValueKeys = {
    min: 'min_value',
    max: 'max_value',
    reset: 'init_value',
  } as const;
  type Recovery = keyof typeof recoveryValueKeys;
  const iconSelectors = {
    min: '.fa-angle-double-left',
    decrease: '.fa-angle-down',
    increase: '.fa-angle-up',
    max: '.fa-angle-double-right',
    reset: '.fa-redo',
  } as const;
  type Control = keyof typeof iconSelectors | 'confirm' | 'cancel';
  const button = (kind: Control): HTMLElement => {
    const element =
      kind === 'confirm' || kind === 'cancel'
        ? container.querySelector<HTMLElement>(
            kind === 'confirm'
              ? '.input-button__submit'
              : '.input-button__cancel',
          )
        : container
            .querySelector(iconSelectors[kind])
            ?.closest<HTMLElement>('.Button');
    if (!element) throw new Error(`Missing number input control ${kind}`);
    return element;
  };
  const disabled = (kind: Control): boolean =>
    button(kind).classList.contains('Button--disabled');
  const edit = async (value: string) => {
    // These are dispatched DOM edits, not native keyboard/browser automation.
    // happy-dom does not perform physical keystrokes' text insertion.
    await act(async () => {
      input().focus();
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input(), value);
      input().dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const click = async (kind: Control) => {
    const target = button(kind);
    // happy-dom .click() lacks the native pointer default that moves focus.
    // Move focus before clicking: retained editor focus would incorrectly
    // suppress RestrictedInput's production external-value synchronization.
    await act(async () => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      if (!disabled(kind)) target.focus();
    });
    await act(async () => target.click());
  };
  const key = async (
    kind: Control | 'input',
    keyName: 'Enter' | 'Escape' | ' ' = 'Enter',
  ) => {
    const target = kind === 'input' ? input() : button(kind);
    await act(async () => target.focus());
    await act(async () => {
      target.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: keyName,
          keyCode: { Enter: 13, Escape: 27, ' ': 32 }[keyName],
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  };
  const assertInvalid = async () => {
    expect(input().validity.valid).toBe(false);
    expect(input().classList.contains('RestrictedInput--invalid')).toBe(true);
    expect(disabled('confirm')).toBe(true);
    expect(disabled('decrease')).toBe(true);
    expect(disabled('increase')).toBe(true);
    await key('input');
    await click('confirm');
    expect(sendMessage).not.toHaveBeenCalled();
    // Recovery starts with the editor focused, even though the blocked Enter
    // attempt above blurred it. Pointer helpers must model the next blur.
    await act(async () => input().focus());
    expect(document.activeElement).toBe(input());
  };

  for (const float of [false, true]) {
    const modeName = float ? 'float' : 'integer';
    for (const bad of float ? ['0.79', '1.36'] : ['-1', '11', '5.5']) {
      for (const recovery of ['min', 'max', 'reset'] as const) {
        for (const mode of ['pointer', 'keyboard'] as const) {
          test(`${modeName} draft ${bad} recovers by ${mode} ${recovery} and submits`, async () => {
            await render(float);
            await edit(bad);
            await assertInvalid();
            if (mode === 'pointer') await click(recovery);
            else await key(recovery);
            const expected = initialData(float)[recoveryValueKeys[recovery]];
            expect(input().value).toBe(String(expected));
            expect(input().validity.valid).toBe(true);
            expect(disabled('confirm')).toBe(false);
            expect(sendMessage).not.toHaveBeenCalled();
            await key('input');
            expect(sendMessage.mock.calls).toEqual([
              ['act/submit', { entry: expected }],
            ]);
          });
        }
      }
    }
    test(`${modeName} recovery permits adjustment and Confirm`, async () => {
      await render(float);
      await edit(float ? '99' : '11');
      await assertInvalid();
      await click('reset');
      await click('increase');
      expect(input().value).toBe(float ? '1.01' : '6');
      expect(disabled('confirm')).toBe(false);
      await click('confirm');
      expect(sendMessage.mock.calls).toEqual([
        ['act/submit', { entry: float ? 1.01 : 6 }],
      ]);
    });
    test(`${modeName} repeated invalid and valid transitions revalidate`, async () => {
      await render(float);
      const recoveries: Recovery[] = [
        'min',
        'max',
        'reset',
        'min',
        'max',
        'reset',
      ];
      for (const recovery of recoveries) {
        await edit(float ? '99' : '11');
        expect(disabled('confirm')).toBe(true);
        await click(recovery);
        expect(input().validity.valid).toBe(true);
        expect(disabled('confirm')).toBe(false);
      }
      expect(sendMessage).not.toHaveBeenCalled();
    });
  }
  test('zero-only backend bounds remain valid and submit zero', async () => {
    await render(false, { init_value: 0, min_value: 0, max_value: 0 });
    await edit('1');
    await assertInvalid();
    await click('min');
    expect(input().value).toBe('0');
    expect(disabled('confirm')).toBe(false);
    await click('confirm');
    expect(sendMessage.mock.calls).toEqual([['act/submit', { entry: 0 }]]);
  });
  test('negative integer range recovers and respects adjustment bounds', async () => {
    await render(false, { init_value: -5, min_value: -10, max_value: -1 });
    await edit('0');
    await assertInvalid();
    await click('max');
    expect(input().value).toBe('-1');
    expect(disabled('increase')).toBe(true);
    await click('decrease');
    expect(input().value).toBe('-2');
    await click('confirm');
    expect(sendMessage.mock.calls).toEqual([['act/submit', { entry: -2 }]]);
  });
}
