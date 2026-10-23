import type { ScreenLifecycle, ScreenSession } from '../contracts';

export function disposeFailedView(
  target: HTMLElement,
  session: ScreenSession,
  lifecycle: ScreenLifecycle,
  destroy?: () => Promise<unknown>,
) {
  target.remove();
  try {
    session.retire();
  } catch (error) {
    lifecycle.error(error);
  }
  if (destroy) {
    let disposal: Promise<unknown>;
    try {
      disposal = Promise.resolve(destroy());
    } catch (error) {
      disposal = Promise.reject(error);
    }
    lifecycle.pending(disposal);
  }
}

/** Own a returned instance before flushing any effects that could fail. */
export function mountOwnedView<Instance>(
  target: HTMLElement,
  session: ScreenSession,
  lifecycle: ScreenLifecycle,
  mount: () => Instance,
  flush: () => void,
  destroy: (instance: Instance) => Promise<unknown>,
) {
  let instance: Instance;
  let hasInstance = false;
  let disposal: Promise<unknown> | undefined;
  const unmount = () => {
    if (disposal) return disposal;
    try {
      disposal = Promise.resolve(destroy(instance));
    } catch (error) {
      disposal = Promise.reject(error);
    }
    return disposal;
  };
  try {
    instance = mount();
    hasInstance = true;
    flush();
  } catch (error) {
    // Keep the original mount/flush error, while separately tracking the real
    // disposal result. The shell cannot finish settling before this completes.
    disposeFailedView(
      target,
      session,
      lifecycle,
      hasInstance ? unmount : undefined,
    );
    throw error;
  }
  return { instance, unmount };
}
