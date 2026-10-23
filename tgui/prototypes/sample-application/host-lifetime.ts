export type HostSource = {
  getState(): {
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
  subscribe(listener: () => void): () => void;
};
export type HostSnapshot = Readonly<{ active: boolean; hostEpoch: number }>;

/** Observe only the existing store. Never subscribe to native transport. */
export function observeSampleLifetime(store: HostSource) {
  const read = () => {
    const { config, suspended, suspending } = store.getState().backend;
    return {
      active:
        !suspended &&
        !suspending &&
        !config.refreshing &&
        config.interface?.name === 'SampleApplication' &&
        config.interface?.layout === 'Window',
      identity: JSON.stringify([
        suspended,
        suspending,
        !!config.refreshing,
        config.window?.key,
        config.interface?.name,
        config.interface?.layout,
      ]),
    };
  };
  let last = read();
  let disposed = false;
  let snapshot: HostSnapshot = Object.freeze({
    active: last.active,
    hostEpoch: 0,
  });
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };
  const unsubscribe = store.subscribe(() => {
    if (disposed) return;
    const next = read();
    if (next.identity === last.identity) return;
    last = next;
    snapshot = Object.freeze({
      active: next.active,
      hostEpoch: snapshot.hostEpoch + 1,
    });
    emit();
  });
  return {
    get active() {
      return snapshot.active;
    },
    get hostEpoch() {
      return snapshot.hostEpoch;
    },
    get epoch() {
      return snapshot.hostEpoch;
    },
    snapshot: () => snapshot,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isCurrent: (epoch: number) =>
      !disposed && snapshot.active && epoch === snapshot.hostEpoch,
    dispose() {
      if (disposed) return;
      disposed = true;
      snapshot = Object.freeze({
        active: false,
        hostEpoch: snapshot.hostEpoch + 1,
      });
      unsubscribe();
      try {
        emit();
      } finally {
        listeners.clear();
      }
    },
  };
}
export type HostLifetime = ReturnType<typeof observeSampleLifetime>;
