import {
  mount,
  unmount,
} from '../crafting-workbench/svelte/node_modules/svelte/src/index-client.js';
import { preview } from './preview';
import SvelteView from './SvelteView.svelte';
preview((target, controller) => {
  const instance = mount(SvelteView, { target, props: { controller } });
  return () => {
    void unmount(instance);
  };
});
