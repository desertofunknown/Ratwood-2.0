import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { BunPlugin } from 'bun';
import { SOURCE_SHA256, transformSource } from './candidate-overlay';

export const here = import.meta.dir;
export const repository = join(here, '../../..');
const tgui = join(repository, 'tgui');
export const HOST_BOUNDARY_SHA256: Record<string, string> = {
  'tgui/packages/tgui/components/keyboard/index.ts':
    '94e22576e444327ad4688e96e6116b95f0f3e0a0fa6988e61f937559faeb0fdb',
  'tgui/node_modules/tgui-core/dist/components/index.js':
    '51d0b4ece51f36635cf661a3d9b84267c6a9ba4a2af3660c2002c4901231e6e7',
  'tgui/node_modules/tgui-core/dist/components/ByondUi.js':
    'd80cb1b91c296c85c2c5c36f7c59b15fb065232b7589069ddf4a38f8cf3f1dda',
  'tgui/node_modules/tgui-core/dist/components/Tooltip.js':
    'ab1e5555d5261171e576a28ac6189c6c98ca9cec49eecfe7a7e374d639f6d3b3',
};
export function plugins(
  variant: 'baseline' | 'candidate',
  inputs = new Set<string>(),
): BunPlugin[] {
  for (const [path, expected] of Object.entries(HOST_BOUNDARY_SHA256)) {
    const actual = createHash('sha256')
      .update(readFileSync(join(repository, path)))
      .digest('hex');
    if (actual !== expected)
      throw Error(`Disconnected host source drift: ${path}`);
  }
  return [
    {
      name: 'actual-chat-renderer-disconnected-preview',
      setup(build) {
        // Chat's only runtime core-component import is Tooltip. Resolve that
        // exact original export directly, avoiding unrelated ByondUi barrel
        // side effects. Both arms retain real Tooltip/Floating/DOMPurify code.
        build.onResolve({ filter: /^tgui-core\/components$/ }, () => ({
          path: join(tgui, 'node_modules/tgui-core/dist/components/Tooltip.js'),
        }));
        build.onResolve(
          { filter: /^(tgui|tgui-panel|tgui-dev-server)\// },
          ({ path }) => ({
            path: Bun.resolveSync(join(tgui, 'packages', path), tgui),
          }),
        );
        build.onLoad({ filter: /./ }, async ({ path }) => {
          inputs.add(path);
          const rel = relative(repository, path).replaceAll('\\', '/');
          if (
            /packages\/(?:tgui|tgui-panel)\/(?:backend|assets|index\.|store|storage|byond|native)/.test(
              rel,
            )
          ) {
            throw Error(`Native boundary import forbidden: ${rel}`);
          }
          if (Object.hasOwn(SOURCE_SHA256, rel))
            return {
              contents: transformSource(
                rel,
                await Bun.file(path).text(),
                variant,
              ),
              loader: path.endsWith('.jsx') ? 'jsx' : 'js',
              resolveDir: dirname(path),
            };
        });
      },
    },
  ];
}
