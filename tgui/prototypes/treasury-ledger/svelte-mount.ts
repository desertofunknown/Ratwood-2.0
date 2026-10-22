import {
  mount,
  unmount,
} from '../crafting-workbench/svelte/node_modules/svelte/src/index-client.js';
import type { Controller } from './model';
import { assertDisconnected } from './network-guard';
import SvelteSession from './SvelteSession.svelte';

export function mountSvelte(target: HTMLElement, controller: Controller) {
  assertDisconnected();
  const instance = mount(SvelteSession, { target, props: { controller } });
  return () => {
    void unmount(instance);
  };
}
