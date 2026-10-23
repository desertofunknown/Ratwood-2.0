import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { here, repository } from './build-options';
import { SOURCE_SHA256, transformSource } from './candidate-overlay';
const assert = (value: unknown, message: string) => {
  if (!value) throw Error(message);
};
for (const path of Object.keys(SOURCE_SHA256)) {
  const source = await readFile(join(repository, path), 'utf8');
  assert(
    transformSource(path, source, 'baseline') === source,
    `Baseline changed: ${path}`,
  );
  assert(
    transformSource(path, source, 'candidate') !== source,
    `Candidate absent: ${path}`,
  );
  let rejected = false;
  try {
    transformSource(path, source + '\n', 'candidate');
  } catch {
    rejected = true;
  }
  assert(rejected, `Source drift accepted: ${path}`);
}
const manifest = JSON.parse(
  await readFile(join(here, 'dist/manifest.json'), 'utf8'),
);
const hash = (data: string | Uint8Array) =>
  createHash('sha256').update(data).digest('hex');
for (const source of manifest.sources) {
  assert(
    hash(await readFile(join(repository, source.path))) === source.sha256,
    `Stale build source: ${source.path}; rebuild both arms`,
  );
}
for (const variant of ['baseline', 'candidate']) {
  const bytes = await readFile(join(here, 'dist', variant, 'app.js'));
  const code = bytes.toString('utf8');
  assert(
    hash(bytes) === manifest.builds[variant].sha256 &&
      bytes.length === manifest.builds[variant].bytes,
    `${variant}: bundle differs from its manifest`,
  );
  const html = await readFile(
    join(here, 'dist', variant, 'index.html'),
    'utf8',
  );
  assert(
    !/new WebSocket|127\.0\.0\.1:3000|Byond\.subscribe|Byond\.winset|localStorage|sessionStorage|indexedDB/.test(
      code,
    ),
    `${variant}: connected code`,
  );
  assert(
    html.includes("connect-src 'none'") &&
      html.includes('id="correctness"') &&
      html.includes('id="benchmark"'),
    `${variant}: missing safety/control contract`,
  );
  for (const path of [
    ...Object.keys(SOURCE_SHA256),
    'tgui/packages/tgui-panel/chat/model.js',
    'tgui/packages/tgui/logging.ts',
    'tgui/packages/tgui/components/TooltipHTML.tsx',
  ])
    assert(
      manifest.builds[variant].inputs.includes(path),
      `${variant}: missing ${path}`,
    );
}
assert(
  manifest.builds.baseline.sha256 !== manifest.builds.candidate.sha256,
  'Identical bundles',
);
console.log(
  'PASS: pinned source overlays, actual graph, visible controls and disconnected build contracts. Browser correctness/performance are separate checks.',
);
