import React, { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';

import type { createMarketController } from './model';
import { assertDisconnected } from '../selection-prompt/network-guard';
import { ReactView } from './ReactView';

type Controller = ReturnType<typeof createMarketController>;
function ReactSession({ controller }: { controller: Controller }) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  return <ReactView state={state} controller={controller} />;
}

export function mountReact(target: HTMLElement, controller: Controller) {
  assertDisconnected();
  const root = createRoot(target);
  root.render(<ReactSession controller={controller} />);
  return () => root.unmount();
}
