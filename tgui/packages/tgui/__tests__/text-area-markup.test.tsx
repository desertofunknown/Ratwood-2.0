import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const tguiRoot = resolve(import.meta.dir, '../../..');

if (!process.env.TGUI_TEXT_MARKUP_TEST_CHILD) {
  test('text area markup delivery (isolated layout shell)', () => {
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
        env: { ...process.env, TGUI_TEXT_MARKUP_TEST_CHILD: '1' },
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
  // Only native window chrome is replaced. The production input modal,
  // backend, keyboard TextArea wrapper, core TextArea, and buttons are real.
  mock.module(resolve(tguiRoot, 'packages/tgui/layouts'), () => ({
    Window: Shell,
  }));
  const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  Reflect.set(globalThis, 'Byond', { windowId: 'text-markup' });
  const backend = await import(resolve(tguiRoot, 'packages/tgui/backend'));
  const { TextInputModal } = await import(
    resolve(tguiRoot, 'packages/tgui/interfaces/TextInputModal')
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
      windowId: 'text-markup',
      sendMessage,
    });
    previousStore = backend.globalStore;
    store = createStore<{ backend: BackendState }>((state, action) => ({
      backend: backend.backendReducer(state?.backend, action) as BackendState,
    }));
    backend.setGlobalStore(store);
    store.dispatch(
      backend.backendUpdate({
        data: {
          large_buttons: false,
          swapped_buttons: false,
          max_length: 500,
          message: 'Write some text.',
          multiline: false,
          placeholder: '',
          timeout: 0,
          title: 'Text Input',
          spellcheck: false,
        },
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
  const renderModal = async (placeholder = 'abcdef', multiline = false) => {
    await act(async () => {
      store.dispatch(
        backend.backendUpdate({
          data: {
            placeholder,
            multiline,
            preview_leadin: 'Preview:',
          },
        }),
      );
      root.render(<TextInputModal />);
    });
    await act(async () => {
      await new Promise((done) => setTimeout(done, 10));
    });
    const textarea = container.querySelector('textarea');
    if (!textarea) throw new Error('Missing production textarea');
    return textarea;
  };
  const shortcut = async (
    textarea: HTMLTextAreaElement,
    key: string,
    modifier: 'ctrlKey' | 'metaKey',
    start: number,
    end: number,
  ) => {
    await act(async () => {
      textarea.focus();
      textarea.setSelectionRange(start, end);
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', {
          key,
          [modifier]: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  };
  const confirm = async (expected: string) => {
    await act(async () => {
      const button = container.querySelector<HTMLElement>(
        '.input-button__submit',
      );
      if (!button) throw new Error('Missing Confirm button');
      button.click();
    });
    expect(sendMessage.mock.calls).toEqual([
      ['act/submit', { entry: expected }],
    ]);
  };
  const expectHints = (expected: string) => {
    const hints = [...container.querySelectorAll('.InputModal__hint')].map(
      (element) => element.textContent,
    );
    expect(hints).toEqual([
      `Preview: ${expected.trim() || '...'}`,
      `${expected.length} / 500`,
    ]);
  };
  for (const modifier of ['ctrlKey', 'metaKey'] as const) {
    for (const [key, marker] of [
      ['b', '+'],
      ['i', '|'],
      ['u', '_'],
    ]) {
      test(`${modifier}+${key} synchronizes visible text, preview, count and immediate Confirm`, async () => {
        const textarea = await renderModal();
        await shortcut(textarea, key, modifier, 1, 4);
        const expected = `a${marker}bcd${marker}ef`;
        expect(textarea.value).toBe(expected);
        expect(sendMessage).not.toHaveBeenCalled();
        // Confirm happens without a subsequent edit or blur to repair parent state.
        await confirm(expected);
        expectHints(expected);
      });
      test(`${modifier}+${key} with empty selection submits inserted markers`, async () => {
        const textarea = await renderModal();
        await shortcut(textarea, key, modifier, 2, 2);
        const expected = `ab${marker}${marker}cdef`;
        expect(textarea.value).toBe(expected);
        expectHints(expected);
        await confirm(expected);
      });
    }
  }
  for (const [multiline, initial, expected] of [
    [false, 'ab\ncd', '+abcd+'],
    [true, 'ab\n\n\ncd', '+ab\n\ncd+'],
  ] as const) {
    test(`markup respects ${multiline ? 'multiline' : 'single-line'} submission sanitization`, async () => {
      const textarea = await renderModal(initial, multiline);
      await shortcut(textarea, 'b', 'ctrlKey', 0, initial.length);
      expectHints(expected);
      await confirm(expected);
    });
  }
  test('ordinary input still updates parent, preview, count and Confirm', async () => {
    const textarea = await renderModal();
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!.call(textarea, 'plain text');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(textarea.value).toBe('plain text');
    expectHints('plain text');
    await confirm('plain text');
  });
  test('an unmapped modified key leaves text and submission unchanged', async () => {
    const textarea = await renderModal();
    await shortcut(textarea, 'z', 'ctrlKey', 1, 4);
    expect(textarea.value).toBe('abcdef');
    expectHints('abcdef');
    await confirm('abcdef');
  });
  const { TextArea } = await import('tgui-core/components');
  test('expensive markup callback remains immediate while ordinary edits debounce', async () => {
    const onChange = mock();
    await act(async () =>
      root.render(
        <TextArea
          value="abcdef"
          userMarkup={{ b: '+' }}
          expensive
          onChange={onChange}
        />,
      ),
    );
    const textarea = container.querySelector('textarea')!;
    await shortcut(textarea, 'b', 'ctrlKey', 1, 4);
    expect(onChange.mock.calls).toEqual([['a+bcd+ef']]);
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!.call(textarea, 'ordinary');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onChange.mock.calls).toEqual([['a+bcd+ef']]);
    await act(async () => {
      await new Promise((done) => setTimeout(done, 300));
    });
    expect(onChange.mock.calls).toEqual([['a+bcd+ef'], ['ordinary']]);
  });
  test('multi-character markers and subsequent selections retain the computed text', async () => {
    const onChange = mock();
    await act(async () =>
      root.render(
        <TextArea
          value="abcdef"
          userMarkup={{ b: '**' }}
          onChange={onChange}
        />,
      ),
    );
    const textarea = container.querySelector('textarea')!;
    await shortcut(textarea, 'b', 'ctrlKey', 1, 4);
    expect(textarea.value).toBe('a**bcd**ef');
    expect(onChange.mock.calls).toEqual([['a**bcd**ef']]);
    await shortcut(textarea, 'b', 'metaKey', 8, 10);
    expect(textarea.value).toBe('a**bcd****ef**');
    expect(onChange.mock.calls).toEqual([['a**bcd**ef'], ['a**bcd****ef**']]);
  });
  test('markup in an empty input updates preview and submission', async () => {
    const textarea = await renderModal('');
    await shortcut(textarea, 'b', 'ctrlKey', 0, 0);
    expect(textarea.value).toBe('++');
    expectHints('++');
    await confirm('++');
  });
  test('default wrapper Tab remains unhandled and does not change text', async () => {
    const textarea = await renderModal();
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    await act(async () => textarea.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
    expect(textarea.value).toBe('abcdef');
    expectHints('abcdef');
    await confirm('abcdef');
  });
  test('opt-in Tab indentation retains existing DOM callback timing', async () => {
    const onChange = mock();
    await act(async () =>
      root.render(
        <TextArea
          value="abcdef"
          dontUseTabForIndent={false}
          onChange={onChange}
        />,
      ),
    );
    const textarea = container.querySelector('textarea')!;
    await shortcut(textarea, 'Tab', 'ctrlKey', 1, 4);
    expect(textarea.value).toBe('a\tef');
    // The separate upstream Tab callback behavior is intentionally not repaired.
    expect(onChange.mock.calls).toEqual([['abcdef']]);
  });
}
