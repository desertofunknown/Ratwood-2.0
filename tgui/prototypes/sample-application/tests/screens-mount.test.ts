import { expect, test } from 'bun:test';

import type { ScreenLifecycle, ScreenSession } from '../contracts';
import { mountOwnedView } from '../screens/mount-lifetime';

function setup() {
  const order: string[] = [];
  const pending: Promise<unknown>[] = [];
  const errors: unknown[] = [];
  const session = {
    retire: () => order.push('retire'),
  } as unknown as ScreenSession;
  const lifecycle: ScreenLifecycle = {
    mounted() {},
    unmounted() {},
    pending: (promise) => {
      pending.push(promise);
    },
    error: (error) => {
      errors.push(error);
    },
  };
  const target = {
    remove: () => order.push('detach'),
  } as unknown as HTMLElement;
  return { order, pending, errors, session, lifecycle, target };
}

test('post-mount flush failure retires and tracks the actual delayed disposal', async () => {
  const env = setup();
  const instance = {};
  const failure = new Error('injected post-mount flush failure');
  let release!: () => void;
  const disposal = new Promise<void>((resolve) => {
    release = resolve;
  });
  expect(() =>
    mountOwnedView(
      env.target,
      env.session,
      env.lifecycle,
      () => {
        env.order.push('mount');
        return instance;
      },
      () => {
        env.order.push('flush');
        throw failure;
      },
      (mounted) => {
        expect(mounted).toBe(instance);
        env.order.push('unmount');
        return disposal;
      },
    ),
  ).toThrow(failure);
  expect(env.order).toEqual(['mount', 'flush', 'detach', 'retire', 'unmount']);
  expect(env.pending).toEqual([disposal]);
  let settled = false;
  env.pending[0].then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  release();
  await env.pending[0];
  expect(settled).toBe(true);
});

test('flush failure retains disposal rejection separately from original error', async () => {
  const env = setup();
  const flushFailure = new Error('flush failed');
  const disposalFailure = new Error('unmount failed');
  expect(() =>
    mountOwnedView(
      env.target,
      env.session,
      env.lifecycle,
      () => ({}),
      () => {
        throw flushFailure;
      },
      () => {
        throw disposalFailure;
      },
    ),
  ).toThrow(flushFailure);
  expect(env.pending).toHaveLength(1);
  await expect(env.pending[0]).rejects.toBe(disposalFailure);
});

test('successful mount returns an idempotent real disposal promise', async () => {
  const env = setup();
  let destroyed = 0;
  const disposal = Promise.resolve();
  const view = mountOwnedView(
    env.target,
    env.session,
    env.lifecycle,
    () => ({}),
    () => {},
    () => {
      destroyed++;
      return disposal;
    },
  );
  expect(view.unmount()).toBe(disposal);
  expect(view.unmount()).toBe(disposal);
  await disposal;
  expect(destroyed).toBe(1);
  expect(env.pending).toEqual([]);
});

test('mount failure still detaches and retires without inventing a disposal handle', () => {
  const env = setup();
  const failure = new Error('mount failed before returning');
  expect(() =>
    mountOwnedView(
      env.target,
      env.session,
      env.lifecycle,
      () => {
        throw failure;
      },
      () => env.order.push('flush'),
      () => {
        env.order.push('unmount');
        return Promise.resolve();
      },
    ),
  ).toThrow(failure);
  expect(env.order).toEqual(['detach', 'retire']);
  expect(env.pending).toEqual([]);
});
