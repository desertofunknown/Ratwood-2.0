import { flushSync, mount, unmount } from 'svelte';

import type { WorkbenchData } from '../model';
import type { WorkbenchAction } from '../Workbench';
import Delivery from './Delivery.svelte';

/** Local rendering adapter only. No BYOND bridge or network imports. */
export function mountWorkbench(
  target: HTMLElement,
  data: WorkbenchData,
  onAction: WorkbenchAction,
  onMountFailure?: (dispose: () => Promise<void>) => void,
) {
  const component = mount(Delivery, {
    target,
    props: { initialData: data, onAction },
  });
  try {
    flushSync();
  } catch (error) {
    // The component already exists. Keep its cleanup accessible to an owning
    // host even though this synchronous mount cannot return the normal handle.
    let disposal: Promise<void> | undefined;
    const dispose = () => {
      if (disposal) return disposal;
      try {
        disposal = Promise.resolve(unmount(component));
      } catch (cleanupError) {
        disposal = Promise.reject(cleanupError);
      }
      return disposal;
    };
    let observed = false;
    try {
      onMountFailure?.(dispose);
      observed = disposal !== undefined;
    } catch (observerError) {
      console.error('Workbench mount cleanup observer failed.', observerError);
    } finally {
      // A missing, throwing or forgetful observer cannot abandon this instance.
      dispose().catch((cleanupError) => {
        if (!observed)
          console.error('Workbench mount cleanup failed.', cleanupError);
      });
    }
    throw error;
  }
  return {
    update: (next: WorkbenchData) => component.update(next),
    unmount: () => unmount(component),
  };
}
