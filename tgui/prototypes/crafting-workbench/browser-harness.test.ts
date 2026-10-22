import { expect, test } from 'bun:test';

import { type BenchmarkScenario, installBenchmark } from './browser-harness';
import type { WorkbenchData, WorkbenchRecipe } from './model';

type Delivery = {
  data: WorkbenchData;
  recipes: WorkbenchData['crafting_recipes']['Benchmark'];
  craftability: WorkbenchData['craftability'];
  firstRecipe: WorkbenchRecipe;
  firstName: string;
  firstPath: string;
  flags: Record<string, unknown>;
};
type Hooks = {
  beforeCommit?: (delivery: number) => Promise<void>;
  afterCommit?: (delivery: number, host: HTMLElement) => void;
};

// This deliberately small synthetic adapter tests harness sequencing and
// invalidation only. It is not evidence that React, Svelte or Lua behaves so.
async function fixture(
  run: (api: any, host: HTMLElement, hooks: Hooks) => Promise<void>,
  controls = false,
) {
  const host = document.createElement('div');
  host.innerHTML =
    '<div class="Workbench"><input type="search"><div class="fixture-rows">' +
    '<button class="Workbench__recipe"></button>'.repeat(40) +
    '</div><div class="fixture-folio"></div></div>';
  document.body.append(host);
  const visibility = Object.getOwnPropertyDescriptor(
    document,
    'visibilityState',
  );
  const raf = globalThis.requestAnimationFrame;
  const target = window as any;
  const oldDemo = target.workbenchDemo;
  const oldBenchmark = target.workbenchBenchmark;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  globalThis.requestAnimationFrame = (callback) => {
    queueMicrotask(() => callback(0));
    return 1;
  };
  let updates = 0;
  let clicks = 0;
  let selectedIdentity: string | undefined;
  let currentData: WorkbenchData;
  const deliveries: Delivery[] = [];
  const hooks: Hooks = {};
  const render = (data: WorkbenchData) => {
    const entries = Object.entries(data.crafting_recipes.Benchmark)
      .map(([slot, recipe]) => ({
        identity: JSON.stringify(['Benchmark', slot, recipe.path]),
        recipe,
      }))
      .sort((a, b) => a.recipe.name.localeCompare(b.recipe.name));
    const selected = entries.find(
      (entry) => entry.identity === selectedIdentity,
    );
    const rows = host.querySelector('.fixture-rows')!;
    rows.replaceChildren();
    for (const entry of entries.slice(0, 40)) {
      const row = document.createElement('button');
      row.className = 'Workbench__recipe';
      row.setAttribute('aria-expanded', String(entry === selected));
      const name = document.createElement('span');
      name.className = 'Workbench__recipe-name';
      name.textContent = entry.recipe.name;
      row.append(name);
      row.onclick = () => {
        clicks++;
        // A click does not synchronously commit in this fixture.
        queueMicrotask(() => {
          selectedIdentity = entry.identity;
          render(currentData);
        });
      };
      rows.append(row);
    }
    const folio = host.querySelector('.fixture-folio')!;
    folio.replaceChildren();
    if (selected) {
      const title = document.createElement('h2');
      title.className = 'Workbench__folio-title';
      title.textContent = selected.recipe.name;
      const match = document.createElement('p');
      const reported = data.craftability[selected.recipe.name] === 1;
      match.className = `Workbench__folio-match ${reported ? 'Workbench__match--yes' : ''}`;
      match.textContent = `Material match: ${reported ? 'reported' : 'not reported'}`;
      folio.append(title, match);
    }
  };
  installBenchmark(
    {
      actions: [],
      async update(data) {
        const delivery = ++updates;
        const recipes = data.crafting_recipes.Benchmark;
        const firstRecipe = Object.values(recipes)[0];
        deliveries.push({
          data,
          recipes,
          craftability: data.craftability,
          firstRecipe,
          firstName: firstRecipe.name,
          firstPath: firstRecipe.path,
          flags: { ...data.craftability },
        });
        currentData = data;
        await hooks.beforeCommit?.(delivery);
        render(data);
        hooks.afterCommit?.(delivery, host);
      },
      async unmount() {
        host.remove();
      },
    },
    controls,
  );
  try {
    await run(
      {
        ...target.workbenchBenchmark,
        demo: target.workbenchDemo,
        updates: () => updates,
        clicks: () => clicks,
        deliveries,
      },
      host,
      hooks,
    );
  } finally {
    await target.workbenchDemo.unmount();
    host.remove();
    globalThis.requestAnimationFrame = raf;
    if (visibility) {
      Object.defineProperty(document, 'visibilityState', visibility);
    } else delete (document as any).visibilityState;
    target.workbenchDemo = oldDemo;
    target.workbenchBenchmark = oldBenchmark;
  }
}

