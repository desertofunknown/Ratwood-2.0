import { flushSync, mount, unmount } from 'svelte';

import type { WorkbenchData } from '../model';
import type { WorkbenchAction } from '../Workbench';
import Delivery from './Delivery.svelte';

/** Local rendering adapter only. No BYOND bridge or network imports. */
export function mountWorkbench(
  target: HTMLElement,
  data: WorkbenchData,
  onAction: WorkbenchAction,
) {
  const component = mount(Delivery, {
    target,
    props: { initialData: data, onAction },
  });
  flushSync();
  return {
    update: (next: WorkbenchData) => component.update(next),
    unmount: () => unmount(component),
  };
}
