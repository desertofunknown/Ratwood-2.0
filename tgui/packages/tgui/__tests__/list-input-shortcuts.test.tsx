import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, type ReactNode, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const tguiRoot = resolve(import.meta.dir, '../../..');

if (!process.env.TGUI_LIST_SHORTCUT_TEST_CHILD) {
  test('mounted list input shortcuts (isolated layout shell and hotkeys)', () => {
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
        env: { ...process.env, TGUI_LIST_SHORTCUT_TEST_CHILD: '1' },
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
    onKeyUp,
  }: {
    children?: ReactNode;
    className?: string;
    onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
    onKeyUp?: React.KeyboardEventHandler<HTMLDivElement>;
  }) => (
    <div className={className} onKeyDown={onKeyDown} onKeyUp={onKeyUp}>
      {children}
    </div>
  );
  Shell.Content = Content;
  // Only native window chrome is replaced. Backend, input controls, selection,
  // actual document hotkey listeners, and key-passthrough dispatch are production code.
  mock.module(resolve(tguiRoot, 'packages/tgui/layouts'), () => ({
    Window: Shell,
  }));
  const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  Reflect.set(globalThis, 'Byond', {
    windowId: 'list-shortcuts',
    winget: () => Promise.resolve({}),
    command: mock(),
  });
  const backend = await import(resolve(tguiRoot, 'packages/tgui/backend'));
  const { ListInputModal } = await import(
    resolve(tguiRoot, 'packages/tgui/interfaces/ListInputModal')
  );
  const {
    setupHotKeys,
    releaseHeldKeys,
    startKeyPassthrough,
    stopKeyPassthrough,
  } = await import('tgui-core/hotkeys');
  // Set up once: setupHotKeys also installs global focus hooks without a disposer.
  // The child process isolates those hooks from every other repository test.
  setupHotKeys({
    keyUpVerb: 'KeyUp',
    keyDownVerb: 'KeyDown',
    verbParamsFn: (verb, key) => `${verb} "${key}" 0 0 0 0`,
  });
  await Promise.resolve();
  stopKeyPassthrough();
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
  let command: ReturnType<typeof mock>;
  const initialData = () => ({
    items: ['apple', 'banana', 'carrot', '2 pears'],
    init_value: 'apple',
    title: 'Choose a fruit',
    message: 'Select a choice.',
    timeout: 0,
    enable_preview: true,
    previewing: false,
    large_buttons: false,
    swapped_buttons: false,
  });
  const searchableItems = [
    'apple',
    'apricot',
    'banana',
    'blueberry',
    'carrot',
    'date',
    'kiwifruit',
    'fig',
    'grape',
  ];

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
    command = mock();
    Reflect.set(globalThis, 'Byond', {
      windowId: 'list-shortcuts',
      sendMessage,
      command,
      winget: () => Promise.resolve({}),
    });
    previousStore = backend.globalStore;
    store = createStore<{ backend: BackendState }>((state, action) => ({
      backend: backend.backendReducer(state?.backend, action) as BackendState,
    }));
    backend.setGlobalStore(store);
    store.dispatch(backend.backendUpdate({ data: initialData() }));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    startKeyPassthrough();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    // Release even if an assertion failed after keydown. Never carry held keys
    // or an active passthrough subscription into the next mounted test.
    releaseHeldKeys();
    stopKeyPassthrough();
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
  });

  const Connected = () => {
    useSyncExternalStore(store.subscribe, store.getState);
    return <ListInputModal />;
  };
  const settleAutofocus = () =>
    act(async () => {
      await new Promise((done) => setTimeout(done, 10));
    });
  const render = async (data: Partial<ReturnType<typeof initialData>> = {}) => {
    await act(async () => {
      store.dispatch(backend.backendUpdate({ data }));
      root.render(<Connected />);
    });
    await settleAutofocus();
  };
  const option = (index = 0) =>
    container.querySelectorAll<HTMLElement>('.ListInput__option')[index];
  const search = () =>
    container.querySelector<HTMLInputElement>(
      'input[placeholder="Search choices..."]',
    );
  const selected = () =>
    container
      .querySelector('.ListInput__option.Button--selected')
      ?.textContent?.trim();
  const button = (selector: string) => {
    const element = container.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing control ${selector}`);
    return element;
  };
  const keyCode = (key: string) =>
    key.length === 1
      ? key.toUpperCase().charCodeAt(0)
      : ({
          Enter: 13,
          Escape: 27,
          ArrowDown: 40,
          ArrowUp: 38,
          Tab: 9,
          Backspace: 8,
          Delete: 46,
          Home: 36,
          F1: 112,
        }[key] ?? 0);
  const keyboardEvent = (
    type: string,
    key: string,
    modifiers: KeyboardEventInit,
  ) =>
    new KeyboardEvent(type, {
      key,
      keyCode: keyCode(key),
      bubbles: true,
      cancelable: true,
      ...modifiers,
    });
  // These are dispatched DOM events, not native keyboard/browser automation.
  // For editing tests, set the value and dispatch input explicitly: happy-dom
  // does not implement a physical keystroke's native text insertion.
  const stroke = async (
    target: HTMLElement,
    key: string,
    modifiers: KeyboardEventInit = {},
    value?: string,
  ) => {
    const down = keyboardEvent('keydown', key, modifiers);
    await act(async () => {
      target.focus();
      target.dispatchEvent(down);
      if (value !== undefined) {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )!.set!.call(target, value);
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await settleAutofocus();
    const up = keyboardEvent('keyup', key, modifiers);
    await act(async () => {
      const focused = document.activeElement;
      (focused instanceof HTMLElement ? focused : document.body).dispatchEvent(
        up,
      );
    });
    return { down, up };
  };

  for (const [name, key, modifiers] of [
    ['lowercase', 'b', {}],
    ['Shift uppercase', 'B', { shiftKey: true }],
    ['Caps Lock uppercase', 'B', {}],
  ] as const) {
    test(`${name} jumps to a choice and consumes gameplay passthrough`, async () => {
      await render();
      const target = option();
      const { down } = await stroke(target, key, modifiers);
      expect(selected()).toContain('Banana');
      expect(document.activeElement).toBe(target);
      expect(down.defaultPrevented).toBe(true);
      expect(sendMessage).not.toHaveBeenCalled();
      expect(command).not.toHaveBeenCalled();
    });
    test(`${name} starts visible search, preserves text and transfers focus without gameplay passthrough`, async () => {
      await render({ items: searchableItems });
      const { down } = await stroke(option(), key, modifiers);
      expect(search()!.value).toBe(key);
      expect(document.activeElement).toBe(search());
      expect(container.querySelectorAll('.ListInput__option').length).toBe(2);
      expect(selected()).toContain('Banana');
      expect(down.defaultPrevented).toBe(true);
      expect(sendMessage).not.toHaveBeenCalled();
      expect(command).not.toHaveBeenCalled();
    });
  }
  test('uppercase letter with no matching choice remains consumed rather than triggering gameplay', async () => {
    await render();
    const { down } = await stroke(option(), 'Z');
    expect(selected()).toContain('Apple');
    expect(command).not.toHaveBeenCalled();
    expect(down.defaultPrevented).toBe(true);
    expect(sendMessage).not.toHaveBeenCalled();
  });
  test('numeric shortcut retains choice navigation and gameplay isolation', async () => {
    await render();
    const { down } = await stroke(option(), '2');
    expect(selected()).toContain('2 pears');
    expect(down.defaultPrevented).toBe(true);
    expect(command).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
  for (const modifier of ['ctrlKey', 'altKey', 'metaKey'] as const) {
    for (const searchVisible of [false, true]) {
      test(`${modifier} shortcuts remain unhandled with search ${searchVisible ? 'visible' : 'hidden'}`, async () => {
        await render(searchVisible ? { items: searchableItems } : {});
        const target = option();
        for (const key of ['b', 'B']) {
          const { down } = await stroke(target, key, { [modifier]: true });
          expect(down.defaultPrevented).toBe(false);
          expect(selected()).toContain('Apple');
          expect(document.activeElement).toBe(target);
          expect(search()?.value ?? '').toBe('');
        }
        // Unconsumed modifier combinations retain existing core/browser behavior.
        expect(sendMessage).not.toHaveBeenCalled();
      });
    }
  }
  for (const key of ['b', 'B']) {
    test(`typing ${key} inside search uses normal input updates, not jump-to-search`, async () => {
      await render({ items: searchableItems });
      const input = search()!;
      const { down } = await stroke(input, key, {}, key);
      expect(search()).toBe(input);
      expect(document.activeElement).toBe(input);
      expect(input.value).toBe(key);
      expect(selected()).toContain('Banana');
      expect(container.querySelectorAll('.ListInput__option').length).toBe(2);
      expect(down.defaultPrevented).toBe(false);
      expect(command).not.toHaveBeenCalled();
      expect(sendMessage).not.toHaveBeenCalled();
    });
  }
  for (const [selector, key, expected] of [
    ['.input-button__submit', 'Enter', ['act/submit', { entry: 'apple' }]],
    [
      '.InputModal__preview',
      'Enter',
      ['act/preview_toggle', { entry: 'apple' }],
    ],
    ['.input-button__cancel', 'Enter', ['act/cancel', {}]],
    ['.input-button__cancel', 'Escape', ['act/cancel', {}]],
  ] as const) {
    test(`footer ${selector} keeps its ${key} action without duplicate submission`, async () => {
      await render();
      await stroke(button(selector), key);
      expect(sendMessage.mock.calls).toEqual([[...expected]]);
      expect(command).not.toHaveBeenCalled();
    });
  }
  test('letters on footer controls do not change list selection or focus', async () => {
    await render({ items: searchableItems });
    const footer = button('.input-button__submit');
    for (const key of ['b', 'B']) {
      const { down } = await stroke(footer, key);
      expect(down.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(footer);
      expect(selected()).toContain('Apple');
      expect(search()!.value).toBe('');
    }
    expect(sendMessage).not.toHaveBeenCalled();
  });
  for (const [key, expected] of [
    ['Enter', ['act/submit', { entry: 'banana' }]],
    ['Escape', ['act/cancel', {}]],
  ] as const) {
    test(`search ${key} retains one modal action after editing`, async () => {
      await render({ items: searchableItems });
      await stroke(search()!, 'b', {}, 'b');
      await stroke(search()!, key);
      expect(sendMessage.mock.calls).toEqual([[...expected]]);
      expect(command).not.toHaveBeenCalled();
    });
  }
  // Range-based isAlphabetic must only receive a single character after case
  // normalization. Otherwise Tab, Home, Backspace, Delete and F1 become letters.
  for (const [key, passthrough] of [
    ['Tab', null],
    ['Backspace', null],
    ['Delete', 'Delete'],
    ['Home', 'Northwest'],
    ['F1', 'F1'],
  ] as const) {
    for (const searchVisible of [false, true]) {
      test(`${key} retains non-character behavior with search ${searchVisible ? 'visible' : 'hidden'}`, async () => {
        await render(searchVisible ? { items: searchableItems } : {});
        const { down, up } = await stroke(option(), key);
        expect(down.defaultPrevented).toBe(false);
        expect(up.defaultPrevented).toBe(false);
        expect(selected()).toContain('Apple');
        expect(search()?.value ?? '').toBe('');
        expect(sendMessage).not.toHaveBeenCalled();
        expect(command.mock.calls).toEqual(
          passthrough
            ? [
                [`KeyDown "${passthrough}" 0 0 0 0`],
                [`KeyUp "${passthrough}" 0 0 0 0`],
              ]
            : [],
        );
      });
    }
  }
  test('letter shortcuts cycle matching choices and wrap without submitting', async () => {
    await render({ items: ['apple', 'banana', 'blueberry', 'carrot'] });
    const target = option();
    for (const [key, expected] of [
      ['b', 'Banana'],
      ['B', 'Blueberry'],
      ['b', 'Banana'],
    ] as const) {
      const { down } = await stroke(target, key);
      expect(selected()).toContain(expected);
      expect(down.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(target);
    }
    expect(sendMessage).not.toHaveBeenCalled();
    expect(command).not.toHaveBeenCalled();
  });
  test('numeric shortcuts cycle from the current selection and wrap', async () => {
    await render({
      items: ['2 pears', 'apple', '2 plums'],
      init_value: '2 pears',
    });
    // Focus the currently selected option, not a different choice.
    const target = option();
    await stroke(target, '2');
    expect(selected()).toContain('2 pears');
    await stroke(target, '2');
    expect(selected()).toContain('2 plums');
    await stroke(target, '2');
    expect(selected()).toContain('2 pears');
    expect(sendMessage).not.toHaveBeenCalled();
    expect(command).not.toHaveBeenCalled();
  });
  test('one matching choice remains selected and no match leaves it unchanged', async () => {
    await render();
    const target = option();
    for (const key of ['b', 'B', 'z']) {
      await stroke(target, key);
      expect(selected()).toContain('Banana');
    }
    expect(sendMessage).not.toHaveBeenCalled();
    expect(command).not.toHaveBeenCalled();
  });
  test('letter shortcut on an empty list is consumed without submitting', async () => {
    await render({ items: [], init_value: '' });
    const target = button('.InputModal');
    const { down } = await stroke(target, 'B');
    expect(selected()).toBeUndefined();
    expect(down.defaultPrevented).toBe(true);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(command).not.toHaveBeenCalled();
  });

  test('duplicate values do not trap repeated letters on an indistinguishable choice', async () => {
    await render({ items: ['apple', 'banana', 'banana', 'blueberry'] });
    const target = option();
    for (const expected of ['Banana', 'Blueberry', 'Banana']) {
      await stroke(target, 'b');
      expect(selected()).toContain(expected);
    }
    expect(command).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
  test('arrow selection changes reset cycling so the next letter uses the first match', async () => {
    await render({ items: ['apple', 'banana', 'blueberry', 'carrot'] });
    const target = option();
    await stroke(target, 'b');
    await stroke(target, 'ArrowDown');
    expect(selected()).toContain('Blueberry');
    await stroke(target, 'b');
    expect(selected()).toContain('Banana');
    await stroke(target, 'b');
    expect(selected()).toContain('Blueberry');
    expect(command).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
  test('changing the choice list resets letter cycling', async () => {
    await render({ items: ['apple', 'banana', 'blueberry'] });
    await stroke(option(), 'b');
    await render({ items: ['apple', 'banana', 'blackberry'] });
    await stroke(option(), 'b');
    expect(selected()).toContain('Banana');
    await stroke(option(), 'b');
    expect(selected()).toContain('Blackberry');
    expect(command).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
  test('toggling search resets letter cycling without changing search typing behavior', async () => {
    await render({ items: ['apple', 'banana', 'blueberry'] });
    await stroke(option(), 'b');
    await act(async () => button('.ListInput__searchToggle').click());
    await settleAutofocus();
    await stroke(search()!, 'b', {}, 'b');
    await act(async () => button('.ListInput__searchToggle').click());
    await settleAutofocus();
    await stroke(option(), 'b');
    expect(selected()).toContain('Banana');
    await stroke(option(), 'b');
    expect(selected()).toContain('Blueberry');
    expect(command).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
  test('clicking the selected choice restarts first-match behavior', async () => {
    await render({ items: ['apple', 'banana', 'blueberry'] });
    const target = option();
    await stroke(target, 'b');
    await act(async () => option(1).click());
    await stroke(target, 'b');
    expect(selected()).toContain('Banana');
    await stroke(target, 'b');
    expect(selected()).toContain('Blueberry');
    expect(command).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
  test('case-distinct values retain their exact submission identity when cycling', async () => {
    await render({ items: ['apple', 'banana', 'Banana'] });
    const target = option();
    await stroke(target, 'b');
    await stroke(target, 'b');
    await stroke(target, 'Enter');
    expect(sendMessage.mock.calls).toEqual([
      ['act/submit', { entry: 'Banana' }],
    ]);
    expect(command).not.toHaveBeenCalled();
  });
  test('different and unmatched shortcuts restart first-match behavior without clearing selection', async () => {
    await render({ items: ['apple', 'banana', 'blueberry', 'carrot'] });
    const target = option();
    await stroke(target, 'b');
    await stroke(target, 'b');
    expect(selected()).toContain('Blueberry');
    await stroke(target, 'z');
    expect(selected()).toContain('Blueberry');
    await stroke(target, 'b');
    expect(selected()).toContain('Banana');
    await stroke(target, 'c');
    expect(selected()).toContain('Carrot');
    await stroke(target, 'b');
    expect(selected()).toContain('Banana');
    expect(command).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
}
