import { CraftingWorkbench } from '../../crafting-workbench/Workbench';
import type { ScreenProps } from '../contracts';
import { ReactScreenOwner } from './react-owner';
import type { WorkbenchSession } from './session-core';

/** The eager route imports no auxiliary view, controller or sample controls. */
export function WorkbenchReactScreen(props: ScreenProps) {
  const session = props.session as WorkbenchSession;
  const handleAction = session.action;
  return (
    <ReactScreenOwner
      key={session.lease.screenEpoch}
      session={session}
      lifecycle={props.lifecycle}
      action={session.action}
    >
      <CraftingWorkbench data={props.snapshot} onAction={handleAction} />
    </ReactScreenOwner>
  );
}
