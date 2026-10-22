import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { GlobalRegistrator } from '@happy-dom/global-registrator';

import type { BenchmarkScenario, DemoAdapter } from './browser-harness';

// Explicit CLI only: production bundles must already exist. This is DOM
// correctness coverage, not browser execution or a performance measurement.
const here = dirname(fileURLToPath(import.meta.url));
const bundles = {
  react: join(here, 'dist/demo.js'),
  svelte: join(here, 'svelte/dist/demo.js'),
  lua: join(here, 'lua/dist/demo.js'),
};
type Arm = keyof typeof bundles;
const scenarios: BenchmarkScenario[] = [
  'catalog',
  'selected-first',
  'selected-off-page',
];
type Result = {
  scenario: BenchmarkScenario;
  mutationPattern: string;
  warmups: number;
  renderedRows: number;
  samplesMs: number[];
  deliveryToCommitSamplesMs: number[];
  selectedRecipe: {
    name: string;
    path: string;
    sourceSlot: string;
    onPage: boolean;
  } | null;
};

async function check(arm: Arm, scenario: BenchmarkScenario) {
  GlobalRegistrator.register({
    settings: {
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
    },
  });
  const target = window as typeof window & {
    workbenchDemo?: DemoAdapter;
    workbenchBenchmark?: { run(scenario: BenchmarkScenario): Promise<Result> };
  };
  const root = document.createElement('div');
  root.id = 'root';
  document.body.append(root);
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  let frameId = 0;
  globalThis.requestAnimationFrame = (callback) => {
    queueMicrotask(() => callback(0));
    return ++frameId;
  };
  // No real durations are collected. Every harness clock read returns zero.
  const clock = performance;
  const oldNow = Object.getOwnPropertyDescriptor(clock, 'now');
  Object.defineProperty(clock, 'now', { configurable: true, value: () => 0 });
  let networkAttempts = 0;
  const rejectNetwork = () => {
    networkAttempts++;
    throw new Error('Network is forbidden in the disconnected bundle check.');
  };
  globalThis.fetch = Object.assign(rejectNetwork, {
    preconnect: rejectNetwork,
  });
  globalThis.WebSocket = class {
    constructor() {
      rejectNetwork();
    }
  } as unknown as typeof WebSocket;
  globalThis.XMLHttpRequest = class {
    constructor() {
      rejectNetwork();
    }
  } as unknown as typeof XMLHttpRequest;
  try {
    // Import the actual minified production IIFE, not a source adapter or UI clone.
    await import(pathToFileURL(bundles[arm]).href);
    assert(target.workbenchBenchmark && target.workbenchDemo);
    assert.equal(target.workbenchDemo.actions.length, 0);
    const result = await target.workbenchBenchmark.run(scenario);
    assert.equal(result.scenario, scenario);
    assert.equal(result.warmups, 5);
    assert.equal(result.renderedRows, 40);
    assert.deepEqual(result.samplesMs, Array(30).fill(0));
    assert.deepEqual(result.deliveryToCommitSamplesMs, Array(30).fill(0));
    assert.equal(target.workbenchDemo.actions.length, 0);
    assert.equal(networkAttempts, 0);
    assert.equal(
      document.querySelector<HTMLInputElement>('input[type="search"]')?.value,
      '',
    );
    const rows = [...document.querySelectorAll('.Workbench__recipe')];
    assert.equal(rows.length, 40);
    const names = rows.map(
      (row) => row.querySelector('.Workbench__recipe-name')?.textContent,
    );
    const expanded = rows.filter(
      (row) => row.getAttribute('aria-expanded') === 'true',
    );
    const title = document.querySelector('.Workbench__folio-title');
    if (scenario === 'catalog') {
      assert.equal(
        result.mutationPattern,
        'clear-one-successive-visible-material-flag-each-iteration',
      );
      assert.equal(result.selectedRecipe, null);
      assert.equal(title, null);
      assert.equal(expanded.length, 0);
      assert.equal(names[0], 'Recipe 0000');
      assert.equal(names[39], 'Recipe 0039');
    } else {
      const onPage = scenario === 'selected-first';
      const name = onPage ? 'Recipe 0000' : 'Recipe 9999 (selected off-page)';
      assert.equal(
        result.mutationPattern,
        'toggle-selected-material-flag-each-iteration',
      );
      assert.deepEqual(result.selectedRecipe, {
        name,
        onPage,
        path: '/benchmark/recipe/0',
        sourceSlot: '0',
      });
      assert.equal(title?.textContent, name);
      assert.equal(names.includes(name), onPage);
      assert.equal(expanded.length, Number(onPage));
      if (onPage) assert.equal(expanded[0], rows[0]);
      assert.equal(names[0], onPage ? 'Recipe 0000' : 'Recipe 0001');
      assert.equal(names[39], onPage ? 'Recipe 0039' : 'Recipe 0040');
      const match = document.querySelector('.Workbench__folio-match');
      assert.equal(match?.textContent?.trim(), 'Material match: not reported');
      assert.equal(match?.classList.contains('Workbench__match--yes'), false);
    }
    assert.equal(
      document.querySelector<HTMLButtonElement>('.demo-benchmark button')
        ?.disabled,
      false,
    );
    assert.equal(
      document.querySelector<HTMLSelectElement>('.demo-benchmark select')
        ?.disabled,
      false,
    );
  } finally {
    try {
      await target.workbenchDemo?.unmount();
      assert.equal(document.querySelector('.Workbench'), null);
      assert.equal(document.querySelector('.demo-benchmark'), null);
    } finally {
      delete target.workbenchDemo;
      delete target.workbenchBenchmark;
      root.remove();
      if (oldNow) Object.defineProperty(clock, 'now', oldNow);
      else delete (clock as { now?: () => number }).now;
      await GlobalRegistrator.unregister();
    }
  }
  console.log(
    `PASS ${arm}/${scenario}: production-bundle DOM correctness only`,
  );
}

if (process.argv[2] === '--child') {
  const arm = process.argv[3] as Arm;
  const scenario = process.argv[4] as BenchmarkScenario;
  assert(Object.hasOwn(bundles, arm) && scenarios.includes(scenario));
  await check(arm, scenario);
} else {
  assert.equal(
    process.argv.length,
    2,
    'Usage: bun run browser-client-scenarios.ts',
  );
  for (const bundle of Object.values(bundles)) {
    assert(
      await Bun.file(bundle).exists(),
      `Missing existing production build: ${bundle}`,
    );
  }
  for (const arm of Object.keys(bundles) as Arm[]) {
    for (const scenario of scenarios) {
      const child = Bun.spawn(
        [
          process.execPath,
          fileURLToPath(import.meta.url),
          '--child',
          arm,
          scenario,
        ],
        {
          cwd: here,
          stdout: 'inherit',
          stderr: 'inherit',
        },
      );
      assert.equal(await child.exited, 0, `${arm}/${scenario} failed`);
    }
  }
  console.log(
    'PASS all 9 isolated combinations. Visibility, animation frames and clocks were stubbed; no performance results.',
  );
}
