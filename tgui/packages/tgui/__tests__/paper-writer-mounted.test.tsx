import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, type ReactNode, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const tguiRoot = resolve(import.meta.dir, '../../..');

if (!process.env.TGUI_PAPER_WRITER_TEST_CHILD) {
  test('paper writer acknowledgement ordering (isolated layout shell)', () => {
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
        env: { ...process.env, TGUI_PAPER_WRITER_TEST_CHILD: '1' },
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
  // Only native window chrome is replaced. The writer, backend, textarea,
  // font select and action buttons are the actual production components.
  mock.module(resolve(tguiRoot, 'packages/tgui/layouts'), () => ({
    Window: Shell,
  }));
  const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  Reflect.set(globalThis, 'Byond', { windowId: 'paper-writer' });
  const backend: typeof import('../backend') = await import(
    resolve(tguiRoot, 'packages/tgui/backend')
  );
  const { PaperWriterPanel }: typeof import('../interfaces/PaperWriterPanel') =
    await import(
      resolve(tguiRoot, 'packages/tgui/interfaces/PaperWriterPanel')
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
  let unmounted: boolean;
  let sendMessage: ReturnType<typeof mock>;

  const initialData = () => ({
    draft: '',
    preview_html: '',
    font: 'default',
    standard_font: 'Times New Roman',
    fonts: ['default', 'Garamond', 'Verdana'],
    maxlen: 2000,
    writer_sequence: 0,
  });
  const MountedWriter = () => {
    useSyncExternalStore(store.subscribe, store.getState);
    return <PaperWriterPanel />;
  };

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
    Reflect.set(globalThis, 'Byond', { windowId: 'paper-writer', sendMessage });
    previousStore = backend.globalStore;
    store = createStore<{ backend: BackendState }>((state, action) => ({
      backend: backend.backendReducer(state?.backend, action) as BackendState,
    }));
    backend.setGlobalStore(store);
    store.dispatch(backend.backendUpdate({ data: initialData() }));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    unmounted = false;
  });
  afterEach(async () => {
    try {
      if (!unmounted) {
        await act(async () => root.unmount());
      }
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

  const render = async (
    overrides: Partial<ReturnType<typeof initialData>> = {},
  ) => {
    await act(async () => {
      store.dispatch(backend.backendUpdate({ data: overrides }));
      root.render(<MountedWriter />);
    });
  };
  const update = async (data: Partial<ReturnType<typeof initialData>>) => {
    await act(async () => store.dispatch(backend.backendUpdate({ data })));
  };
  const textarea = () => {
    const element = container.querySelector('textarea');
    if (!element) throw new Error('Missing production paper textarea');
    return element;
  };
  const fontSelect = () => {
    const element = container.querySelector('select');
    if (!element) throw new Error('Missing production font select');
    return element;
  };
  const button = (text: string) => {
    const element = [
      ...container.querySelectorAll<HTMLElement>('[role="button"]'),
    ].find((entry) => entry.textContent?.trim() === text);
    if (!element) throw new Error(`Missing production ${text} button`);
    return element;
  };
  const click = async (text: string) => {
    // Synthetic click alone does not model pointer-induced blur in happy-dom.
    // Explicit focus keeps this about the writer's real focus/echo contract.
    await act(async () => {
      button(text).focus();
      button(text).click();
    });
  };
  const edit = async (value: string) => {
    await act(async () => {
      textarea().focus();
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!.call(textarea(), value);
      textarea().dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(textarea().value).toBe(value);
  };
  const selectFont = async (font: string) => {
    await act(async () => {
      fontSelect().focus();
      fontSelect().value = font;
      fontSelect().dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(fontSelect().value).toBe(font);
  };
  const blur = async () => {
    await act(async () => textarea().blur());
    expect(document.activeElement).not.toBe(textarea());
  };
  const waitForDebounce = async () => {
    await act(async () => {
      await new Promise((done) => setTimeout(done, 475));
    });
  };

  test('an older draft echo cannot replace a newer unsent draft after blur', async () => {
    await render();
    await edit('First draft');
    await click('Update Preview');
    await edit('First draft with the new ending');
    await blur();
    await update({ draft: 'First draft', writer_sequence: 1 });
    const visibleDraft = textarea().value;
    await click('Done');
    expect(sendMessage.mock.calls).toEqual([
      ['act/update_draft', { draft: 'First draft', font: 'default', seq: 1 }],
      [
        'act/sign',
        { draft: 'First draft with the new ending', font: 'default', seq: 2 },
      ],
    ]);
    expect(visibleDraft).toBe('First draft with the new ending');
  });

  test('an older acknowledgement cannot replace a newer already-sent draft', async () => {
    await render();
    await edit('First draft');
    await click('Update Preview');
    await edit('Second draft');
    await click('Update Preview');
    await update({ draft: 'First draft', writer_sequence: 1 });
    const visibleDraft = textarea().value;
    await click('Done');
    expect(sendMessage.mock.calls).toEqual([
      ['act/update_draft', { draft: 'First draft', font: 'default', seq: 1 }],
      ['act/update_draft', { draft: 'Second draft', font: 'default', seq: 2 }],
      ['act/sign', { draft: 'Second draft', font: 'default', seq: 3 }],
    ]);
    expect(visibleDraft).toBe('Second draft');
  });

  for (const alreadySent of [false, true]) {
    test(`an older font echo cannot replace a newer ${alreadySent ? 'sent' : 'unsent'} font`, async () => {
      await render();
      await edit('A letter');
      await selectFont('Garamond');
      await click('Update Preview');
      await selectFont('Verdana');
      if (alreadySent) await click('Update Preview');
      await update({ draft: 'A letter', font: 'Garamond', writer_sequence: 1 });
      const visibleFont = fontSelect().value;
      await click('Done');
      expect(sendMessage.mock.calls.at(-1)).toEqual([
        'act/sign',
        { draft: 'A letter', font: 'Verdana', seq: alreadySent ? 3 : 2 },
      ]);
      expect(visibleFont).toBe('Verdana');
    });
  }

  test('Clear stays empty when an earlier draft acknowledgement arrives', async () => {
    await render();
    await edit('First draft');
    await click('Update Preview');
    await edit('Unsent changes');
    await click('Clear');
    await update({ draft: 'First draft', writer_sequence: 1 });
    const visibleDraft = textarea().value;
    await click('Done');
    await waitForDebounce();
    expect(sendMessage.mock.calls).toEqual([
      ['act/update_draft', { draft: 'First draft', font: 'default', seq: 1 }],
      ['act/clear', { seq: 2 }],
      ['act/sign', { draft: '', font: 'default', seq: 3 }],
    ]);
    expect(visibleDraft).toBe('');
  });

  test('Done sends the latest draft once, ignores an older echo, then accepts the sign reset', async () => {
    await render();
    await edit('First draft');
    await click('Update Preview');
    await edit('Final draft');
    await click('Done');
    await update({ draft: 'First draft', writer_sequence: 1 });
    const pendingDraft = textarea().value;
    await update({
      draft: '',
      writer_sequence: 2,
      preview_html: '<p>Final draft</p>',
    });
    await waitForDebounce();
    expect(sendMessage.mock.calls).toEqual([
      ['act/update_draft', { draft: 'First draft', font: 'default', seq: 1 }],
      ['act/sign', { draft: 'Final draft', font: 'default', seq: 2 }],
    ]);
    expect(pendingDraft).toBe('Final draft');
    expect(textarea().value).toBe('');
  });

  test('a sign reset cannot erase a new draft typed after Done', async () => {
    await render();
    await edit('Finished letter');
    await click('Done');
    await edit('A new paragraph');
    await blur();
    await update({ draft: '', writer_sequence: 1 });
    await click('Done');
    expect(sendMessage.mock.calls).toEqual([
      ['act/sign', { draft: 'Finished letter', font: 'default', seq: 1 }],
      ['act/sign', { draft: 'A new paragraph', font: 'default', seq: 2 }],
    ]);
  });

  test('the first Done acknowledgement clears the draft even when the backend draft stays empty', async () => {
    await render();
    await edit('Finished letter');
    await click('Done');
    await update({ draft: '', writer_sequence: 1 });
    expect(textarea().value).toBe('');
    await click('Done');
    expect(sendMessage.mock.calls).toEqual([
      ['act/sign', { draft: 'Finished letter', font: 'default', seq: 1 }],
      ['act/sign', { draft: '', font: 'default', seq: 2 }],
    ]);
  });

  test('the latest acknowledgement applies server-truncated text when idle', async () => {
    await render({ maxlen: 5 });
    await edit('Draft longer than the server maxlen');
    await selectFont('Garamond');
    await click('Update Preview');
    // paper.dm clips update_draft to maxlen and returns the accepted draft.
    await update({ draft: 'Draft', font: 'Garamond', writer_sequence: 1 });
    expect(textarea().value).toBe('Draft');
    expect(fontSelect().value).toBe('Garamond');
    await click('Done');
    expect(sendMessage.mock.calls.at(-1)).toEqual([
      'act/sign',
      { draft: 'Draft', font: 'Garamond', seq: 2 },
    ]);
  });

  test('a sequence-only acknowledgement applies the latest accepted server truncation', async () => {
    await render({ maxlen: 5 });
    await edit('Draft one');
    await click('Update Preview');
    await edit('Draft two');
    await click('Update Preview');
    await update({ draft: 'Draft', writer_sequence: 1 });
    expect(textarea().value).toBe('Draft two');
    // The accepted text is identical for both clipped requests. Only the
    // acknowledgement sequence changes when the second request is processed.
    await update({ draft: 'Draft', writer_sequence: 2 });
    expect(textarea().value).toBe('Draft');
    await click('Done');
    expect(sendMessage.mock.calls.at(-1)).toEqual([
      'act/sign',
      { draft: 'Draft', font: 'default', seq: 3 },
    ]);
  });

  test('typing remains protected while the textarea is focused', async () => {
    await render();
    await edit('First draft');
    await click('Update Preview');
    await edit('Still typing');
    await update({ draft: 'First draft', writer_sequence: 1 });
    expect(document.activeElement).toBe(textarea());
    expect(textarea().value).toBe('Still typing');
    await click('Done');
    expect(sendMessage.mock.calls.at(-1)).toEqual([
      'act/sign',
      { draft: 'Still typing', font: 'default', seq: 2 },
    ]);
  });

  test('idle external updates remain visible without sending a new action', async () => {
    await render({ draft: 'Initial letter' });
    await update({ draft: 'Other writer changed this', font: 'Verdana' });
    expect(textarea().value).toBe('Other writer changed this');
    expect(fontSelect().value).toBe('Verdana');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('a fresh external update after our acknowledgement is still accepted', async () => {
    await render();
    await edit('Our draft');
    await click('Update Preview');
    await update({ draft: 'Our draft', writer_sequence: 1 });
    await update({
      draft: 'Other writer added text',
      font: 'Verdana',
      writer_sequence: 1,
    });
    expect(textarea().value).toBe('Other writer added text');
    expect(fontSelect().value).toBe('Verdana');
    expect(sendMessage.mock.calls).toHaveLength(1);
  });

  test('the normal debounce sends the current draft and font once', async () => {
    await render({ writer_sequence: 7 });
    await edit('Debounced letter');
    await selectFont('Verdana');
    await waitForDebounce();
    expect(sendMessage.mock.calls).toEqual([
      [
        'act/update_draft',
        { draft: 'Debounced letter', font: 'Verdana', seq: 8 },
      ],
    ]);
  });

  test('an older echo cannot change the next debounced draft or font', async () => {
    await render();
    await edit('First draft');
    await selectFont('Garamond');
    await click('Update Preview');
    await edit('Latest draft');
    await selectFont('Verdana');
    await update({
      draft: 'First draft',
      font: 'Garamond',
      writer_sequence: 1,
    });
    await waitForDebounce();
    expect(sendMessage.mock.calls).toEqual([
      ['act/update_draft', { draft: 'First draft', font: 'Garamond', seq: 1 }],
      ['act/update_draft', { draft: 'Latest draft', font: 'Verdana', seq: 2 }],
    ]);
    expect(textarea().value).toBe('Latest draft');
    expect(fontSelect().value).toBe('Verdana');
  });

  test('unmount cancels the pending draft debounce', async () => {
    await render();
    await edit('Unsent letter');
    await act(async () => root.unmount());
    unmounted = true;
    await waitForDebounce();
    expect(sendMessage).not.toHaveBeenCalled();
  });
}
