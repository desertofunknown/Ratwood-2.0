import './network-guard';

import { expect, test } from 'bun:test';
import React from 'react';
import { flushSync as reactFlush } from 'react-dom';
import { createRoot } from 'react-dom/client';

import {
  flushSync,
  mount,
  unmount,
} from '../crafting-workbench/svelte/node_modules/svelte/src/index-client.js';
import { networkAttempts } from './network-guard';
import { ReactView } from './ReactView';
import { assertDisconnected, sampleController } from './sample';
import SvelteView from './SvelteView.svelte';
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  flushSync();
  reactFlush(() => {});
};
async function run(arm: 'react' | 'svelte') {
  const host = document.createElement('div');
  document.body.append(host);
  const { controller } = sampleController('success');
  let dispose: () => void;
  if (arm === 'react') {
    const root = createRoot(host);
    reactFlush(() => root.render(<ReactView controller={controller} />));
    dispose = () => reactFlush(() => root.unmount());
  } else {
    const instance = mount(SvelteView, { target: host, props: { controller } });
    flushSync();
    dispose = () => {
      void unmount(instance);
      flushSync();
    };
  }
  await settle();
  const get = (label: string) =>
    host.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
  const snapshot = () => ({
    summary: host.querySelector('[role=status]')?.textContent,
    days: [...host.querySelectorAll('h2')].map((n) => n.textContent),
    descriptions: [
      ...host.querySelectorAll('.ChangesArchive__description'),
    ].map((n) => n.textContent),
    authors: [...host.querySelectorAll('.ChangesArchive__day h3')].map(
      (n) => n.textContent,
    ),
    credits: host.querySelector('.Changelog__credits')?.textContent,
    hrefs: [...host.querySelectorAll('.Changelog__credits a')].map((a) =>
      a.getAttribute('href'),
    ),
  });
  const snapshots = [snapshot()];
  const input = get('Search this month');
  input.focus();
  input.value = 'true';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  snapshots.push(snapshot());
  expect(snapshot().descriptions).toEqual(['']);
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );
  expect(document.activeElement).not.toBe(input);
  input.focus();
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  expect(document.activeElement).not.toBe(input);
  get('Clear search').click();
  await settle();
  expect(input.value).toBe('');
  expect(document.activeElement).toBe(input);
  input.value = 'lantern';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  const entries = host.querySelector('.ChangesArchive__entries')!;
  entries.scrollTop = 100;
  get('Older month').click();
  await settle();
  expect(input.value).toBe('lantern');
  expect(entries.scrollTop).toBe(0);
  snapshots.push(snapshot());
  get('Newer month').click();
  await settle();
  snapshots.push(snapshot());
  expect(snapshot().descriptions).toHaveLength(2);
  dispose();
  host.remove();
  return snapshots;
}
test('mounted React/Svelte shared view, input, credits and duplicate/scalar parity', async () => {
  expect(await run('svelte')).toEqual(await run('react'));
});
test('native globals fail closed, including properties present with undefined values', () => {
  expect(() => assertDisconnected({ Byond: undefined })).toThrow();
  expect(() => assertDisconnected({ hubStorage: {} })).toThrow();
});

import { createController } from './model';
for (const arm of ['react', 'svelte'] as const) {
  test(`${arm}: terminal retry retains query, credits in loading/failure/empty, unmount cancels`, async () => {
    const timers = new Map<number, TimerCallback>();
    let next = 0,
      attempts = 0;
    const controller = createController({
      dates: ['2026-10'],
      action() {
        attempts++;
      },
      resolveAsset: (name) => name,
      fetch: async () => ({ text: async () => 'Cannot find sample' }),
      schedule(fn) {
        timers.set(++next, fn);
        return next;
      },
      cancel(id) {
        timers.delete(id as number);
      },
    });
    const host = document.createElement('div');
    document.body.append(host);
    let dispose: () => void;
    if (arm === 'react') {
      const root = createRoot(host);
      reactFlush(() => root.render(<ReactView controller={controller} />));
      dispose = () => reactFlush(() => root.unmount());
    } else {
      const instance = mount(SvelteView, {
        target: host,
        props: { controller },
      });
      flushSync();
      dispose = () => {
        void unmount(instance);
        flushSync();
      };
    }
    await settle();
    const input = host.querySelector('input')!;
    input.value = 'preserved';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(host.querySelector('.Changelog__credits')).not.toBeNull();
    while (timers.size) {
      const [id, fn] = [...timers][0];
      timers.delete(id);
      fn();
      await settle();
    }
    expect(attempts).toBe(6);
    expect(input.value).toBe('preserved');
    expect(host.querySelector('.Changelog__credits')).not.toBeNull();
    const retry = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Retry this month',
    )!;
    expect(retry).toBeDefined();
    retry.click();
    await settle();
    expect(attempts).toBe(7);
    expect(input.value).toBe('preserved');
    expect(controller.snapshot().data).toStartWith('Loading changelog');
    const staleTimer = [...timers.values()][0];
    dispose();
    expect(timers.size).toBe(0);
    staleTimer();
    await settle();
    expect(attempts).toBe(7);
    host.remove();
    const emptyHost = document.createElement('div');
    document.body.append(emptyHost);
    const empty = sampleController('empty').controller;
    if (arm === 'react') {
      const root = createRoot(emptyHost);
      reactFlush(() => root.render(<ReactView controller={empty} />));
      dispose = () => reactFlush(() => root.unmount());
    } else {
      const instance = mount(SvelteView, {
        target: emptyHost,
        props: { controller: empty },
      });
      flushSync();
      dispose = () => {
        void unmount(instance);
        flushSync();
      };
    }
    await settle();
    expect(
      emptyHost.querySelector('.ChangesArchive__status')?.textContent,
    ).toBe('No changelog archives are available.');
    expect(emptyHost.querySelector('.Changelog__credits')).not.toBeNull();
    expect(emptyHost.querySelector('select')).toBeNull();
    dispose();
    emptyHost.remove();
  });
}

test('mounted checks made no network or worker requests', () => {
  expect(networkAttempts()).toBe(0);
});

type TimerCallback = () => void;
