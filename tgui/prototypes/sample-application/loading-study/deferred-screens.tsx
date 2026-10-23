import { useMemo, useSyncExternalStore } from 'react';

import {
  type Route,
  routeLabels,
  type ScreenFactory,
  type ScreenLifecycle,
  type ScreenProps,
  type ScreenRenderer,
  type ScreenSession,
  type SessionContext,
} from '../contracts';

export type AuxModule = {
  createSession: ScreenFactory;
  Screen: ScreenRenderer;
};
export type DeferredObservation = Readonly<{
  kind: 'requested' | 'loading' | 'failed' | 'ready' | 'committed-ready';
  route: Route;
  hostEpoch: number;
  screenEpoch: number;
  attempt: number;
  error?: unknown;
}>;
export type DeferredState = Readonly<
  | { status: 'loading' | 'retired'; attempt: number }
  | { status: 'failed'; attempt: number; error: unknown }
  | { status: 'ready'; attempt: number; session: ScreenSession }
>;
export type DeferredSession = ScreenSession & {
  snapshot(): DeferredState;
  subscribe(listener: () => void): () => void;
  retry(): boolean;
};
type Options = {
  workbenchFactory: ScreenFactory;
  WorkbenchScreen: ScreenRenderer;
  loadAuxiliary(): Promise<AuxModule>;
  observe?(event: DeferredObservation): void;
};

type LoadResult = { module: AuxModule } | { error: unknown };
/** Clearing interest also releases the visit closure if an import never settles. */
function watchModule(
  request: Promise<AuxModule>,
  receive: ((result: LoadResult) => void) | undefined,
) {
  const deliver = (result: LoadResult) => {
    const listener = receive;
    receive = undefined;
    listener?.(result);
  };
  void request.then(
    (module) => deliver({ module }),
    (error) => deliver({ error }),
  );
  return () => {
    receive = undefined;
  };
}

/**
 * A disconnected source-model adapter, not native-client acceptance.
 * Only the module and its in-flight import are shared. Every visit gets a new
 * lease, attempt state and original screen session. Retirement cancels interest,
 * not browser ESM fetch/evaluation, and never waits for that work to finish.
 */
