import { perf } from 'common/perf';
import type { Store } from 'common/redux';
import {
  type ComponentType,
  createElement,
  useLayoutEffect,
  useSyncExternalStore,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { createLogger } from './logging';

const logger = createLogger('renderer');

let reactRoot: Root;
let initialRender: string | boolean = true;
let suspended = false;

// These functions are used purely for profiling.
export function resumeRenderer() {
  initialRender = initialRender || 'resumed';
  suspended = false;
}

export function suspendRenderer() {
  suspended = true;
}

enum Render {
  Start = 'render/start',
  Finish = 'render/finish',
}

function reportRender() {
  perf.mark(Render.Finish);
  if (suspended) {
    return;
  }

  // Report rendering time
  if (process.env.NODE_ENV !== 'production') {
    if (initialRender === 'resumed') {
      logger.log('rendered in', perf.measure(Render.Start, Render.Finish));
    } else if (initialRender) {
      logger.debug('serving from:', location.href);
      logger.debug('bundle entered in', perf.measure('inception', 'init'));
      logger.debug('initialized in', perf.measure('init', Render.Start));
      logger.log('rendered in', perf.measure(Render.Start, Render.Finish));
      logger.log('fully loaded in', perf.measure('inception', Render.Finish));
    } else {
      logger.debug('rendered in', perf.measure(Render.Start, Render.Finish));
    }
  }

  if (initialRender) {
    initialRender = false;
  }
}

function StoreRoot({
  component,
  store,
}: {
  component: ComponentType;
  store: Store;
}) {
  useSyncExternalStore(store.subscribe, store.getState);
  perf.mark(Render.Start);
  useLayoutEffect(reportRender);
  return createElement(component);
}

export function render(component: ComponentType, store: Store) {
  if (!reactRoot) {
    const element = document.getElementById('react-root');
    reactRoot = createRoot(element!);
  }
  reactRoot.render(createElement(StoreRoot, { component, store }));
}
