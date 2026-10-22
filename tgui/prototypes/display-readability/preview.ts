import { type Controller, createController } from './model';
import { assertDisconnected } from './network-guard';
import { createSample, type Sample } from './sample';

export function preview(
  mount: (target: HTMLElement, controller: Controller) => () => void,
) {
  const root = document.getElementById('root')!;
  const controls = document.getElementById('controls')!;
  try {
    assertDisconnected();
  } catch (error) {
    root.textContent = String(error);
    return () => {};
  }
  const title = document.createElement('h1');
  title.textContent = 'Disconnected sample only';
  const note = document.createElement('p');
  note.textContent =
    'Synthetic settings, not your preferences. Clicks queue exact commands; Deliver next sample update reveals simulated values. No game connection, native effects, persistence or save acknowledgement. Reopen starts a fresh sample.';
  const actions = document.createElement('div');
  actions.className = 'DisplayPreview__actions';
  function button(label: string) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'TithewoodControl';
    node.textContent = label;
    actions.append(node);
    return node;
  }
  const deliver = button('Deliver next sample update');
  const toggle = button('Close sample');
  const status = document.createElement('p');
  status.className = 'DisplayPreview__status';
  status.setAttribute('role', 'status');
  const command = document.createElement('p');
  command.className = 'DisplayPreview__command';
  controls.replaceChildren(title, note, actions, status, command);
  let sample: Sample | undefined;
  let cleanup: (() => void) | undefined;
  function update() {
    const count = sample?.pendingCount() ?? 0;
    deliver.disabled = !cleanup || count === 0;
    status.textContent = cleanup
      ? `Queued sample updates: ${count}. Displayed values change only on delivery.`
      : 'Sample closed.';
  }
  function close() {
    assertDisconnected();
    cleanup?.();
    cleanup = undefined;
    sample = undefined;
    root.replaceChildren();
    const closed = document.createElement('p');
    closed.className = 'DisplayPreview__closed';
    closed.textContent = 'Sample settings closed.';
    root.append(closed);
    toggle.textContent = 'Reopen sample';
    command.textContent = '';
    update();
  }
  function open() {
    assertDisconnected();
    close();
    root.replaceChildren();
    const source = createSample();
    sample = source;
    const controller = createController({
      subscribe: source.subscribe,
      action: (...args) => {
        source.action(...args);
        command.textContent = `Latest sample command: ${args[0]} ${JSON.stringify(args[1])}`;
        update();
      },
    });
    const unmount = mount(root, controller);
    cleanup = () => {
      controller.close();
      unmount();
      source.dispose();
    };
    toggle.textContent = 'Close sample';
    update();
  }
  deliver.onclick = () => {
    assertDisconnected();
    sample?.deliverNext();
    update();
  };
  toggle.onclick = () => (cleanup ? close() : open());
  open();
  return () => {
    close();
    deliver.onclick = null;
    toggle.onclick = null;
    controls.replaceChildren();
    root.replaceChildren();
  };
}
