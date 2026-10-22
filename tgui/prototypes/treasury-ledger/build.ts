import { createHash } from 'node:crypto';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

import { plugins } from '../changes-archive/build-options';

const here = import.meta.dir;
const repository = join(here, '../../..');
const output = join(here, 'dist');
const inputs = new Set<string>();
const builds: Record<
  string,
  { bytes: number; sha256: string; inputs: string[] }
> = {};
const hash = (data: string | Uint8Array) =>
  createHash('sha256').update(data).digest('hex');
export const csp =
  "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; font-src 'none'; img-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

for (const arm of ['react', 'svelte']) {
  const armInputs = new Set<string>();
  await mkdir(join(output, arm), { recursive: true });
  const result = await Bun.build({
    entrypoints: [join(here, `${arm}-entry.${arm === 'react' ? 'tsx' : 'ts'}`)],
    outdir: join(output, arm),
    naming: 'app.js',
    target: 'browser',
    conditions: ['browser', 'production'],
    format: 'iife',
    minify: true,
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    plugins: plugins(armInputs),
  });
  if (!result.success) throw Error(result.logs.map(String).join('\n'));
  if (result.outputs.length !== 1 || result.outputs[0].kind !== 'entry-point') {
    throw Error(
      'Expected one script and no generated inline/component styles.',
    );
  }
  for (const path of armInputs) {
    if (/\/packages\/tgui\//.test(path)) {
      throw Error(`Production runtime source forbidden in preview: ${path}`);
    }
    inputs.add(path);
  }
  builds[arm] = {
    bytes: result.outputs[0].size,
    sha256: hash(new Uint8Array(await result.outputs[0].arrayBuffer())),
    inputs: [...armInputs].sort().map((path) => relative(repository, path)),
  };
  await writeFile(
    join(output, arm, 'index.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Tithewood disconnected Treasury Ledger / ${arm}</title><link rel="stylesheet" href="../tokens.css"><link rel="stylesheet" href="../controls.css"><link rel="stylesheet" href="../ledger.css"><link rel="stylesheet" href="../preview.css"><script defer src="app.js"></script></head><body class="TithewoodSurface TreasuryPreview"><header id="controls" class="TreasuryPreview__controls" aria-label="Disconnected sample controls"></header><main id="root"></main><footer class="TreasuryPreview__footer">Derived from Ratwood StewardTrade; original economy port from Azure-Peak. <a href="../NOTICE.txt">Source and license notice</a> · <a href="../LICENSE.txt">Repository license</a></footer></body></html>`,
  );
}

for (const [source, name] of [
  ['../ui-shared/tokens.css', 'tokens.css'],
  ['../ui-shared/controls.css', 'controls.css'],
  ['ledger.css', 'ledger.css'],
  ['preview.css', 'preview.css'],
]) {
  const path = join(here, source);
  const css = await readFile(path, 'utf8');
  if (/@font-face|url\(/i.test(css))
    throw Error(`External assets forbidden: ${path}`);
  inputs.add(path);
  await writeFile(join(output, name), css);
}

// Inventory source and build prerequisites, not only the tree-shaken runtime.
for (const item of await readdir(here, { withFileTypes: true })) {
  if (item.isFile()) inputs.add(join(here, item.name));
}
const provenance = [
  'LICENSE',
  'tgui/package.json',
  'tgui/bun.lock',
  'tgui/prototypes/changes-archive/build-options.ts',
  'tgui/prototypes/crafting-workbench/svelte/package.json',
  'tgui/prototypes/crafting-workbench/svelte/bun.lock',
  'tgui/packages/tgui/interfaces/StewardTrade/LedgerView.tsx',
  'tgui/packages/tgui/interfaces/StewardTrade/types.ts',
  'tgui/packages/tgui/interfaces/StewardTrade.tsx',
  'code/modules/roguetown/roguemachine/steward/steward_trade_tgui.dm',
];
for (const source of provenance) inputs.add(join(repository, source));
inputs.add(
  join(
    here,
    '../crafting-workbench/svelte/node_modules/svelte/compiler/index.js',
  ),
);

const licenses = new Map<
  string,
  {
    name: string;
    version: string;
    license: unknown;
    files: string[];
  }
>();
for (const input of inputs) {
  let folder = dirname(input);
  while (folder.startsWith(repository)) {
    try {
      const pkg = JSON.parse(
        await readFile(join(folder, 'package.json'), 'utf8'),
      );
      if (pkg.name && pkg.license) {
        const key = `${pkg.name}@${pkg.version}`;
        if (!licenses.has(key)) {
          const files: string[] = [];
          for (const file of [
            'LICENSE',
            'LICENSE.md',
            'LICENSE.txt',
            'license',
            'license.md',
            'license.txt',
            'COPYING',
          ]) {
            try {
              await access(join(folder, file));
              const name = `${pkg.name.replaceAll('/', '_')}-${file}`;
              await mkdir(join(output, 'licenses'), { recursive: true });
              await copyFile(
                join(folder, file),
                join(output, 'licenses', name),
              );
              files.push(`licenses/${name}`);
            } catch {}
          }
          if (!files.length)
            throw Error(`Missing dependency license file: ${key}`);
          licenses.set(key, {
            name: pkg.name,
            version: pkg.version,
            license: pkg.license,
            files,
          });
        }
        break;
      }
    } catch (error) {
      if (String(error).includes('Missing dependency license')) throw error;
    }
    if (folder === repository) break;
    folder = dirname(folder);
  }
}
await copyFile(join(repository, 'LICENSE'), join(output, 'LICENSE.txt'));
const sources = await Promise.all(
  [...inputs].sort().map(async (path) => ({
    path: relative(repository, path),
    sha256: hash(await readFile(path)),
  })),
);
await writeFile(
  join(output, 'manifest.json'),
  JSON.stringify(
    {
      builds,
      sources,
      provenance,
      dependencies: [...licenses.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      tools: { bun: Bun.version, svelte: '5.57.2' },
      constraints:
        'Build-only, disconnected synthetic records. No native transport, runtime server, deployment, geometry or performance claim.',
    },
    null,
    2,
  ),
);
await writeFile(
  join(output, 'NOTICE.txt'),
  'Tithewood Treasury Ledger disconnected candidates. Derived from Ratwood StewardTrade/LedgerView.tsx, its tab lifecycle, types and steward_trade_tgui.dm. The original StewardTrade economy backend identifies its origin as Azure-Peak PR #7000. Repository-derived source is governed by the repository GNU Affero General Public License v3; see LICENSE.txt and the original repository notices. React, ReactDOM, Svelte and other resolved dependencies retain their own licenses; manifest.json records exact source hashes and dependency inventory, and licenses/ contains their license texts. No fonts, images, real account balances, dates or permissions are included. Before any hosted preview or distribution, provide the exact corresponding public repository source checkpoint, these new source files, unchanged shared CSS/compiler helper, dependency manifests/lockfiles, build instructions and required original notices. This local output does not publish anything and is not by itself a complete legal distribution package.\n',
);
await writeFile(
  join(output, 'index.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Tithewood Treasury Ledger candidates</title><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="preview.css"></head><body class="TithewoodSurface TreasuryPreview"><main class="TreasuryPreview__controls"><h1>Disconnected Treasury Ledger</h1><p>Sample-only synthetic records, not a game connection.</p><p><a href="react/">React candidate</a> · <a href="svelte/">Svelte candidate</a></p><p>Identical input, controller and external CSS. No native geometry or performance claim.</p><a href="NOTICE.txt">Source and license requirement</a></main></body></html>`,
);
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(builds).map(([arm, { bytes, sha256 }]) => [
        arm,
        { bytes, sha256 },
      ]),
    ),
  ),
);
