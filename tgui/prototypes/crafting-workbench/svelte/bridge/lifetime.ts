type LifetimeSource = {
  getState: () => {
    backend: {
      config: {
        refreshing?: unknown;
        window?: { key?: string };
        interface?: { name?: string; layout?: string };
      };
      suspended: number | false;
      suspending: boolean;
    };
  };
  subscribe: (listener: () => void) => () => void;
};

/** Harness only. Observe the EXISTING store, never Byond.subscribe. */
export function observeWorkbenchLifetime(store: LifetimeSource) {
  const read = () => {
    const { config, suspended, suspending } = store.getState().backend;
    return {
      active:
        !suspended &&
        !suspending &&
        !config.refreshing &&
        config.interface?.name === 'MiaCraft',
      key: JSON.stringify([
        config.window?.key,
        config.interface?.name,
        config.interface?.layout,
      ]),
    };
  };
  let last = read();
  let epoch = 0;
  let disposed = false;
  const unsubscribe = store.subscribe(() => {
    const next = read();
    if (next.active !== last.active || next.key !== last.key) epoch++;
    last = next;
  });
  return {
    get epoch() {
      return epoch;
    },
    get active() {
      return !disposed && last.active;
    },
    isCurrent: (candidate: number) =>
      !disposed && last.active && candidate === epoch,
    dispose() {
      if (disposed) return;
      disposed = true;
      epoch++;
      unsubscribe();
    },
  };
}
