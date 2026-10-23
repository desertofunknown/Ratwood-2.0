import { useLayoutEffect, useRef } from 'react';

import type { WorkbenchData } from '../crafting-workbench/model';
import {
  routeLabels,
  routes,
  type ScreenLifecycle,
  type ScreenRenderer,
} from './contracts';
import type { SessionManager, SessionSnapshot } from './session-manager';

type ShellProps = {
  manager: SessionManager;
  state: SessionSnapshot;
  Screen: ScreenRenderer;
  snapshot: WorkbenchData;
  lifecycle: ScreenLifecycle;
};

/** Local navigation inside the one production React Window, not native routing. */
export function Shell({
  manager,
  state,
  Screen,
  snapshot,
  lifecycle,
}: ShellProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const { session, route, hostEpoch, screenEpoch } = state;
  useLayoutEffect(() => {
    if (session?.lease.isCurrent() && heading.current?.isConnected) {
      heading.current.focus({ preventScroll: true });
    }
  }, [session]);
  return (
    <div className="SampleApplication" data-sample-application="">
      <header className="SampleApplication__header">
        <p className="SampleApplication__disclosure">
          Disconnected sample application · All six screens use local fixture
          data. No live game, trade dispatch or preference saving.
        </p>
        <nav
          aria-label="Sample screens"
          className="SampleApplication__navigation"
        >
          {routes.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className="TithewoodControl"
              data-sample-route={candidate}
              aria-current={candidate === route ? 'page' : undefined}
              onClick={() => manager.navigate(candidate)}
            >
              {routeLabels[candidate]}
            </button>
          ))}
        </nav>
        <h1 ref={heading} tabIndex={-1} className="SampleApplication__heading">
          {routeLabels[route]}
        </h1>
      </header>
      <section
        className="SampleApplication__screen"
        aria-label={`${routeLabels[route]} sample`}
        data-active-screen={session ? route : 'inactive'}
        data-host-epoch={hostEpoch}
        data-screen-epoch={screenEpoch}
      >
        {session?.lease.isCurrent() ? (
          <Screen
            key={`${hostEpoch}:${screenEpoch}`}
            session={session}
            snapshot={snapshot}
            lifecycle={lifecycle}
          />
        ) : (
          <p className="SampleApplication__inactive" role="status">
            Sample inactive. Resume the fixture to open a fresh screen session.
          </p>
        )}
      </section>
    </div>
  );
}
