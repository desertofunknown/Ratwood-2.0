import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { journeys, studies, research } from './routes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
export const CSP = "default-src 'none'; script-src 'none'; style-src 'self'; connect-src 'none'; img-src 'none'; font-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const routeIds = Object.keys(studies).flatMap((id) => [`${id}-svelte`, `${id}-react`]).concat(['svelte', 'react', 'lua'].map((variant) => `${research.id}-${variant}`));

export function validateRegistry(inventory) {
  if (!inventory || inventory.status !== 'verified' || !Array.isArray(inventory.routes)) throw Error('Verified route inventory is required.');
  const safePath = (path) => typeof path === 'string' && /^\/(?:[a-z0-9-]+\/)+$/.test(path);
  if (!safePath(inventory.hubPath)) throw Error('Invalid hub mount path.');
  const ids = new Set();
  const paths = new Set();
  for (const route of inventory.routes) {
    if (!routeIds.includes(route.id) || ids.has(route.id)) throw Error(`Unknown or repeated route ID: ${route.id}`);
    if (!safePath(route.path) || paths.has(route.path) || route.path === inventory.hubPath) throw Error(`Unsafe or repeated route: ${route.path}`);
    ids.add(route.id); paths.add(route.path);
  }
  if (routeIds.some((id) => !ids.has(id))) throw Error('Approved inventory is missing a study route.');
  const assigned = journeys.flatMap((journey) => journey.studies);
  if (assigned.length !== Object.keys(studies).length || new Set(assigned).size !== assigned.length || assigned.some((id) => !studies[id])) throw Error('Each study must belong to exactly one journey.');
  return inventory.routes.map((route) => ({ ...route, href: `${posix.relative(inventory.hubPath, route.path)}/` }));
}

