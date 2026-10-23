import { type ReactNode, useLayoutEffect, useRef } from 'react';

import type { WorkbenchData } from '../../crafting-workbench/model';
import type { WorkbenchAction } from '../../crafting-workbench/Workbench';
import type { ScreenLifecycle, ScreenSession } from '../contracts';

export type MountedScreen = {
  update(snapshot: WorkbenchData): void | Promise<unknown>;
  unmount(): Promise<unknown>;
};
export type ScreenMount<Session extends ScreenSession> = (
  target: HTMLElement,
  session: Session,
  snapshot: WorkbenchData,
  lifecycle: ScreenLifecycle,
) => MountedScreen;
type OwnerProps<Session extends ScreenSession> = {
  session: Session;
  snapshot: WorkbenchData;
  lifecycle: ScreenLifecycle;
  mountContent: ScreenMount<Session>;
  action?: WorkbenchAction;
  controls?: ReactNode;
};

type Generation<Session extends ScreenSession> = {
  session: Session;
  target: HTMLDivElement;
  mounted: MountedScreen;
  dispose(): Promise<unknown>;
};

export function SvelteScreenOwner<Session extends ScreenSession>({
  session,
  snapshot,
  lifecycle,
  mountContent,
  action,
  controls,
}: OwnerProps<Session>) {
  const container = useRef<HTMLDivElement>(null);
  const current = useRef<Generation<Session> | undefined>(undefined);

  // Every committed workbench delivery matters, even same-object mutations.
  useLayoutEffect(() => {
    const old = current.current;
    if (old && (old.session !== session || !session.lease.isCurrent())) {
      old.dispose();
    }
    if (!session.lease.isCurrent()) return;
    if (!current.current) {
      const target = document.createElement('div');
      target.dataset.sampleScreenTarget = session.route;
      container.current!.append(target);
      let mounted: MountedScreen;
      try {
        mounted = mountContent(target, session, snapshot, lifecycle);
      } catch (error) {
        target.remove();
        session.retire();
        lifecycle.error(error);
        return;
      }
      let disposal: Promise<unknown> | undefined;
      let unregister = () => {};
      const generation: Generation<Session> = {
        session,
        target,
        mounted,
        dispose() {
          if (disposal) return disposal;
          // Detach before async Svelte cleanup. An old view can neither focus
          // the shell nor remove a replacement generation's private subtree.
          if (current.current === generation) current.current = undefined;
          target.remove();
          unregister();
          try {
            session.retire();
          } catch (error) {
            lifecycle.error(error);
          }
          lifecycle.unmounted();
          try {
            disposal = Promise.resolve(mounted.unmount());
          } catch (error) {
            disposal = Promise.reject(error);
          }
          lifecycle.pending(disposal);
          return disposal;
        },
      };
      current.current = generation;
      lifecycle.mounted(action);
      unregister = session.lease.onRetire(() => {
        generation.dispose();
      });
      if (!session.lease.isCurrent()) generation.dispose();
      return;
    }
    const generation = current.current;
    const failed = (error: unknown) => {
      if (current.current === generation) generation.dispose();
      lifecycle.error(error);
    };
    try {
      Promise.resolve(generation.mounted.update(snapshot)).catch(failed);
    } catch (error) {
      failed(error);
    }
  });
  useLayoutEffect(
    () => () => {
      current.current?.dispose();
    },
    [],
  );
  return (
    <div data-sample-screen-host="svelte">
      {session.lease.isCurrent() && controls}
      <div ref={container} />
    </div>
  );
}
