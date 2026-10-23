import { useMemo } from 'react';

import type {
  Route,
  ScreenFactory,
  ScreenLease,
  ScreenLifecycle,
  ScreenProps,
  ScreenRenderer,
  ScreenSession,
} from '../contracts';
import type { DeferredSession, DeferredState } from './deferred-screens';

export type MeasurementMode = 'eager' | 'lazy' | 'workbench';
type Kind =
  | 'requested'
  | 'loading'
  | 'failed'
  | 'module-ready'
  | 'committed-ready'
  | 'factory-failed'
  | 'mount-callback-failed'
  | 'renderer-error'
  | 'retired-before-ready'
  | 'retired-after-ready';
export type RouteObservation = Readonly<{
  sequence: number;
  request: number;
  kind: Kind;
  route: Route;
  hostEpoch: number;
  screenEpoch: number;
  routeVisit: number;
  auxiliaryVisit: number | null;
  attempt: number;
  failureSeen: boolean;
  includesManualRetryWait: boolean;
  requestedAtMs: number | null;
  atMs: number | null;
  sinceRequestMs: number | null;
  requestToOwnerMountedMs: number | null;
}>;
type Entry = {
  lease: ScreenLease;
  route: Route;
  hostEpoch: number;
  screenEpoch: number;
  request: number;
  routeVisit: number;
  auxiliaryVisit: number | null;
  requestedAtMs: number | null;
  attempt: number;
  failureSeen: boolean;
  committed: boolean;
  retired: boolean;
  session?: ScreenSession;
  deferred?: DeferredSession;
  lastState?: string;
  cleanup: Array<() => void>;
};

