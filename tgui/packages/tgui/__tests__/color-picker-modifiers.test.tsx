import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const tguiRoot = resolve(import.meta.dir, '../../..');

if (!process.env.TGUI_COLOR_MODIFIERS_TEST_CHILD) {
  test('mounted color picker modifiers (isolated layout shell)', () => {
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
        env: { ...process.env, TGUI_COLOR_MODIFIERS_TEST_CHILD: '1' },
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
  // Replace only window chrome. ColorPickerModal, Interactive, backend, footer,
  // keyboard adapters and core controls are real. Isolate the mock in a child.
  mock.module(resolve(tguiRoot, 'packages/tgui/layouts'), () => ({
    Window: Shell,
  }));
  const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  Reflect.set(globalThis, 'Byond', { windowId: 'color-modifiers' });
  const backend: typeof import('../backend') = await import(
    resolve(tguiRoot, 'packages/tgui/backend')
  );
  const { ColorPickerModal }: typeof import('../interfaces/ColorPickerModal') =
    await import(
      resolve(tguiRoot, 'packages/tgui/interfaces/ColorPickerModal')
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
      windowId: 'color-modifiers',
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

  const render = async (defaultColor = '#408040') => {
    await act(async () => {
      store.dispatch(
        backend.backendUpdate({
          data: {
            autofocus: false,
            title: 'Color modifier regression',
            message: '',
            timeout: 0,
            default_color: defaultColor,
            presets: '',
            large_buttons: false,
            swapped_buttons: false,
          },
        }),
      );
      root.render(<ColorPickerModal />);
    });
  };
  const sliders = () =>
    Array.from(
      container.querySelectorAll<HTMLElement>('.react-colorful__interactive'),
    );
  const colorState = () =>
    sliders().map((slider) => [
      slider.getAttribute('aria-valuenow'),
      slider.getAttribute('aria-valuetext'),
    ]);
  const hex = () =>
    container.querySelector<HTMLInputElement>('input.Input')!.value;
  const key = async (
    target: HTMLElement,
    keyName: string,
    modifiers: KeyboardEventInit = {},
  ) => {
    // Dispatched DOM events verify React handling, not native key defaults.
    const event = new KeyboardEvent('keydown', {
      key: keyName,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    });
    const bubbled = mock();
    document.addEventListener('keydown', bubbled);
    try {
      await act(async () => {
        target.focus();
        target.dispatchEvent(event);
      });
      expect(bubbled.mock.calls).toEqual([[event]]);
    } finally {
      document.removeEventListener('keydown', bubbled);
    }
    expect(document.activeElement).toBe(target);
    return event;
  };
  const confirm = async (expected: string) => {
    expect(sendMessage).not.toHaveBeenCalled();
    const button = container.querySelector<HTMLElement>(
      '.input-button__submit',
    );
    if (!button) throw new Error('Missing production Confirm button');
    await act(async () => button.focus());
    await act(async () => button.click());
    expect(sendMessage.mock.calls).toEqual([
      ['act/submit', { entry: expected }],
    ]);
  };

  test('Ctrl+Right preserves Hue 120 and the submitted green color', async () => {
    await render('#00ff00');
    const hue = sliders()[1];
    expect(hue.getAttribute('aria-label')).toBe('Hue');
    expect(hue.getAttribute('aria-valuenow')).toBe('120');
    const event = await key(hue, 'ArrowRight', { ctrlKey: true });
    expect(hue.getAttribute('aria-valuenow')).toBe('120');
    expect(event.defaultPrevented).toBe(false);
    expect(hex()).toBe('00FF00');
    await confirm('#00ff00');
  });

  for (const modifier of ['ctrlKey', 'altKey', 'metaKey'] as const) {
    for (const shiftKey of [false, true]) {
      test(`${modifier}${shiftKey ? '+Shift' : ''} arrows leave all color controls untouched`, async () => {
        await render();
        expect(sliders()).toHaveLength(8);
        const initial = colorState();
        // Both Hue controls, the 2D field, S/V, and all three RGB channels.
        for (const slider of sliders()) {
          for (const arrow of [
            'ArrowRight',
            'ArrowLeft',
            'ArrowUp',
            'ArrowDown',
          ]) {
            const event = await key(slider, arrow, {
              [modifier]: true,
              shiftKey,
            });
            expect(colorState()).toEqual(initial);
            expect(hex()).toBe('408040');
            expect(event.defaultPrevented).toBe(false);
            expect(sendMessage).not.toHaveBeenCalled();
          }
        }
        await confirm('#408040');
      });
    }
  }

  const controls = [
    {
      name: 'Color',
      index: 0,
      value: 'Saturation 55%, Brightness 50%',
      hex: '#3a803a',
    },
    { name: 'main Hue', index: 1, value: '138', hex: '#408053' },
    { name: 'row Hue', index: 2, value: '138', hex: '#408053' },
    { name: 'Saturation', index: 3, value: '55', hex: '#3a803a' },
    { name: 'Value', index: 4, value: '55', hex: '#468d46' },
    { name: 'Red', index: 5, value: '76.75', hex: '#4d8040' },
    { name: 'Green', index: 6, value: '140.75', hex: '#408d40' },
    { name: 'Blue', index: 7, value: '76.75', hex: '#40804d' },
  ];
  for (const control of controls) {
    for (const shiftKey of [false, true]) {
      test(`${control.name} ${shiftKey ? 'Shift+' : ''}Right keeps the existing step and submits`, async () => {
        await render();
        const slider = sliders()[control.index];
        const event = await key(slider, 'ArrowRight', { shiftKey });
        expect(event.defaultPrevented).toBe(true);
        expect(
          slider.getAttribute(
            control.index === 0 ? 'aria-valuetext' : 'aria-valuenow',
          ),
        ).toBe(control.value);
        expect(hex()).toBe(control.hex.slice(1).toUpperCase());
        await confirm(control.hex);
      });
    }
  }

  test('ordinary and Shift arrows retain 2D directions and reversal', async () => {
    await render();
    const field = sliders()[0];
    const cases = [
      ['ArrowUp', false, 'Saturation 50%, Brightness 55%', '468D46'],
      ['ArrowDown', true, 'Saturation 50%, Brightness 50%', '408040'],
      ['ArrowLeft', false, 'Saturation 45%, Brightness 50%', '468046'],
      ['ArrowRight', true, 'Saturation 50%, Brightness 50%', '408040'],
    ] as const;
    for (const [arrow, shiftKey, value, expectedHex] of cases) {
      expect((await key(field, arrow, { shiftKey })).defaultPrevented).toBe(
        true,
      );
      expect(field.getAttribute('aria-valuetext')).toBe(value);
      expect(hex()).toBe(expectedHex);
    }
    await confirm('#408040');
  });

  test('one-dimensional Up/Down and non-arrow keys keep their existing behavior', async () => {
    await render();
    const initial = colorState();
    for (const slider of sliders().slice(1)) {
      for (const arrow of ['ArrowUp', 'ArrowDown']) {
        for (const shiftKey of [false, true]) {
          expect(
            (await key(slider, arrow, { shiftKey })).defaultPrevented,
          ).toBe(true);
          expect(colorState()).toEqual(initial);
        }
      }
    }
    for (const slider of sliders()) {
      for (const other of ['Tab', 'Home', 'End', 'Enter', 'Escape', 'a']) {
        expect((await key(slider, other)).defaultPrevented).toBe(false);
        expect(colorState()).toEqual(initial);
      }
    }
    await confirm('#408040');
  });
}
