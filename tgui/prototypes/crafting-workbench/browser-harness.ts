import type { WorkbenchData } from './model';

export interface DemoAdapter {
  // Resolve after this delivery has committed its DOM changes.
  update(data: WorkbenchData): Promise<void>;
  unmount(): Promise<void>;
  actions: unknown[];
}

export type BenchmarkScenario =
  | 'catalog'
  | 'selected-first'
  | 'selected-off-page';

const scenarios: BenchmarkScenario[] = [
  'catalog',
  'selected-first',
  'selected-off-page',
];
const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

type Selection = { name: string; onPage: boolean };

// Two animation frames bound a visible update opportunity, not exact paint time.
export function installBenchmark(
  adapter: DemoAdapter,
  visibleControls = false,
) {
  let controls: HTMLElement | undefined;
  let button: HTMLButtonElement | undefined;
  let scenarioSelect: HTMLSelectElement | undefined;
  const target = window as typeof window & {
    workbenchDemo?: DemoAdapter;
    workbenchBenchmark?: {
      run(scenario?: BenchmarkScenario): Promise<unknown>;
    };
  };
  let closed = false;
  let running = false;
  let visibilityInvalidated = false;
  const setRunning = (value: boolean) => {
    running = value;
    if (button) button.disabled = value;
    if (scenarioSelect) scenarioSelect.disabled = value;
  };
  const guarded: DemoAdapter = {
    actions: adapter.actions,
    async update(data) {
      if (closed) {
        throw new Error('Demo was unmounted; reload before benchmarking.');
      }
      await adapter.update(data);
    },
    async unmount() {
      closed = true;
      controls?.remove();
      await adapter.unmount();
    },
  };
  const assertVisible = () => {
    if (
      closed ||
      visibilityInvalidated ||
      document.visibilityState !== 'visible' ||
      !document.querySelector('.Workbench')
    ) {
      throw new Error('Benchmark requires a mounted, visible document.');
    }
  };
  const assertState = (selection?: Selection, materialMatch = true) => {
    assertVisible();
    const search = document.querySelector<HTMLInputElement>(
      '.Workbench input[type="search"]',
    );
    const rows = [
      ...document.querySelectorAll<HTMLButtonElement>('.Workbench__recipe'),
    ];
    const titles = document.querySelectorAll('.Workbench__folio-title');
    const expanded = rows.filter(
      (row) => row.getAttribute('aria-expanded') === 'true',
    );
    if (!search || search.value !== '' || rows.length !== 40) {
      throw new Error(
        'Reload the demo and run without search or expanded pagination (40 rows required).',
      );
    }
    if (!selection) {
      if (titles.length || expanded.length) {
        throw new Error('Reload the demo and run without prior selection.');
      }
      return;
    }
    const matchingRows = rows.filter(
      (row) =>
        row.querySelector('.Workbench__recipe-name')?.textContent ===
        selection.name,
    );
    const match = document.querySelector('.Workbench__folio-match');
    if (
      titles.length !== 1 ||
      titles[0].textContent !== selection.name ||
      matchingRows.length !== (selection.onPage ? 1 : 0) ||
      expanded.length !== (selection.onPage ? 1 : 0) ||
      (selection.onPage &&
        (expanded[0] !== rows[0] || expanded[0] !== matchingRows[0])) ||
      !match ||
      match.classList.contains('Workbench__match--yes') !== materialMatch ||
      match.textContent?.trim() !==
        `Material match: ${materialMatch ? 'reported' : 'not reported'}`
    ) {
      throw new Error(
        'Benchmark selection, folio material state or visible/off-page position changed; reload the demo.',
      );
    }
  };
  target.workbenchDemo = guarded;
  target.workbenchBenchmark = {
    async run(scenario = 'catalog') {
      if (running) throw new Error('A benchmark is already running.');
      if (!scenarios.includes(scenario)) {
        throw new Error(`Unknown benchmark scenario: ${String(scenario)}`);
      }
      assertVisible();
      // Do not quietly discard a pre-existing selection when replacing demo data.
      if (document.querySelector('.Workbench__folio-title')) {
        throw new Error('Reload the demo and run without prior selection.');
      }
      setRunning(true);
      visibilityInvalidated = false;
      const onVisibility = () => {
        if (document.visibilityState !== 'visible') {
          visibilityInvalidated = true;
        }
      };
      document.addEventListener('visibilitychange', onVisibility);
      try {
        const recipes = Array.from({ length: 1282 }, (_, index) => ({
          name: `Recipe ${String(index).padStart(4, '0')}`,
          path: `/benchmark/recipe/${index}`,
          req_text: index % 2 ? '1 fiber' : '2 timber',
        }));
        const data: WorkbenchData = {
          crafting_recipes: { Benchmark: recipes },
          craftability: Object.fromEntries(
            recipes.map((recipe) => [recipe.name, 1]),
          ),
          showonlycraftable: false,
        };
        await guarded.update(data);
        assertState();
        let selection: Selection | undefined;
        if (scenario !== 'catalog') {
          const firstRow =
            document.querySelector<HTMLButtonElement>('.Workbench__recipe')!;
          if (
            firstRow.querySelector('.Workbench__recipe-name')?.textContent !==
            recipes[0].name
          ) {
            throw new Error(
              'First synthetic recipe is not the first rendered row.',
            );
          }
          firstRow.click();
          // Deliver through the public adapter to await the click's committed
          // state, without injecting selection into any client implementation.
          await guarded.update(data);
          selection = { name: recipes[0].name, onPage: true };
          assertState(selection);
          if (scenario === 'selected-off-page') {
            const oldName = recipes[0].name;
            recipes[0].name = 'Recipe 9999 (selected off-page)';
            data.craftability[recipes[0].name] = 1;
            delete data.craftability[oldName];
            // The array source slot, recipe object and path remain unchanged.
            await guarded.update(data);
            selection = { name: recipes[0].name, onPage: false };
            assertState(selection);
          }
        }
        const samples: number[] = [];
        const deliveryToCommitSamples: number[] = [];
        let selectedMaterialMatch = true;
        for (let iteration = 0; iteration < 35; iteration++) {
          // Same nested record identity deliberately tests delivered in-place updates.
          // Catalog retains its original successive-row mutation workload.
          const nextSelectedMaterialMatch: boolean = !selectedMaterialMatch;
          if (selection) {
            data.craftability[selection.name] = Number(
              nextSelectedMaterialMatch,
            );
          } else {
            data.craftability[recipes[iteration].name] = 0;
          }
          assertState(selection, selectedMaterialMatch);
          const start = performance.now();
          await guarded.update(data);
          const deliveryToCommitElapsed = performance.now() - start;
          await frame();
          await frame();
          const elapsed = performance.now() - start;
          if (selection) selectedMaterialMatch = nextSelectedMaterialMatch;
          assertState(selection, selectedMaterialMatch);
          if (iteration >= 5) {
            deliveryToCommitSamples.push(deliveryToCommitElapsed);
            samples.push(elapsed);
          }
        }
        return {
          scope:
            'Synthetic 1282-recipe delivery-to-DOM-commit and two-animation-frame wall-clock times; not CPU, exact paint, input latency, startup or game timing.',
          scenario,
          mutationPattern: selection
            ? 'toggle-selected-material-flag-each-iteration'
            : 'clear-one-successive-visible-material-flag-each-iteration',
          selectedRecipe: selection
            ? { ...selection, path: recipes[0].path, sourceSlot: '0' }
            : null,
          userAgent: navigator.userAgent,
          viewport: [innerWidth, innerHeight],
          visibility: document.visibilityState,
          warmups: 5,
          deliveryToCommitSamplesMs: deliveryToCommitSamples,
          samplesMs: samples,
          renderedRows: document.querySelectorAll('.Workbench__recipe').length,
        };
      } finally {
        document.removeEventListener('visibilitychange', onVisibility);
        visibilityInvalidated = false;
        setRunning(false);
      }
    },
  };
  if (visibleControls) {
    controls = document.createElement('details');
    controls.className = 'demo-benchmark';
    const summary = document.createElement('summary');
    summary.textContent = 'Comparison tools';
    const label = document.createElement('label');
    label.textContent = 'Scenario: ';
    scenarioSelect = document.createElement('select');
    scenarioSelect.setAttribute('aria-label', 'Benchmark scenario');
    for (const scenario of scenarios) {
      const option = document.createElement('option');
      option.value = scenario;
      option.textContent = scenario;
      scenarioSelect.append(option);
    }
    label.append(scenarioSelect);
    button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Run sample update benchmark';
    const note = document.createElement('p');
    note.textContent =
      'Changes the sample catalog. Reload between scenarios and for design browsing. Selected scenarios toggle the selected material flag; catalog clears successive visible flags. Keep this tab visible; reports DOM-commit and two-frame wall-clock times, not CPU or exact paint.';
    const output = document.createElement('pre');
    output.setAttribute('aria-live', 'polite');
    output.setAttribute('aria-label', 'Benchmark results');
    button.onclick = async () => {
      output.textContent = 'Running…';
      try {
        output.textContent = JSON.stringify(
          await target.workbenchBenchmark!.run(
            scenarioSelect!.value as BenchmarkScenario,
          ),
          null,
          2,
        );
      } catch (error) {
        output.textContent = `Benchmark rejected: ${error instanceof Error ? error.message : String(error)}`;
      }
    };
    controls.append(summary, note, label, button, output);
    document.body.prepend(controls);
  }
}
