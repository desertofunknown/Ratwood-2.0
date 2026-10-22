import {
  mount,
  unmount,
} from '../crafting-workbench/svelte/node_modules/svelte/src/index-client.js';
import { assertDisconnected } from '../selection-prompt/network-guard';
import {
  createController,
  type Act,
  type Controller,
  type Data,
  type Kind,
} from './model';
import SvelteView from './SvelteView.svelte';

export function mountSvelte(target: HTMLElement, controller: Controller) {
  assertDisconnected();
  const instance = mount(SvelteView, { target, props: { controller } });
  return () => {
    void unmount(instance);
  };
}

export function createSvelteValuePrompt(
  host: HTMLElement,
  kind: Kind,
  initialData: Data,
  onAction: Act,
  onClose?: () => void,
) {
  const controller = createController(kind, initialData, onAction, onClose);
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
