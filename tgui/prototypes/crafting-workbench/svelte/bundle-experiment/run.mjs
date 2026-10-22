import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  statfs,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

// Deliberately BUILD ONLY. No output bundle is imported, evaluated, or served.
const here = dirname(fileURLToPath(import.meta.url));
const svelteRoot = resolve(here, '..');
const tgui = resolve(here, '../../../..');
const repository = resolve(tgui, '..');
const generated = join(here, '.generated');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runRoot = join(generated, stamp);
const require = createRequire(import.meta.url);
const rspack = require('@rspack/core');
const { VERSION: svelteVersion } = require('svelte/compiler');
assert.equal(
  typeof globalThis.Bun,
  'undefined',
  'Run with real Node, not Bun.',
);
const normalize = (value) => value.split(repository).join('<repo>');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const saveJson = (file, value) =>
  writeFile(file, JSON.stringify(value, null, 2) + '\n');

function git(...args) {
  return execFileSync('git', args, {
    cwd: repository,
    encoding: 'utf8',
  }).trim();
}

async function spaceGuard() {
  const disk = await statfs(here);
  const available = disk.bavail * disk.bsize;
  assert(available > 10 * 1024 ** 3, 'Must preserve more than 10 GiB free.');
  return available;
}

async function preservedInputHashes() {
  const files = git('ls-files', '-z', 'tgui').split('\0').filter(Boolean);
  return Object.fromEntries(
    await Promise.all(
      files
        // This result is intentionally refreshed after all input checks.
        // Once tracked, every other experiment file remains protected too.
        .filter(
          (file) =>
            file !== relative(repository, join(here, 'measurement.json')),
        )
        .map(async (file) => [
          file,
          digest(await readFile(join(repository, file))),
        ]),
    ),
  );
}

async function toolPackage(name) {
  // Package metadata can be unexported; read the already installed package.
  const file = join(
    name === 'svelte' ? svelteRoot : tgui,
    'node_modules',
    name,
    'package.json',
  );
  const pkg = await readJson(file);
  return {
    name: pkg.name,
    version: pkg.version,
    packageJsonSha256: digest(await readFile(file)),
  };
}

async function treeManifest(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await treeManifest(join(directory, entry.name), name)));
    } else if (entry.isFile()) {
      const bytes = await readFile(join(directory, entry.name));
      files.push({ name, raw: bytes.length, sha256: digest(bytes) });
    } else {
      throw new Error(`Unexpected non-regular public/output entry: ${name}`);
    }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

function describe(value) {
  if (value instanceof RegExp) return value.toString();
  if (Array.isArray(value)) return value.map(describe);
  if (value && typeof value === 'object') {
    return Object.fromEntries([
      ...(value.constructor !== Object
        ? [['constructor', value.constructor.name]]
        : []),
      ...Object.entries(value).map(([key, item]) => [key, describe(item)]),
    ]);
  }
  if (typeof value === 'function') return `[function ${value.name}]`;
  return typeof value === 'string' ? normalize(value) : value;
}

function flattenModules(modules, parentChunks = [], parent = null) {
  return (modules ?? []).flatMap((module) => {
    const effectiveChunks = module.chunks?.length
      ? module.chunks
      : parentChunks;
    const item = {
      ...module,
      modules: undefined,
      // Concatenated children can say orphan=true yet belong to an emitted
      // parent. Preserve both facts instead of claiming orphan=false.
      effectiveChunks,
      concatenatedParent: parent,
      concatenatedChildrenCount: module.modules?.length ?? 0,
    };
    return [
      item,
      ...flattenModules(module.modules, effectiveChunks, module.identifier),
    ];
  });
}

async function assetMeasurements(output) {
  const manifest = await treeManifest(output);
  return Promise.all(
    manifest.map(async (file) => ({
      ...file,
      gzip: gzipSync(await readFile(join(output, file.name)), {
        level: 9,
      }).length,
    })),
  );
}

function totals(assets) {
  const sum = (files) => ({
    raw: files.reduce((value, file) => value + file.raw, 0),
    gzip: files.reduce((value, file) => value + file.gzip, 0),
  });
  return {
    javascript: sum(assets.filter((file) => file.name.endsWith('.js'))),
    css: sum(assets.filter((file) => file.name.endsWith('.css'))),
    all: sum(assets),
  };
}

