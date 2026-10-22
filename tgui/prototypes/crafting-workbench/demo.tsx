import { useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { installBenchmark } from './browser-harness';
import { createDemoData } from './fixtures';
import type { WorkbenchData } from './model';
import { CraftingWorkbench, type WorkbenchAction } from './Workbench';

const actions: unknown[] = [];
let deliver: (data: WorkbenchData) => void;
function Demo() {
  const [data, setData] = useState(createDemoData);
  deliver = (next) => setData({ ...next });
  const [lastAction, setLastAction] = useState('No requests recorded.');
  const onAction: WorkbenchAction = (action, payload) => {
    actions.push({ action, payload });
    setLastAction(`${action}: ${JSON.stringify(payload)}`);
    if (action === 'checkboxonlycraftable') {
      // Simulate acknowledgement only in this demo; no BYOND bridge is imported.
      setData((previous) => ({
        ...previous,
        showonlycraftable: Boolean(payload.state),
      }));
    }
  };
  return (
    <div className="demo-shell">
      <div className="demo-notice">
        Design prototype · Sample data · No game connection
      </div>
      <CraftingWorkbench data={data} onAction={onAction} />
      <div className="demo-event" role="status" aria-live="polite">
        {lastAction}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
flushSync(() => root.render(<Demo />));
installBenchmark(
  {
    actions,
    async update(data) {
      flushSync(() => deliver(data));
    },
    async unmount() {
      flushSync(() => root.unmount());
    },
  },
  true,
);
