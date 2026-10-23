import { createWorkbenchSession } from '../../screens/session-core';
import { WorkbenchSvelteScreen } from '../../screens/workbench-svelte';
import { startMeasuredPage } from '../route-measurements';

/** Build-only control, not a six-screen preview. */
export function start() {
  return startMeasuredPage(
    WorkbenchSvelteScreen,
    (route, context) => {
      if (route !== 'workbench') {
        throw new Error('Workbench-only build control.');
      }
      return createWorkbenchSession(context);
    },
    'svelte',
    'workbench',
  );
}
