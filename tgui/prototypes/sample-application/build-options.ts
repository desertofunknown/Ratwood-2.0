import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BunPlugin } from 'bun';

import {
  definitions as integrationDefinitions,
  plugins as integrationPlugins,
} from '../crafting-workbench/browser-integration/build-options';

import { endpointBanner } from './endpoint-binding';

export const banner = endpointBanner;
export const definitions = {
  ...integrationDefinitions,
  Byond: '__sampleEndpointFacade',
};
export const here = dirname(fileURLToPath(import.meta.url));
export const tgui = resolve(here, '../..');
export const repository = resolve(tgui, '..');

export function plugins(inputs?: Set<string>): BunPlugin[] {
  return [
    {
      name: 'shared-sample-single-svelte-runtime',
      setup(build) {
        // Every reused screen resolves to the same pinned compiler/runtime.
        build.onResolve({ filter: /^svelte(?:\/|$)/ }, ({ path }) => ({
          path:
            path === 'svelte'
              ? join(
                  here,
                  '../crafting-workbench/svelte/node_modules/svelte/src/index-client.js',
                )
              : Bun.resolveSync(
                  path,
                  join(here, '../crafting-workbench/svelte'),
                ),
        }));
      },
    },
    ...integrationPlugins(inputs),
  ];
}
