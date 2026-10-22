import React, { useEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { Controller } from './model';
import { assertDisconnected } from './network-guard';
import { ReactView } from './ReactView';

function ReactSession({ controller }: { controller: Controller }) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  useEffect(() => {
    controller.open();
    return () => controller.close();
  }, [controller]);
  return state.data ? (
    <ReactView
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
export function mountReact(target: HTMLElement, controller: Controller) {
  assertDisconnected();
  const root = createRoot(target);
  root.render(<ReactSession controller={controller} />);
  return () => root.unmount();
}
