import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const shared = resolve(here, '..');
const output = resolve(here, 'dist');
await mkdir(output, { recursive: true });
// Remove only known obsolete generated font copies, never the game assets.
for (const font of ['lora-regular.ttf', 'lora-bold.ttf', 'pterra.ttf']) {
  await rm(join(output, font), { force: true });
}
const result = await Bun.build({
  entrypoints: [join(here, 'demo.ts')],
  outdir: output,
  target: 'browser',
  conditions: ['browser', 'production'],
  format: 'iife',
  minify: true,
  // Fengari's official browser build eliminates its Node paths this way.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env.FENGARICONF': 'undefined',
    process: 'undefined',
  },
  loader: { '.lua': 'text' },
});
if (!result.success) throw new Error(result.logs.map(String).join('\n'));
for (const style of ['workbench.css', 'demo.css']) {
  await copyFile(join(shared, style), join(output, style));
}
await writeFile(
  join(output, 'index.html'),
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>Tithewood crafting workbench prototype</title><link rel="stylesheet" href="demo.css"><link rel="stylesheet" href="workbench.css"><script defer src="demo.js"></script></head>
<body><div id="root"></div></body></html>`,
);
const noticePackages = ['fengari', 'fengari-interop', 'sprintf-js'];
await writeFile(
  join(output, 'THIRD-PARTY-NOTICES.txt'),
  (
    await Promise.all(
      noticePackages.map(
        async (name) =>
          `${name}\n${'='.repeat(name.length)}\n${await readFile(join(here, 'node_modules', name, 'LICENSE'), 'utf8')}`,
      ),
    )
  ).join('\n\n'),
);
await copyFile(
  resolve(shared, '../../../LICENSE'),
  join(output, 'PROJECT-LICENSE.txt'),
);
await copyFile(
  resolve(shared, '../../../README.md'),
  join(output, 'PROJECT-README.md'),
);
await copyFile(join(here, 'README.md'), join(output, 'IMPLEMENTATION.md'));
const files = ['demo.js', 'workbench.css', 'demo.css'];
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
  'workbench.lua',
  'adapter.ts',
  'demo.ts',
  'build.ts',
  'package.json',
  'bun.lock',
  'README.md',
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
    'Standalone production demo transfer bytes including Fengari VM, interop, Lua source, shared fixture, adapter and opt-in browser harness. Not render, memory, FPS or in-game performance.',
  runtime: 'fengari@0.1.5 + fengari-interop@0.1.4 (Lua 5.3, not LuaJIT)',
  bundler: `bun@${Bun.version}`,
  target: 'browser, IIFE, production, minified JS, external shared CSS',
  luaSource:
    'Bundled as text, parsed by Fengari at mount; no precompiled bytecode.',
  gzip: 'gzip level 9, each file separately',
  resolutionConditions: ['browser', 'production'],
  sourceSha256,
  sizes,
};
await writeFile(
  join(output, 'bundle-sizes.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
console.log(`Built local-only Lua comparison: ${join(output, 'index.html')}`);
