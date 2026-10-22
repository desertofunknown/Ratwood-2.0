import type { Cancel, Schedule } from './model';

/** Deterministic injected clock. Retained callbacks deliberately model stale work. */
export function testClock() {
  let now = 0;
  let serial = 0;
  const pending = new Map<number, { at: number; callback: () => void }>();
  const callbacks: Array<() => void> = [];
  const cancelled: unknown[] = [];
  const schedule: Schedule = (callback, delay) => {
    callbacks.push(callback);
    pending.set(++serial, { at: now + delay, callback });
    return serial;
  };
  const cancel: Cancel = (timer) => {
    cancelled.push(timer);
    pending.delete(timer as number);
  };
  return {
    schedule,
    cancel,
    callbacks,
    cancelled,
    pending,
    advance(milliseconds: number) {
      const until = now + milliseconds;
      let iterations = 0;
      while (true) {
        const next = [...pending].sort(
          (a, b) => a[1].at - b[1].at || a[0] - b[0],
        )[0];
        if (!next || next[1].at > until) break;
        if (++iterations > 1000)
          throw Error('Unexpected timer loop in ledger check.');
        now = next[1].at;
        pending.delete(next[0]);
        next[1].callback();
      }
      now = until;
    },
  };
}
