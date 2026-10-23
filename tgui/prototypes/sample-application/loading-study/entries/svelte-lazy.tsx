import { createWorkbenchSession } from '../../screens/session-core';
import { WorkbenchSvelteScreen } from '../../screens/workbench-svelte';
import { createDeferredScreens } from '../deferred-screens';
import { startMeasuredPage } from '../route-measurements';

export function start() {
  const screens = createDeferredScreens({
    workbenchFactory: (_route, context) => createWorkbenchSession(context),
    WorkbenchScreen: WorkbenchSvelteScreen,
    loadAuxiliary: () => import('./svelte-auxiliary'),
  });
  return startMeasuredPage(
    screens.Screen,
    screens.createSession,
    'svelte',
    'lazy',
  );
}
