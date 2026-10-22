import type { Controller } from './model';
import { assertDisconnected, sampleController, type Scenario } from './sample';
export function preview(
  mount: (target: HTMLElement, controller: Controller) => () => void,
) {
  const root = document.getElementById('root')!;
  try {
    assertDisconnected();
  } catch (error) {
    root.textContent = String(error);
    return;
  }
  const controls = document.getElementById('controls')!;
  const label = document.createElement('label');
  label.textContent = 'Sample outcome ';
  const select = document.createElement('select');
  select.className = 'TithewoodControl';
  for (const scenario of ['success', 'retry', 'failure', 'empty']) {
    const option = document.createElement('option');
    option.value = scenario;
    option.textContent = scenario;
    select.append(option);
  }
  label.append(select);
  const reload = document.createElement('button');
  reload.className = 'TithewoodControl';
  reload.textContent = 'Load sample';
  const toggle = document.createElement('button');
  toggle.className = 'TithewoodControl';
  toggle.textContent = 'Close archive';
  const note = document.createElement('p');
  note.textContent =
    'Sample-only. Retry succeeds on attempt 3; failure stops after 6 attempts. Closing cancels pending work. Reopening resets the sample. No game connection or performance claim.';
  controls.append(label, reload, toggle, note);
  let cleanup: (() => void) | undefined;
  function open() {
    cleanup?.();
    root.replaceChildren();
    const { controller } = sampleController(select.value as Scenario);
    cleanup = mount(root, controller);
    toggle.textContent = 'Close archive';
  }
  reload.onclick = open;
  toggle.onclick = () => {
    if (cleanup) {
      cleanup();
      cleanup = undefined;
      root.replaceChildren();
      toggle.textContent = 'Reopen archive';
    } else open();
  };
  open();
}
