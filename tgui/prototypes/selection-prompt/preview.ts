import { type Controller } from './model';
import { assertDisconnected } from './network-guard';
import { createSample, scenarios, type Scenario } from './sample';
export function preview(
  mount: (target: HTMLElement, controller: Controller) => () => void,
) {
  const root = document.getElementById('root')!,
    controls = document.getElementById('controls')!;
  try {
    assertDisconnected();
  } catch (error) {
    root.textContent = String(error);
    return;
  }
  controls.className = 'TithewoodSurface SelectionPreview';
  const title = document.createElement('h1');
  title.textContent = 'Disconnected selection sample';
  const note = document.createElement('p');
  note.textContent =
    'No game connection, audio, storage or native receipt. Commands are recorded only; preview and timeout change only when delivered below. Close/suspend disposes this local sample. Reopen starts fresh.';
  const actions = document.createElement('div');
  actions.className = 'SelectionPreview__actions';
  const select = document.createElement('select');
  select.className = 'TithewoodControl';
  select.setAttribute('aria-label', 'Sample scenario');
  for (const name of scenarios) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.append(option);
  }
  actions.append(select);
  function button(text: string, handler: () => void) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'TithewoodControl';
    b.textContent = text;
    b.onclick = () => {
      assertDisconnected();
      handler();
    };
    actions.append(b);
    return b;
  }
  const log = document.createElement('p');
  log.setAttribute('role', 'status');
  log.textContent = 'No sample commands recorded.';
  let sample: ReturnType<typeof createSample> | undefined,
    cleanup: (() => void) | undefined;
  function close() {
    const old = sample;
    sample = undefined;
    old?.dispose();
    cleanup?.();
    cleanup = undefined;
    root.replaceChildren();
    const p = document.createElement('p');
    p.className = 'TithewoodSurface';
    p.textContent =
      'Local sample disposed. No Cancel or native close receipt was emitted.';
    root.append(p);
  }
  function open() {
    assertDisconnected();
    close();
    root.replaceChildren();
    sample = createSample(
      select.value as Scenario,
      (action, params) => {
        log.textContent = `Recorded sample action ${action}: ${JSON.stringify(params ?? {})}. No server acknowledgement.`;
      },
      () => {
        if (sample) close();
      },
    );
    cleanup = mount(root, sample.controller);
    log.textContent = 'Fresh sample. No commands recorded.';
  }
  button('Fresh mount', open);
  button('Close / suspend sample', close);
  button('Deliver preview state', () => {
    if (sample)
      sample.deliver({
        previewing: !sample.controller.snapshot().data.previewing,
      });
  });
  button('Deliver timeout zero', () => sample?.deliver({ timeout: 0 }));
  button('Deliver timeout half', () => sample?.deliver({ timeout: 0.5 }));
  button('Replace item reference', () => {
    if (sample)
      sample.deliver({ items: [...sample.controller.snapshot().data.items] });
  });
  button('Deliver changed choices', () =>
    sample?.deliver({
      items: ['new bell', 'ash and iron', 'winter vigil'],
      init_value: 'new bell',
    }),
  );
  button('Hide controls', () => {
    controls.hidden = true;
    show.hidden = false;
  });
  const show = document.createElement('button');
  show.type = 'button';
  show.textContent = 'Show sample controls';
  show.hidden = true;
  show.onclick = () => {
    controls.hidden = false;
    show.hidden = true;
  };
  controls.after(show);
  controls.replaceChildren(title, note, actions, log);
  open();
  return () => {
    close();
    show.remove();
    controls.replaceChildren();
  };
}
