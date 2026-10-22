import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, statfs, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileAsync } from 'sass-embedded';

import { createDemoData } from '../fixtures';
import { definitions, here, plugins, repository } from './build-options';

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
const inputs = new Set<string>();
const builds: Record<string, unknown> = {};
for (const arm of ['react', 'svelte']) {
  const directory = join(output, arm);
  await mkdir(directory, { recursive: true });
  const result = await Bun.build({
    entrypoints: [join(here, `${arm}-entry.ts`)],
    outdir: directory,
    naming: 'app.js',
    target: 'browser',
    conditions: ['browser', 'production'],
    format: 'iife',
    minify: true,
    define: definitions,
    plugins: plugins(inputs),
  });
  if (!result.success) throw new Error(result.logs.map(String).join('\n'));
  builds[arm] = {
    javascriptBytes: result.outputs[0].size,
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
<title>Tithewood disconnected ${arm} integration fixture</title>
<link rel="stylesheet" href="../shell.css"><link rel="stylesheet" href="../workbench.css"><script defer src="app.js"></script></head>
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
const workbench = await readFile(join(here, '../workbench.css'));
assert(
  !/@font-face|url\(/i.test(workbench.toString()),
  'Workbench must remain asset-free.',
);
inputs.add(join(here, '../workbench.css'));
await writeFile(join(output, 'shell.css'), css.css);
await writeFile(join(output, 'workbench.css'), workbench);
await writeFile(
  join(output, 'sample-data.json'),
  JSON.stringify(createDemoData(), null, 2) + '\n',
);
await writeFile(
  join(output, 'index.html'),
  '<!doctype html><html lang="en"><meta charset="utf-8"><title>Disconnected integration fixtures</title><h1>Tithewood sample-only integration fixtures</h1><p><a href="react/">React control</a> | <a href="svelte/">React-owned Svelte</a></p><p>No game connection. No startup, CPU or heap claims.</p><p><a href="NOTICE.txt">License/source inventory</a> | <a href="sample-data.json">Exact sample data</a> | <a href="manifest.json">Build hashes</a></p></html>\n',
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
let notice = `Tithewood disconnected browser integration fixture\n\nSample-only artifact. No warranties. No font/image files are redistributed.\nThe actual production reset, Layout, TitleBar and Window rules are compiled\nunchanged, with matched fixture-only colors/system fonts and a CSS close glyph.\nNo production main theme, icon font, image, route, helpers.js or native transport.\n\nSource inventory: source-inventory.json lists all resolved build inputs and hashes,\nincluding conservatively visited but tree-shaken modules. Repository-relative\npaths only. Exact sample payload: sample-data.json. Build hashes: manifest.json.\nPublic project repository: https://github.com/desertofunknown/Ratwood-2.0\nA repository link alone does not cover uncommitted fixture changes. Before\npublic distribution, the publisher must provide the matching reviewed source\nat an immutable public commit or source archive, with applicable notices.\nNo source release or hosting is performed by this build.\n\nRepository license (unless a source header says otherwise):\n\n${await readFile(join(repository, 'LICENSE'), 'utf8')}\n\nProduction tgui MIT-header sources: Copyright (c) 2020 Aleksej Komarov.\nApplicable MIT terms are reproduced in the dependency notices below.\n`;
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
  fixture: 'disconnected-browser-integration',
  bun: Bun.version,
  mode: 'production',
  note: 'Build-only transfer metadata; not a browser performance result.',
  arms: builds,
  sharedCss: { shell: digest(css.css), workbench: digest(workbench) },
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
      'workbench.css',
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
