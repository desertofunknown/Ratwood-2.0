import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { VERSION } from 'svelte/compiler';
import { sveltePlugin } from './compiler';

const here = dirname(fileURLToPath(import.meta.url));
const shared = resolve(here, '..');
const output = resolve(here, 'dist');
await mkdir(output, { recursive: true });
const result = await Bun.build({
  entrypoints: [join(here, 'demo.ts')],
  outdir: output,
  target: 'browser',
  conditions: ['browser', 'production'],
  format: 'iife',
  minify: true,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [sveltePlugin()],
});
if (!result.success) throw new Error(result.logs.map(String).join('\n'));
for (const style of ['workbench.css', 'demo.css']) {
  await copyFile(join(shared, style), join(output, style));
}
for (const font of ['lora-regular.ttf', 'lora-bold.ttf', 'pterra.ttf']) {
  await copyFile(
    resolve(shared, '../../../interface/fonts', font),
    join(output, font),
  );
}
await writeFile(
  join(output, 'index.html'),
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>Tithewood crafting workbench prototype</title><link rel="stylesheet" href="demo.css"><link rel="stylesheet" href="workbench.css"><script defer src="demo.js"></script></head>
<body><div id="root"></div></body></html>`,
);
const files = [
  'demo.js',
  'workbench.css',
  'demo.css',
  'lora-regular.ttf',
  'lora-bold.ttf',
  'pterra.ttf',
];
const sizes = await Promise.all(
  files.map(async (file) => {
    const bytes = await readFile(join(output, file));
    return {
      file,
      raw: bytes.byteLength,
      gzip: gzipSync(bytes, { level: 9 }).byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }),
);
const sourcePaths = [
  'Workbench.svelte',
  'Demo.svelte',
  'demo.ts',
  'compiler.ts',
  'build.ts',
  'package.json',
  'bun.lock',
  '../model.ts',
  '../fixtures.ts',
  '../browser-harness.ts',
  '../workbench.css',
  '../demo.css',
];
const sourceSha256 = Object.fromEntries(
  await Promise.all(
    sourcePaths.map(async (file) => [
      file,
      createHash('sha256')
        .update(await readFile(join(here, file)))
        .digest('hex'),
    ]),
  ),
);
const report = {
  scope:
    'Standalone production demo transfer bytes including Svelte runtime, shared fixture, adapter and opt-in browser harness. Not render, memory, FPS or in-game performance.',
  compiler: `svelte@${VERSION}`,
  bundler: `bun@${Bun.version}`,
  target: 'browser, IIFE, production, minified, external shared CSS',
  gzip: 'gzip level 9, each file separately',
  compilerOptions: {
    generate: 'client',
    dev: false,
    css: 'external',
    runes: true,
  },
  resolutionConditions: ['browser', 'production'],
  diagnostics:
    'esm-env DEV resolves to false. Bun 1.2.16 retains inactive diagnostic branches; compiler dev instrumentation is disabled.',
  sourceSha256,
  sizes,
};
await writeFile(
  join(output, 'bundle-sizes.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
console.log(
  `Built local-only Svelte comparison: ${join(output, 'index.html')}`,
);