function compare(left, right) {
  const names = [...new Set([...left, ...right].map((file) => file.name))];
  return names.sort().map((name) => {
    const a = left.find((file) => file.name === name);
    const b = right.find((file) => file.name === name);
    return {
      name,
      raw: (b?.raw ?? 0) - (a?.raw ?? 0),
      gzip: (b?.gzip ?? 0) - (a?.gzip ?? 0),
      identical: a?.sha256 === b?.sha256,
    };
  });
}

const sourceCommit = git('rev-parse', 'HEAD');
const statusBefore = git('status', '--short');
const publicBefore = await treeManifest(join(tgui, 'public'));
const preservedBefore = await preservedInputHashes();
const freeBefore = await spaceGuard();
assert.equal(svelteVersion, '5.57.2', 'Re-review changes to pinned compiler.');
await mkdir(runRoot, { recursive: true });

// Fixed generated entry paths keep repeated-run module IDs comparable.
// These are not production entrypoints and MUST NEVER be loaded in a browser.
const marker = '__TITHEWOOD_BUILD_ONLY_RETAIN__';
const controlEntry = join(generated, 'control-entry.ts');
const candidateEntry = join(generated, 'candidate-entry.ts');
const reactEntry = join(generated, 'react-entry.ts');
await writeFile(controlEntry, `globalThis.${marker} = null;\n`);
await writeFile(
  reactEntry,
  `import { CraftingWorkbench } from '../../../Workbench';\n` +
    `import { observeWorkbenchLifetime } from '../../bridge/lifetime';\n` +
    `import '../../../workbench.css';\n` +
    `globalThis.${marker} = { Component: CraftingWorkbench, observeWorkbenchLifetime };\n`,
);
await writeFile(
  candidateEntry,
  `import { ReactWorkbenchHost } from '../../ReactHost';\n` +
    `import { observeWorkbenchLifetime } from '../../bridge/lifetime';\n` +
    `import '../../../workbench.css';\n` +
    `globalThis.${marker} = { Component: ReactWorkbenchHost, observeWorkbenchLifetime };\n`,
);

// The real config resolves dirname from cwd at module evaluation time.
process.chdir(tgui);
const production = (await import(pathToFileURL(join(tgui, 'rspack.config.ts'))))
  .default;
assert.equal(production.context, tgui);
assert.equal(production.mode, 'production');
assert.deepEqual(production.target, ['web', 'browserslist:edge >= 123']);
assert.equal(typeof production.entry.tgui, 'string');
const jsRule = production.module.rules.find((rule) =>
  rule.test?.test('component.tsx'),
);
assert(jsRule?.use && Array.isArray(jsRule.use));

