import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { ReactView as ArchiveView } from '../../changes-archive/ReactView';
import { CraftingWorkbench } from '../../crafting-workbench/Workbench';
import { ReactView as SettingsView } from '../../display-readability/ReactView';
import { ReactView as MarketView } from '../../market-quote/ReactView';
import { ReactView as LedgerView } from '../../treasury-ledger/ReactView';
import type { ScreenProps } from '../contracts';
import { ReactDialogs } from '../dialogs/ReactDialogs';
import { ScreenControls } from './controls';
import type { OwnedScreenSession } from './session';

function Archive({
  session,
}: {
  session: Extract<OwnedScreenSession, { route: 'archive' }>;
}) {
  const { controller, sampleEpoch } = useSyncExternalStore(
    session.subscribe,
    session.snapshot,
  );
  return <ArchiveView key={sampleEpoch} controller={controller} />;
}

function Treasury({
  session,
}: {
  session: Extract<OwnedScreenSession, { route: 'treasury' }>;
}) {
  const { controller } = session;
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  useLayoutEffect(() => {
    controller.open();
    return controller.close;
  }, [controller]);
  return (
    <LedgerView
      page={state.page}
      draft={state.draft}
      onDraft={controller.draft}
      onClear={controller.clear}
      onPage={controller.page}
      onRefresh={controller.refresh}
    />
  );
}

function Readability({
  session,
}: {
  session: Extract<OwnedScreenSession, { route: 'readability' }>;
}) {
  const { controller } = session;
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  useLayoutEffect(() => {
    controller.open();
    return controller.close;
  }, [controller]);
  return state.data ? (
    <SettingsView
      data={state.data}
      onToggle={controller.toggle}
      onSelect={controller.select}
    />
  ) : (
    <p className="TithewoodSurface DisplayReadability">
      Waiting for sample state.
    </p>
  );
}

function Market({
  session,
}: {
  session: Extract<OwnedScreenSession, { route: 'market' }>;
}) {
  const { controller } = session;
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  return <MarketView state={state} controller={controller} />;
}

function Content({ session, snapshot }: ScreenProps) {
  const owned = session as OwnedScreenSession;
  switch (owned.route) {
    case 'workbench':
      return <CraftingWorkbench data={snapshot} onAction={owned.action} />;
    case 'treasury':
      return <Treasury session={owned} />;
    case 'readability':
      return <Readability session={owned} />;
    case 'market':
      return <Market session={owned} />;
    case 'archive':
      return <Archive session={owned} />;
    case 'dialogs':
      return <ReactDialogs controller={owned.controller} lease={owned.lease} />;
  }
}

function Generation(props: ScreenProps) {
  const { session, lifecycle } = props;
  const owned = session as OwnedScreenSession;
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
    lifecycle.mounted(owned.route === 'workbench' ? owned.action : undefined);
    return () => {
      unregister();
      detach();
    };
  }, [session]);
  return (
    <div ref={container} data-sample-screen-host="react">
      {session.lease.isCurrent() &&
        createPortal(
          <>
            <ScreenControls session={owned} />
            <Content {...props} />
          </>,
          target,
        )}
    </div>
  );
}

/** A portal is still the shell's one React root, never a nested createRoot. */
export function ReactScreen(props: ScreenProps) {
  return <Generation key={props.session.lease.screenEpoch} {...props} />;
}
