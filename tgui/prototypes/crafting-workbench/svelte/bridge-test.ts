import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sveltePlugin } from './compiler';

const here = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(here, '../../..');
const output = join(here, '.generated');
await mkdir(output, { recursive: true });
const result = await Bun.build({
  entrypoints: [join(here, 'bridge/checks.tsx')],
  outdir: output,
  naming: 'Bridge.test.js',
  target: 'browser',
  conditions: ['browser', 'production'],
  format: 'esm',
  minify: { syntax: true },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    // Rspack-only development-story discovery is eagerly imported by the debug
    // barrel. No story is used by Window; fail loudly if a test ever requests one.
    'import.meta.webpackContext': 'globalThis.__disconnectedWebpackContext',
  },
  external: ['bun:test'],
  plugins: [
    {
      name: 'production-tgui-aliases',
      setup(build) {
        for (const [name, path] of Object.entries({
          'tgui-core/components': 'packages/tgui/components/keyboard/index.ts',
          'tgui-core/base-components':
            'node_modules/tgui-core/dist/components/index.js',
        })) {
          build.onResolve({ filter: new RegExp(`^${name}$`) }, () => ({
            path: join(workspace, path),
          }));
        }
      },
    },
    sveltePlugin(),
  ],
});
if (!result.success) throw new Error(result.logs.map(String).join('\n'));
const child = Bun.spawn(
  [
    process.execPath,
    'test',
    join(output, 'Bridge.test.js'),
    ...process.argv.slice(2),
  ],
  { cwd: here, stdout: 'inherit', stderr: 'inherit' },
);
process.exit(await child.exited);
