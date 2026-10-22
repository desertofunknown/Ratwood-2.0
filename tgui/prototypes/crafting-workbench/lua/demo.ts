import { installBenchmark } from '../browser-harness';
import { createDemoData } from '../fixtures';
import type { WorkbenchData } from '../model';
import type { WorkbenchAction } from '../Workbench';
import { mountWorkbench } from './adapter';

// Demo shell and mock acknowledgement only. The workbench itself is Lua-owned.
const target = document.getElementById('root')!;
const shell = document.createElement('div');
shell.className = 'demo-shell';
const notice = document.createElement('div');
notice.className = 'demo-notice';
notice.textContent = 'Design prototype · Sample data · No game connection';
shell.append(notice);
target.append(shell);
let data: WorkbenchData = createDemoData();
const actions: unknown[] = [];
const status = document.createElement('div');
status.className = 'demo-event';
status.setAttribute('role', 'status');
status.setAttribute('aria-live', 'polite');
status.textContent = 'No requests recorded.';
const onAction: WorkbenchAction = (action, payload) => {
  actions.push({ action, payload });
  status.textContent = `${action}: ${JSON.stringify(payload)}`;
  if (action === 'checkboxonlycraftable') {
    data = { ...data, showonlycraftable: Boolean(payload.state) };
    component.update(data);
  }
};
const component = mountWorkbench(shell, data, onAction);
shell.append(status);
installBenchmark(
  {
    actions,
    async update(next) {
      data = next;
      component.update(data);
    },
    async unmount() {
      component.unmount();
      shell.remove();
    },
  },
  true,
);
