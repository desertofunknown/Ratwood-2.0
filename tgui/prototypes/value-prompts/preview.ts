import { type Controller, type Kind } from './model';
import { assertDisconnected } from '../selection-prompt/network-guard';
import { createSample, scenarios, type Scenario } from './fixtures';

/** Shared, memory-only harness. No preview control belongs to the modal itself. */
export function preview(
  mount: (host: HTMLElement, controller: Controller) => () => void,
) {
  const root = document.getElementById('root')!;
  const controls = document.getElementById('controls')!;
  try {
    assertDisconnected();
  } catch (error) {
    root.textContent = String(error);
    return;
  }
  controls.className = 'TithewoodSurface ValuePreview';
  const details = document.createElement('details');
  details.open = true;
  const summary = document.createElement('summary');
  summary.textContent = 'Disconnected value samples · controls';
  const note = document.createElement('p');
  note.textContent =
    'Local records only: no game connection, saving, audio or server acknowledgement. Close suspends this sample without Cancel. Reopen starts fresh. Timeout is delivered data, not a ticking clock.';
  const actions = document.createElement('div');
  actions.className = 'ValuePreview__actions';
  function selector(label: string, values: readonly string[]) {
    const wrap = document.createElement('label');
    wrap.textContent = label;
    const select = document.createElement('select');
    select.className = 'TithewoodControl';
    select.setAttribute('aria-label', label);
    for (const value of values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.append(option);
    }
    wrap.append(select);
    actions.append(wrap);
    return select;
  }
  const kind = selector('Prompt kind', ['text', 'number']);
  const fixture = selector('Sample scenario', scenarios);
  const log = document.createElement('pre');
  log.className = 'ValuePreview__record';
  log.setAttribute('role', 'status');
  log.dataset.testid = 'action-record';
  const state = document.createElement('p');
  state.dataset.testid = 'sample-status';
  let count = 0;
  function clearRecord() {
    count = 0;
    log.dataset.actionCount = '0';
    log.textContent = 'Action count: 0\nLatest local action: none';
    if (sample) sample.actions.length = 0;
  }
  let sample: ReturnType<typeof createSample> | undefined;
  let cleanup: (() => void) | undefined;
  function close() {
    const previous = sample;
    sample = undefined;
    previous?.dispose();
    cleanup?.();
    cleanup = undefined;
    root.replaceChildren();
    state.textContent =
      'Sample suspended locally. No Cancel or native close receipt emitted. Use Reopen sample.';
  }
  function open() {
    assertDisconnected();
    close();
    clearRecord();
    sample = createSample(
      kind.value as Kind,
      fixture.value as Scenario,
      (action, params) => {
        count += 1;
        log.dataset.actionCount = String(count);
        // Retain undefined explicitly; JSON.stringify alone silently drops it.
        const exact =
          params === undefined
            ? 'undefined'
            : `{ entry: ${params.entry === undefined ? 'undefined' : typeof params.entry === 'number' && !Number.isFinite(params.entry) ? String(params.entry) : JSON.stringify(params.entry)} }`;
        log.textContent = `Action count: ${count}\nLatest local action: ${action}\nParameters: ${exact}\nNo server acknowledgement.`;
      },
      () => {
        if (sample) close();
      },
    );
    cleanup = mount(root, sample.controller);
    state.textContent =
      'Sample open. Confirm and Cancel record actions without pretending a server closed the window.';
  }
  function button(label: string, handler: () => void) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'TithewoodControl';
    button.textContent = label;
    button.onclick = () => {
      assertDisconnected();
      handler();
    };
    actions.append(button);
  }
  kind.onchange = open;
  fixture.onchange = open;
  button('Reopen sample', open);
  button('Clear local record', clearRecord);
  button('Deliver timeout zero', () => sample?.deliver({ timeout: 0 }));
  button('Deliver timeout half', () => sample?.deliver({ timeout: 0.5 }));
  button('Toggle large buttons', () =>
    sample?.deliver({
      large_buttons: !sample.controller.snapshot().data.large_buttons,
    }),
  );
  button('Toggle swapped buttons', () =>
    sample?.deliver({
      swapped_buttons: !sample.controller.snapshot().data.swapped_buttons,
    }),
  );
  button('Toggle paste / drop block', () => {
    if (!sample) return;
    const disabled = !sample.controller.snapshot().data.disable_paste;
    sample.deliver({ disable_paste: disabled });
    state.textContent = `Sample open. Paste/drop block: ${disabled ? 'on' : 'off'} (text editor only).`;
  });
  button('Hide controls until reload', () => {
    controls.hidden = true;
    root.querySelector<HTMLElement>('[data-testid="input"]')?.focus();
  });
  details.append(summary, note, actions);
  controls.replaceChildren(details, state, log);
  open();
  return () => {
    close();
    controls.replaceChildren();
  };
}