/** Matched sample instrumentation, not a CPU, paint, startup or native metric. */
export function measureRoutes(
  OriginalScreen: ScreenRenderer,
  originalFactory: ScreenFactory,
  arm: 'react' | 'svelte',
  mode: MeasurementMode,
  now: () => number = () => performance.now(),
) {
  const capacity = 200;
  const records: RouteObservation[] = [];
  const entries = new WeakMap<ScreenSession, Entry>();
  const active = new Set<Entry>();
  const listeners = new Set<() => void>();
  const visits = new Map<Route, number>();
  let requests = 0;
  let auxiliaryVisits = 0;
  let total = 0;
  let diagnosticErrors = 0;
  let disposed = false;
  const safely = (operation: () => void) => {
    try {
      operation();
    } catch {
      diagnosticErrors++;
    }
  };
  const time = () => {
    try {
      const value = now();
      if (Number.isFinite(value) && value >= 0) return value;
    } catch {
      // A diagnostic clock cannot prevent the original owner from cleaning up.
    }
    diagnosticErrors++;
    return null;
  };
  const record = (entry: Entry, kind: Kind, atMs = time()) => {
    if (disposed) return;
    const sinceRequestMs =
      atMs !== null &&
      entry.requestedAtMs !== null &&
      atMs >= entry.requestedAtMs
        ? atMs - entry.requestedAtMs
        : null;
    records.push(
      Object.freeze({
        sequence: ++total,
        request: entry.request,
        kind,
        route: entry.route,
        hostEpoch: entry.hostEpoch,
        screenEpoch: entry.screenEpoch,
        routeVisit: entry.routeVisit,
        auxiliaryVisit: entry.auxiliaryVisit,
        attempt: entry.attempt,
        failureSeen: entry.failureSeen,
        includesManualRetryWait: entry.attempt > 1,
        requestedAtMs: entry.requestedAtMs,
        atMs,
        sinceRequestMs,
        requestToOwnerMountedMs:
          kind === 'committed-ready' ? sinceRequestMs : null,
      }),
    );
    if (records.length > capacity) records.shift();
    for (const listener of [...listeners]) safely(listener);
  };
  const stop = (entry: Entry) => {
    active.delete(entry);
    for (const cleanup of entry.cleanup.splice(0)) safely(cleanup);
  };
  const addCleanup = (entry: Entry, cleanup: () => void) => {
    if (entry.retired || disposed) safely(cleanup);
    else entry.cleanup.push(cleanup);
  };
  const inspect = (entry: Entry): DeferredState | undefined => {
    try {
      return entry.deferred?.snapshot();
    } catch {
      diagnosticErrors++;
      return undefined;
    }
  };
  const observeState = (entry: Entry) => {
    if (disposed || entry.retired) return;
    const state = inspect(entry);
    if (!state) return;
    const key = `${state.status}:${state.attempt}`;
    if (key === entry.lastState) return;
    entry.lastState = key;
    if (Number.isSafeInteger(state.attempt) && state.attempt > 0) {
      entry.attempt = state.attempt;
    }
    if (state.status === 'failed') entry.failureSeen = true;
    if (state.status === 'retired') {
      entry.retired = true;
      stop(entry);
      record(
        entry,
        entry.committed ? 'retired-after-ready' : 'retired-before-ready',
      );
    } else {
      record(entry, state.status === 'ready' ? 'module-ready' : state.status);
    }
  };
  const eligible = (entry: Entry | undefined, session: ScreenSession) => {
    if (!entry || disposed || entry.retired || entry.committed) return false;
    try {
      if (
        entry.session !== session ||
        session.lease !== entry.lease ||
        session.route !== entry.route ||
        entry.lease.route !== entry.route ||
        entry.lease.hostEpoch !== entry.hostEpoch ||
        entry.lease.screenEpoch !== entry.screenEpoch ||
        !entry.lease.isCurrent()
      ) {
        return false;
      }
      if (!entry.deferred) return true;
      const state = inspect(entry);
      return (
        state?.status === 'ready' &&
        state.session.lease === entry.lease &&
        state.session.route === entry.route
      );
    } catch {
      diagnosticErrors++;
      return false;
    }
  };
  const createSession: ScreenFactory = (route, context) => {
    if (disposed) return originalFactory(route, context);
    // This is the synchronous factory request, not an input-event timestamp.
    const requestedAtMs = time();
    const entry: Entry = {
      lease: context.lease,
      route,
      hostEpoch: context.lease.hostEpoch,
      screenEpoch: context.lease.screenEpoch,
      request: ++requests,
      routeVisit: (visits.get(route) ?? 0) + 1,
      auxiliaryVisit: route === 'workbench' ? null : ++auxiliaryVisits,
      requestedAtMs,
      attempt: 1,
      failureSeen: false,
      committed: false,
      retired: false,
      cleanup: [],
    };
    visits.set(route, entry.routeVisit);
    active.add(entry);
    addCleanup(
      entry,
      context.lease.onRetire(() => {
        if (entry.retired) return;
        entry.retired = true;
        stop(entry);
        record(
          entry,
          entry.committed ? 'retired-after-ready' : 'retired-before-ready',
        );
      }),
    );
    record(entry, 'requested', requestedAtMs);
    try {
      const session = originalFactory(route, context);
      entry.session = session;
      entries.set(session, entry);
      const candidate = session as DeferredSession;
      if (
        typeof candidate.snapshot === 'function' &&
        typeof candidate.subscribe === 'function' &&
        typeof candidate.retry === 'function'
      ) {
        entry.deferred = candidate;
        safely(() => {
          addCleanup(
            entry,
            candidate.subscribe(() => observeState(entry)),
          );
        });
        observeState(entry);
      }
      return session;
    } catch (error) {
      entry.failureSeen = true;
      record(entry, 'factory-failed');
      throw error;
    }
  };
  function Screen(props: ScreenProps) {
    const { session, lifecycle } = props;
    const holder = useMemo(() => {
      const entry = entries.get(session);
      const holder = {
        latest: lifecycle,
        lifecycle: undefined as unknown as ScreenLifecycle,
      };
      holder.lifecycle = {
        mounted(action) {
          const atMs = time();
          const wasEligible = eligible(entry, session);
          try {
            holder.latest.mounted(action);
          } catch (error) {
            if (entry && !entry.retired) {
              entry.failureSeen = true;
              record(entry, 'mount-callback-failed', atMs);
            }
            throw error;
          }
          // Original diagnostics may synchronously retire or replace the lease.
          if (wasEligible && eligible(entry, session)) {
            entry!.committed = true;
            record(entry!, 'committed-ready', atMs);
          }
        },
        unmounted: () => holder.latest.unmounted(),
        pending: (disposal) => holder.latest.pending(disposal),
        error(error) {
          if (entry && !entry.retired) {
            entry.failureSeen = true;
            record(entry, 'renderer-error');
          }
          holder.latest.error(error);
        },
      };
      return holder;
    }, [session]);
    holder.latest = lifecycle;
    return <OriginalScreen {...props} lifecycle={holder.lifecycle} />;
  }
  return {
    Screen,
    createSession,
    read: () => ({
      arm,
      mode,
      metric: 'Synchronous session-factory request to original owner mounted',
      caveats: [
        'Disconnected sample only. Includes controller, renderer and measurement work; excludes input dispatch before the request. Does not await asynchronous fixture data. Not paint, CPU, page startup or native-client latency.',
        'Module-ready is not committed-ready. Only the original current owner mounted callback can record committed-ready.',
        'First auxiliary visit is first in this application instance, not proof of a cold browser or module cache.',
        'Retry durations retain the original request time, including failures and human retry waiting. Do not pool them with uninterrupted visits.',
        'Failures, loading, retirement and retries are retained as events, not silently excluded. Null times indicate an invalid clock sample.',
        'Observations reset only on page reload. Reloading does not guarantee a cold browser cache.',
      ],
      capacity,
      totalRecords: total,
      droppedRecords: total - records.length,
      diagnosticErrors,
      trackedSessions: active.size,
      subscriptions: listeners.size,
      records: [...records],
    }),
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of [...active]) stop(entry);
      listeners.clear();
    },
  };
}
