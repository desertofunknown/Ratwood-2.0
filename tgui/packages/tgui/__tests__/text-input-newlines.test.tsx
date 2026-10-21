import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const tguiRoot = resolve(import.meta.dir, '../../..');

if (!process.env.TGUI_TEXT_NEWLINE_TEST_CHILD) {
  test('text input newline sanitization (isolated layout shell)', () => {
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
        env: { ...process.env, TGUI_TEXT_NEWLINE_TEST_CHILD: '1' },
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
  Reflect.set(globalThis, 'Byond', { windowId: 'text-newlines' });
  const backend = await import(resolve(tguiRoot, 'packages/tgui/backend'));
  const { TextInputModal, removeAllSkiplines, sanitizeMultiline } =
    await import(resolve(tguiRoot, 'packages/tgui/interfaces/TextInputModal'));
  if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
  else Reflect.deleteProperty(globalThis, 'Byond');

  const singleLineCases = [
    ['empty', '', ''],
    ['ordinary text', '  one two  ', '  one two  '],
    ['first LF run', 'one\n\n\ntwo', 'onetwo'],
    ['separated LF runs', 'one\ntwo\nthree', 'onetwothree'],
    ['separated CRLF runs', 'one\r\ntwo\r\nthree', 'onetwothree'],
    ['separated CR-only runs', 'one\rtwo\rthree', 'onetwothree'],
    ['mixed runs and boundaries', '\r\none\ntwo\rthree\r\n', 'onetwothree'],
    [
      'spaces and tabs preserved',
      ' one \n two\t\n three ',
      ' one  two\t three ',
    ],
  ];
  for (const [name, input, expected] of singleLineCases) {
    test(`single-line sanitizer: ${name}`, () => {
      expect(removeAllSkiplines(input)).toBe(expected);
    });
  }
  const multilineCases = [
    ['empty', '', ''],
    ['ordinary text', '  one two  ', '  one two  '],
    [
      'one and two LF line breaks preserved',
      'one\ntwo\n\nthree',
      'one\ntwo\n\nthree',
    ],
    [
      'one and two CRLF line breaks preserved',
      'one\r\ntwo\r\n\r\nthree',
      'one\r\ntwo\r\n\r\nthree',
    ],
    ['first long LF run', 'one\n\n\ntwo', 'one\n\ntwo'],
    [
      'separated long LF runs',
      'one\n\n\ntwo\n\n\n\nthree',
      'one\n\ntwo\n\nthree',
    ],
    [
      'separated long CRLF runs',
      'one\r\n\r\n\r\ntwo\r\n\r\n\r\n\r\nthree',
      'one\n\ntwo\n\nthree',
    ],
    [
      'mixed LF and CRLF runs',
      'one\n\r\n\ntwo\r\n\n\r\nthree',
      'one\n\ntwo\n\nthree',
    ],
    [
      'CR-only behavior unchanged',
      'one\r\r\rtwo\r\r\r\rthree',
      'one\r\r\rtwo\r\r\r\rthree',
    ],
    [
      'whitespace separates runs',
      'one\n\n \n\ntwo\t\n\nthree',
      'one\n\n \n\ntwo\t\n\nthree',
    ],
  ];
  for (const [name, input, expected] of multilineCases) {
    test(`multiline sanitizer: ${name}`, () => {
      expect(sanitizeMultiline(input)).toBe(expected);
    });
  }
  test('single-line sanitization is idempotent across separated runs', () => {
    const once = removeAllSkiplines('one\ntwo\r\nthree\rfour');
    expect(removeAllSkiplines(once)).toBe(once);
  });
  test('multiline sanitization is idempotent across separated runs', () => {
    const once = sanitizeMultiline('one\n\n\ntwo\r\n\r\n\r\nthree');
    expect(sanitizeMultiline(once)).toBe(once);
  });

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
      windowId: 'text-newlines',
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
    // A DOM edit event models a paste result; happy-dom does not synthesize
    // native clipboard insertion. No paste handler is mocked or invoked.
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
  for (const [name, multiline, input, expected] of [
    ['single-line', false, 'one\ntwo\nthree', 'onetwothree'],
    ['multiline', true, 'one\n\n\ntwo\n\n\n\nthree', 'one\n\ntwo\n\nthree'],
  ] as const) {
    for (const method of ['Confirm', 'Enter']) {
      test(`${name} edit submits every sanitized run via ${method}`, async () => {
        const textarea = await renderAndEdit(input, multiline);
        await act(async () => {
          if (method === 'Confirm') {
            const confirm = container.querySelector<HTMLElement>(
              '.input-button__submit',
            );
            if (!confirm) throw new Error('Missing Confirm button');
            confirm.click();
          } else {
            textarea.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: 'Enter',
                keyCode: 13,
                bubbles: true,
                cancelable: true,
              }),
            );
          }
        });
        expect(sendMessage).toHaveBeenCalledTimes(1);
        expect(sendMessage.mock.calls).toEqual([
          ['act/submit', { entry: expected }],
        ]);
      });
    }
  }
}
