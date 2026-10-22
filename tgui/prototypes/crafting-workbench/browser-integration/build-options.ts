import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BunPlugin } from 'bun';

import { sveltePlugin } from '../svelte/compiler';

export const here = dirname(fileURLToPath(import.meta.url));
export const tgui = resolve(here, '../../..');
export const repository = resolve(tgui, '..');
export function plugins(inputs?: Set<string>): BunPlugin[] {
  return [
    {
      name: 'fixture-input-audit-and-production-aliases',
      setup(build) {
        build.onLoad({ filter: /./ }, ({ path }) => {
          if (
            /(?:^|\/)helpers(?:\.min)?\.js$/.test(path) ||
            path === join(tgui, 'packages/tgui/index.tsx')
          ) {
            throw new Error('Production transport entry is forbidden.');
          }
          inputs?.add(path);
          return undefined;
        });
        for (const [name, path] of Object.entries({
          'tgui-core/components': 'packages/tgui/components/keyboard/index.ts',
          'tgui-core/base-components':
            'node_modules/tgui-core/dist/components/index.js',
        })) {
          build.onResolve({ filter: new RegExp(`^${name}$`) }, () => ({
            path: join(tgui, path),
          }));
        }
      },
    },
    sveltePlugin(),
  ];
}
export const definitions = {
  'process.env.NODE_ENV': JSON.stringify('production'),
  'import.meta.webpackContext': 'globalThis.__disconnectedWebpackContext',
};
