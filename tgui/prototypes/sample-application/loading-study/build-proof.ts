import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

import type { BunPlugin } from 'bun';
import ts from 'typescript';

import { definitions, plugins, repository } from '../build-options';

const here = import.meta.dir;
const output = join(here, 'dist');
const singleton = './endpoint-binding.js';
const lexicalImports = `import { binding as __sampleEndpointBinding, facade as __sampleEndpointFacade, excludedStories as __loadingExcludedStories } from '${singleton}';`;
const guardedBanner = `${lexicalImports}\n__sampleEndpointBinding.read();`;
const digest = (data: string | Uint8Array) =>
  createHash('sha256').update(data).digest('hex');

type Phase = 'singleton' | 'bootstrap' | 'production';
type Edge = { kind: 'static' | 'dynamic'; path: string };
type Emitted = {
  path: string;
  phase: Phase;
  bytes: number;
  gzipBytes: number;
  sha256: string;
  imports: Edge[];
  facadeReferences: number;
};

function externalBinding(bootstrap: boolean): BunPlugin {
  return {
    name: 'loading-proof-one-external-binding',
    setup(build) {
      build.onResolve({ filter: /^\.\/endpoint-binding\.js$/ }, () => ({
        path: singleton,
        external: true,
      }));
      if (bootstrap) {
        build.onResolve(
          { filter: /^\.\/(production-host|deferred-probe)\.js$/ },
          ({ path }) => ({ path, external: true }),
        );
      }
    },
  };
}