const scenarios: BenchmarkScenario[] = [
  'catalog',
  'selected-first',
  'selected-off-page',
];
const setupDeliveries = (scenario: BenchmarkScenario) =>
  scenario === 'catalog' ? 1 : scenario === 'selected-first' ? 2 : 3;
const restoreProperty = (
  object: object,
  name: string,
  descriptor?: PropertyDescriptor,
) => {
  if (descriptor) Object.defineProperty(object, name, descriptor);
  else delete (object as any)[name];
};
const waitForControls = async (button: HTMLButtonElement) => {
  for (let i = 0; i < 1000 && button.disabled; i++) await Promise.resolve();
  // Allow the visible event handler to publish the resolved result too.
  await Promise.resolve();
  expect(button.disabled).toBe(false);
};

test('default catalog retains thirty warmed samples and successive visible flag clearing', async () => {
  await fixture(async (api) => {
    const result = await api.run();
    expect(result.scenario).toBe('catalog');
    expect(result.mutationPattern).toBe(
      'clear-one-successive-visible-material-flag-each-iteration',
    );
    expect(result.selectedRecipe).toBeNull();
    expect(result.samplesMs).toHaveLength(30);
    expect(result.deliveryToCommitSamplesMs).toHaveLength(30);
    expect(result.warmups).toBe(5);
    expect(result.renderedRows).toBe(40);
    expect(api.updates()).toBe(36);
    expect(api.clicks()).toBe(0);
    const deliveries = api.deliveries as Delivery[];
    for (let iteration = 0; iteration < 35; iteration++) {
      const flags = deliveries[iteration + 1].flags;
      expect(Object.values(flags).filter((flag) => flag === 0)).toHaveLength(
        iteration + 1,
      );
      expect(flags[`Recipe ${String(iteration).padStart(4, '0')}`]).toBe(0);
      expect(flags[`Recipe ${String(iteration + 1).padStart(4, '0')}`]).toBe(1);
    }
  });
});

