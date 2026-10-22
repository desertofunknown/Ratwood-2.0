/// <reference path="../crafting-workbench/svelte/node_modules/svelte/types/index.d.ts" />
declare module '*.svelte' {
  const component: import('svelte').Component<any>;
  export default component;
}
declare module '*svelte/src/index-client.js' {
  export { flushSync, mount, onMount, untrack, unmount } from 'svelte';
}
