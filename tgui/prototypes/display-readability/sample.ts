import { createSampleData } from './fixtures';
import {
  copyData,
  type DeliverData,
  type SettingsAction,
  type SettingsData,
} from './model';
import { assertDisconnected } from './network-guard';

/** In-memory demonstration only. No native effects or persistence are simulated. */
export function createSample(
  initial: SettingsData = createSampleData(),
  validateBoundary: () => void = assertDisconnected,
) {
  validateBoundary();
  let data = copyData(initial);
  let active = true;
  const subscribers = new Set<DeliverData>();
  const pending: Array<() => void> = [];
  function queueDelivery(next: SettingsData) {
    validateBoundary();
    if (!active) return;
    const snapshot = copyData(next);
    const recipients = [...subscribers];
    pending.push(() => {
      validateBoundary();
      if (!active) return;
      for (const recipient of recipients) {
        if (!active) return;
        if (subscribers.has(recipient)) recipient(copyData(snapshot));
      }
    });
  }
  const action: SettingsAction = (...command) => {
    validateBoundary();
    if (!active) return;
    const [kind, payload] = command;
    if (kind === 'toggle') {
      const entry = data.categories
        .flatMap((category) => category.entries)
        .find((entry) => entry.id === payload.id);
      if (!entry) return;
      entry.enabled = !entry.enabled;
    } else {
      const entry = data.categories
        .flatMap((category) => category.selects ?? [])
        .find((entry) => entry.id === payload.id);
      if (
        !entry ||
        !entry.options.some((option) => option.value === payload.value)
      )
        return;
      entry.value = payload.value;
    }
    // Queue every activation, even a repeated toggle or selected palette.
    queueDelivery(data);
  };
  return {
    action,
    subscribe(recipient: DeliverData) {
      validateBoundary();
      if (!active) return () => {};
      subscribers.add(recipient);
      recipient(copyData(data));
      return () => {
        subscribers.delete(recipient);
      };
    },
    pendingCount: () => pending.length,
    queueDelivery,
    deliverNext() {
      validateBoundary();
      if (!active) return false;
      const next = pending.shift();
      next?.();
      return Boolean(next);
    },
    dispose() {
      validateBoundary();
      active = false;
      pending.length = 0;
      subscribers.clear();
    },
  };
}
export type Sample = ReturnType<typeof createSample>;
