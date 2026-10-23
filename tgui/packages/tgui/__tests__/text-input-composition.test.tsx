import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const tguiRoot = resolve(import.meta.dir, '../../..');

if (!process.env.TGUI_TEXT_COMPOSITION_TEST_CHILD) {
  test('text input composition keys (isolated layout shell)', () => {
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
        env: { ...process.env, TGUI_TEXT_COMPOSITION_TEST_CHILD: '1' },
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
  Reflect.set(globalThis, 'Byond', { windowId: 'text-composition' });
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
      windowId: 'text-composition',
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
  const renderAndEdit = async (value: string, multiline: boolean) => {
    await act(async () => {
      store.dispatch(backend.backendUpdate({ data: { multiline } }));
      root.render(<TextInputModal />);
      await new Promise((done) => setTimeout(done, 10));
    });
    // Let the core textarea's deferred autofocus settle before editing.
    await act(async () => {
      await new Promise((done) => setTimeout(done, 10));
    });
    const textarea = container.querySelector('textarea');
    if (!textarea) throw new Error('Missing production textarea');
    // Dispatched DOM events test event policy, not native IME acceptance.
    await act(async () => {
      textarea.focus();
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!.call(textarea, value);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(sendMessage).not.toHaveBeenCalled();
    return textarea;
  };
  for (const multiline of [false, true]) {
    for (const key of ['Enter', 'Escape']) {
      test(`composing ${key} preserves ${multiline ? 'multiline' : 'single-line'} draft and focus`, async () => {
        const textarea = await renderAndEdit('unfinished candidate', multiline);
        const event = new KeyboardEvent('keydown', {
          key,
          bubbles: true,
          cancelable: true,
          isComposing: true,
        });
        await act(async () => textarea.dispatchEvent(event));
        expect(sendMessage.mock.calls).toEqual([]);
        expect(event.defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(textarea);
        expect(textarea.value).toBe('unfinished candidate');
      });
    }
  }
  test('ordinary Escape still cancels', async () => {
    const textarea = await renderAndEdit('draft', false);
    await act(async () =>
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(sendMessage.mock.calls).toEqual([['act/cancel', {}]]);
  });
  test('composition end followed by ordinary Enter submits in the same mount', async () => {
    const textarea = await renderAndEdit('candidate', false);
    await act(async () => {
      textarea.dispatchEvent(
        new CompositionEvent('compositionstart', { bubbles: true }),
      );
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
          isComposing: true,
        }),
      );
    });
    expect(sendMessage.mock.calls).toEqual([]);
    expect(document.activeElement).toBe(textarea);
    await act(async () => {
      textarea.dispatchEvent(
        new CompositionEvent('compositionend', {
          bubbles: true,
          data: 'finished candidate',
        }),
      );
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!.call(textarea, 'finished candidate');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(sendMessage.mock.calls).toEqual([
      ['act/submit', { entry: 'finished candidate' }],
    ]);
  });
}
