import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, 'dist');
await mkdir(output, { recursive: true });
const result = await Bun.build({
  entrypoints: [join(here, 'demo.tsx')],
  outdir: output,
  target: 'browser',
  conditions: ['browser', 'production'],
  format: 'iife',
  minify: true,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
});
if (!result.success) {
  throw new Error(result.logs.map(String).join('\n'));
}
await copyFile(join(here, 'workbench.css'), join(output, 'workbench.css'));
// Remove obsolete copies from earlier demo builds; game assets are untouched.
for (const font of ['lora-regular.ttf', 'lora-bold.ttf', 'pterra.ttf']) {
  await rm(join(output, font), { force: true });
}
await copyFile(join(here, 'demo.css'), join(output, 'demo.css'));
await writeFile(
  join(output, 'index.html'),
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>Tithewood crafting workbench prototype</title><link rel="stylesheet" href="demo.css"><link rel="stylesheet" href="workbench.css"><script defer src="demo.js"></script></head>
<body><div id="root"></div></body></html>`,
);
console.log(`Built local-only prototype: ${join(output, 'index.html')}`);
for (const file of result.outputs) {
  console.log(`${file.path}: ${file.size} bytes`);
}
