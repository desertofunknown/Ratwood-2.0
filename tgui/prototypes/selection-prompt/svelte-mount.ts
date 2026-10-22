import {
  mount,
  unmount,
} from '../crafting-workbench/svelte/node_modules/svelte/src/index-client.js';
import {
  createController,
  type Controller,
  type Data,
  type Act,
} from './model';
import { assertDisconnected } from './network-guard';
import SvelteView from './SvelteView.svelte';
export function mountSvelte(target: HTMLElement, controller: Controller) {
  assertDisconnected();
  const instance = mount(SvelteView, { target, props: { controller } });
  return () => {
    void unmount(instance);
  };
}
export function createSvelteSelectionPrompt(
  host: HTMLElement,
  initialData: Data,
  onAction: Act,
  onClose?: () => void,
) {
  const controller = createController(initialData, onAction, onClose);
  const dispose = mountSvelte(host, controller);
  return {
    controller,
    update: controller.deliver,
    destroy: () => {
      controller.close();
      dispose();
    },
  };
}
