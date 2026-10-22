import { expect, test } from 'bun:test';

import { installBenchmark } from './browser-harness';

async function fixture(
  run: (api: any, host: HTMLElement) => Promise<void>,
  controls = false,
) {
  const host = document.createElement('div');
  host.innerHTML =
    '<div class="Workbench"><input type="search">' +
    '<button class="Workbench__recipe"></button>'.repeat(40) +
    '</div>';
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
  installBenchmark(
    {
      actions: [],
      async update() {
        updates++;
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
      },
      host,
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

test('harness records only thirty warmed samples from neutral mounted state', async () => {
  await fixture(async (api) => {
    const result = await api.run();
    expect(result.samplesMs).toHaveLength(30);
    expect(result.deliveryToCommitSamplesMs).toHaveLength(30);
    expect(result.renderedRows).toBe(40);
    expect(api.updates()).toBe(36);
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

test('harness rejects expanded pagination and selected folios', async () => {
  await fixture(async (api, host) => {
    const extra = document.createElement('button');
    extra.className = 'Workbench__recipe';
    host.append(extra);
    await expect(api.run()).rejects.toThrow('Reload');
    extra.remove();
    const title = document.createElement('h2');
    title.className = 'Workbench__folio-title';
    host.append(title);
    await expect(api.run()).rejects.toThrow('Reload');
  });
});

test('harness rejects concurrent runs', async () => {
  await fixture(async (api) => {
    const first = api.run();
    await expect(api.run()).rejects.toThrow('already running');
    await first;
  });
});

test('harness rejects terminal unmount and later updates', async () => {
  await fixture(async (api) => {
    await api.demo.unmount();
    await expect(api.run()).rejects.toThrow('mounted');
    await expect(api.demo.update({})).rejects.toThrow('unmounted');
  });
});

test('harness aborts when document becomes hidden during frames', async () => {
  await fixture(async (api) => {
    globalThis.requestAnimationFrame = (callback) => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });
      queueMicrotask(() => callback(0));
      return 1;
    };
    await expect(api.run()).rejects.toThrow('visible');
  });
});

test('harness rejects a hidden transition even after visibility is restored', async () => {
  await fixture(async (api) => {
    globalThis.requestAnimationFrame = (callback) => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      queueMicrotask(() => callback(0));
      return 1;
    };
    await expect(api.run()).rejects.toThrow('visible');
  });
});

test('visible control runs the same harness and displays raw JSON without automatic execution', async () => {
  await fixture(async (api) => {
    const button = document.querySelector<HTMLButtonElement>(
      '.demo-benchmark button',
    )!;
    const output = document.querySelector('.demo-benchmark pre')!;
    expect(api.updates()).toBe(0);
    button.click();
    expect(button.disabled).toBe(true);
    for (let i = 0; i < 300 && button.disabled; i++) await Promise.resolve();
    expect(button.disabled).toBe(false);
    expect(JSON.parse(output.textContent!).samplesMs).toHaveLength(30);
    await api.demo.unmount();
    expect(document.querySelector('.demo-benchmark')).toBeNull();
  }, true);
});

test('visible control reports rejected runs and permits retry', async () => {
  await fixture(async (_, host) => {
    const button = document.querySelector<HTMLButtonElement>(
      '.demo-benchmark button',
    )!;
    host.querySelector('input')!.value = 'not neutral';
    button.click();
    for (let i = 0; i < 300 && button.disabled; i++) await Promise.resolve();
    expect(button.disabled).toBe(false);
    expect(
      document.querySelector('.demo-benchmark pre')!.textContent,
    ).toContain('Benchmark rejected:');
  }, true);
});

test('delivery-to-commit timing awaits the adapter but excludes frame waits', async () => {
  await fixture(async (api) => {
    let clock = 0;
    const now = Object.getOwnPropertyDescriptor(performance, 'now');
    Object.defineProperty(performance, 'now', {
      configurable: true,
      value: () => clock,
    });
    globalThis.requestAnimationFrame = (callback) => {
      queueMicrotask(() => {
        clock += 10;
        callback(clock);
      });
      return 1;
    };
    const update = api.demo.update;
    api.demo.update = async (data: unknown) => {
      await update(data);
      await Promise.resolve();
      clock += 3;
    };
    try {
      const result = await api.run();
      expect(result.deliveryToCommitSamplesMs).toEqual(Array(30).fill(3));
      expect(result.samplesMs).toEqual(Array(30).fill(23));
      expect(result.scope).toContain('not CPU');
    } finally {
      if (now) Object.defineProperty(performance, 'now', now);
      else delete (performance as any).now;
    }
  });
});
