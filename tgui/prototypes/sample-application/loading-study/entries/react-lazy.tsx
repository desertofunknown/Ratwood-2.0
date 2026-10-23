import { createWorkbenchSession } from '../../screens/session-core';
import { WorkbenchReactScreen } from '../../screens/workbench-react';
import { createDeferredScreens } from '../deferred-screens';
import { startMeasuredPage } from '../route-measurements';

export function start() {
  const screens = createDeferredScreens({
    workbenchFactory: (_route, context) => createWorkbenchSession(context),
    WorkbenchScreen: WorkbenchReactScreen,
    loadAuxiliary: () => import('./react-auxiliary'),
  });
  return startMeasuredPage(
    screens.Screen,
    screens.createSession,
    'react',
    'lazy',
  );
}
