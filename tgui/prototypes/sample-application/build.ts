import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, statfs, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { compileAsync } from 'sass-embedded';

import {
  olderSample,
  sample as archiveSample,
} from '../changes-archive/sample';
import { createDemoData } from '../crafting-workbench/fixtures';
import { createSampleData } from '../display-readability/fixtures';
import { MARKET_SAMPLES } from '../market-quote/fixtures';
import { sampleEntries } from '../treasury-ledger/fixtures';
import { archiveScreenCss } from './archive-styles';
import { auditOwnedEndpointBundle } from './audit-bundle';
import {
  banner,
  definitions,
  here,
  plugins,
  repository,
} from './build-options';

// BUILD ONLY. Never imports or evaluates emitted browser bundles, serves files,
// opens a network listener, launches a browser, or modifies production outputs.
const output = join(here, 'dist');
const disk = await statfs(here);
assert(
  disk.bavail * disk.bsize > 10 * 1024 ** 3,
  'More than 10 GiB free is required.',
);
await mkdir(output, { recursive: true });
const digest = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');
const inputs = new Set<string>(
  [
    'endpoint-binding.ts',
    'build-options.ts',
    'build.ts',
    'archive-styles.ts',
  ].map((path) => join(here, path)),
);
const builds: Record<string, unknown> = {};
for (const arm of ['react', 'svelte']) {
  const directory = join(output, arm);
  await mkdir(directory, { recursive: true });
  const result = await Bun.build({
    entrypoints: [join(here, `${arm}-entry.tsx`)],
    outdir: directory,
    naming: 'app.js',
    target: 'browser',
    conditions: ['browser', 'production'],
    format: 'iife',
    minify: true,
    define: definitions,
    banner,
    plugins: plugins(inputs),
  });
  if (!result.success) throw new Error(result.logs.map(String).join('\n'));
  const endpointAudit = auditOwnedEndpointBundle(
    await result.outputs[0].text(),
  );
  builds[arm] = {
    endpointAudit,
    javascriptBytes: result.outputs[0].size,
    gzipBytes: gzipSync(await result.outputs[0].arrayBuffer()).byteLength,
    sha256: digest(
      await result.outputs[0]
        .arrayBuffer()
        .then((bytes) => new Uint8Array(bytes)),
    ),
  };
  await writeFile(
    join(directory, 'index.html'),
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; font-src 'none'; img-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>Tithewood disconnected ${arm} sample application</title>
<link rel="stylesheet" href="../screens.css"><link rel="stylesheet" href="../shell.css"><script defer src="app.js"></script></head>
<body><div id="fixture-root"></div><aside id="fixture-controls" aria-label="Disconnected fixture controls"></aside></body></html>\n`,
  );
}
const css = await compileAsync(join(here, 'shell.scss'), {
  style: 'compressed',
});
for (const url of css.loadedUrls) {
  if (url.protocol === 'file:') inputs.add(fileURLToPath(url));
}
assert(
  !/@font-face|url\(/i.test(css.css),
  'No font/image assets may be emitted.',
);
const screenPaths = [
  '../ui-shared/tokens.css',
  '../ui-shared/controls.css',
  '../crafting-workbench/workbench.css',
  '../treasury-ledger/ledger.css',
  '../market-quote/market.css',
  '../display-readability/settings.css',
  '../changes-archive/archive.css',
];
const screenCss = (
  await Promise.all(
    screenPaths.map(async (path) => {
      const file = join(here, path);
      inputs.add(file);
      const source = await readFile(file, 'utf8');
      return path === '../changes-archive/archive.css'
        ? archiveScreenCss(source)
        : source;
    }),
  )
).join('\n');
assert(!/@font-face|url\(/i.test(screenCss), 'Screens must remain asset-free.');
await writeFile(join(output, 'shell.css'), css.css);
await writeFile(join(output, 'screens.css'), screenCss);
await writeFile(
  join(output, 'sample-data.json'),
  JSON.stringify(
    {
      workbench: createDemoData(),
      ledger: sampleEntries,
      readability: createSampleData(),
      market: MARKET_SAMPLES,
      archive: { '2026-10': archiveSample, '2026-09': olderSample },
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  join(output, 'index.html'),
  '<!doctype html><html lang="en"><meta charset="utf-8"><title>Disconnected shared application</title><h1>Tithewood sample-only shared application</h1><p><a href="react/">React control</a> | <a href="svelte/">React-owned Svelte</a></p><p>No game connection. No startup, CPU or heap claims.</p><p><a href="NOTICE.txt">License/source inventory</a> | <a href="sample-data.json">Exact sample data</a> | <a href="manifest.json">Build hashes</a></p></html>\n',
);

// Inventory every resolved source, including eagerly visited/tree-shaken files.
// This conservative inventory is not a claim that every file is shipped code.
const licenses = new Map<
  string,
  { name: string; version?: string; license?: string; files: string[] }
>();
for (const path of [...inputs].sort()) {
  if (!path.includes('/node_modules/')) continue;
  let directory = dirname(path);
  while (directory !== repository && directory !== '/') {
    try {
      const pkg = JSON.parse(
        await readFile(join(directory, 'package.json'), 'utf8'),
      );
      const files = (await readdir(directory)).filter((name) =>
        /^(?:licen[cs]e|copying|notice)(?:\.|$)/i.test(name),
      );
      licenses.set(directory, {
        name: pkg.name,
        version: pkg.version,
        license: pkg.license,
        files,
      });
      break;
    } catch {
      directory = dirname(directory);
    }
  }
}
let notice = `Tithewood disconnected shared application\n\nSample-only artifact. No warranties. No font/image files are redistributed.\nThe actual production reset, Layout, TitleBar and Window rules are compiled\nunchanged, with matched fixture-only colors/system fonts and a CSS close glyph.\nNo production main theme, icon font, image, route, helpers.js or native transport.\n\nSource inventory: source-inventory.json lists all resolved build inputs and hashes,\nincluding conservatively visited but tree-shaken modules. Repository-relative\npaths only. Exact sample payload: sample-data.json. Build hashes: manifest.json.\nPublic project repository: https://github.com/desertofunknown/Ratwood-2.0\nA repository link alone does not cover uncommitted fixture changes. Before\npublic distribution, the publisher must provide the matching reviewed source\nat an immutable public commit or source archive, with applicable notices.\nNo source release or hosting is performed by this build.\n\nRepository license (unless a source header says otherwise):\n\n${await readFile(join(repository, 'LICENSE'), 'utf8')}\n\nProduction tgui MIT-header sources: Copyright (c) 2020 Aleksej Komarov.\nApplicable MIT terms are reproduced in the dependency notices below.\n`;
for (const [directory, pkg] of [...licenses].sort((a, b) =>
  a[1].name.localeCompare(b[1].name),
)) {
  notice += `\n\nDEPENDENCY ${pkg.name} ${pkg.version ?? ''} (${pkg.license ?? 'see source headers'})\n`;
  assert(
    pkg.files.length > 0,
    `No license notice found for ${pkg.name}; review before publishing.`,
  );
  for (const file of pkg.files) {
    notice += `\n${file}:\n${await readFile(join(directory, file), 'utf8')}\n`;
  }
}
await writeFile(join(output, 'NOTICE.txt'), notice);
const sourceInventory = await Promise.all(
  [...inputs].sort().map(async (path) => {
    assert(
      path.startsWith(repository + '/'),
      'Unexpected external source; review inventory boundary.',
    );
    return {
      path: relative(repository, path),
      sha256: digest(await readFile(path)),
    };
  }),
);
await writeFile(
  join(output, 'source-inventory.json'),
  JSON.stringify(sourceInventory, null, 2) + '\n',
);
const manifest = {
  fixture: 'disconnected-shared-application',
  bun: Bun.version,
  mode: 'production',
  note: 'Build-only transfer metadata; not a browser performance result.',
  arms: builds,
  sharedCss: {
    shell: {
      sha256: digest(css.css),
      bytes: Buffer.byteLength(css.css),
      gzipBytes: gzipSync(css.css).byteLength,
    },
    screens: {
      sha256: digest(screenCss),
      bytes: Buffer.byteLength(screenCss),
      gzipBytes: gzipSync(screenCss).byteLength,
    },
  },
  sampleDataFileSha256: digest(
    await readFile(join(output, 'sample-data.json')),
  ),
  files: await Promise.all(
    [
      'index.html',
      'react/index.html',
      'react/app.js',
      'svelte/index.html',
      'svelte/app.js',
      'shell.css',
      'screens.css',
      'sample-data.json',
      'NOTICE.txt',
      'source-inventory.json',
    ].map(async (file) => ({
      path: file,
      sha256: digest(await readFile(join(output, file))),
    })),
  ),
  resolvedSourceCount: inputs.size,
  dependencies: [...licenses.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  ),
};
await writeFile(
  join(output, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(JSON.stringify(manifest, null, 2));