const arms = {};
for (const arm of ['ordinary', 'control', 'react', 'candidate']) {
  await spaceGuard();
  const output = join(runRoot, arm, 'assets');
  await mkdir(output, { recursive: true });
  const config = {
    ...production,
    output: { ...production.output, path: output },
  };
  if (arm !== 'ordinary') {
    config.entry = {
      ...production.entry,
      tgui: [
        production.entry.tgui,
        { control: controlEntry, react: reactEntry, candidate: candidateEntry }[
          arm
        ],
      ],
    };
  }
  if (arm === 'candidate') {
    config.module = {
      ...production.module,
      rules: [
        ...production.module.rules,
        {
          test: /\.svelte$/,
          include: svelteRoot,
          type: jsRule.type,
          // Loaders run right to left: compile, then identical production SWC.
          use: [...jsRule.use, { loader: join(here, 'svelte-loader.cjs') }],
        },
      ],
    };
  }
  // Assert untouched production knobs rather than quietly recreating them.
  for (const key of Object.keys(production)) {
    if (!['output', 'entry', 'module'].includes(key)) {
      assert.strictEqual(config[key], production[key], `${arm}: ${key}`);
    }
  }
  assert.deepEqual(config.output, { ...production.output, path: output });
  assert.deepEqual(
    config.module.rules.slice(0, production.module.rules.length),
    production.module.rules,
  );
  const compiler = rspack(config);
  await saveJson(join(runRoot, arm, 'config.json'), {
    supplied: describe(config),
    normalized: {
      mode: compiler.options.mode,
      target: compiler.options.target,
      devtool: compiler.options.devtool,
      output: describe(compiler.options.output),
      optimization: describe(compiler.options.optimization),
      resolve: describe(compiler.options.resolve),
    },
  });
  console.log(`Building ${arm}; output is never executed.`);
  let stats;
  try {
    stats = await new Promise((resolveBuild, reject) =>
      compiler.run((error, value) =>
        error ? reject(error) : resolveBuild(value),
      ),
    );
    assert(stats, 'Rspack did not return stats.');
    const json = stats.toJson({
      all: false,
      assets: true,
      chunks: true,
      chunkModules: true,
      entrypoints: true,
      errors: true,
      errorDetails: true,
      warnings: true,
      modules: true,
      nestedModules: true,
      orphanModules: true,
      groupModulesByAttributes: false,
      groupModulesByCacheStatus: false,
      groupModulesByExtension: false,
      groupModulesByLayer: false,
      groupModulesByPath: false,
      groupModulesByType: false,
      groupReasonsByOrigin: false,
      reasons: true,
      usedExports: true,
      providedExports: true,
      ids: true,
      source: false,
      version: true,
      timings: true,
      hash: true,
      modulesSpace: Infinity,
      nestedModulesSpace: Infinity,
      chunkModulesSpace: Infinity,
    });
    await saveJson(
      join(runRoot, arm, 'stats.json'),
      JSON.parse(normalize(JSON.stringify(json))),
    );
    if (stats.hasErrors()) throw new Error(stats.toString({ colors: false }));
    const modules = flattenModules(json.modules);
    const sourceHashes = {};
    for (const file of stats.compilation.fileDependencies) {
      if (file.startsWith(repository + '/') && (await stat(file)).isFile()) {
        sourceHashes[relative(repository, file)] = digest(await readFile(file));
      }
    }
    await saveJson(join(runRoot, arm, 'input-hashes.json'), sourceHashes);
    await saveJson(
      join(runRoot, arm, 'modules.json'),
      JSON.parse(normalize(JSON.stringify(modules))),
    );
    const assets = await assetMeasurements(output);
    arms[arm] = {
      assets,
      totals: totals(assets),
      warnings: JSON.parse(normalize(JSON.stringify(json.warnings))),
      modules,
      sourceHashes,
      normalized: compiler.options,
    };
    console.log(`${arm}: ${JSON.stringify(arms[arm].totals)}`);
  } finally {
    await new Promise((resolveClose, reject) =>
      compiler.close((error) => (error ? reject(error) : resolveClose())),
    );
  }
}

// A genuine ordinary CLI build, with only its supported outputPath override.
// No helper rebuild, development server, bundle evaluation, or live route.
const cliOutput = join(runRoot, 'ordinary-cli/assets');
await mkdir(cliOutput, { recursive: true });
console.log('Verifying ordinary CLI equivalence; output is never executed.');
const cliLog = execFileSync(
  process.execPath,
  [
    join(tgui, 'node_modules/@rspack/cli/bin/rspack.js'),
    'build',
    '--config',
    join(tgui, 'rspack.config.ts'),
    '--outputPath',
    cliOutput,
  ],
  { cwd: tgui, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 180000 },
);
await writeFile(join(runRoot, 'ordinary-cli/build.log'), normalize(cliLog));
const cliAssets = await assetMeasurements(cliOutput);
assert.deepEqual(
  cliAssets,
  arms.ordinary.assets,
  'Ordinary API/CLI output differs.',
);

const candidate = arms.candidate;
for (const [name, arm] of Object.entries(arms)) {
  for (const [file, hash] of Object.entries(arms.ordinary.sourceHashes)) {
    if (file in arm.sourceHashes) {
      assert.equal(
        arm.sourceHashes[file],
        hash,
        `${name}: changed common input ${file}`,
      );
    }
  }
  for (const panel of ['tgui-panel.bundle.js', 'tgui-panel.bundle.css']) {
    assert.equal(
      arm.assets.find((file) => file.name === panel).sha256,
      arms.ordinary.assets.find((file) => file.name === panel).sha256,
      `${name}: second entry changed`,
    );
  }
  if (['ordinary', 'control'].includes(name)) {
    assert(
      !arm.modules.some(
        (module) =>
          module.effectiveChunks.length &&
          /\/(?:svelte\/src|svelte\/ReactHost|svelte\/adapter|svelte\/Workbench|svelte\/Delivery|crafting-workbench\/model)/.test(
            module.nameForCondition ?? '',
          ),
      ),
      `${name}: unexpected prototype implementation`,
    );
  }
}
const reactModules = arms.react.modules.filter(
  (module) => module.effectiveChunks.length,
);
assert(
  reactModules.some((module) =>
    module.nameForCondition?.endsWith('/crafting-workbench/Workbench.tsx'),
  ),
);
assert(
  !reactModules.some((module) =>
    module.nameForCondition?.includes('/node_modules/svelte/'),
  ),
);
assert.equal(
  arms.react.assets.find((file) => file.name === 'tgui.bundle.css').sha256,
  candidate.assets.find((file) => file.name === 'tgui.bundle.css').sha256,
  'React/Svelte comparison must contain byte-identical shared stylesheet output.',
);
const emitted = candidate.modules.filter(
  (module) => module.effectiveChunks.length,
);
const modulePath = (module) =>
  module.nameForCondition ?? module.identifier ?? '';
