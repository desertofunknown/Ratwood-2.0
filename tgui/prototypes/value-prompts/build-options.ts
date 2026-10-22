import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import type { BunPlugin } from 'bun';
const { compile } = createRequire(import.meta.url)(
  '../crafting-workbench/svelte/node_modules/svelte/compiler',
) as typeof import('svelte/compiler');
export const here = import.meta.dir;
export function plugins(inputs = new Set<string>()): BunPlugin[] {
  return [
    {
      name: 'disconnected-value-compiler',
      setup(build) {
        build.onResolve({ filter: /^svelte(?:\/|$)/ }, ({ path }) => ({
          path: Bun.resolveSync(
            path,
            join(here, '../crafting-workbench/svelte'),
          ),
        }));
        build.onLoad({ filter: /./ }, ({ path }) => {
          inputs.add(path);
          if (/packages\/tgui\/(?:backend|assets|index|layouts)/.test(path)) {
            throw Error(`Native boundary import forbidden: ${path}`);
          }
        });
        build.onLoad({ filter: /\.html$/ }, async ({ path }) => ({
          contents: await Bun.file(path).text(),
          loader: 'text',
        }));
        build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
          const result = compile(await Bun.file(path).text(), {
            filename: path,
            generate: 'client',
            dev: false,
            css: 'external',
            runes: true,
          });
          if (result.warnings.length || result.css?.code) {
            throw Error(JSON.stringify(result.warnings));
          }
          return {
            contents: result.js.code,
            loader: 'js',
            resolveDir: dirname(path),
          };
        });
      },
    },
  ];
}