function audit(code: string, path: string, phase: Phase) {
  if (phase !== 'singleton') {
    assert(code.startsWith(lexicalImports), `${path}: missing lexical import`);
    assert(
      !code.includes('The sample endpoint binding can only be installed once.'),
      `${path}: duplicate binding implementation`,
    );
  }
  if (phase === 'production') {
    assert(code.startsWith(guardedBanner), `${path}: missing pre-body guard`);
  }
  const source = ts.createSourceFile(
    path,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const imports: Edge[] = [];
  let facadeReferences = 0;
  function record(kind: Edge['kind'], node: ts.Expression) {
    assert(ts.isStringLiteral(node), `${path}: unresolved import expression`);
    assert(node.text.startsWith('./'), `${path}: non-local import`);
    const target = node.text.slice(2);
    assert(!target.includes('/'), `${path}: expected flat local graph`);
    imports.push({ kind, path: target });
  }
  function visit(node: ts.Node) {
    if (ts.isIdentifier(node)) {
      assert(node.text !== 'Byond', `${path}: unbound native identifier`);
      if (node.text === '__sampleEndpointFacade') facadeReferences++;
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['window', 'globalThis'].includes(node.expression.text) &&
      ts.isStringLiteral(node.argumentExpression)
    ) {
      assert(
        node.argumentExpression.text !== 'Byond',
        `${path}: direct native property lookup`,
      );
    }
    if (ts.isImportDeclaration(node)) record('static', node.moduleSpecifier);
    if (ts.isExportDeclaration(node) && node.moduleSpecifier)
      record('static', node.moduleSpecifier);
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    )
      record('dynamic', node.arguments[0]);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { imports, facadeReferences };
}

assert.equal(Bun.version, '1.2.16', 'Use the accepted installed Bun version.');
await mkdir(output, { recursive: true });
const emitted = new Map<string, Emitted>();
const sources: Record<Phase, Set<string>> = {
  singleton: new Set(),
  bootstrap: new Set(),
  production: new Set(),
};

for (const phase of ['singleton', 'bootstrap', 'production'] as const) {
  const result = await Bun.build({
    entrypoints:
      phase === 'singleton'
        ? [join(here, 'module-binding.ts')]
        : phase === 'bootstrap'
          ? [join(here, 'host-bootstrap.ts')]
          : [join(here, 'production-host.ts'), join(here, 'deferred-probe.ts')],
    outdir: output,
    naming:
      phase === 'singleton'
        ? 'endpoint-binding.js'
        : { entry: '[name].js', chunk: 'chunk-[hash].js' },
    target: 'browser',
    format: 'esm',
    conditions: ['browser', 'production'],
    splitting: phase === 'production',
    minify: true,
    define: {
      ...definitions,
      'import.meta.webpackContext': '__loadingExcludedStories',
    },
    banner:
      phase === 'singleton'
        ? undefined
        : phase === 'bootstrap'
          ? lexicalImports
          : guardedBanner,
    plugins: [
      ...(phase === 'singleton'
        ? []
        : [externalBinding(phase === 'bootstrap')]),
      ...plugins(sources[phase]),
    ],
  });
  assert(result.success, result.logs.map(String).join('\n'));
  for (const artifact of result.outputs) {
    const path = basename(artifact.path);
    assert(path.endsWith('.js'), `Unexpected non-JavaScript output: ${path}`);
    assert(!emitted.has(path), `Duplicate emitted output: ${path}`);
    const code = await artifact.text();
    emitted.set(path, {
      path,
      phase,
      bytes: artifact.size,
      gzipBytes: gzipSync(code).byteLength,
      sha256: digest(code),
      ...audit(code, path, phase),
    });
  }
}

assert(
  [...emitted.values()].some(
    ({ phase, path }) => phase === 'production' && path.startsWith('chunk-'),
  ),
  'Proof must actually emit a shared production chunk.',
);
for (const file of emitted.values()) {
  for (const edge of file.imports)
    assert(emitted.has(edge.path), `${file.path}: missing import ${edge.path}`);
  if (file.phase !== 'singleton')
    assert(
      file.imports.some(
        (edge) => edge.kind === 'static' && edge.path === singleton.slice(2),
      ),
      `${file.path}: not statically bound to the one singleton URL`,
    );
}
assert.deepEqual(
  [...sources.bootstrap].filter((path) =>
    /\/packages\/(?:tgui|common)\//.test(path),
  ),
  [],
  'Production dependency entered the pre-install bootstrap closure.',
);
assert(
  ![...sources.production].includes(resolve(here, '../bootstrap.ts')),
  'The old per-script bootstrap must not enter the split graph.',
);
for (const phase of ['bootstrap', 'production'] as const)
  assert(
    ![...sources[phase]].includes(resolve(here, '../endpoint-binding.ts')),
    `${phase}: singleton factory bundled twice`,
  );

function closure(entry: string) {
  const files = new Set<string>();
  const visit = (path: string) => {
    if (files.has(path)) return;
    files.add(path);
    for (const edge of emitted.get(path)!.imports)
      if (edge.kind === 'static') visit(edge.path);
  };
  visit(entry);
  return files;
}
function totals(files: Set<string>) {
  return {
    files: [...files].sort(),
    bytes: [...files].reduce((sum, path) => sum + emitted.get(path)!.bytes, 0),
    gzipBytes: [...files].reduce(
      (sum, path) => sum + emitted.get(path)!.gzipBytes,
      0,
    ),
  };
}
const initial = closure('host-bootstrap.js');
assert([...initial].every((path) => emitted.get(path)!.phase !== 'production'));
const firstHost = new Set([...initial, ...closure('production-host.js')]);
const deferred = closure('deferred-probe.js');
const manifest = {
  proof: 'single-owned-external-esm-endpoint',
  bun: Bun.version,
  note: 'Bun build/import + Happy DOM correctness proof only. Not browser, native, startup, CPU, memory or route-lazy evidence.',
  singleton: singleton.slice(2),
  guard:
    'Every production entry/common chunk imports the same singleton and calls binding.read() before its module body.',
  accounting:
    'Raw and sum of per-file gzip bytes; static dependency closures deduplicated by emitted local URL.',
  initialBootstrapClosure: totals(initial),
  firstHostTotalClosure: totals(firstHost),
  deferredStaticClosure: totals(deferred),
  deferredUniqueAfterHost: totals(
    new Set([...deferred].filter((path) => !firstHost.has(path))),
  ),
  allEmitted: totals(new Set(emitted.keys())),
  files: [...emitted.values()].sort((a, b) => a.path.localeCompare(b.path)),
  buildRecipe: await Promise.all(
    [
      'build-proof.ts',
      '../build-options.ts',
      '../../crafting-workbench/browser-integration/build-options.ts',
      '../../crafting-workbench/svelte/compiler.ts',
    ].map(async (path) => ({
      path: relative(repository, resolve(here, path)),
      sha256: digest(await readFile(resolve(here, path))),
    })),
  ),
  sources: Object.fromEntries(
    await Promise.all(
      Object.entries(sources).map(async ([phase, paths]) => [
        phase,
        await Promise.all(
          [...paths].sort().map(async (path) => ({
            path: relative(repository, path),
            sha256: digest(await readFile(path)),
          })),
        ),
      ]),
    ),
  ),
};
await writeFile(
  join(output, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(JSON.stringify({ ...manifest, sources: undefined }, null, 2));
