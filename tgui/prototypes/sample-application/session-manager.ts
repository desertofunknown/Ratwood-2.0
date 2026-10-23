import type { WorkbenchAction } from '../crafting-workbench/Workbench';
import {
  routes,
  type Route,
  type ScreenFactory,
  type ScreenLease,
  type ScreenLifecycle,
  type ScreenSession,
} from './contracts';
import type { HostLifetime } from './host-lifetime';

type ManagerOptions = {
  lifetime: HostLifetime;
  createSession: ScreenFactory;
  validateBoundary(): void;
  onWorkbenchAction: WorkbenchAction;
  lifecycle: ScreenLifecycle;
  initialRoute?: Route;
};
export type SessionSnapshot = Readonly<{
  route: Route;
  hostEpoch: number;
  screenEpoch: number;
  session: ScreenSession | null;
}>;

type OwnedSession = { session: ScreenSession; retire(): void };

/** Route changes revoke capabilities immediately, even inside a batched render. */
export function createSessionManager(options: ManagerOptions) {
  const { lifetime, lifecycle } = options;
  let route = options.initialRoute ?? 'workbench';
  let screenEpoch = 0;
  let revision = 0;
  let disposed = false;
  let rootEnabled = true;
  let current: OwnedSession | null = null;
  const listeners = new Set<() => void>();
  let snapshot: SessionSnapshot = Object.freeze({
    route,
    hostEpoch: lifetime.hostEpoch,
    screenEpoch,
    session: null,
  });
  const report = (error: unknown) => {
    // Error reporting must not prevent remaining controller/view cleanup.
    try {
      lifecycle.error(error);
    } catch {
      /* The lease is already fenced. */
    }
  };
  const publish = () => {
    snapshot = Object.freeze({
      route,
      hostEpoch: lifetime.hostEpoch,
      screenEpoch,
      session: current?.session ?? null,
    });
    for (const listener of [...listeners]) listener();
  };
  const retireCurrent = () => {
    const old = current;
    current = null;
    old?.retire();
  };
  const reconcile = () => {
    const transition = ++revision;
    const ownedRoute = route;
    const ownedScreenEpoch = screenEpoch;
    const hostEpoch = lifetime.hostEpoch;
    retireCurrent();
    // A retirement callback may synchronously navigate or dispose the manager.
    if (transition !== revision) return;
    if (!disposed && rootEnabled && lifetime.active) {
      let valid = true;
      let retired = false;
      let created: ScreenSession | undefined;
      const retireListeners = new Set<() => void>();
      const lease: ScreenLease = Object.freeze({
        route: ownedRoute,
        hostEpoch,
        screenEpoch: ownedScreenEpoch,
        isCurrent: () =>
          valid &&
          !disposed &&
          lifetime.isCurrent(hostEpoch) &&
          screenEpoch === ownedScreenEpoch &&
          current?.session.lease === lease,
        onRetire(cleanup: () => void) {
          if (!valid) {
            cleanup();
            return () => {};
          }
          retireListeners.add(cleanup);
          return () => {
            retireListeners.delete(cleanup);
          };
        },
      });
      const retire = () => {
        if (retired) return;
        retired = true;
        valid = false;
        try {
          created?.retire();
        } catch (error) {
          report(error);
        } finally {
          for (const cleanup of [...retireListeners]) {
            try {
              cleanup();
            } catch (error) {
              report(error);
            }
          }
          retireListeners.clear();
        }
      };
      try {
        options.validateBoundary();
        created = options.createSession(ownedRoute, {
          lease,
          validateBoundary: options.validateBoundary,
          lifecycle,
          onWorkbenchAction: (name, payload) => {
            if (!lease.isCurrent()) return;
            options.validateBoundary();
            options.onWorkbenchAction(name, payload);
          },
        });
        if (created.lease !== lease || created.route !== ownedRoute) {
          throw new Error('Screen factory returned a mismatched session.');
        }
        // Construction can itself invoke callbacks. Never publish a stale one.
        if (
          transition === revision &&
          !disposed &&
          rootEnabled &&
          lifetime.isCurrent(hostEpoch) &&
          route === ownedRoute &&
          screenEpoch === ownedScreenEpoch
        ) {
          current = { session: created, retire };
        } else {
          retire();
        }
      } catch (error) {
        retire();
        report(error);
      }
    }
    if (transition === revision) publish();
  };
  const unsubscribe = lifetime.subscribe(reconcile);
  reconcile();
  return {
    snapshot: () => snapshot,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    navigate(next: Route) {
      if (!routes.includes(next))
        throw new Error(`Unknown local screen: ${next}`);
      if (disposed || next === route) return false;
      route = next;
      screenEpoch++;
      reconcile();
      return true;
    },
    /** Root removal also invalidates leases while keeping the chosen route. */
    retireRoot() {
      if (disposed || !rootEnabled) return;
      rootEnabled = false;
      screenEpoch++;
      reconcile();
    },
    resumeRoot() {
      if (disposed) return;
      rootEnabled = true;
      if (!current) reconcile();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      rootEnabled = false;
      revision++;
      unsubscribe();
      retireCurrent();
      snapshot = Object.freeze({
        route,
        hostEpoch: lifetime.hostEpoch,
        screenEpoch,
        session: null,
      });
      listeners.clear();
    },
  };
}
export type SessionManager = ReturnType<typeof createSessionManager>;