for (const scenario of scenarios) {
  test(`${scenario} repeatedly delivers the same data and nested identities`, async () => {
    await fixture(async (api) => {
      const result = await api.run(scenario);
      const deliveries = api.deliveries as Delivery[];
      expect(api.updates()).toBe(setupDeliveries(scenario) + 35);
      expect(result.scenario).toBe(scenario);
      expect(result.samplesMs).toHaveLength(30);
      expect(result.deliveryToCommitSamplesMs).toHaveLength(30);
      expect(result.renderedRows).toBe(40);
      for (const delivery of deliveries) {
        expect(delivery.data).toBe(deliveries[0].data);
        expect(delivery.recipes).toBe(deliveries[0].recipes);
        expect(delivery.craftability).toBe(deliveries[0].craftability);
        expect(delivery.firstRecipe).toBe(deliveries[0].firstRecipe);
        expect(Object.keys(delivery.recipes)).toHaveLength(1282);
      }
      if (scenario !== 'catalog') {
        expect(api.clicks()).toBe(1);
        expect(result.mutationPattern).toBe(
          'toggle-selected-material-flag-each-iteration',
        );
        expect(result.selectedRecipe.onPage).toBe(
          scenario === 'selected-first',
        );
        for (const [iteration, delivery] of deliveries
          .slice(setupDeliveries(scenario))
          .entries()) {
          expect(delivery.flags[result.selectedRecipe.name]).toBe(
            iteration % 2,
          );
          expect(
            Object.entries(delivery.flags).filter(
              ([name, flag]) =>
                name !== result.selectedRecipe.name && flag !== 1,
            ),
          ).toEqual([]);
        }
      }
    });
  });

  test(`${scenario} excludes all setup commits, awaits measured commits and preserves raw outliers`, async () => {
    await fixture(async (api, _host, hooks) => {
      let clock = 0;
      const reads: number[] = [];
      const now = Object.getOwnPropertyDescriptor(performance, 'now');
      Object.defineProperty(performance, 'now', {
        configurable: true,
        value: () => {
          reads.push(clock);
          return clock;
        },
      });
      const setups = setupDeliveries(scenario);
      hooks.beforeCommit = async (delivery) => {
        await Promise.resolve();
        // Large setup delays must never leak into a recorded sample.
        clock += delivery <= setups ? 1000 : delivery === setups + 9 ? 103 : 3;
      };
      hooks.afterCommit = (delivery) => {
        // Happy DOM may read performance.now() for the real click's timestamp.
        // Discard those untimed setup reads, not any benchmark samples.
        if (delivery === setups) reads.length = 0;
      };
      globalThis.requestAnimationFrame = (callback) => {
        queueMicrotask(() => {
          clock += 10;
          callback(clock);
        });
        return 1;
      };
      try {
        const result = await api.run(scenario);
        const expected = Array(30).fill(3);
        expected[3] = 103;
        expect(result.deliveryToCommitSamplesMs).toEqual(expected);
        expect(result.samplesMs).toEqual(expected.map((value) => value + 20));
        expect(reads).toHaveLength(105);
        expect(reads[0]).toBe(setups * 1000);
        expect(result.scope).toContain('not CPU');
      } finally {
        restoreProperty(performance, 'now', now);
      }
    });
  });

  test(`${scenario} rejects search and extra rows introduced during measured commits`, async () => {
    for (const fault of ['search', 'rows']) {
      await fixture(async (api, _host, hooks) => {
        hooks.afterCommit = (delivery, host) => {
          if (delivery !== setupDeliveries(scenario) + 8) return;
          if (fault === 'search') {
            host.querySelector('input')!.value = 'filtered';
          } else {
            const row = document.createElement('button');
            row.className = 'Workbench__recipe';
            host.append(row);
          }
        };
        await expect(api.run(scenario)).rejects.toThrow('Reload');
      });
    }
  });
}

test('off-page setup retains slot/path identity, migrates its flag and keeps exactly forty other rows', async () => {
  await fixture(async (api, host) => {
    const result = await api.run('selected-off-page');
    const deliveries = api.deliveries as Delivery[];
    const selectedName = result.selectedRecipe.name;
    expect(deliveries[0].firstName).toBe('Recipe 0000');
    expect(deliveries[1].firstName).toBe('Recipe 0000');
    for (const delivery of deliveries.slice(2)) {
      expect(delivery.firstName).toBe(selectedName);
      expect(delivery.firstPath).toBe('/benchmark/recipe/0');
      expect(delivery.flags).not.toHaveProperty('Recipe 0000');
      expect(Object.keys(delivery.flags)).toHaveLength(1282);
    }
    expect(deliveries[2].flags[selectedName]).toBe(1);
    expect(result.selectedRecipe.sourceSlot).toBe('0');
    expect(result.selectedRecipe.path).toBe('/benchmark/recipe/0');
    expect(host.querySelector('.Workbench__folio-title')!.textContent).toBe(
      selectedName,
    );
    const names = [...host.querySelectorAll('.Workbench__recipe-name')].map(
      (name) => name.textContent,
    );
    expect(names).toHaveLength(40);
    expect(names[0]).toBe('Recipe 0001');
    expect(names[39]).toBe('Recipe 0040');
    expect(names).not.toContain(selectedName);
    expect(host.querySelector('[aria-expanded="true"]')).toBeNull();
  });
});

for (const scenario of ['selected-first', 'selected-off-page'] as const) {
  test(`${scenario} rejects folio, detail flag and expanded-row invalidation during samples`, async () => {
    for (const fault of ['title', 'material', 'position']) {
      await fixture(async (api, _host, hooks) => {
        hooks.afterCommit = (delivery, host) => {
          if (delivery !== setupDeliveries(scenario) + 8) return;
          if (fault === 'title') {
            host.querySelector('.Workbench__folio-title')!.textContent =
              'Wrong recipe';
          }
          if (fault === 'material') {
            host.querySelector('.Workbench__folio-match')!.textContent =
              'Stale detail flag';
          }
          if (fault === 'position') {
            host
              .querySelector('.Workbench__recipe')!
              .setAttribute(
                'aria-expanded',
                String(scenario !== 'selected-first'),
              );
          }
        };
        await expect(api.run(scenario)).rejects.toThrow('selection');
      });
    }
  });
}

