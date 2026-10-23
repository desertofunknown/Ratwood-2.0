import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { plugins, repository } from '../build-options';
import {
  compareRendererSnapshots,
  runRendererFixtures,
} from './renderer-fixtures';

test('happyDOM historical differential: frozen baseline/candidate renderer HTML, highlights, types, order, storage, events', async () => {
  const temp = await mkdtemp('/tmp/chat-renderer-differential-');
  const results: unknown[] = [];
  const originalByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  const originalRenderer = (window as any).__chatRenderer__;
  const interval = globalThis.setInterval;
  const intervals: ReturnType<typeof setInterval>[] = [];
  // Track production constructor pruning timers solely for test cleanup.
  globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
    const id = interval(...args);
    intervals.push(id);
    return id;
  }) as typeof setInterval;
  const nativeCalls: unknown[] = [];
  Reflect.set(
    globalThis,
    'Byond',
    new Proxy(Object.create(null), {
      get(_target, key) {
        if (key === 'sendMessage') {
          return (payload: any) => {
            if (
              payload?.type !== 'log' ||
              payload.ns !== 'chatRenderer' ||
              typeof payload.message !== 'string'
            ) {
              throw new Error(
                'Differential test rejected non-log native message',
              );
            }
            nativeCalls.push({ ...payload });
          };
        }
        throw new Error(`Differential test rejected Byond.${String(key)}`);
      },
      set() {
        throw new Error('Differential test rejected native mutation');
      },
    }),
  );
  try {
    for (const variant of ['baseline', 'candidate'] as const) {
      const build = await Bun.build({
        entrypoints: [
          join(repository, 'tgui/packages/tgui-panel/chat/renderer.jsx'),
        ],
        outdir: join(temp, variant),
        target: 'browser',
        format: 'esm',
        define: { 'process.env.NODE_ENV': '"production"' },
        plugins: plugins(variant),
      });
      if (!build.success) throw new Error(build.logs.map(String).join('\n'));
      delete (window as any).__chatRenderer__;
      const { chatRenderer } = await import(build.outputs[0].path);
      results.push(await runRendererFixtures(chatRenderer));
    }
    expect(compareRendererSnapshots(results[0], results[1])).toBe(true);
    expect((results[0] as unknown[]).length).toBe(15);
    expect(
      nativeCalls.every(
        (call: any) => call.type === 'log' && call.ns === 'chatRenderer',
      ),
    ).toBe(true);
  } finally {
    for (const id of intervals) clearInterval(id);
    globalThis.setInterval = interval;
    (window as any).__chatRenderer__ = originalRenderer;
    if (originalByond) {
      Object.defineProperty(globalThis, 'Byond', originalByond);
    } else Reflect.deleteProperty(globalThis, 'Byond');
    await rm(temp, { recursive: true, force: true });
  }
}, 30000);
