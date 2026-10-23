import { useLayoutEffect, useRef } from 'react';

import type { WorkbenchData } from '../../crafting-workbench/model';
import { mountWorkbench } from '../../crafting-workbench/svelte/adapter';
import {
  flushSync,
  mount,
  unmount,
} from '../../crafting-workbench/svelte/node_modules/svelte/src/index-client.js';
import SettingsSession from '../../display-readability/SvelteSession.svelte';
import MarketView from '../../market-quote/SvelteView.svelte';
import LedgerSession from '../../treasury-ledger/SvelteSession.svelte';
import type { ScreenLifecycle, ScreenProps } from '../contracts';
import { ScreenControls } from './controls';
import { disposeFailedView, mountOwnedView } from './mount-lifetime';
import type { OwnedScreenSession } from './session';

export type MountedScreen = {
  update(snapshot: WorkbenchData): void | Promise<unknown>;
  unmount(): Promise<unknown>;
};

/** Direct existing view mounts. The returned disposal promise is never dropped. */
export function mountScreenContent(
  target: HTMLElement,
  session: OwnedScreenSession,
  snapshot: WorkbenchData,
  lifecycle: ScreenLifecycle,
): MountedScreen {
  if (session.route === 'workbench') {
    return mountWorkbench(target, snapshot, session.action, (dispose) => {
      disposeFailedView(target, session, lifecycle, dispose);
    });
  }
  const owned = mountOwnedView(
    target,
    session,
    lifecycle,
    () =>
      session.route === 'treasury'
        ? mount(LedgerSession, {
            target,
            props: { controller: session.controller },
          })
        : session.route === 'readability'
          ? mount(SettingsSession, {
              target,
              props: { controller: session.controller },
            })
          : mount(MarketView, {
              target,
              props: { controller: session.controller },
            }),
    flushSync,
    unmount,
  );
  return {
    update() {},
    unmount: owned.unmount,
  };
}

type Generation = {
  session: OwnedScreenSession;
  target: HTMLDivElement;
  mounted: MountedScreen;
  dispose(): Promise<unknown>;
};

export function SvelteScreen({ session, snapshot, lifecycle }: ScreenProps) {
  const owned = session as OwnedScreenSession;
  const container = useRef<HTMLDivElement>(null);
  const current = useRef<Generation | undefined>(undefined);

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
        mounted = mountScreenContent(target, owned, snapshot, lifecycle);
      } catch (error) {
        target.remove();
        session.retire();
        lifecycle.error(error);
        return;
      }
      let disposal: Promise<unknown> | undefined;
      let unregister = () => {};
      const generation: Generation = {
        session: owned,
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
      lifecycle.mounted(owned.route === 'workbench' ? owned.action : undefined);
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
      {session.lease.isCurrent() && <ScreenControls session={owned} />}
      <div ref={container} />
    </div>
  );
}
