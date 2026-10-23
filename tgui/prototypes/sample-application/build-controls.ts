// Build-only workbench controls with the same compiler, owned endpoint binding,
// production module aliases and minifier as the four-screen application.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { banner, definitions, here, plugins } from './build-options';
import { auditOwnedEndpointBundle } from './audit-bundle';

const disk = await statfs(here);
assert(
  disk.bavail * disk.bsize > 10 * 1024 ** 3,
  'More than 10 GiB free required.',
);
const output = join(here, '.control-dist');
const controls: Record<string, unknown> = {};
for (const arm of ['react', 'svelte']) {
  const outdir = join(output, arm);
  await mkdir(outdir, { recursive: true });
  const inputs = new Set<string>();
  const result = await Bun.build({
    entrypoints: [
      join(here, `../crafting-workbench/browser-integration/${arm}-entry.ts`),
    ],
    outdir,
    naming: 'app.js',
    target: 'browser',
    conditions: ['browser', 'production'],
    format: 'iife',
    minify: true,
    banner,
    define: definitions,
    plugins: [
      {
        name: 'matched-control-owned-endpoint',
        setup(build) {
          build.onResolve({ filter: /^\.\/bootstrap$/ }, ({ importer }) => {
            if (importer.includes('/crafting-workbench/browser-integration/')) {
              return { path: join(here, 'bootstrap.ts') };
            }
          });
        },
      },
      ...plugins(inputs),
    ],
  });
  if (!result.success) throw Error(result.logs.map(String).join('\n'));
  auditOwnedEndpointBundle(await result.outputs[0].text());
  const bytes = new Uint8Array(await result.outputs[0].arrayBuffer());
  controls[arm] = {
    javascriptBytes: bytes.byteLength,
    gzipBytes: gzipSync(bytes).byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    resolvedSourceCount: inputs.size,
  };
}
await writeFile(
  join(output, 'manifest.json'),
  JSON.stringify(
    {
      note: 'Build-only controls. Existing workbench UI/host with this application’s owned endpoint bootstrap. Not a new browser or native performance result.',
      bun: Bun.version,
      controls,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify(controls, null, 2));
