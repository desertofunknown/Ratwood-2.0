import { useMemo } from 'react';

import { mountWorkbench } from '../svelte/adapter';
import { ReactWorkbenchHost, type WorkbenchMount } from '../svelte/ReactHost';
import type { ArmProps } from './contracts';

export function SvelteArm({ lifecycle, ...props }: ArmProps) {
  const mount = useMemo<WorkbenchMount>(
    () => (target, snapshot, action) => {
      const mounted = mountWorkbench(target, snapshot, action);
      lifecycle.mounted(action);
      return {
        update: mounted.update,
        unmount() {
          lifecycle.unmounted();
          const pending = mounted.unmount();
          lifecycle.pending(Promise.resolve(pending));
          return pending;
        },
      };
    },
    [lifecycle],
  );
  const handleError = lifecycle.error;
  return <ReactWorkbenchHost {...props} mount={mount} onError={handleError} />;
}
