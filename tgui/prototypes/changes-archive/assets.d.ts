/* eslint-disable spaced-comment -- TypeScript reference directive syntax. */
/// <reference path="../crafting-workbench/svelte/node_modules/svelte/types/index.d.ts" />
declare module '*.html' {
  const html: string;
  export default html;
}
declare module '*.svelte' {
  const component: import('../crafting-workbench/svelte/node_modules/svelte').Component<any>;
  export default component;
}