export function createDeferredScreens(options: Options): {
  createSession: ScreenFactory;
  Screen: ScreenRenderer;
} {
  let cached: AuxModule | undefined;
  let inFlight: Promise<AuxModule> | undefined;
  const entries = new WeakMap<ScreenSession, ReturnType<typeof createEntry>>();

  const load = () => {
    if (cached) return Promise.resolve(cached);
    if (inFlight) return inFlight;
    const request = Promise.resolve()
      .then(() => options.loadAuxiliary())
      .then((module) => {
        if (
          !module ||
          typeof module.createSession !== 'function' ||
          typeof module.Screen !== 'function'
        ) {
          throw new Error(
            'Auxiliary module returned an invalid screen contract.',
          );
        }
        cached = module;
        return module;
      });
    inFlight = request;
    // Reset our rejected promise, not the browser's ESM module map. A real
    // cached evaluation failure can reject again and may require page reload.
    void request.then(
      () => {
        if (inFlight === request) inFlight = undefined;
      },
      () => {
        if (inFlight === request) inFlight = undefined;
      },
    );
    return request;
  };

  function createEntry(route: Route, context: SessionContext) {
    const { lease } = context;
    let retired = false;
    let attempt = 1;
    let state: DeferredState = Object.freeze({ status: 'loading', attempt });
    let readyModule: AuxModule | undefined;
    let candidate: ScreenSession | undefined;
    const retiredCandidates = new WeakSet<ScreenSession>();
    const listeners = new Set<() => void>();
    let unregister = () => {};
    let cancelInterest = () => {};
    const current = (token = attempt) =>
      !retired && token === attempt && lease.isCurrent();
    const report = (error: unknown, lifecycle = context.lifecycle) => {
      try {
        lifecycle.error(error);
      } catch {
        // Diagnostics must never retain authority or interrupt other cleanup.
      }
    };
    const observe = (
      kind: DeferredObservation['kind'],
      token: number,
      error?: unknown,
    ) => {
      try {
        options.observe?.(
          Object.freeze({
            kind,
            route,
            hostEpoch: lease.hostEpoch,
            screenEpoch: lease.screenEpoch,
            attempt: token,
            ...(error === undefined ? {} : { error }),
          }),
        );
      } catch (error) {
        report(error);
      }
    };
    const notify = () => {
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch (error) {
          report(error);
        }
      }
    };
    const retireCandidate = (owned: ScreenSession | undefined) => {
      if (
        !owned ||
        (typeof owned !== 'object' && typeof owned !== 'function') ||
        retiredCandidates.has(owned)
      ) {
        return;
      }
      retiredCandidates.add(owned);
      try {
        owned.retire();
      } catch (error) {
        report(error);
      }
    };
    const guardLifecycle = (lifecycle: ScreenLifecycle, committed = false) => {
      const guard = (callback: () => void) => {
        try {
          callback();
        } catch (error) {
          report(error, lifecycle);
        }
      };
      return {
        mounted(action) {
          if (!current()) return;
          guard(() => lifecycle.mounted(action));
          if (committed && current() && state.status === 'ready') {
            observe('committed-ready', state.attempt);
          }
        },
        unmounted: () => guard(() => lifecycle.unmounted()),
        pending(disposal) {
          // This is ONLY an original renderer's real view-disposal promise.
          // Handle rejection even if the recipient's tracking callback throws.
          void Promise.resolve(disposal).catch((error) =>
            report(error, lifecycle),
          );
          guard(() => lifecycle.pending(disposal));
        },
        error: (error) => report(error, lifecycle),
      } satisfies ScreenLifecycle;
    };
    const fail = (token: number, error: unknown) => {
      if (!current(token)) return;
      state = Object.freeze({ status: 'failed', attempt: token, error });
      report(error);
      if (!current(token)) return;
      observe('failed', token, error);
      if (current(token)) notify();
    };
    const start = (token: number) => {
      // The manager cannot publish the wrapper lease until its synchronous
      // factory returns, including when the auxiliary module is already cached.
      queueMicrotask(() => {
        if (!current(token)) return;
        try {
          context.validateBoundary();
          if (!current(token)) return;
          observe('loading', token);
          if (!current(token)) return;
          cancelInterest = watchModule(load(), (result) => {
            if ('error' in result) {
              fail(token, result.error);
            } else {
              const { module } = result;
              let created: ScreenSession | undefined;
              try {
                if (!current(token)) return;
                context.validateBoundary();
                if (!current(token)) return;
                created = module.createSession(route, {
                  ...context,
                  lifecycle: guardLifecycle(context.lifecycle),
                });
                if (!current(token)) {
                  retireCandidate(created);
                  return;
                }
                context.validateBoundary();
                if (!current(token)) {
                  retireCandidate(created);
                  return;
                }
                if (created.route !== route || created.lease !== lease) {
                  throw new Error(
                    'Auxiliary factory returned a mismatched session.',
                  );
                }
                candidate = created;
                readyModule = module;
                state = Object.freeze({
                  status: 'ready',
                  attempt: token,
                  session: created,
                });
                observe('ready', token);
                if (current(token)) notify();
              } catch (error) {
                retireCandidate(created);
                fail(token, error);
              }
            }
          });
        } catch (error) {
          fail(token, error);
        }
      });
    };
    const session: DeferredSession = {
      route,
      lease,
      snapshot: () => state,
      subscribe(listener) {
        if (retired) return () => {};
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      retry() {
        if (!current() || state.status !== 'failed') return false;
        state = Object.freeze({ status: 'loading', attempt: ++attempt });
        start(attempt);
        notify();
        return true;
      },
      retire() {
        if (retired) return;
        retired = true;
        const old = candidate;
        candidate = undefined;
        readyModule = undefined;
        state = Object.freeze({ status: 'retired', attempt });
        attempt++;
        cancelInterest();
        try {
          unregister();
        } catch (error) {
          report(error);
        }
        retireCandidate(old);
        notify();
        listeners.clear();
      },
    };
    unregister = lease.onRetire(session.retire);
    start(attempt);
    // Request time is separate from import readiness and committed mounting.
    observe('requested', attempt);
    return { session, guardLifecycle, module: () => readyModule };
  }

  const createSession: ScreenFactory = (route, context) => {
    if (route === 'workbench') return options.workbenchFactory(route, context);
    const entry = createEntry(route, context);
    entries.set(entry.session, entry);
    return entry.session;
  };

  function AuxiliaryScreen({ session, snapshot, lifecycle }: ScreenProps) {
    const entry = entries.get(session);
    if (!entry) {
      throw new Error('Deferred screen session belongs to another adapter.');
    }
    const state = useSyncExternalStore(
      entry.session.subscribe,
      entry.session.snapshot,
    );
    const guarded = useMemo(
      () => entry.guardLifecycle(lifecycle, true),
      [entry, lifecycle],
    );
    const handleRetry = entry.session.retry;
    if (!session.lease.isCurrent() || state.status === 'retired') return null;
    if (state.status === 'ready') {
      const OriginalScreen = entry.module()!.Screen;
      return (
        <OriginalScreen
          session={state.session}
          snapshot={snapshot}
          lifecycle={guarded}
        />
      );
    }
    return (
      <div
        className="SampleApplication__screenControls"
        data-deferred-screen={state.status}
      >
        {state.status === 'failed' ? (
          <>
            <p role="alert">Could not load {routeLabels[session.route]}.</p>
            <button
              type="button"
              className="TithewoodControl"
              data-deferred-retry=""
              onClick={handleRetry}
            >
              Retry screen
            </button>
            <p>
              A temporary loader failure can be retried. A cached browser module
              failure may require reloading this page.
            </p>
          </>
        ) : (
          <p role="status" aria-live="polite">
            Loading {routeLabels[session.route]}…
          </p>
        )}
      </div>
    );
  }
  function Screen(props: ScreenProps) {
    if (props.session.route === 'workbench') {
      const WorkbenchScreen = options.WorkbenchScreen;
      return <WorkbenchScreen {...props} />;
    }
    return <AuxiliaryScreen {...props} />;
  }
  return { createSession, Screen };
}
