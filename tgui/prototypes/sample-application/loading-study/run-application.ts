import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import ts from 'typescript';

const here = import.meta.dir;
const repository = resolve(here, '../../../..');
const generated = join(here, '.generated');
const digest = (bytes: string | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const requested = process.argv.slice(2);
const modes = requested.length ? requested : ['workbench', 'eager', 'lazy'];
const scenarioFilter = process.env.LOADING_APPLICATION_FILTER;
assert(modes.length === new Set(modes).size, 'Duplicate application mode.');
assert(
  modes.every((mode) => ['workbench', 'eager', 'lazy'].includes(mode)),
  'Unknown application mode.',
);
type Source = { path: string; sha256: string };
type Edge = { kind: 'static' | 'dynamic'; path: string };
type Artifact = {
  path: string;
  phase: 'singleton' | 'bootstrap' | 'application';
  sha256: string;
  imports: Edge[];
};
type Manifest = {
  mode: string;
  arm: string;
  bun: string;
  files: Artifact[];
  sources: Record<'singleton' | 'bootstrap' | 'application', Source[]>;
  buildRecipe: Source[];
};
const variants: {
  mode: string;
  arm: string;
  directory: string;
  manifest: Manifest;
  auxiliaryEntry?: string;
}[] = [];
for (const mode of modes) {
  for (const arm of ['react', 'svelte']) {
    const directory = join(here, 'dist/application', mode, arm);
    const manifest: Manifest = JSON.parse(
      await readFile(join(directory, 'manifest.json'), 'utf8'),
    );
    assert.equal(manifest.bun, Bun.version);
    assert.equal(manifest.mode, mode);
    assert.equal(manifest.arm, arm);
    assert(
      manifest.buildRecipe?.some((source) =>
        source.path.endsWith('/loading-study/build-application.ts'),
      ),
      'Application build recipe must be hashed, including bootstrap alias rules.',
    );
    for (const source of [
      ...Object.values(manifest.sources).flat(),
      ...manifest.buildRecipe,
    ]) {
      const path = resolve(repository, source.path);
      assert(
        path.startsWith(repository + '/'),
        'Source inventory escaped repository.',
      );
      assert.equal(
        digest(await readFile(path)),
        source.sha256,
        `Source changed after application build: ${source.path}. Rebuild before testing.`,
      );
    }
    const paths = new Set(manifest.files.map((file) => file.path));
    assert.equal(
      paths.size,
      manifest.files.length,
      'Duplicate emitted application URL.',
    );
    for (const required of [
      'endpoint-binding.js',
      'application-bootstrap.js',
      'launch.js',
      'app.js',
    ]) {
      assert(paths.has(required), `Missing application artifact: ${required}`);
    }
    let bootstrapEdges = 0;
    for (const file of manifest.files) {
      assert(
        /^[\w.-]+\.js$/.test(file.path),
        'Artifact is not a flat local module URL.',
      );
      const bytes = await readFile(join(directory, file.path));
      assert.equal(
        digest(bytes),
        file.sha256,
        `Emitted artifact changed after build: ${mode}/${arm}/${file.path}`,
      );
      const code = bytes.toString();
      const parsed = ts.createSourceFile(
        file.path,
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS,
      );
      const edges: Edge[] = [];
      const record = (kind: Edge['kind'], expression: ts.Expression) => {
        assert(
          ts.isStringLiteral(expression),
          'Unresolved emitted application import.',
        );
        assert(
          /^\.\/[\w.-]+\.js$/.test(expression.text),
          'Non-local or cache-busted emitted module URL.',
        );
        const path = expression.text.slice(2);
        assert(
          paths.has(path),
          `Import outside the audited application inventory: ${path}`,
        );
        edges.push({ kind, path });
      };
      const visit = (node: ts.Node) => {
        if (ts.isImportDeclaration(node)) {
          record('static', node.moduleSpecifier);
        }
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
      visit(parsed);
      assert.deepEqual(
        edges,
        file.imports,
        'Manifest import graph does not match emitted JavaScript.',
      );
      if (file.phase === 'application') {
        assert.match(
          code,
          /^import \{ binding as __sampleEndpointBinding, facade as __sampleEndpointFacade, excludedStories as __loadingExcludedStories \} from '\.\/endpoint-binding\.js';\n__sampleEndpointBinding\.read\(\);/,
          'Every application entry/common chunk needs a pre-body endpoint ownership guard.',
        );
        bootstrapEdges += edges.filter(
          (edge) =>
            edge.kind === 'static' && edge.path === 'application-bootstrap.js',
        ).length;
      }
      if (file.path !== 'endpoint-binding.js') {
        assert(
          !code.includes(
            'The sample endpoint binding can only be installed once.',
          ),
          'A second endpoint-binding factory was bundled.',
        );
      }
      if (file.path === 'application-bootstrap.js') {
        assert(
          edges.some(
            (edge) =>
              edge.kind === 'static' && edge.path === 'endpoint-binding.js',
          ),
        );
        assert(
          edges.some(
            (edge) => edge.kind === 'dynamic' && edge.path === 'app.js',
          ),
        );
        assert(
          edges.every(
            (edge) =>
              edge.path === 'endpoint-binding.js' ||
              (edge.kind === 'dynamic' && edge.path === 'app.js'),
          ),
          'Bootstrap statically reaches the real application graph.',
        );
      }
    }
    assert(
      bootstrapEdges > 0,
      'The real runtime must use the installed emitted application-bootstrap URL.',
    );
    const sources = manifest.sources.application.map((source) => source.path);
    assert(
      !sources.includes('tgui/prototypes/sample-application/bootstrap.ts'),
      'Original bootstrap was bundled.',
    );
    assert(
      !sources.includes(
        'tgui/prototypes/sample-application/endpoint-binding.ts',
      ),
      'Application contains another binding factory.',
    );
    for (const required of ['application-context.ts', '../runtime.tsx']) {
      const path = resolve(here, required).slice(repository.length + 1);
      assert(
        sources.includes(path),
        `Missing actual runtime/bootstrap alias source: ${path}`,
      );
    }
    assert(
      !manifest.sources.bootstrap.some((source) =>
        /\/packages\/(common|tgui)\//.test(source.path),
      ),
      'Production source is statically present in the bootstrap build.',
    );
    const auxiliaryEntries = [
      ...new Set(
        manifest.files
          .filter((file) => file.phase === 'application')
          .flatMap((file) =>
            file.imports
              .filter((edge) => edge.kind === 'dynamic')
              .map((edge) => edge.path),
          ),
      ),
    ];
    assert.equal(
      auxiliaryEntries.length,
      mode === 'lazy' ? 1 : 0,
      'Expected exactly one genuine deferred entry per lazy arm, none in eager controls.',
    );
    variants.push({
      mode,
      arm,
      directory,
      manifest,
      auxiliaryEntry: auxiliaryEntries[0],
    });
  }
}
await mkdir(generated, { recursive: true });
const wrapper = join(generated, 'application-emitted.test.ts');
await writeFile(wrapper, "import '../application-checks';\n");
const foreignCases = ['global', 'window'].flatMap((target) =>
  ['Byond', 'hubStorage'].flatMap((property) =>
    ['own', 'inherited'].map(
      (ownership) => `${target} ${property} ${ownership}`,
    ),
  ),
);
const scenarios = [
  'mounted emitted application preserves real routes and disposal',
  ...['bootstrap', 'application'].flatMap((entry) =>
    foreignCases.map((value) => `startup ${entry} ${value}`),
  ),
  'pending application import retires before evaluation',
  ...foreignCases.map((value) => `pending foreign ${value}`),
  ...foreignCases.map((value) => `warm foreign ${value}`),
  'cached modules and retained actions lose retirement authority',
];
const lazyScenarios = [
  'lazy pending auxiliary newer navigation wins',
  'lazy pending auxiliary unmount releases old visit',
  'lazy pending auxiliary foreign accessor fails without reads',
  ...foreignCases.map((value) => `lazy cold auxiliary foreign ${value}`),
];
const harness = await Promise.all(
  ['application-checks.ts', 'run-application.ts'].map(async (path) => ({
    path,
    sha256: digest(await readFile(join(here, path))),
  })),
);
const reports: {
  mode: string;
  arm: string;
  scenario: string;
  assertions: number;
  observations: unknown[];
}[] = [];
for (const { mode, arm, auxiliaryEntry } of variants) {
  const selectedScenarios = [
    ...scenarios,
    ...(mode === 'lazy' ? lazyScenarios : []),
  ].filter((scenario) => !scenarioFilter || scenario.includes(scenarioFilter));
  assert(
    selectedScenarios.length,
    `No application cases matched ${scenarioFilter}`,
  );
  for (const scenario of selectedScenarios) {
    // Every scenario starts in a new process. Exact immutable URLs are reused;
    // successful or failed ESM caches cannot hide a cold-evaluation regression.
    const child = Bun.spawn(
      [
        process.execPath,
        'test',
        '--preload',
        join(here, '../../../happydom.ts'),
        wrapper,
      ],
      {
        cwd: here,
        env: {
          ...process.env,
          LOADING_APPLICATION_MODE: mode,
          LOADING_APPLICATION_ARM: arm,
          LOADING_APPLICATION_CASE: scenario,
          LOADING_APPLICATION_AUXILIARY: auxiliaryEntry ?? '',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    const log = stdout + stderr;
    process.stdout.write(log);
    assert.equal(code, 0, `${mode}/${arm}: ${scenario} failed`);
    assert.match(log, /\b1 pass\b/);
    assert.match(log, /\b0 fail\b/);
    const assertions = Number(log.match(/(\d+) expect\(\) calls/)?.[1]);
    assert(
      Number.isInteger(assertions) && assertions > 0,
      'Missing pinned Bun assertion summary.',
    );
    const observations = [
      ...log.matchAll(/^APPLICATION_OBSERVATION (.+)$/gm),
    ].map((match) => JSON.parse(match[1]));
    reports.push({ mode, arm, scenario, assertions, observations });
  }
}
// Refuse to report a mixed-source run if anyone edits the harness or audited
// inputs while children are evaluating the supposedly frozen emitted modules.
for (const source of harness) {
  assert.equal(
    digest(await readFile(join(here, source.path))),
    source.sha256,
    `Application test harness changed during execution: ${source.path}`,
  );
}
for (const { directory, manifest } of variants) {
  for (const source of [
    ...Object.values(manifest.sources).flat(),
    ...manifest.buildRecipe,
  ]) {
    assert.equal(
      digest(await readFile(resolve(repository, source.path))),
      source.sha256,
      `Application source changed during execution: ${source.path}`,
    );
  }
  for (const file of manifest.files) {
    assert.equal(
      digest(await readFile(join(directory, file.path))),
      file.sha256,
      `Application artifact changed during execution: ${file.path}`,
    );
  }
}
const assertions = reports.reduce((sum, report) => sum + report.assertions, 0);
const report = {
  environment: `Bun ${Bun.version} + Happy DOM only; real emitted disconnected applications, not browser/native/performance acceptance`,
  notes: [
    'Global and separate Window network API tripwires enabled before application imports.',
    'Existing test-only Happy DOM standalone-table-row parser correction enabled.',
    'No source React, original bootstrap, mocked production store or mocked Window imported by checks.',
  ],
  harness,
  scenarioFilter: scenarioFilter ?? null,
  scenarios: reports,
  passed: reports.length,
  assertions,
  variants: variants.map(({ mode, arm, manifest }) => ({
    mode,
    arm,
    emittedHashes: manifest.files.map(({ path, sha256 }) => ({ path, sha256 })),
    sourceHashes: manifest.sources,
    buildRecipe: manifest.buildRecipe,
  })),
};
await writeFile(
  join(generated, 'application-results.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  `Emitted application proof: ${reports.length} isolated cases / ${assertions} assertions passed.`,
);
