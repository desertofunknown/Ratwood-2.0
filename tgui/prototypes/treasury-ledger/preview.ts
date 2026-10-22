import {
  duplicateEntries,
  edgeEntries,
  emptyEntries,
  fiftyOneEntries,
  longEntries,
  sampleEntries,
} from './fixtures';
import { type Controller, createController, type LedgerEntry } from './model';
import { assertDisconnected } from './network-guard';
import { createSample } from './sample';

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
  const fixtures: Array<[string, readonly LedgerEntry[]]> = [
    ['51 synthetic entries', sampleEntries],
    ['50 synthetic entries', fiftyOneEntries.slice(1)],
    ['Empty ledger', emptyEntries],
    ['Duplicate entries', duplicateEntries],
    ['Kinds and scalar edges', edgeEntries],
    ['Long names and reasons', longEntries],
  ];
  const title = document.createElement('h1');
  title.textContent = 'Disconnected sample only';
  const note = document.createElement('p');
  note.textContent =
    'Synthetic treasury records, not live game data. Search, refresh and paging stay in memory. Close/reopen and Load sample reset the sample; no game connection, native-host geometry or performance claim.';
  const actions = document.createElement('div');
  actions.className = 'TreasuryPreview__actions';
  const label = document.createElement('label');
  label.textContent = 'Sample records ';
  const select = document.createElement('select');
  select.className = 'TithewoodControl';
  for (const [index, [name]] of fixtures.entries()) {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = name;
    select.append(option);
  }
  label.append(select);
  const load = document.createElement('button');
  load.className = 'TithewoodControl';
  load.type = 'button';
  load.textContent = 'Load sample';
  const toggle = document.createElement('button');
  toggle.className = 'TithewoodControl';
  toggle.type = 'button';
  actions.append(label, load, toggle);
  controls.replaceChildren(title, note, actions);
  let cleanup: (() => void) | undefined;
  function close() {
    cleanup?.();
    cleanup = undefined;
    root.replaceChildren();
    const closed = document.createElement('p');
    closed.className = 'TreasuryPreview__closed';
    closed.textContent = 'Sample ledger closed.';
    root.append(closed);
    toggle.textContent = 'Reopen ledger';
  }
  function open() {
    assertDisconnected();
    close();
    root.replaceChildren();
    const sample = createSample({ entries: fixtures[Number(select.value)][1] });
    const controller = createController({
      action: sample.action,
      subscribe: sample.subscribe,
    });
    const unmount = mount(root, controller);
    cleanup = () => {
      controller.close();
      unmount();
      sample.dispose();
    };
    toggle.textContent = 'Close ledger';
  }
  load.onclick = open;
  toggle.onclick = () => (cleanup ? close() : open());
  open();
  return () => {
    close();
    load.onclick = null;
    toggle.onclick = null;
    controls.replaceChildren();
    root.replaceChildren();
  };
}
