import type { WorkbenchData } from '../../crafting-workbench/model';
import { mountWorkbench } from '../../crafting-workbench/svelte/adapter';
import type { ScreenLifecycle, ScreenProps } from '../contracts';
import { disposeFailedView } from './mount-lifetime';
import type { WorkbenchSession } from './session-core';
import { type MountedScreen, SvelteScreenOwner } from './svelte-owner';

/** Keep the existing partial-flush cleanup path shared by both entry choices. */
export function mountWorkbenchScreen(
  target: HTMLElement,
  session: WorkbenchSession,
  snapshot: WorkbenchData,
  lifecycle: ScreenLifecycle,
): MountedScreen {
  return mountWorkbench(target, snapshot, session.action, (dispose) => {
    disposeFailedView(target, session, lifecycle, dispose);
  });
}

/** The eager route imports no auxiliary view, controller or sample controls. */
export function WorkbenchSvelteScreen(props: ScreenProps) {
  const session = props.session as WorkbenchSession;
  return (
    <SvelteScreenOwner
      session={session}
      snapshot={props.snapshot}
      lifecycle={props.lifecycle}
      mountContent={mountWorkbenchScreen}
      action={session.action}
    />
  );
}
