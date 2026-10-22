import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

import { here, plugins } from './build-options';
const output = join(here, 'dist');
const inputs = new Set<string>([
  join(here, 'build.ts'),
  join(here, 'build-options.ts'),
  join(here, 'README.md'),
  join(here, 'check.ts'),
  join(here, 'assets.d.ts'),
  join(here, '.gitignore'),
]);
const builds: Record<string, unknown> = {};
const hash = (data: string | Uint8Array) =>
  createHash('sha256').update(data).digest('hex');
for (const arm of ['react', 'svelte']) {
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
    plugins: plugins(inputs),
  });
  if (!result.success) throw Error(result.logs.map(String).join('\n'));
  builds[arm] = {
    bytes: result.outputs[0].size,
    sha256: hash(new Uint8Array(await result.outputs[0].arrayBuffer())),
  };
  await writeFile(
    join(output, arm, 'index.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; font-src 'none'; img-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>Tithewood disconnected Alerts / ${arm}</title><link rel="stylesheet" href="../tokens.css"><link rel="stylesheet" href="../controls.css"><link rel="stylesheet" href="../alert.css"><script defer src="app.js"></script></head><body><div id="controls" class="TithewoodSurface PreviewControls" aria-label="Disconnected preview controls"></div><div id="root"></div></body></html>`,
  );
}
for (const [source, name] of [
  ['../ui-shared/tokens.css', 'tokens.css'],
  ['../ui-shared/controls.css', 'controls.css'],
  ['alert.css', 'alert.css'],
]) {
  const path = join(here, source);
  const css = await readFile(path, 'utf8');
  if (/@font-face|url\(/i.test(css)) {
    throw Error(`External assets forbidden: ${path}`);
  }
  inputs.add(path);
  await writeFile(join(output, name), css);
}
await copyFile(join(here, '../../../LICENSE'), join(output, 'LICENSE.txt'));
const licenses = new Map<
  string,
  { name: string; version: string; license: unknown; files: string[] }
>();
for (const input of inputs) {
  let folder = dirname(input);
  while (folder.includes('/tgui')) {
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
          licenses.set(key, {
            name: pkg.name,
            version: pkg.version,
            license: pkg.license,
            files,
          });
        }
        break;
      }
    } catch {}
    folder = dirname(folder);
  }
}
const sources = await Promise.all(
  [...inputs].sort().map(async (path) => ({
    path: relative(join(here, '../../..'), path),
    sha256: hash(await readFile(path)),
  })),
);
await writeFile(
  join(output, 'manifest.json'),
  JSON.stringify(
    {
      builds,
      provenance: await Promise.all(
        [
          'packages/tgui/interfaces/AlertModal.tsx',
          'packages/tgui/interfaces/common/Loader.tsx',
          '../code/modules/tgui_input/alert.dm',
        ].map(async (path) => ({
          path,
          sha256: hash(await readFile(join(here, '../..', path))),
        })),
      ),
      sources,
      dependencies: [...licenses.values()],
      constraints:
        'Build-only disconnected sample. No performance measurement. No native transport.',
    },
    null,
    2,
  ),
);
await writeFile(
  join(output, 'NOTICE.txt'),
  'Tithewood Alert prompt disconnected candidate. Derived from Ratwood AlertModal sources and governed by repository licensing. Repository AGPL v3 text is preserved in LICENSE.txt. See manifest.json for exact source hashes and dependency license inventory, licenses/ for copied dependency licenses. No fonts or images. Before any distribution or hosted preview, supply the exact corresponding repository source (including these files, original AlertModal/DM sources and original notices), dependency lockfiles, local build instructions, and required license texts. This build does not publish anything and is not a complete legal distribution package.\n',
);
await writeFile(
  join(output, 'index.html'),
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;; script-src &apos;self&apos;; style-src &apos;self&apos;; connect-src &apos;none&apos;; font-src &apos;none&apos;; img-src &apos;none&apos;; worker-src &apos;none&apos;; object-src &apos;none&apos;; base-uri &apos;none&apos;; form-action &apos;none&apos;"><title>Tithewood Alert candidates</title><h1>Disconnected Alerts / archive</h1><p><a href="react/">React</a> | <a href="svelte/">Svelte</a></p><p>Identical sample data, shared candidate controller/CSS; no game connection or performance claim.</p><a href="NOTICE.txt">Source and license requirement</a></html>',
);
console.log(JSON.stringify(builds));
