import { flushSync, mount, unmount } from 'svelte';

import { installBenchmark, type DemoAdapter } from '../browser-harness';
import Demo from './Demo.svelte';

const actions: unknown[] = [];
const component = mount(Demo, {
  target: document.getElementById('root')!,
  props: { actions },
});
flushSync();
const adapter: DemoAdapter = {
  update: (data) => component.update(data),
  unmount: () => unmount(component),
  actions,
};
installBenchmark(adapter, true);
