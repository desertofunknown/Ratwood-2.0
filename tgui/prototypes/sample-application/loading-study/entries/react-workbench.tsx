import { createWorkbenchSession } from '../../screens/session-core';
import { WorkbenchReactScreen } from '../../screens/workbench-react';
import { startMeasuredPage } from '../route-measurements';

/** Build-only control, not a six-screen preview. */
export function start() {
  return startMeasuredPage(
    WorkbenchReactScreen,
    (route, context) => {
      if (route !== 'workbench') {
        throw new Error('Workbench-only build control.');
      }
      return createWorkbenchSession(context);
    },
    'react',
    'workbench',
  );
}
