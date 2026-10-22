import type { WorkbenchData } from './model';

export interface DemoAdapter {
  update(data: WorkbenchData): Promise<void>;
  unmount(): Promise<void>;
  actions: unknown[];
}

const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// Two animation frames bound a visible update opportunity, not exact paint time.
export function installBenchmark(
  adapter: DemoAdapter,
  visibleControls = false,
) {
  let controls: HTMLElement | undefined;
  const target = window as typeof window & {
    workbenchDemo?: DemoAdapter;
    workbenchBenchmark?: { run(): Promise<unknown> };
  };
  let closed = false;
  let running = false;
  let visibilityInvalidated = false;
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
      document.visibilityState !== 'visible'
    ) {
      throw new Error('Benchmark requires a mounted, visible document.');
    }
  };
  const assertNeutral = () => {
    assertVisible();
    const search = document.querySelector<HTMLInputElement>(
      '.Workbench input[type="search"]',
    );
    if (
      !search ||
      search.value !== '' ||
      document.querySelector('.Workbench__folio-title') ||
      document.querySelectorAll('.Workbench__recipe').length !== 40
    ) {
      throw new Error(
        'Reload the demo and run without search, selection or expanded pagination.',
      );
    }
  };
  target.workbenchDemo = guarded;
  target.workbenchBenchmark = {
    async run() {
      if (running) throw new Error('A benchmark is already running.');
      assertVisible();
      running = true;
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
        assertNeutral();
        const samples: number[] = [];
        for (let iteration = 0; iteration < 35; iteration++) {
          // Same nested record identity deliberately tests delivered in-place updates.
          data.craftability[recipes[iteration].name] = 0;
          assertNeutral();
          const start = performance.now();
          await guarded.update(data);
          await frame();
          await frame();
          const elapsed = performance.now() - start;
          assertNeutral();
          if (iteration >= 5) samples.push(elapsed);
        }
        return {
          scope:
            'Synthetic 1282-recipe delivered updates through two animation frames; not exact paint, input latency, startup or game timing.',
          userAgent: navigator.userAgent,
          viewport: [innerWidth, innerHeight],
          visibility: document.visibilityState,
          warmups: 5,
          samplesMs: samples,
          renderedRows: document.querySelectorAll('.Workbench__recipe').length,
        };
      } finally {
        document.removeEventListener('visibilitychange', onVisibility);
        visibilityInvalidated = false;
        running = false;
      }
    },
  };
  if (visibleControls) {
    controls = document.createElement('details');
    controls.className = 'demo-benchmark';
    const summary = document.createElement('summary');
    summary.textContent = 'Comparison tools';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Run sample update benchmark';
    const note = document.createElement('p');
    note.textContent =
      'Changes the sample catalog. Reload for design browsing. Keep this tab visible; timings include two animation frames, not exact paint.';
    const output = document.createElement('pre');
    output.setAttribute('aria-live', 'polite');
    output.setAttribute('aria-label', 'Benchmark results');
    button.onclick = async () => {
      button.disabled = true;
      output.textContent = 'Running…';
      try {
        output.textContent = JSON.stringify(
          await target.workbenchBenchmark!.run(),
          null,
          2,
        );
      } catch (error) {
        output.textContent = `Benchmark rejected: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        button.disabled = false;
      }
    };
    controls.append(summary, note, button, output);
    document.body.prepend(controls);
  }
}