const required = [
  '/svelte/ReactHost.tsx',
  '/svelte/bridge/lifetime.ts',
  '/svelte/adapter.ts',
  '/svelte/Delivery.svelte',
  '/svelte/Workbench.svelte',
  '/crafting-workbench/model.ts',
  '/crafting-workbench/workbench.css',
  '/node_modules/svelte/src/index-client.js',
  '/node_modules/svelte/src/internal/client/render.js',
];
const retention = required.map((suffix) => {
  const matches = emitted.filter((module) =>
    modulePath(module).includes(suffix),
  );
  assert(
    matches.length,
    `Required candidate module not in emitted graph: ${suffix}`,
  );
  return {
    suffix,
    modules: matches.map((module) => ({
      identifier: normalize(module.identifier),
      usedExports: module.usedExports,
      orphan: module.orphan,
      effectiveChunks: module.effectiveChunks,
      concatenatedParent: normalize(module.concatenatedParent ?? ''),
    })),
  };
});
for (const suffix of [
  '/svelte/src/compiler/',
  '/svelte/compiler/',
  '/svelte/src/index-server.js',
  '/crafting-workbench/fixtures.ts',
  '/crafting-workbench/browser-harness.ts',
  '/svelte/demo.ts',
  '/svelte/Demo.svelte',
]) {
  assert(
    !emitted.some((module) => modulePath(module).includes(suffix)),
    suffix,
  );
}
const candidateJs = await readFile(
  join(runRoot, 'candidate/assets/tgui.bundle.js'),
  'utf8',
);
const controlJs = await readFile(
  join(runRoot, 'control/assets/tgui.bundle.js'),
  'utf8',
);
const ordinaryJs = await readFile(
  join(runRoot, 'ordinary/assets/tgui.bundle.js'),
  'utf8',
);
assert(candidateJs.includes(marker) && controlJs.includes(marker));
assert(!ordinaryJs.includes(marker));
for (const sentinel of [
  'Component:',
  'observeWorkbenchLifetime',
  'data-disconnected-workbench-host',
  'The workbench',
]) {
  assert(
    candidateJs.includes(sentinel),
    `Minified retention sentinel absent: ${sentinel}`,
  );
}
const candidateCss = await readFile(
  join(runRoot, 'candidate/assets/tgui.bundle.css'),
  'utf8',
);
assert(candidateCss.includes('.Workbench__header'));
const envModules = emitted.filter((module) =>
  modulePath(module).includes('/node_modules/esm-env/'),
);
const developmentFalse = envModules.find(
  (module) =>
    modulePath(module).endsWith('/false.js') &&
    module.reasons?.some(
      (reason) => reason.active && reason.userRequest === 'esm-env/development',
    ),
);
assert(
  developmentFalse,
  'No active esm-env/development -> false.js resolution evidence.',
);
assert(
  !emitted.some((module) =>
    /\/(dev-fallback|browser-fallback)\.js$/.test(modulePath(module)),
  ),
);
const packages = {};
for (const module of emitted) {
  const file = module.nameForCondition;
  if (!file || !file.includes('/node_modules/')) continue;
  let folder = dirname(file);
  while (folder.startsWith(repository)) {
    try {
      const info = await readJson(join(folder, 'package.json'));
      if (info.name && info.version) {
        const key = relative(repository, folder);
        packages[key] ??= {
          name: info.name,
          version: info.version,
          license: info.license ?? null,
          packageJsonSha256: digest(
            await readFile(join(folder, 'package.json')),
          ),
        };
        break;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    folder = dirname(folder);
  }
}
const reactPackages = Object.values(packages).filter(
  (pkg) => pkg.name === 'react',
);
assert.equal(reactPackages.length, 1, 'Candidate must reuse existing React.');
const runtimeDependencies = Object.entries(packages).filter(([path]) =>
  path.includes('/crafting-workbench/svelte/node_modules/'),
);
const licenses = [];
await mkdir(join(runRoot, 'licenses'));
for (const [path, pkg] of runtimeDependencies) {
  const names = (await readdir(join(repository, path))).filter((name) =>
    /^(licen[cs]e|copying)(\.|$)/i.test(name),
  );
  assert(names.length, `No runtime license found for ${pkg.name}`);
  for (const name of names) {
    const destination = `${pkg.name.replaceAll('/', '-')}-${name}`;
    await copyFile(
      join(repository, path, name),
      join(runRoot, 'licenses', destination),
    );
    licenses.push({
      package: pkg.name,
      version: pkg.version,
      file: `licenses/${destination}`,
      sha256: digest(await readFile(join(repository, path, name))),
    });
  }
}
const publicAfter = await treeManifest(join(tgui, 'public'));
assert.deepEqual(
  publicAfter,
  publicBefore,
  'Production public assets were changed.',
);
assert.deepEqual(
  await preservedInputHashes(),
  preservedBefore,
  'Tracked production/prototype inputs changed.',
);
const publicMatches = arms.ordinary.assets.map((file) => ({
  name: file.name,
  identical:
    publicBefore.find((prior) => prior.name === file.name)?.sha256 ===
    file.sha256,
}));
const inputHashes = Object.fromEntries(
  await Promise.all(
    [
      'tgui/rspack.config.ts',
      'tgui/package.json',
      'tgui/bun.lock',
      'tgui/prototypes/crafting-workbench/svelte/package.json',
      'tgui/prototypes/crafting-workbench/svelte/bun.lock',
      ...['run.mjs', 'svelte-loader.cjs'].map((name) =>
        relative(repository, join(here, name)),
      ),
    ].map(async (file) => [
      file,
      digest(await readFile(join(repository, file))),
    ]),
  ),
);
const toolPackages = await Promise.all(
  [
    '@rspack/core',
    '@rspack/cli',
    '@rspack/binding',
    '@rspack/binding-linux-x64-gnu',
    'css-loader',
    'sass-loader',
    'sass-embedded',
    'sass-embedded-linux-x64',
    'svelte',
  ].map(toolPackage),
);
const moduleEvidence = (module) => ({
  resource: normalize(module.nameForCondition ?? module.identifier),
  effectiveChunks: module.effectiveChunks,
  usedExports: module.usedExports,
  reasons: (module.reasons ?? [])
    .filter(
      (reason) => reason.active && /^esm-env\//.test(reason.userRequest ?? ''),
    )
    .map(({ type, userRequest, active }) => ({ type, userRequest, active })),
});
const ordinaryIdentifiers = new Set(
  arms.ordinary.modules.map((module) => module.identifier),
);
const addedModuleAttribution = emitted
  .filter(
    (module) =>
      !module.concatenatedChildrenCount &&
      !ordinaryIdentifiers.has(module.identifier),
  )
  .map((module) => ({
    resource: normalize(
      module.nameForCondition ?? module.identifier ?? module.name,
    ),
    moduleType: module.moduleType,
    graphBytesBeforeMinification: module.size,
    usedExports: module.usedExports,
    effectiveChunks: module.effectiveChunks,
  }));
await saveJson(join(runRoot, 'preserved-input-hashes.json'), preservedBefore);
const report = {
  sourceCommit,
  measuredAt: stamp,
  scope:
    'Build-only addition to existing production tgui, not replacement, activation, runtime benchmark, or standalone total.',
  toolchain: {
    runtime: 'Node (Bun presence rejected)',
    executable: basename(process.execPath),
    executableSha256: digest(await readFile(process.execPath)),
    node: process.version,
    bun: null,
    zlib: process.versions.zlib,
    svelte: svelteVersion,
    packages: toolPackages,
    compilerEntrySha256: digest(
      await readFile(require.resolve('svelte/compiler')),
    ),
    nativeAddons: await Promise.all(
      Object.keys(require.cache)
        .filter((file) => file.endsWith('.node'))
        .map(async (file) => ({
          path: normalize(file),
          sha256: digest(await readFile(file)),
        })),
    ),
  },
  target: production.target,
  gzip: 'Node zlib gzipSync level 9, each emitted asset independently; totals sum file gzip lengths.',
  configChanges: {
    ordinary: ['output.path only'],
    control: [
      'output.path',
      'append generated global-assignment retention entry to tgui entry',
    ],
    react: [
      'output.path',
      'append generated retention entry importing existing React CraftingWorkbench/lifetime/shared CSS',
    ],
    candidate: [
      'output.path',
      'append generated retention entry importing existing host/lifetime/shared CSS',
      'scoped Svelte compiler loader followed by existing production SWC chain',
    ],
  },
  compilerOptions: {
    generate: 'client',
    dev: false,
    css: 'external',
    runes: true,
  },
  normalBuildDifference:
    'Rspack is called directly. The separate build:helpers terser step is not run; public helpers/assets remain byte-identical. No emitted bundle is evaluated.',
  inputHashes,
  sourceStatusBefore: statusBefore,
  sourceStatusAfter: git('status', '--short'),
  generatedEvidence: relative(here, runRoot),
  freeBytes: { before: freeBefore, after: await spaceGuard() },
  productionPublicUnchanged: true,
  preservedTrackedInputsUnchanged: Object.keys(preservedBefore).length,
  commonCompilationInputsUnchanged: true,
  ordinaryMatchesExistingPublic: publicMatches,
  ordinaryCliByteIdentical: true,
  arms: Object.fromEntries(
    Object.entries(arms).map(([name, arm]) => [
      name,
      {
        assets: arm.assets,
        totals: arm.totals,
        warnings: arm.warnings,
        emittedModuleRecords: arm.modules.filter(
          (module) => module.effectiveChunks.length,
        ).length,
      },
    ]),
  ),
  deltas: {
    ordinaryToControl: compare(arms.ordinary.assets, arms.control.assets),
    ordinaryToCandidate: compare(arms.ordinary.assets, candidate.assets),
    controlToCandidate: compare(arms.control.assets, candidate.assets),
    ordinaryToReact: compare(arms.ordinary.assets, arms.react.assets),
    reactToCandidate: compare(arms.react.assets, candidate.assets),
  },
  retention,
  addedModuleAttribution,
  productionResolution: {
    conditions: candidate.normalized.resolve.conditionNames,
    esmByDependencyConditions:
      candidate.normalized.resolve.byDependency.esm.conditionNames,
    browserSvelte: true,
    developmentFalse: moduleEvidence(developmentFalse),
    esmEnvModules: envModules.map(moduleEvidence),
  },
  installedEmittedPackages: packages,
  runtimeDependenciesAdded: runtimeDependencies.map(([path, pkg]) => ({
    path,
    ...pkg,
  })),
  licenses,
  limitations: [
    'Candidate includes existing React host, lifetime observer, Svelte client/runtime, compiled workflow, adapter, shared model, CSS, retention shim and bundler perturbations. It is not Svelte runtime alone.',
    'Global assignment prevents tree shaking but is artificial; ordinary-to-control measures its whole-build perturbation. Neither hook nor candidate is registered in production routes.',
    'Nested module sizes are pre-minification graph facts, not exact per-package minified or gzip contributions. Gzip differences are not additive attribution.',
    'Both production entries and existing assets remain. No lazy chunk, external React protocol, alternate target/minifier, or font substitution is introduced.',
    'React comparator retains the existing direct React component, lifetime observer and exact same CSS. Svelte needs its React host plus adapter. This is a build-cost comparison of existing boundaries, not identical adapters or runtime performance.',
    'Startup, execution, DOM, memory, native support, real asset-loader acceptance, and runtime lifecycle are not tested by this experiment.',
  ],
};
await saveJson(join(runRoot, 'report.json'), report);
await saveJson(join(here, 'measurement.json'), report);
console.log(
  JSON.stringify(
    {
      report: relative(repository, join(here, 'measurement.json')),
      deltas: Object.fromEntries(
        Object.entries(report.deltas).map(([name, files]) => [
          name,
          files.filter((file) => !file.identical),
        ]),
      ),
      ordinaryCliByteIdentical: true,
      publicMatches: publicMatches.every((file) => file.identical),
    },
    null,
    2,
  ),
);