test('catalog rejects selection introduced during a sample', async () => {
  await fixture(async (api, _host, hooks) => {
    hooks.afterCommit = (delivery, host) => {
      if (delivery === 9) {
        const title = document.createElement('h2');
        title.className = 'Workbench__folio-title';
        host.append(title);
      }
    };
    await expect(api.run()).rejects.toThrow('selection');
  });
});

test('harness rejects prior search and permits a corrected rerun', async () => {
  await fixture(async (api, host) => {
    host.querySelector('input')!.value = 'filtered';
    await expect(api.run()).rejects.toThrow('Reload');
    host.querySelector('input')!.value = '';
    expect((await api.run()).samplesMs).toHaveLength(30);
  });
});

test('harness rejects expanded pagination and prior selected folios for every scenario', async () => {
  await fixture(async (api, host) => {
    const extra = document.createElement('button');
    extra.className = 'Workbench__recipe';
    host.append(extra);
    for (const scenario of scenarios) {
      await expect(api.run(scenario)).rejects.toThrow('Reload');
    }
    extra.remove();
    const title = document.createElement('h2');
    title.className = 'Workbench__folio-title';
    host.append(title);
    for (const scenario of scenarios) {
      await expect(api.run(scenario)).rejects.toThrow('selection');
    }
  });
});

test('harness rejects unknown scenarios without delivery', async () => {
  await fixture(async (api) => {
    await expect(api.run('selected-last')).rejects.toThrow('Unknown');
    expect(api.updates()).toBe(0);
  });
});

test('harness rejects concurrent runs during selected setup and recovers after completion', async () => {
  await fixture(async (api, _host, hooks) => {
    let release: () => void;
    hooks.beforeCommit = (delivery) =>
      delivery === 2
        ? new Promise((resolve) => {
            release = resolve;
          })
        : Promise.resolve();
    const first = api.run('selected-first');
    for (let i = 0; i < 100 && api.updates() < 2; i++) await Promise.resolve();
    expect(api.updates()).toBe(2);
    await expect(api.run()).rejects.toThrow('already running');
    release!();
    await first;
    // Completion must clear the concurrent-run guard, but not erase selection.
    await expect(api.run()).rejects.toThrow('selection');
  });
});

test('harness rejects terminal unmount, detached DOM and later updates', async () => {
  await fixture(async (api, host) => {
    host.remove();
    await expect(api.run()).rejects.toThrow('mounted');
    document.body.append(host);
    await api.demo.unmount();
    await expect(api.run()).rejects.toThrow('mounted');
    await expect(api.demo.update({})).rejects.toThrow('unmounted');
  });
});

for (const restoreVisible of [false, true]) {
  test(`harness aborts a hidden frame transition (restored=${restoreVisible})`, async () => {
    await fixture(async (api) => {
      globalThis.requestAnimationFrame = (callback) => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));
        if (restoreVisible) {
          Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
          });
          document.dispatchEvent(new Event('visibilitychange'));
        }
        queueMicrotask(() => callback(0));
        return 1;
      };
      await expect(api.run()).rejects.toThrow('visible');
    });
  });
}

test('visible selector defaults to catalog, runs the selected scenario, and tears down with its results', async () => {
  await fixture(async (api) => {
    const button = document.querySelector<HTMLButtonElement>(
      '.demo-benchmark button',
    )!;
    const select = document.querySelector<HTMLSelectElement>(
      '.demo-benchmark select',
    )!;
    const output = document.querySelector('.demo-benchmark pre')!;
    expect(api.updates()).toBe(0);
    expect(select.value).toBe('catalog');
    expect([...select.options].map((option) => option.value)).toEqual(
      scenarios,
    );
    select.value = 'selected-off-page';
    button.click();
    expect(button.disabled).toBe(true);
    expect(select.disabled).toBe(true);
    expect(output.textContent).toBe('Running…');
    await waitForControls(button);
    expect(select.disabled).toBe(false);
    const result = JSON.parse(output.textContent!);
    expect(result.scenario).toBe('selected-off-page');
    expect(result.samplesMs).toHaveLength(30);
    await api.demo.unmount();
    expect(document.querySelector('.demo-benchmark')).toBeNull();
  }, true);
});

