import {
  mount,
  unmount,
} from '../crafting-workbench/svelte/node_modules/svelte/src/index-client.js';
import { assertDisconnected } from '../selection-prompt/network-guard';
import { createMarketController } from './model';
import SvelteView from './SvelteView.svelte';

type MarketController = ReturnType<typeof createMarketController>;

/** Mount only the disconnected inspector; no bridge or backend is installed. */
export function mountSvelte(target: HTMLElement, controller: MarketController) {
  assertDisconnected();
  const instance = mount(SvelteView, { target, props: { controller } });
  return () => {
    void unmount(instance);
  };
}

export function createSvelteMarketQuote(host: HTMLElement, sampleId?: string) {
  assertDisconnected();
  const controller = createMarketController(sampleId);
  const unmountView = mountSvelte(host, controller);
  return {
    controller,
    destroy: () => {
      controller.dispose();
      unmountView();
    },
  };
}
