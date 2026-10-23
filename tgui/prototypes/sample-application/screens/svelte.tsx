import type { WorkbenchData } from '../../crafting-workbench/model';
import {
  flushSync,
  mount,
  unmount,
} from '../../crafting-workbench/svelte/node_modules/svelte/src/index-client.js';
import SettingsSession from '../../display-readability/SvelteSession.svelte';
import MarketView from '../../market-quote/SvelteView.svelte';
import LedgerSession from '../../treasury-ledger/SvelteSession.svelte';
import type { ScreenLifecycle, ScreenProps } from '../contracts';
import SvelteDialogs from '../dialogs/SvelteDialogs.svelte';
import ArchiveSession from './ArchiveSession.svelte';
import { ScreenControls } from './controls';
import { mountOwnedView } from './mount-lifetime';
import type { OwnedScreenSession } from './session';
import { type MountedScreen, SvelteScreenOwner } from './svelte-owner';
import { mountWorkbenchScreen } from './workbench-svelte';

export type { MountedScreen } from './svelte-owner';

/** Direct existing view mounts. The returned disposal promise is never dropped. */
export function mountScreenContent(
  target: HTMLElement,
  session: OwnedScreenSession,
  snapshot: WorkbenchData,
  lifecycle: ScreenLifecycle,
): MountedScreen {
  if (session.route === 'workbench') {
    return mountWorkbenchScreen(target, session, snapshot, lifecycle);
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
          : session.route === 'dialogs'
            ? mount(SvelteDialogs, {
                target,
                props: { controller: session.controller, lease: session.lease },
              })
            : session.route === 'archive'
              ? mount(ArchiveSession, { target, props: { session } })
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

/** Existing domain mounts share the same owner as the eager workbench. */
export function SvelteScreen({ session, snapshot, lifecycle }: ScreenProps) {
  const owned = session as OwnedScreenSession;
  return (
    <SvelteScreenOwner
      session={owned}
      snapshot={snapshot}
      lifecycle={lifecycle}
      mountContent={mountScreenContent}
      action={owned.route === 'workbench' ? owned.action : undefined}
      controls={<ScreenControls session={owned} />}
    />
  );
}
