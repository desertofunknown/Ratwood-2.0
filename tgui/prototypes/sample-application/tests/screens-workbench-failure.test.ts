import { afterAll, expect, test } from 'bun:test';
import { join } from 'node:path';

import type { WorkbenchData } from '../../crafting-workbench/model';
import type { ScreenLifecycle, ScreenSession } from '../contracts';
import { disposeFailedView } from '../screens/mount-lifetime';

// Compile the actual adapter against a tiny test runtime. This isolates only
// mount/flush/disposal failures, not Svelte rendering or emitted app execution.
const result = await Bun.build({
  entrypoints: [
    join(import.meta.dir, '../../crafting-workbench/svelte/adapter.ts'),
  ],
  target: 'bun',
  format: 'esm',
  plugins: [
    {
      name: 'workbench-mount-failure-test-runtime',
      setup(build) {
        build.onResolve({ filter: /^svelte$/ }, () => ({
          path: 'runtime',
          namespace: 'mount-failure',
        }));
        build.onResolve({ filter: /Delivery\.svelte$/ }, () => ({
          path: 'component',
          namespace: 'mount-failure',
        }));
        build.onLoad(
          { filter: /.*/, namespace: 'mount-failure' },
          ({ path }) => ({
            loader: 'js',
            contents:
              path === 'component'
                ? 'export default {};'
                : `
          export const mount = (...args) => globalThis.__sampleMountFailureRuntime.mount(...args);
          export const flushSync = () => globalThis.__sampleMountFailureRuntime.flush();
          export const unmount = (...args) => globalThis.__sampleMountFailureRuntime.unmount(...args);
        `,
          }),
        );
      },
    },
  ],
});
if (!result.success) throw Error(result.logs.map(String).join('\n'));
const artifact = join(import.meta.dir, '../.test-build/workbench-failure.mjs');
await Bun.write(artifact, result.outputs[0]);
const { mountWorkbench } = (await import(
  artifact
)) as typeof import('../../crafting-workbench/svelte/adapter');
type Runtime = {
  mount(): { update(): void };
  flush(): void;
  unmount(): Promise<void>;
};
const runtimeHost = globalThis as typeof globalThis & {
  __sampleMountFailureRuntime?: Runtime;
};
const originalRuntime = runtimeHost.__sampleMountFailureRuntime;
afterAll(() => {
  if (originalRuntime)
    runtimeHost.__sampleMountFailureRuntime = originalRuntime;
  else delete runtimeHost.__sampleMountFailureRuntime;
});
const data = {} as WorkbenchData;

test('workbench partial flush failure detaches and retires before its exact tracked cleanup', async () => {
  const order: string[] = [];
  const pending: Promise<unknown>[] = [];
  let release!: () => void;
  const disposal = new Promise<void>((resolve) => {
    release = resolve;
  });
  const failure = new Error('flush failed');
  runtimeHost.__sampleMountFailureRuntime = {
    mount: () => ({ update() {} }),
    flush: () => {
      throw failure;
    },
    unmount: () => {
      order.push('unmount');
      return disposal;
    },
  };
  const target = {
    remove: () => order.push('detach'),
  } as unknown as HTMLElement;
  const session = {
    retire: () => order.push('retire'),
  } as unknown as ScreenSession;
  const lifecycle: ScreenLifecycle = {
    mounted() {},
    unmounted() {},
    error() {},
    pending: (promise) => {
      pending.push(promise);
    },
  };
  expect(() =>
    mountWorkbench(
      target,
      data,
      () => {},
      (dispose) => {
        disposeFailedView(target, session, lifecycle, dispose);
        expect(dispose()).toBe(disposal);
      },
    ),
  ).toThrow(failure);
  expect(order).toEqual(['detach', 'retire', 'unmount']);
  expect(pending).toEqual([disposal]);
  release();
  await pending[0];
});

for (const observer of ['missing', 'forgets', 'throws'] as const) {
  test(`workbench ${observer} cleanup observer cannot abandon or double-destroy its instance`, async () => {
    const failure = new Error('original flush failure');
    const cleanupFailure = new Error('cleanup failed distinctly');
    const observerFailure = new Error('observer failed distinctly');
    let destroyed = 0;
    const messages: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args) => {
      messages.push(args);
    };
    runtimeHost.__sampleMountFailureRuntime = {
      mount: () => ({ update() {} }),
      flush: () => {
        throw failure;
      },
      unmount: () => {
        destroyed++;
        return Promise.reject(cleanupFailure);
      },
    };
    try {
      expect(() =>
        mountWorkbench(
          {} as HTMLElement,
          data,
          () => {},
          observer === 'missing'
            ? undefined
            : observer === 'forgets'
              ? () => {}
              : (dispose) => {
                  dispose();
                  dispose();
                  throw observerFailure;
                },
        ),
      ).toThrow(failure);
      await Promise.resolve();
      expect(destroyed).toBe(1);
      expect(messages.some((message) => message[1] === cleanupFailure)).toBe(
        true,
      );
      expect(messages.some((message) => message[1] === observerFailure)).toBe(
        observer === 'throws',
      );
    } finally {
      console.error = originalError;
    }
  });
}

test('workbench successful three-argument API is unchanged', async () => {
  let updates = 0;
  let destroyed = 0;
  runtimeHost.__sampleMountFailureRuntime = {
    mount: () => ({
      update: () => {
        updates++;
      },
    }),
    flush() {},
    unmount: () => {
      destroyed++;
      return Promise.resolve();
    },
  };
  const view = mountWorkbench({} as HTMLElement, data, () => {});
  view.update(data);
  await view.unmount();
  expect(updates).toBe(1);
  expect(destroyed).toBe(1);
});
