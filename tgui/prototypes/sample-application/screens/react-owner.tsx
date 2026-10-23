import { type ReactNode, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';

import type { WorkbenchAction } from '../../crafting-workbench/Workbench';
import type { ScreenLifecycle, ScreenSession } from '../contracts';

type OwnerProps = {
  session: ScreenSession;
  lifecycle: ScreenLifecycle;
  action?: WorkbenchAction;
  children: ReactNode;
};

/** A portal remains in the shell's one React root, never a nested createRoot. */
export function ReactScreenOwner({
  session,
  lifecycle,
  action,
  children,
}: OwnerProps) {
  const container = useRef<HTMLDivElement>(null);
  const target = useMemo(() => document.createElement('div'), [session]);
  useLayoutEffect(() => {
    if (!session.lease.isCurrent()) return;
    target.dataset.sampleScreenTarget = session.route;
    container.current!.append(target);
    let mounted = true;
    const detach = () => {
      target.remove();
      if (!mounted) return;
      mounted = false;
      lifecycle.unmounted();
    };
    const unregister = session.lease.onRetire(detach);
    lifecycle.mounted(action);
    return () => {
      unregister();
      detach();
    };
  }, [session]);
  return (
    <div ref={container} data-sample-screen-host="react">
      {session.lease.isCurrent() && createPortal(children, target)}
    </div>
  );
}