test('programmatic runs disable both visible controls and cleanup after rejection permits retry', async () => {
  await fixture(async (api, host) => {
    const button = document.querySelector<HTMLButtonElement>(
      '.demo-benchmark button',
    )!;
    const select = document.querySelector<HTMLSelectElement>(
      '.demo-benchmark select',
    )!;
    host.querySelector('input')!.value = 'not neutral';
    const rejected = api.run();
    expect(button.disabled).toBe(true);
    expect(select.disabled).toBe(true);
    await expect(rejected).rejects.toThrow('Reload');
    expect(button.disabled).toBe(false);
    expect(select.disabled).toBe(false);
    button.click();
    await waitForControls(button);
    expect(
      document.querySelector('.demo-benchmark pre')!.textContent,
    ).toContain('Benchmark rejected:');
    host.querySelector('input')!.value = '';
    button.click();
    await waitForControls(button);
    expect(select.disabled).toBe(false);
    expect(
      JSON.parse(document.querySelector('.demo-benchmark pre')!.textContent!)
        .scenario,
    ).toBe('catalog');
  }, true);
});

test('unmount during a sample removes controls and rejects rather than returning partial results', async () => {
  await fixture(async (api) => {
    globalThis.requestAnimationFrame = (callback) => {
      queueMicrotask(async () => {
        await api.demo.unmount();
        callback(0);
      });
      return 1;
    };
    await expect(api.run('selected-first')).rejects.toThrow('mounted');
    expect(document.querySelector('.demo-benchmark')).toBeNull();
  }, true);
});

test('selected setup rejects an uncommitted click before any timed frames', async () => {
  await fixture(async (api, _host, hooks) => {
    let frames = 0;
    globalThis.requestAnimationFrame = (callback) => {
      frames++;
      queueMicrotask(() => callback(0));
      return 1;
    };
    hooks.afterCommit = (delivery, host) => {
      if (delivery === 1) {
        // A disabled rendered control does not dispatch its click handler.
        host.querySelector<HTMLButtonElement>('.Workbench__recipe')!.disabled =
          true;
      }
    };
    await expect(api.run('selected-first')).rejects.toThrow('selection');
    expect(api.clicks()).toBe(0);
    expect(api.updates()).toBe(2);
    expect(frames).toBe(0);
  });
});

test('visibility listener and controls are restored after an adapter failure', async () => {
  await fixture(async (api, _host, hooks) => {
    const add = document.addEventListener;
    const remove = document.removeEventListener;
    const listeners = new Set<unknown>();
    document.addEventListener = ((
      type: string,
      listener: any,
      options: any,
    ) => {
      if (type === 'visibilitychange') listeners.add(listener);
      add.call(document, type, listener, options);
    }) as typeof add;
    document.removeEventListener = ((
      type: string,
      listener: any,
      options: any,
    ) => {
      if (type === 'visibilitychange') listeners.delete(listener);
      remove.call(document, type, listener, options);
    }) as typeof remove;
    const button = document.querySelector<HTMLButtonElement>(
      '.demo-benchmark button',
    )!;
    const select = document.querySelector<HTMLSelectElement>(
      '.demo-benchmark select',
    )!;
    hooks.beforeCommit = async (delivery) => {
      if (delivery === 8) throw new Error('Synthetic adapter failure');
    };
    try {
      await expect(api.run()).rejects.toThrow('Synthetic adapter failure');
      expect(listeners.size).toBe(0);
      expect(button.disabled).toBe(false);
      expect(select.disabled).toBe(false);
      hooks.beforeCommit = undefined;
      expect((await api.run()).samplesMs).toHaveLength(30);
      expect(listeners.size).toBe(0);
    } finally {
      document.addEventListener = add;
      document.removeEventListener = remove;
    }
  }, true);
});