export async function renderHub(inventory) {
  inventory ??= JSON.parse(await readFile(join(here, 'approved-routes.json'), 'utf8'));
  const routes = validateRegistry(inventory);
  const link = (id, label, context) => {
    const route = routes.find((candidate) => candidate.id === id);
    if (!route) throw Error(`Unapproved link: ${id}`);
    return `<a href="${escape(route.href)}" aria-label="${escape(`${label}: ${context}`)}">${escape(label)}</a>`;
  };
  const sections = journeys.map((journey, index) => `<section class="journey" id="${journey.id}" aria-labelledby="${journey.id}-title">
    <div class="section-heading"><span class="step" aria-hidden="true">0${index + 1}</span><div><h2 id="${journey.id}-title">${escape(journey.title)}</h2><p class="muted">${escape(journey.description)}</p></div></div>
    <div class="study-grid">${journey.studies.map((id) => `<article class="study" aria-labelledby="${id}-title"><h3 id="${id}-title">${escape(studies[id].title)}</h3><p>${escape(studies[id].description)}</p><p class="prompt">${escape(studies[id].prompt)}</p><div class="variants" aria-label="${escape(studies[id].title)} implementations">${link(`${id}-svelte`, 'Svelte', studies[id].title)}${link(`${id}-react`, 'React', studies[id].title)}</div></article>`).join('\n')}</div>
  </section>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escape(CSP)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Tithewood workshop · disconnected UI samples</title>
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="hub.css">
</head>
<body class="TithewoodSurface">
<a class="skip-link" href="#main">Skip to the studies</a>
<header><div class="shell">
<p class="eyebrow">Tithewood · UI evaluation workshop</p>
<h1>Disconnected samples.<br>One place to compare.</h1>
<p class="lead">Follow a player journey, open a study, and compare the same task in Svelte and React.</p>
<p class="boundary">This is not the live game. These studies use sample data and do not carry your choices between screens. React remains the production baseline; Svelte is provisional.</p>
<nav aria-label="Player journeys"><ul class="journey-nav">${journeys.map((journey) => `<li><a href="#${journey.id}">${escape(journey.title)}</a></li>`).join('')}<li><a href="#research">Lua research</a></li></ul></nav>
</div></header>
<main id="main" class="shell" tabindex="-1">
${sections}
<section class="research" id="research" aria-labelledby="research-title"><p class="eyebrow">Separate research comparison</p><h2 id="research-title">${escape(research.title)}</h2><p class="muted">${escape(research.description)}</p><div class="variants">${link(`${research.id}-svelte`, 'Standalone Svelte', research.title)}${link(`${research.id}-react`, 'Standalone React', research.title)}${link(`${research.id}-lua`, 'Browser-Lua research', research.title)}</div></section>
<section class="evaluate" aria-labelledby="evaluate-title"><h2 id="evaluate-title">A useful comparison</h2><ol><li>Choose one study and try the same task in both implementations.</li><li>Use your browser’s Back command to return to this hub. Existing study navigation is unchanged.</li><li>Compare readability, keyboard focus, narrow layouts and how clearly each view explains its state.</li></ol><p class="muted">This hub records nothing and adds no scripts to the studies. It is not performance evidence or a claim of native-client compatibility or accessibility conformance.</p></section>
</main>
<footer><div class="shell"><p>Static workshop navigation. No game connection, saved preferences or cross-study session.</p><div class="footer-links"><a href="source/tgui/prototypes/evaluation-hub/README.md">Source & build instructions</a><a href="manifest.json">Build provenance</a><a href="NOTICE.txt">Notices</a><a href="LICENSE.txt">License</a></div></div></footer>
</body>
</html>
`;
}

export async function buildHub({ outputDir = join(here, 'dist') } = {}) {
  const output = resolve(outputDir);
  const allowed = ['dist', '.test-build'].some((folder) => output === join(here, folder) || output.startsWith(join(here, folder) + sep));
  if (!allowed) throw Error('Output must remain in evaluation-hub/dist or evaluation-hub/.test-build.');
  const inventory = JSON.parse(await readFile(join(here, 'approved-routes.json'), 'utf8'));
  const routes = validateRegistry(inventory);
  const html = await renderHub(inventory);
  const css = await readFile(join(here, 'hub.css'));
  const tokens = await readFile(join(here, '../ui-shared/tokens.css'));
  if (/@import|@font-face|url\s*\(/i.test(css.toString() + tokens.toString())) throw Error('Remote or imported CSS assets are forbidden.');
  // No deletion: refuse a reused nonempty directory rather than package stale files.
  try { if ((await readdir(output)).length) throw Error('Output directory must be empty; choose a fresh output directory.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(join(output, 'source'), { recursive: true });
  const inputs = ['build.mjs', 'routes.mjs', 'approved-routes.json', 'hub.css', 'README.md', 'NOTICE.txt'];
  const sources = [];
  for (const name of inputs) {
    const path = join(here, name);
    const bytes = await readFile(path);
    sources.push({ path: relative(repo, path), sha256: hash(bytes) });
    const mirror = join(output, 'source', relative(repo, path));
    await mkdir(dirname(mirror), { recursive: true });
    await writeFile(mirror, bytes);
  }
  for (const [path, name] of [[join(here, '../ui-shared/tokens.css'), 'tokens.css'], [join(repo, 'LICENSE'), 'LICENSE.txt']]) {
    const bytes = await readFile(path);
    sources.push({ path: relative(repo, path), sha256: hash(bytes) });
    await writeFile(join(output, name), bytes);
    const mirror = join(output, 'source', relative(repo, path));
    await mkdir(dirname(mirror), { recursive: true });
    await writeFile(mirror, bytes);
  }
  await writeFile(join(output, 'index.html'), html);
  await writeFile(join(output, 'hub.css'), css);
  await copyFile(join(here, 'NOTICE.txt'), join(output, 'NOTICE.txt'));
  const artifacts = [];
  for (const entry of await readdir(output, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath ?? entry.path, entry.name);
    const bytes = await readFile(path);
    artifacts.push({ path: relative(output, path), sha256: hash(bytes), bytes: bytes.length });
  }
  const manifest = {
    schemaVersion: 1, kind: 'disconnected-static-evaluation-hub', clientJavaScript: false,
    hubPath: inventory.hubPath, routes, sources: sources.sort((a, b) => a.path.localeCompare(b.path)),
    artifacts: artifacts.sort((a, b) => a.path.localeCompare(b.path)), dependencies: [],
    constraints: ['No production activation or game connection.', 'No runtime JavaScript, fonts, images, storage or tracking.', 'No performance, native-client acceptance or accessibility conformance claim.'],
  };
  await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { outputDir: output, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildHub();
  console.log(`Built disconnected evaluation hub: ${result.outputDir}`);
}
