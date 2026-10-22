import { useLayoutEffect, useRef } from 'react';

import { CraftingWorkbench, type WorkbenchAction } from '../Workbench';
import type { ArmProps } from './contracts';

function Generation({
  snapshot,
  epoch,
  isCurrent,
  lifecycle,
  onAction,
}: ArmProps) {
  const alive = useRef(false);
  const current = useRef({ onAction, isCurrent });
  const action = useRef<WorkbenchAction>((name, payload) => {
    if (alive.current && current.current.isCurrent(epoch)) {
      current.current.onAction(name, payload);
    }
  }).current;
  useLayoutEffect(() => {
    current.current = { onAction, isCurrent };
  });
  useLayoutEffect(() => {
    alive.current = true;
    lifecycle.mounted(action);
    return () => {
      alive.current = false;
      lifecycle.unmounted();
    };
  }, []);
  return <CraftingWorkbench data={snapshot} onAction={action} />;
}

export function ReactArm(props: ArmProps) {
  return (
    <div data-disconnected-workbench-host="">
      {props.active && props.isCurrent(props.epoch) && (
        <Generation key={props.epoch} {...props} />
      )}
    </div>
  );
}
