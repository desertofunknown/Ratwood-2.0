import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import {
  here,
  plugins,
  repository,
  HOST_BOUNDARY_SHA256,
} from './build-options';
import { SOURCE_SHA256 } from './candidate-overlay';
const output = join(here, 'dist');
const hash = (data: string | Uint8Array) =>
  createHash('sha256').update(data).digest('hex');
export const csp =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const inputs = new Set<string>();
const builds: Record<string, any> = {};
const document = (title: string, content: string, arm = false) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>${title}</title><link rel="stylesheet" href="${arm ? '../' : ''}preview.css">${arm ? '<script defer src="app.js"></script>' : ''}</head><body>${content}</body></html>`;
for (const variant of ['baseline', 'candidate'] as const) {
  const armInputs = new Set<string>();
  await mkdir(join(output, variant), { recursive: true });
  const result = await Bun.build({
    entrypoints: [join(here, 'preview-entry.ts')],
    outdir: join(output, variant),
    naming: 'app.js',
    target: 'browser',
    format: 'iife',
    minify: true,
    conditions: ['browser', 'production'],
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      PREVIEW_VARIANT: JSON.stringify(variant),
    },
    plugins: plugins(variant, armInputs),
  });
  if (!result.success) throw Error(result.logs.map(String).join('\n'));
  if (result.outputs.length !== 1) throw Error('Expected single JS bundle');
  const bytes = new Uint8Array(await result.outputs[0].arrayBuffer());
  if (
    /new WebSocket|127\.0\.0\.1:3000|Byond\.subscribe|Byond\.winset|localStorage|sessionStorage|indexedDB/.test(
      new TextDecoder().decode(bytes),
    )
  )
    throw Error('Connected runtime residue');
  for (const path of armInputs) inputs.add(path);
  for (const required of Object.keys(SOURCE_SHA256))
    if (!armInputs.has(join(repository, required)))
      throw Error(`Missing actual source: ${required}`);
  builds[variant] = {
    bytes: bytes.length,
    sha256: hash(bytes),
    inputs: [...armInputs].sort().map((path) => relative(repository, path)),
  };
  await writeFile(
    join(output, variant, 'index.html'),
    document(
      `Chat highlights / ${variant}`,
      `<h1>Chat highlights: ${variant}</h1><p>Disconnected synthetic fixtures through the actual production chat renderer. <a href="../${variant === 'baseline' ? 'candidate' : 'baseline'}/">Other arm</a> · <a href="../">Overview</a></p><p class="notice">No game connection, real player data, storage or native helpers. Timings are synchronous mounted renderer work, not paint, FPS, CPU time or game latency.</p><div class="controls"><label>Measured samples<input id="samples" type="number" min="1" max="100" value="7"></label><label>Warmups<input id="warmups" type="number" min="0" max="20" value="2"></label><button id="correctness">Run correctness</button><button id="benchmark">Run benchmark</button></div><p id="status" role="status" aria-live="polite">Loading actual renderer…</p><div id="viewport" aria-label="Mounted synthetic chat"></div><h2>Raw JSON results</h2><pre id="output">No run yet.</pre><p class="notice">Copy both JSON results. Alternate arm order and keep conditions equal. All raw samples and warmups retained. <a href="../README.txt">Method and limitations</a> · <a href="../NOTICE.txt">Source and license requirements</a> · <a href="../manifest.json">Provenance</a></p>`,
      true,
    ),
  );
}
for (const [src, dest] of [
  ['preview.css', 'preview.css'],
  ['README.md', 'README.txt'],
  ['NOTICE.txt', 'NOTICE.txt'],
])
  await copyFile(join(here, src), join(output, dest));
await copyFile(join(repository, 'LICENSE'), join(output, 'LICENSE.txt'));
async function inventory(folder: string) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (['dist', 'node_modules'].includes(entry.name)) continue;
    const path = join(folder, entry.name);
    if (entry.isDirectory()) await inventory(path);
    else inputs.add(path);
  }
}
await inventory(here);
for (const path of Object.keys(HOST_BOUNDARY_SHA256))
  inputs.add(join(repository, path));
for (const path of [
  'LICENSE',
  'tgui/package.json',
  'tgui/bun.lock',
  'tgui/rspack.config.ts',
  'tgui/tsconfig.json',
]) {
  try {
    await readFile(join(repository, path));
    inputs.add(join(repository, path));
  } catch {
    if (!path.includes('rspack')) throw Error(`Missing ${path}`);
  }
}
const dependencies = new Map<string, unknown>();
for (const input of inputs) {
  let folder = dirname(input);
  while (folder.startsWith(repository)) {
    let pkg: any;
    try {
      pkg = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
    } catch {}
    if (pkg?.name && pkg?.license) {
      const key = `${pkg.name}@${pkg.version}`;
      if (!dependencies.has(key)) {
        const files: string[] = [];
        for (const name of [
          'LICENSE',
          'LICENSE.md',
          'LICENSE.txt',
          'license',
          'license.md',
          'license.txt',
          'COPYING',
        ]) {
          try {
            const content = await readFile(join(folder, name));
            const dest = `licenses/${pkg.name.replaceAll('/', '_')}-${name}`;
            await mkdir(join(output, 'licenses'), { recursive: true });
            await writeFile(join(output, dest), content);
            files.push(dest);
          } catch {}
        }
        if (!files.length) throw Error(`Missing dependency license: ${key}`);
        dependencies.set(key, {
          name: pkg.name,
          version: pkg.version,
          license: pkg.license,
          files,
        });
      }
      break;
    }
    if (folder === repository) break;
    folder = dirname(folder);
  }
}
await writeFile(
  join(output, 'manifest.json'),
  JSON.stringify(
    {
      builds,
      repositoryCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repository,
        encoding: 'utf8',
      }).trim(),
      disconnectedHostBoundary: {
        description:
          'Core component barrel resolves to its unchanged Tooltip export only, excluding unrelated ByondUi native lifecycle side effects identically in both arms.',
        sources: HOST_BOUNDARY_SHA256,
      },
      pinnedProductionSources: SOURCE_SHA256,
      sources: await Promise.all(
        [...inputs].sort().map(async (path) => ({
          path: relative(repository, path),
          sha256: hash(await readFile(path)),
        })),
      ),
      dependencies: [...dependencies.values()],
      tools: { bun: Bun.version },
      boundary:
        'Actual renderer graph. Baseline unchanged; only hash-checked candidate overlay. No backend, native transport, storage or deployment.',
    },
    null,
    2,
  ),
);
await writeFile(
  join(output, 'index.html'),
  document(
    'Disconnected chat highlight comparison',
    '<h1>Actual chat renderer: highlight A/B</h1><p>Synthetic sample only, not a deployed game change.</p><p><a href="baseline/">Baseline production renderer</a> · <a href="candidate/">Prepared-highlighter candidate</a></p><p>Run correctness first, then benchmarks with equal settings. Keep tabs visible and alternate arm order. These elapsed synchronous timings are not FPS, CPU time or game latency.</p><p><a href="README.txt">Method</a> · <a href="NOTICE.txt">Source and licenses</a> · <a href="manifest.json">Build manifest</a></p>',
  ),
);
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(builds).map(([key, value]) => [
        key,
        { bytes: value.bytes, sha256: value.sha256 },
      ]),
    ),
  ),
);
