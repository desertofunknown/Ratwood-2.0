import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, statfs, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

import type { BunPlugin } from 'bun';
import ts from 'typescript';

import { definitions, plugins, repository } from '../build-options';

// Build only: no browser, transport, listener or production output is launched.
const here = import.meta.dir;
const output = join(here, 'dist/application');
const singleton = './endpoint-binding.js';
const lexicalImports = `import { binding as __sampleEndpointBinding, facade as __sampleEndpointFacade, excludedStories as __loadingExcludedStories } from '${singleton}';`;
const guardedBanner = `${lexicalImports}\n__sampleEndpointBinding.read();`;
const digest = (bytes: string | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
type Phase = 'singleton' | 'bootstrap' | 'application';
type Edge = { kind: 'static' | 'dynamic'; path: string };
type Artifact = {
  path: string;
  phase: Phase;
  bytes: number;
  gzipBytes: number;
  sha256: string;
  imports: Edge[];
};

function aliases(phase: Phase): BunPlugin {
  return {
    name: 'one-installed-application-endpoint',
    setup(build) {
      build.onResolve(
        { filter: /^\.\/(?:endpoint-binding|application-bootstrap|app)\.js$/ },
        ({ path }) => ({ path, external: true }),
      );
      if (phase === 'application') {
        build.onResolve(
          { filter: /(?:^|\/)bootstrap(?:\.ts)?$/ },
          ({ path, importer }) => {
            const target = resolve(dirname(importer), path).replace(
              /\.ts$/,
              '',
            );
            if (target === resolve(here, '../bootstrap')) {
              return { path: join(here, 'application-context.ts') };
            }
          },
        );
      }
    },
  };
}

function inspect(code: string, path: string, phase: Phase): Edge[] {
  if (phase !== 'singleton') {
    assert(
      code.startsWith(lexicalImports),
      `${path}: missing singleton import`,
    );
    assert(
      !code.includes('The sample endpoint binding can only be installed once.'),
      `${path}: duplicate binding factory`,
    );
  }
  if (phase === 'application') {
    assert(
      code.startsWith(guardedBanner),
      `${path}: missing pre-body validation`,
    );
  }
  const source = ts.createSourceFile(
    path,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const edges: Edge[] = [];
  const record = (kind: Edge['kind'], node: ts.Expression) => {
    assert(ts.isStringLiteral(node), `${path}: unresolved import expression`);
    assert(node.text.startsWith('./'), `${path}: non-local module URL`);
    const target = node.text.slice(2);
    assert(!target.includes('/'), `${path}: expected flat per-arm graph`);
    edges.push({ kind, path: target });
  };
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node)) {
      assert(node.text !== 'Byond', `${path}: unbound native identifier`);
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['window', 'globalThis'].includes(node.expression.text) &&
      ts.isStringLiteral(node.argumentExpression)
    ) {
      assert(
        node.argumentExpression.text !== 'Byond',
        `${path}: native property lookup`,
      );
    }
    if (ts.isImportDeclaration(node)) record('static', node.moduleSpecifier);
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      record('static', node.moduleSpecifier);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      record('dynamic', node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return edges;
}

assert.equal(Bun.version, '1.2.16');
const disk = await statfs(here);
assert(
  disk.bavail * disk.bsize > 10 * 1024 ** 3,
  'More than 10 GiB free required.',
);
await mkdir(output, { recursive: true });
const variants: Record<string, unknown> = {};
const modes = process.argv.slice(2);
const selectedModes = modes.length ? modes : ['workbench', 'eager', 'lazy'];
for (const mode of selectedModes) {
  assert(
    ['workbench', 'eager', 'lazy'].includes(mode),
    `Unknown build mode: ${mode}`,
  );
  for (const arm of ['react', 'svelte']) {
    const directory = join(output, mode, arm);
    await mkdir(directory, { recursive: true });
    const emitted = new Map<string, Artifact>();
    const sources: Record<Phase, Set<string>> = {
      singleton: new Set(),
      bootstrap: new Set(),
      application: new Set(),
    };
    for (const phase of ['singleton', 'bootstrap', 'application'] as const) {
      const result = await Bun.build({
        entrypoints:
          phase === 'singleton'
            ? [join(here, 'module-binding.ts')]
            : phase === 'bootstrap'
              ? [
                  join(here, 'application-bootstrap.ts'),
                  join(here, 'launch.ts'),
                ]
              : [join(here, `entries/${arm}-${mode}.tsx`)],
        outdir: directory,
        naming:
          phase === 'singleton'
            ? 'endpoint-binding.js'
            : phase === 'bootstrap'
              ? '[name].js'
              : { entry: 'app.js', chunk: 'chunk-[hash].js' },
        target: 'browser',
        format: 'esm',
        conditions: ['browser', 'production'],
        splitting: phase === 'application',
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
          ...(phase === 'singleton' ? [] : [aliases(phase)]),
          ...plugins(sources[phase]),
        ],
      });
      assert(result.success, result.logs.map(String).join('\n'));
      for (const artifact of result.outputs) {
        const path = basename(artifact.path);
        assert(
          path.endsWith('.js') && !emitted.has(path),
          `Unexpected or duplicate output: ${path}`,
        );
        const code = await artifact.text();
        emitted.set(path, {
          path,
          phase,
          bytes: artifact.size,
          gzipBytes: gzipSync(code).byteLength,
          sha256: digest(code),
          imports: inspect(code, path, phase),
        });
      }
    }
    for (const artifact of emitted.values()) {
      for (const edge of artifact.imports) {
        assert(
          emitted.has(edge.path),
          `${artifact.path}: missing emitted import ${edge.path}`,
        );
      }
    }
    assert(
      ![...sources.application].includes(resolve(here, '../bootstrap.ts')),
      'Original bootstrap was bundled.',
    );
    for (const phase of ['bootstrap', 'application'] as const) {
      assert(
        !sources[phase].has(resolve(here, '../endpoint-binding.ts')),
        `${phase}: binding factory bundled twice`,
      );
    }
    assert.deepEqual(
      [...sources.bootstrap].filter((path) =>
        /\/packages\/(?:common|tgui)\//.test(path),
      ),
      [],
      'Production dependency evaluated before installation.',
    );
    const closure = (entry: string) => {
      const found = new Set<string>();
      const visit = (path: string) => {
        if (found.has(path)) return;
        found.add(path);
        for (const edge of emitted.get(path)!.imports) {
          if (edge.kind === 'static') visit(edge.path);
        }
      };
      visit(entry);
      return found;
    };
    const total = (files: Set<string>) => ({
      files: [...files].sort(),
      bytes: [...files].reduce(
        (sum, path) => sum + emitted.get(path)!.bytes,
        0,
      ),
      gzipBytes: [...files].reduce(
        (sum, path) => sum + emitted.get(path)!.gzipBytes,
        0,
      ),
    });
    const bootstrap = closure('launch.js');
    const firstWorkbench = new Set([...bootstrap, ...closure('app.js')]);
    const auxiliary = new Set(
      [...emitted.keys()].filter((path) => !firstWorkbench.has(path)),
    );
    if (mode !== 'lazy') {
      assert.equal(
        auxiliary.size,
        0,
        'Eager control unexpectedly has deferred modules.',
      );
    }
    if (mode === 'workbench') {
      assert.deepEqual(
        [...sources.application].filter((path) =>
          /\/prototypes\/(?:changes-archive|market-quote|treasury-ledger|display-readability|selection-prompt|value-prompts|alert-prompt)\//.test(
            path,
          ),
        ),
        [],
        'Workbench-only control imported auxiliary sources.',
      );
    }
    const manifest = {
      mode,
      arm,
      bun: Bun.version,
      note: 'Build-only disconnected ESM comparison. Workbench mode is a transfer control, not a six-screen preview. No startup, render, CPU, heap or native-client claim.',
      accounting:
        'Initial usable graph includes unconditional dynamic app startup, not only the entry file. Raw and sum of per-file gzip, deduplicated by emitted URL; all CSS stays eager.',
      literalEntry: emitted.get('launch.js'),
      bootstrapOnly: total(bootstrap),
      firstWorkbench: total(firstWorkbench),
      deferredUnique: total(auxiliary),
      allJavascript: total(new Set(emitted.keys())),
      files: [...emitted.values()].sort((a, b) => a.path.localeCompare(b.path)),
      buildRecipe: await Promise.all(
        [
          'build-application.ts',
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
          Object.entries(sources).map(async ([phase, files]) => [
            phase,
            await Promise.all(
              [...files].sort().map(async (path) => ({
                path: relative(repository, path),
                sha256: digest(await readFile(path)),
              })),
            ),
          ]),
        ),
      ),
    };
    await writeFile(
      join(directory, 'manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
    );
    await writeFile(
      join(directory, 'index.html'),
      `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; font-src 'none'; img-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>Disconnected ${mode} ${arm} loading study</title><link rel="stylesheet" href="../../screens.css"><link rel="stylesheet" href="../../shell.css"><script type="module" src="launch.js"></script></head><body><div id="fixture-root"></div><aside id="fixture-controls" aria-label="Disconnected fixture controls"></aside></body></html>\n`,
    );
    variants[`${mode}/${arm}`] = {
      firstWorkbench: manifest.firstWorkbench,
      deferredUnique: manifest.deferredUnique,
      allJavascript: manifest.allJavascript,
    };
  }
}
const styles: Array<{
  path: string;
  bytes: number;
  gzipBytes: number;
  sha256: string;
}> = [];
const expectedStyles: Record<string, string> = {
  'shell.css':
    '85f7a908bf65855b8ee6349562a66b43dcd7ec1e6da092e90d5dd4b32624046a',
  'screens.css':
    '67f75feaeb5aa9237c826b78be83dc1d9ac0edae76939d8dac5b1882b204dcfd',
};
for (const name of ['shell.css', 'screens.css']) {
  // The already-reviewed eager CSS remains identical and eagerly linked.
  const bytes = await readFile(join(here, '../dist', name));
  assert.equal(
    digest(bytes),
    expectedStyles[name],
    `${name}: matched frozen CSS changed`,
  );
  await writeFile(join(output, name), bytes);
  styles.push({
    path: name,
    bytes: bytes.byteLength,
    gzipBytes: gzipSync(bytes).byteLength,
    sha256: digest(bytes),
  });
}
await writeFile(
  join(output, 'comparison.json'),
  JSON.stringify(
    {
      variants,
      styles,
      note: 'This invocation only; use per-variant manifests as the authoritative artifact inventory.',
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ variants, styles }, null, 2));
