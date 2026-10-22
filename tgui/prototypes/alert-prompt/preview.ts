import { assertDisconnected } from '../selection-prompt/network-guard';
import { fixtures } from './fixtures';
import { createController, type Controller, type Data } from './model';

/** Sample-only controls; deliveries never imply a game acknowledgement. */
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
  controls.className = 'TithewoodSurface AlertPreview';
  const details = document.createElement('details');
  details.open = true;
  const summary = document.createElement('summary');
  summary.textContent = 'Disconnected alert samples · controls';
  const note = document.createElement('p');
  note.textContent =
    'Sample records only. Choices and Escape record commands without pretending a server closed the window. Close suspends locally without Cancel. Timeout is delivered progress, not a local clock. Reopen starts fresh.';
  const actions = document.createElement('div');
  actions.className = 'AlertPreview__actions';
  const label = document.createElement('label');
  label.textContent = 'Sample scenario';
  const select = document.createElement('select');
  select.className = 'TithewoodControl';
  select.setAttribute('aria-label', 'Sample scenario');
  for (const name of Object.keys(fixtures)) {
    const option = document.createElement('option');
    option.value = option.textContent = name;
    select.append(option);
  }
  label.append(select);
  actions.append(label);
  const status = document.createElement('p');
  status.dataset.testid = 'sample-status';
  const log = document.createElement('pre');
  log.className = 'AlertPreview__record';
  log.setAttribute('role', 'status');
  log.dataset.testid = 'action-record';
  let count = 0;
  let controller: Controller | undefined;
  let cleanup: (() => void) | undefined;
  function clear() {
    count = 0;
    log.dataset.actionCount = '0';
    log.textContent = 'Action count: 0\nLatest local action: none';
  }
  function close() {
    const previous = controller;
    controller = undefined;
    previous?.close();
    cleanup?.();
    cleanup = undefined;
    root.replaceChildren();
    status.textContent =
      'Sample suspended locally. No Cancel or native close receipt emitted. Reopen starts fresh.';
  }
  function open() {
    assertDisconnected();
    close();
    clear();
    controller = createController(
      fixtures[select.value],
      (action, params) => {
        log.dataset.actionCount = String(++count);
        log.textContent = `Action count: ${count}\nLatest local action: ${action}\nParameters: ${params === undefined ? 'undefined' : JSON.stringify(params)}\nNo server acknowledgement.`;
      },
      close,
    );
    cleanup = mount(root, controller);
    status.textContent = 'Sample open. Commands are local records only.';
  }
  function deliver(patch: Partial<Data>) {
    if (controller)
      controller.deliver({ ...controller.getSnapshot().data, ...patch });
  }
  function button(text: string, handler: () => void) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'TithewoodControl';
    item.textContent = text;
    item.onclick = () => {
      assertDisconnected();
      handler();
    };
    actions.append(item);
  }
  select.onchange = open;
  button('Reopen sample', open);
  button('Clear local record', clear);
  button('Deliver timeout half', () => deliver({ timeout: 0.5 }));
  button('Deliver timeout zero', () => deliver({ timeout: 0 }));
  button('Toggle large buttons', () =>
    deliver({ large_buttons: !controller?.getSnapshot().data.large_buttons }),
  );
  button('Toggle swapped buttons', () =>
    deliver({
      swapped_buttons: !controller?.getSnapshot().data.swapped_buttons,
    }),
  );
  button('Deliver one choice', () =>
    deliver({ buttons: ['Only remaining choice'] }),
  );
  button('Deliver no choices', () => deliver({ buttons: [] }));
  button('Deliver server close sample', close);
  button('Hide controls until reload', () => {
    controls.hidden = true;
    root.querySelector<HTMLElement>('[data-alert-content]')?.focus();
  });
  details.append(summary, note, actions);
  controls.replaceChildren(details, status, log);
  open();
  return () => {
    close();
    controls.replaceChildren();
  };
}
