import { dirname } from 'node:path';

import type { BunPlugin } from 'bun';
import { compile } from 'svelte/compiler';

/** Compile normal production client components, with no SSR or injected styles. */
export function sveltePlugin(): BunPlugin {
  return {
    name: 'standalone-svelte-production-client',
    setup(build) {
      build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
        const source = await Bun.file(path).text();
        const result = compile(source, {
          filename: path,
          generate: 'client',
          dev: false,
          css: 'external',
          runes: true,
        });
        if (result.warnings.length) {
          throw new Error(
            result.warnings
              .map((warning) => `${path}: ${warning.code}: ${warning.message}`)
              .join('\n'),
          );
        }
        if (result.css?.code)
          throw new Error(
            'Styles must remain in the exact shared external CSS.',
          );
        return {
          contents: result.js.code,
          loader: 'js',
          resolveDir: dirname(path),
        };
      });
    },
  };
}
