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
  return (
    <ReactView
      page={state.page}
      draft={state.draft}
      onDraft={controller.draft}
      onClear={controller.clear}
      onPage={controller.page}
      onRefresh={controller.refresh}
    />
  );
}

export function mountReact(target: HTMLElement, controller: Controller) {
  assertDisconnected();
  const root = createRoot(target);
  root.render(<ReactSession controller={controller} />);
  return () => root.unmount();
}
