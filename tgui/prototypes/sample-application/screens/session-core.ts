import type { WorkbenchAction } from '../../crafting-workbench/Workbench';
import type { Cancel, Schedule } from '../../treasury-ledger/model';
import type { ScreenSession, SessionContext } from '../contracts';

export type WorkbenchSession = ScreenSession & {
  route: 'workbench';
  action: WorkbenchAction;
};
export type SessionClock = {
  /** Test clock injection only; each screen retains its existing delays. */
  schedule?: Schedule;
  cancel?: Cancel;
};

/** Own every local subscription independently of either rendering framework. */
export function sessionScope(context: SessionContext, options: SessionClock) {
  let retired = false;
  const subscriptions = new Set<() => void>();
  const timers = new Set<unknown>();
  const current = () => !retired && context.lease.isCurrent();
  const schedule = options.schedule ?? ((fn, delay) => setTimeout(fn, delay));
  const cancel =
    options.cancel ??
    ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  function subscribe<Args extends unknown[]>(
    source: (notify: (...args: Args) => void) => () => void,
    notify: (...args: Args) => void,
  ) {
    if (!current()) return () => {};
    const unsubscribe = source((...args) => {
      if (current()) notify(...args);
    });
    let subscribed = true;
    const cleanup = () => {
      if (!subscribed) return;
      subscribed = false;
      subscriptions.delete(cleanup);
      unsubscribe();
    };
    if (!current()) cleanup();
    else subscriptions.add(cleanup);
    return cleanup;
  }
  const attempt = (cleanup: () => void) => {
    try {
      cleanup();
    } catch (error) {
      context.lifecycle.error(error);
    }
  };
  function retire(...cleanups: Array<() => void>) {
    if (retired) return;
    retired = true;
    // A broken subscriber or validator cannot keep the other owned resources
    // alive. Report each failure while completing the remaining cleanup.
    for (const unsubscribe of [...subscriptions]) attempt(unsubscribe);
    for (const timer of timers) attempt(() => cancel(timer));
    timers.clear();
    for (const cleanup of cleanups) attempt(cleanup);
  }
  return {
    current,
    subscribe,
    schedule(callback: () => void, delay: number) {
      const timer = schedule(() => {
        timers.delete(timer);
        if (current()) callback();
      }, delay);
      timers.add(timer);
      return timer;
    },
    cancel(timer: unknown) {
      if (timers.delete(timer)) cancel(timer);
    },
    gate<Args extends unknown[]>(callback: (...args: Args) => void) {
      return (...args: Args) => {
        if (current()) callback(...args);
      };
    },
    retire,
    construct<T>(factory: () => T, cleanup: () => void): T {
      try {
        return factory();
      } catch (error) {
        retire(cleanup);
        throw error;
      }
    },
  };
}

/** The eager workbench uses the same lease gate as every auxiliary session. */
export function createWorkbenchSession(
  context: SessionContext,
  options: SessionClock = {},
): WorkbenchSession {
  const { lease, validateBoundary } = context;
  validateBoundary();
  const scope = sessionScope(context, options);
  return {
    route: 'workbench',
    lease,
    action: scope.gate(context.onWorkbenchAction),
    retire: () => scope.retire(),
  };
}
