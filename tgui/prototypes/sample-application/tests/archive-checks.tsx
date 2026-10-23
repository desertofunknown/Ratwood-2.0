import '../test-environment';
import '../../treasury-ledger/test-dom';

import { afterAll, expect, test } from 'bun:test';
import { useLayoutEffect } from 'react';
import { flushSync } from 'react-dom';

import credits from '../../changes-archive/credits.html' with { type: 'text' };
import { type Controller, loading, project } from '../../changes-archive/model';
import {
  sample,
  sampleController,
  type Scenario,
} from '../../changes-archive/sample';
import { boundary } from '../bootstrap';
import { createOwnedBoundary } from '../boundary';
import type { ScreenProps, ScreenRenderer } from '../contracts';
import { createFixture } from '../runtime';
import { ReactScreen } from '../screens/react';
import {
  createScreenSession,
  type OwnedScreenSession,
  type ScreenSessionOptions,
} from '../screens/session';
import { SvelteScreen } from '../screens/svelte';
import { networkGuard } from '../test-network-guard';
import {
  button,
  click,
  controlledClock,
  element,
  enter,
  navigate,
} from './integration-helpers';

// These are actual mounted shared-application screens in Happy DOM, not native
// BYOND, browser layout, assistive-technology, rendering/performance acceptance.
const arms = [
  ['React', ReactScreen],
  ['React-owned Svelte', SvelteScreen],
] as const;
type ArchiveSession = Extract<OwnedScreenSession, { route: 'archive' }>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const body = (text = JSON.stringify(sample)) => ({ text: async () => text });
const normalize = (text: string | null | undefined) =>
  (text ?? '').replace(/\s+/g, ' ').trim();
const label = <T extends HTMLElement = HTMLElement>(
  target: HTMLElement,
  name: string,
) => element<T>(target, `[aria-label="${name}"]`);

async function mountedArchive(
  Screen: ScreenRenderer,
  options: ScreenSessionOptions = {},
) {
  const target = document.createElement('div');
  document.body.append(target);
  const clock = controlledClock();
  const sessions: OwnedScreenSession[] = [];
  const expectedErrors: string[] = [];
  const fixture = createFixture(target, Screen, (route, context) => {
    const session = createScreenSession(route, context, {
      ...options,
      ...clock,
    });
    sessions.push(session);
    return session;
  });
  const current = () => {
    const session = fixture.sessionManager.snapshot().session;
    expect(session?.route).toBe('archive');
    return session as ArchiveSession;
  };
  const controller = () => current().snapshot().controller;
  const expectOneOwner = () => {
    expect(
      sessions.filter((session) => session.lease.isCurrent()),
    ).toHaveLength(1);
    expect(fixture.read().mounts - fixture.read().unmounts).toBe(1);
    expect(target.querySelectorAll('[data-sample-screen-target]')).toHaveLength(
      1,
    );
    expect(target.querySelectorAll('.Window')).toHaveLength(1);
    expect(fixture.read().nativeSubscriptionAttempts).toBe(0);
    expect(fixture.read().errors).toEqual(expectedErrors);
  };
  async function dispose() {
    try {
      await fixture.dispose();
      const state = fixture.read();
      expect(state.subscriptions).toBe(0);
      expect(state.pendingDisposals).toBe(0);
      expect(state.mounts).toBe(state.unmounts);
      expect(state.errors).toEqual(expectedErrors);
      expect(state.nativeSubscriptionAttempts).toBe(0);
      expect(clock.pending.size).toBe(0);
      expect(sessions.every((session) => !session.lease.isCurrent())).toBe(
        true,
      );
    } finally {
      target.remove();
    }
  }
  try {
    fixture.resume();
    await fixture.settle();
    await navigate(fixture, 'archive');
    expectOneOwner();
  } catch (error) {
    await dispose();
    throw error;
  }
  return {
    fixture,
    target,
    clock,
    sessions,
    expectedErrors,
    current,
    controller,
    expectOneOwner,
    dispose,
    async advance(milliseconds: number) {
      flushSync(() => clock.advance(milliseconds));
      await fixture.settle();
    },
    async scenario(value: Scenario) {
      const select = label<HTMLSelectElement>(
        target,
        'Archive sample scenario',
      );
      flushSync(() => {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await fixture.settle();
      expect(current().snapshot().scenario).toBe(value);
    },
  };
}

function expectCredits(target: HTMLElement) {
  const expected = document.createElement('div');
  expected.innerHTML = String(credits);
  const actual = element(target, '.Changelog__credits');
  expect(normalize(actual.textContent)).toBe(normalize(expected.textContent));
  expect(
    [...actual.querySelectorAll('a')].map((a) => a.getAttribute('href')),
  ).toEqual(
    [...expected.querySelectorAll('a')].map((a) => a.getAttribute('href')),
  );
}

function expectProjection(target: HTMLElement, controller: Controller) {
  const expected = project(controller.snapshot());
  expect(
    normalize(
      target.querySelector('.ChangesArchive [role="status"]')?.textContent,
    ),
  ).toBe(expected.summary ?? '');
  expect(
    [...target.querySelectorAll('.ChangesArchive__day h2')].map(
      (n) => n.textContent,
    ),
  ).toEqual(expected.days.map((day) => day.label));
  expect(
    [...target.querySelectorAll('.ChangesArchive__day h3')].map(
      (n) => n.textContent,
    ),
  ).toEqual(
    expected.days.flatMap((day) => day.authors.map((author) => author.name)),
  );
  expect(
    [...target.querySelectorAll('.ChangesArchive__description')].map(
      (n) => n.textContent,
    ),
  ).toEqual(
    expected.days.flatMap((day) =>
      day.authors.flatMap((author) => author.rows.map((row) => row.text)),
    ),
  );
  expectCredits(target);
}

for (const [name, Screen] of arms) {
  test(`${name}: mounted archive route keeps month/search/clear/count/scalar/credits parity (simulated DOM)`, async () => {
    const s = await mountedArchive(Screen);
    const { fixture, target } = s;
    try {
      const controller = s.controller();
      expect(document.activeElement).toBe(
        element(target, '.SampleApplication__heading'),
      );
      expect(element(target, '.SampleApplication__heading').textContent).toBe(
        'Changes / archive',
      );
      expect(
        label<HTMLSelectElement>(target, 'Archive month').selectedOptions[0]
          .textContent,
      ).toBe('October 2026');
      expect(label<HTMLButtonElement>(target, 'Newer month').disabled).toBe(
        true,
      );
      expect(label<HTMLButtonElement>(target, 'Older month').disabled).toBe(
        false,
      );
      expectProjection(target, controller);
      expect(
        target.querySelector('.ChangesArchive [role="status"]')?.textContent,
      ).toBe('9 of 9 changes');
      const descriptions = [
        ...target.querySelectorAll('.ChangesArchive__description'),
      ].map((n) => n.textContent);
      expect(
        descriptions.filter(
          (text) => text === 'A lantern now keeps its flame.',
        ),
      ).toHaveLength(2);
      expect(descriptions).toContain('0');
      const input = label<HTMLInputElement>(target, 'Search this month');
      for (const [query, count] of [
        ['  LANTERN  ', 2],
        ['true', 1],
        ['Sample Archivist', 3],
        ['not present', 0],
      ] as const) {
        await enter(fixture, input, query);
        expect(input.value).toBe(query);
        expect(
          target.querySelectorAll('.ChangesArchive__description'),
        ).toHaveLength(count);
        expectProjection(target, controller);
      }
      expect(
        target.querySelector('.ChangesArchive [role="status"]')?.textContent,
      ).toBe('0 of 9 changes. No changes match this search.');
      for (const key of ['Enter', 'Escape']) {
        input.focus();
        input.dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true }),
        );
        expect(document.activeElement).not.toBe(input);
      }
      await click(fixture, label(target, 'Clear search'));
      expect(input.value).toBe('');
      expect(document.activeElement).toBe(input);
      expect(label<HTMLButtonElement>(target, 'Clear search').disabled).toBe(
        true,
      );
      await enter(fixture, input, 'lantern');
      const entries = element(target, '.ChangesArchive__entries');
      entries.scrollTop = 100;
      await click(fixture, label(target, 'Older month'));
      expect(controller.snapshot().selectedIndex).toBe(1);
      expect(input.value).toBe('lantern');
      expect(entries.scrollTop).toBe(0);
      expectProjection(target, controller);
      expect(
        target.querySelector('.ChangesArchive [role="status"]')?.textContent,
      ).toBe('0 of 1 changes. No changes match this search.');
      expect(label<HTMLButtonElement>(target, 'Older month').disabled).toBe(
        true,
      );
      await click(fixture, label(target, 'Newer month'));
      expectProjection(target, controller);
      expect(
        target.querySelectorAll('.ChangesArchive__description'),
      ).toHaveLength(2);
      const select = label<HTMLSelectElement>(target, 'Archive month');
      flushSync(() => {
        select.value = '1';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await fixture.settle();
      expect(controller.snapshot().selectedIndex).toBe(1);
      expectProjection(target, controller);
      expect(networkGuard.attempted).toBe(0);
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: same archive route is a no-op; leaving resets month/query and keeps one lease/subscription set`, async () => {
    const s = await mountedArchive(Screen);
    const { fixture, target } = s;
    try {
      const old = s.current();
      const controller = s.controller();
      const input = label<HTMLInputElement>(target, 'Search this month');
      await enter(fixture, input, 'older visit');
      await click(fixture, label(target, 'Older month'));
      input.focus();
      const state = fixture.read();
      const screen = element(target, '.ChangesArchive');
      const host = element(target, '.Window');
      const calls = fixture.endpoint.totalRecordedCalls;
      expect(fixture.navigate('archive')).toBe(false);
      await fixture.settle();
      expect(s.current()).toBe(old);
      expect(s.controller()).toBe(controller);
      expect(element(target, '.ChangesArchive')).toBe(screen);
      expect(document.activeElement).toBe(input);
      expect(fixture.read().screenEpoch).toBe(state.screenEpoch);
      for (let visit = 0; visit < 5; visit++) {
        await navigate(fixture, 'workbench');
        expect(old.lease.isCurrent()).toBe(false);
        await navigate(fixture, 'archive');
        expect(s.current()).not.toBe(old);
        expect(s.controller().snapshot().query).toBe('');
        expect(s.controller().snapshot().selectedIndex).toBe(0);
        expect(document.activeElement).toBe(
          element(target, '.SampleApplication__heading'),
        );
        expect(element(target, '.Window')).toBe(host);
        expect(fixture.read().hostEpoch).toBe(state.hostEpoch);
        expect(fixture.read().subscriptions).toBe(state.subscriptions);
        s.expectOneOwner();
      }
      expect(fixture.endpoint.totalRecordedCalls).toBe(calls);
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: mounted retry/failure/empty controls keep credits and retire replaced archive controllers`, async () => {
    const s = await mountedArchive(Screen);
    const { fixture, target } = s;
    try {
      await s.scenario('failure');
      const failed = s.controller();
      await enter(
        fixture,
        label<HTMLInputElement>(target, 'Search this month'),
        'preserved',
      );
      expectCredits(target);
      for (const delay of [100, 150, 200, 250, 300, 350]) {
        await s.advance(delay);
      }
      expect(failed.snapshot().data).toBe(
        'Failed to load data after 6 attempts',
      );
      expectCredits(target);
      expect(label<HTMLInputElement>(target, 'Search this month').value).toBe(
        'preserved',
      );
      expect(s.clock.pending.size).toBe(0);
      await click(fixture, button(target, 'Retry this month'));
      expect(failed.snapshot().data).toStartWith('Loading changelog data');
      expect(label<HTMLInputElement>(target, 'Search this month').value).toBe(
        'preserved',
      );
      expect(s.clock.pending.size).toBe(1);
      const staleTimers = [...s.clock.callbacks];
      await s.scenario('empty');
      const empty = s.controller();
      expect(empty).not.toBe(failed);
      expect(empty.snapshot().data).toBe(
        'No changelog archives are available.',
      );
      expect(target.querySelector('[aria-label="Archive month"]')).toBeNull();
      expectCredits(target);
      expect(s.clock.pending.size).toBe(0);
      const previous = failed.snapshot();
      flushSync(() => {
        staleTimers.forEach((callback) => callback());
        failed.mount();
        failed.select(0);
        failed.query('retired sample cannot mutate');
      });
      await fixture.settle();
      expect(failed.snapshot()).toBe(previous);
      expect(s.controller()).toBe(empty);
      expect(s.clock.pending.size).toBe(0);
      await s.scenario('retry');
      const retry = s.controller();
      expect(typeof retry.snapshot().data).toBe('string');
      await s.advance(100);
      expect(typeof retry.snapshot().data).toBe('string');
      await s.advance(150);
      expect(retry.snapshot().data).toEqual(sample);
      expectProjection(target, retry);
      s.expectOneOwner();
    } finally {
      await s.dispose();
    }
  });
}

for (const [name, Screen] of arms) {
  for (const phase of ['fetch', 'text'] as const) {
    for (const outcome of ['resolve', 'reject'] as const) {
      test(`${name}: leaving during ${phase}, then reentering, fences stale ${outcome} and retained actions`, async () => {
        const response = deferred<{ text(): Promise<string> }>();
        const text = deferred<string>();
        const urls: string[] = [];
        let textReads = 0;
        const s = await mountedArchive(Screen, {
          archive: {
            fetch: async (url) => {
              urls.push(url);
              if (urls.length > 1) return body();
              if (phase === 'fetch') return response.promise;
              return {
                text() {
                  textReads++;
                  return text.promise;
                },
              };
            },
          },
        });
        const { fixture, target } = s;
        try {
          const old = s.current();
          const controller = s.controller();
          const staleOlder = label(target, 'Older month');
          const staleInput = label<HTMLInputElement>(
            target,
            'Search this month',
          );
          await enter(fixture, staleInput, 'pending old visit');
          const oldState = controller.snapshot();
          expect(oldState.data).toBe(loading);
          expect(urls).toHaveLength(1);
          let oldNotices = 0;
          const unsubscribe = controller.subscribe(() => oldNotices++);
          // No React commit is needed to revoke the old capabilities.
          expect(fixture.sessionManager.navigate('workbench')).toBe(true);
          expect(old.lease.isCurrent()).toBe(false);
          expect(staleInput.isConnected).toBe(false);
          controller.mount();
          controller.select(1);
          controller.query('must not mutate retired snapshot');
          old.selectSample('failure');
          staleOlder.click();
          staleInput.value = 'detached input';
          staleInput.dispatchEvent(new Event('input', { bubbles: true }));
          expect(controller.snapshot()).toBe(oldState);
          expect(urls).toHaveLength(1);
          expect(s.clock.pending.size).toBe(0);
          expect(fixture.sessionManager.navigate('archive')).toBe(true);
          await fixture.settle();
          const fresh = s.controller();
          const freshState = fresh.snapshot();
          expect(fresh).not.toBe(controller);
          expect(freshState.data).toEqual(sample);
          expect(freshState.query).toBe('');
          const calls = fixture.endpoint.totalRecordedCalls;
          if (outcome === 'reject') {
            (phase === 'fetch' ? response : text).reject(
              Error('late old visit failure'),
            );
          } else if (phase === 'fetch') {
            response.resolve({
              async text() {
                textReads++;
                return 'Cannot find stale archive';
              },
            });
          } else {
            text.resolve('Cannot find stale archive');
          }
          await fixture.settle();
          expect(textReads).toBe(phase === 'fetch' ? 0 : 1);
          expect(urls).toHaveLength(2);
          expect(controller.snapshot()).toBe(oldState);
          expect(fresh.snapshot()).toBe(freshState);
          expect(oldNotices).toBe(0);
          expect(s.clock.pending.size).toBe(0);
          expect(fixture.endpoint.totalRecordedCalls).toBe(calls);
          let lateNotices = 0;
          const lateUnsubscribe = controller.subscribe(() => lateNotices++);
          controller.query('late subscriber cannot reactivate');
          controller.mount();
          controller.select(0);
          await fixture.settle();
          expect(lateNotices).toBe(0);
          expect(urls).toHaveLength(2);
          unsubscribe();
          lateUnsubscribe();
          s.expectOneOwner();
          expectProjection(target, fresh);
        } finally {
          // Resolve unused deferreds as well, without introducing rejection noise.
          response.resolve(body());
          text.resolve(JSON.stringify(sample));
          await s.dispose();
        }
      });
    }
  }

  test(`${name}: leaving during retry cancels work even when canceled callbacks are invoked after reentry`, async () => {
    const urls: string[] = [];
    const s = await mountedArchive(Screen, {
      archive: {
        fetch: async (url) => {
          urls.push(url);
          return body(
            urls.length === 1
              ? 'Cannot find sample archive'
              : JSON.stringify(sample),
          );
        },
      },
    });
    const { fixture, target } = s;
    try {
      const old = s.current();
      const controller = s.controller();
      const oldState = controller.snapshot();
      let notices = 0;
      const stop = controller.subscribe(() => notices++);
      expect(s.clock.pending.size).toBe(1);
      const callbacks = [...s.clock.callbacks];
      expect(fixture.sessionManager.navigate('workbench')).toBe(true);
      expect(old.lease.isCurrent()).toBe(false);
      expect(s.clock.pending.size).toBe(0);
      expect(fixture.sessionManager.navigate('archive')).toBe(true);
      await fixture.settle();
      const fresh = s.controller();
      const freshState = fresh.snapshot();
      const calls = fixture.endpoint.totalRecordedCalls;
      flushSync(() => {
        callbacks.forEach((callback) => callback());
        controller.mount();
        controller.select(1);
        controller.query('cannot resume retry');
      });
      await fixture.settle();
      expect(urls).toHaveLength(2);
      expect(notices).toBe(0);
      expect(controller.snapshot()).toBe(oldState);
      expect(fresh.snapshot()).toBe(freshState);
      expect(s.clock.pending.size).toBe(0);
      expect(fixture.endpoint.totalRecordedCalls).toBe(calls);
      stop();
      s.expectOneOwner();
      expectProjection(target, fresh);
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: Window Close during archive fetch retires immediately and resume creates a clean visit`, async () => {
    const pending = deferred<{ text(): Promise<string> }>();
    const urls: string[] = [];
    let oldTextReads = 0;
    const s = await mountedArchive(Screen, {
      archive: {
        fetch: async (url) => {
          urls.push(url);
          return urls.length === 1 ? pending.promise : body();
        },
      },
    });
    const { fixture, target } = s;
    try {
      const old = s.current();
      const controller = s.controller();
      await enter(
        fixture,
        label<HTMLInputElement>(target, 'Search this month'),
        'old close',
      );
      const state = controller.snapshot();
      const subscriptions = fixture.read().subscriptions;
      let notices = 0;
      const stop = controller.subscribe(() => notices++);
      await click(fixture, label(target, 'Close window'));
      expect(old.lease.isCurrent()).toBe(false);
      expect(fixture.read().active).toBe(false);
      expect(fixture.read().suspending).toBe(true);
      const calls = fixture.endpoint.totalRecordedCalls;
      controller.mount();
      controller.select(1);
      controller.query('closed');
      pending.resolve({
        async text() {
          oldTextReads++;
          return JSON.stringify(sample);
        },
      });
      await fixture.settle();
      expect(controller.snapshot()).toBe(state);
      expect(notices).toBe(0);
      expect(oldTextReads).toBe(0);
      expect(urls).toHaveLength(1);
      expect(fixture.endpoint.totalRecordedCalls).toBe(calls);
      fixture.dispatch('suspend');
      await fixture.settle();
      expect(target.querySelector('.Window')).toBeNull();
      fixture.resume();
      await fixture.settle();
      expect(fixture.read().route).toBe('archive');
      expect(s.current()).not.toBe(old);
      expect(s.controller().snapshot().query).toBe('');
      expect(s.controller().snapshot().selectedIndex).toBe(0);
      expect(s.controller().snapshot().data).toEqual(sample);
      expect(urls).toHaveLength(2);
      expect(fixture.read().subscriptions).toBe(subscriptions);
      expect(document.activeElement).toBe(
        element(target, '.SampleApplication__heading'),
      );
      stop();
      s.expectOneOwner();
    } finally {
      pending.resolve(body());
      await s.dispose();
    }
  });

  test(`${name}: root unmount during body reading releases subscriptions and remount survives the old body`, async () => {
    const pending = deferred<string>();
    const urls: string[] = [];
    const s = await mountedArchive(Screen, {
      archive: {
        fetch: async (url) => {
          urls.push(url);
          return urls.length === 1 ? { text: () => pending.promise } : body();
        },
      },
    });
    const { fixture, target } = s;
    try {
      const old = s.current();
      const controller = s.controller();
      await enter(
        fixture,
        label<HTMLInputElement>(target, 'Search this month'),
        'root draft',
      );
      const oldState = controller.snapshot();
      let notices = 0;
      const stop = controller.subscribe(() => notices++);
      const before = fixture.read();
      fixture.unmountRoot();
      expect(old.lease.isCurrent()).toBe(false);
      expect(fixture.read().rootMounted).toBe(false);
      expect(fixture.read().active).toBe(false);
      await fixture.settle();
      expect(fixture.read().mounts).toBe(fixture.read().unmounts);
      expect(fixture.read().pendingDisposals).toBe(0);
      expect(fixture.read().subscriptions).toBeLessThan(before.subscriptions);
      expect(s.clock.pending.size).toBe(0);
      expect(target.querySelector('.Window')).toBeNull();
      fixture.mountRoot();
      await fixture.settle();
      const fresh = s.controller();
      const freshState = fresh.snapshot();
      expect(s.current()).not.toBe(old);
      expect(freshState.query).toBe('');
      expect(freshState.selectedIndex).toBe(0);
      expect(freshState.data).toEqual(sample);
      pending.resolve('Cannot find obsolete text');
      flushSync(() => {
        controller.mount();
        controller.select(1);
        controller.query('retired root');
      });
      await fixture.settle();
      expect(notices).toBe(0);
      expect(controller.snapshot()).toBe(oldState);
      expect(fresh.snapshot()).toBe(freshState);
      expect(urls).toHaveLength(2);
      expect(s.clock.pending.size).toBe(0);
      expect(fixture.read().subscriptions).toBe(before.subscriptions);
      expect(document.activeElement).toBe(
        element(target, '.SampleApplication__heading'),
      );
      stop();
      s.expectOneOwner();
    } finally {
      pending.resolve(JSON.stringify(sample));
      await s.dispose();
    }
  });

  test(`${name}: full disposal while fetching remains inert after a new fixture mounts`, async () => {
    const pending = deferred<{ text(): Promise<string> }>();
    let requests = 0;
    let bodyReads = 0;
    const first = await mountedArchive(Screen, {
      archive: {
        fetch: async () => {
          requests++;
          return pending.promise;
        },
      },
    });
    const old = first.current();
    const controller = first.controller();
    const oldState = controller.snapshot();
    let notices = 0;
    const stop = controller.subscribe(() => notices++);
    await first.dispose();
    expect(old.lease.isCurrent()).toBe(false);
    const final = first.fixture.read();
    await first.fixture.dispose();
    expect(first.fixture.read()).toEqual(final);
    expect(() => first.fixture.mountRoot()).toThrow('disposed');
    const fresh = await mountedArchive(Screen);
    try {
      const current = fresh.controller();
      const currentState = current.snapshot();
      const calls = fresh.fixture.endpoint.totalRecordedCalls;
      pending.resolve({
        async text() {
          bodyReads++;
          return JSON.stringify(sample);
        },
      });
      flushSync(() => {
        controller.mount();
        controller.select(1);
        controller.query('disposed');
        old.selectSample('failure');
      });
      await fresh.fixture.settle();
      expect(controller.snapshot()).toBe(oldState);
      expect(notices).toBe(0);
      expect(requests).toBe(1);
      expect(bodyReads).toBe(0);
      expect(current.snapshot()).toBe(currentState);
      expect(fresh.fixture.endpoint.totalRecordedCalls).toBe(calls);
      expect(first.clock.pending.size).toBe(0);
      stop();
      fresh.expectOneOwner();
    } finally {
      pending.resolve(body());
      await fresh.dispose();
    }
  });

  test(`${name}: delayed retired archive view disposal cannot clear or focus the replacement visit`, async () => {
    const disposal = deferred<void>();
    let held = false;
    const DelayedScreen: ScreenRenderer = (props: ScreenProps) => {
      useLayoutEffect(
        () => () => {
          if (props.session.route === 'archive' && !held) {
            held = true;
            props.lifecycle.pending(disposal.promise);
          }
        },
        [],
      );
      return <Screen {...props} />;
    };
    const s = await mountedArchive(DelayedScreen);
    const { fixture, target } = s;
    try {
      const old = s.current();
      const oldController = s.controller();
      fixture.navigate('workbench');
      expect(old.lease.isCurrent()).toBe(false);
      expect(fixture.read().pendingDisposals).toBeGreaterThan(0);
      fixture.navigate('archive');
      // Flush framework microtasks without waiting for the intentionally held
      // disposal promise that fixture.settle correctly tracks.
      for (let turn = 0; turn < 12; turn++) await Promise.resolve();
      flushSync(() => {});
      const current = s.current();
      const screen = element(target, '.ChangesArchive');
      expect(current).not.toBe(old);
      expect(current.lease.isCurrent()).toBe(true);
      expect(document.activeElement).toBe(
        element(target, '.SampleApplication__heading'),
      );
      oldController.mount();
      oldController.query('old disposal');
      disposal.resolve();
      await fixture.settle();
      expect(fixture.read().pendingDisposals).toBe(0);
      expect(s.current()).toBe(current);
      expect(element(target, '.ChangesArchive')).toBe(screen);
      expect(s.controller().snapshot().query).toBe('');
      expect(s.controller().snapshot().data).toEqual(sample);
      expect(document.activeElement).toBe(
        element(target, '.SampleApplication__heading'),
      );
      s.expectOneOwner();
    } finally {
      disposal.resolve();
      await s.dispose();
    }
  });
}

for (const [name, Screen] of arms) {
  for (const phase of ['fetch', 'text'] as const) {
    test(`${name}: replacing the archive sample during ${phase} fences old work while its route lease stays current`, async () => {
      const response = deferred<{ text(): Promise<string> }>();
      const text = deferred<string>();
      const urls: string[] = [];
      let textReads = 0;
      const s = await mountedArchive(Screen, {
        archive: {
          fetch: async (url) => {
            urls.push(url);
            if (urls.length > 1) return body();
            return phase === 'fetch'
              ? response.promise
              : {
                  text() {
                    textReads++;
                    return text.promise;
                  },
                };
          },
        },
      });
      try {
        const session = s.current();
        const old = s.controller();
        await enter(
          s.fixture,
          label<HTMLInputElement>(s.target, 'Search this month'),
          'old sample',
        );
        const state = old.snapshot();
        const oldView = element(s.target, '.ChangesArchive');
        let notices = 0;
        const stop = old.subscribe(() => notices++);
        await s.scenario('retry');
        expect(session.lease.isCurrent()).toBe(true);
        expect(s.current()).toBe(session);
        expect(s.controller()).not.toBe(old);
        expect(element(s.target, '.ChangesArchive')).not.toBe(oldView);
        const current = s.controller();
        const currentState = current.snapshot();
        expect(currentState.query).toBe('');
        expect(currentState.data).toEqual(sample);
        if (phase === 'fetch') {
          response.resolve({
            async text() {
              textReads++;
              return 'Cannot find replaced sample';
            },
          });
        } else text.resolve('Cannot find replaced sample');
        flushSync(() => {
          old.mount();
          old.select(1);
          old.query('retired sample');
        });
        await s.fixture.settle();
        expect(old.snapshot()).toBe(state);
        expect(current.snapshot()).toBe(currentState);
        expect(notices).toBe(0);
        expect(urls).toHaveLength(2);
        expect(textReads).toBe(phase === 'fetch' ? 0 : 1);
        expect(s.clock.pending.size).toBe(0);
        stop();
        s.expectOneOwner();
      } finally {
        response.resolve(body());
        text.resolve(JSON.stringify(sample));
        await s.dispose();
      }
    });
  }
}

test('archive standalone sample defaults still reject the application owned native-looking global', () => {
  expect(() => sampleController('success')).toThrow(
    'refuses native host globals',
  );
});

for (const [name, Screen] of arms) {
  for (const phase of ['fetch', 'text'] as const) {
    test(`${name}: owned archive rejects a replaced host at the ${phase} delivery boundary without reading it`, async () => {
      const response = deferred<{ text(): Promise<string> }>();
      const text = deferred<string>();
      let textReads = 0;
      let fetches = 0;
      const s = await mountedArchive(Screen, {
        archive: {
          fetch: async () => {
            fetches++;
            return phase === 'fetch'
              ? response.promise
              : {
                  text() {
                    textReads++;
                    return text.promise;
                  },
                };
          },
        },
      });
      s.expectedErrors.push(
        'Error: Disconnected sample shell refuses native or unowned globals.',
      );
      const descriptor = Object.getOwnPropertyDescriptor(window, 'Byond');
      let foreignReads = 0;
      const current = s.current();
      const before = current.snapshot();
      const beforeState = before.controller.snapshot();
      const calls = s.fixture.endpoint.totalRecordedCalls;
      try {
        Object.defineProperty(window, 'Byond', {
          configurable: true,
          get() {
            foreignReads++;
            return undefined;
          },
        });
        if (phase === 'fetch') {
          response.resolve({
            async text() {
              textReads++;
              return JSON.stringify(sample);
            },
          });
        } else text.resolve(JSON.stringify(sample));
        await s.fixture.settle();
        expect(() => boundary.validate()).toThrow('unowned globals');
        expect(() => current.selectSample('empty')).not.toThrow();
        expect(before.controller.snapshot()).toBe(beforeState);
        expect(s.fixture.read().errors).toEqual(s.expectedErrors);
        expect(s.clock.pending.size).toBe(0);
        expect(current.snapshot()).toBe(before);
        expect(typeof before.controller.snapshot().data).toBe('string');
        expect(
          s.target.querySelectorAll('.ChangesArchive__description'),
        ).toHaveLength(0);
        expect(textReads).toBe(phase === 'fetch' ? 0 : 1);
        expect(foreignReads).toBe(0);
        expect(s.fixture.endpoint.totalRecordedCalls).toBe(calls);
        expect(s.fixture.read().nativeSubscriptionAttempts).toBe(0);
        // Keep the route active while the boundary is invalid. A rejected
        // delivery must not schedule an async retry whose action can reject
        // outside the domain loader's catch block.
        flushSync(() => {
          s.clock.advance(1000);
          s.clock.callbacks.forEach((callback) => callback());
          before.controller.mount();
          before.controller.select(1);
          before.controller.query('cannot revive invalid boundary');
          current.selectSample('success');
        });
        await s.fixture.settle();
        expect(s.clock.pending.size).toBe(0);
        expect(foreignReads).toBe(0);
        expect(textReads).toBe(phase === 'fetch' ? 0 : 1);
        expect(fetches).toBe(1);
        expect(before.controller.snapshot()).toBe(beforeState);
        expect(s.fixture.read().errors).toEqual(s.expectedErrors);
        if (descriptor) Object.defineProperty(window, 'Byond', descriptor);
        else Reflect.deleteProperty(window, 'Byond');
        await navigate(s.fixture, 'workbench');
        await navigate(s.fixture, 'archive');
        expect(s.current()).not.toBe(current);
        expect(s.controller().snapshot().data).toEqual(sample);
        expect(s.controller().snapshot().query).toBe('');
        expect(fetches).toBe(2);
        before.controller.mount();
        before.controller.select(1);
        expect(before.controller.snapshot()).toBe(beforeState);
        s.expectOneOwner();
      } finally {
        if (descriptor) Object.defineProperty(window, 'Byond', descriptor);
        else Reflect.deleteProperty(window, 'Byond');
        response.resolve(body());
        text.resolve(JSON.stringify(sample));
        await s.dispose();
      }
    });
  }
}

for (const [name, Screen] of arms) {
  test(`${name}: a queued archive retry retires on ownership loss before issuing its action or fetch`, async () => {
    let fetches = 0;
    const s = await mountedArchive(Screen, {
      archive: {
        fetch: async () => {
          fetches++;
          return body(
            fetches === 1
              ? 'Cannot find sample archive'
              : JSON.stringify(sample),
          );
        },
      },
    });
    const descriptor = Object.getOwnPropertyDescriptor(window, 'Byond');
    const old = s.current();
    const controller = s.controller();
    const state = controller.snapshot();
    const callbacks = [...s.clock.callbacks];
    let foreignReads = 0;
    s.expectedErrors.push(
      'Error: Disconnected sample shell refuses native or unowned globals.',
    );
    try {
      expect(s.clock.pending.size).toBe(1);
      Object.defineProperty(window, 'Byond', {
        configurable: true,
        get() {
          foreignReads++;
          return undefined;
        },
      });
      flushSync(() => s.clock.advance(100));
      await s.fixture.settle();
      expect(s.clock.pending.size).toBe(0);
      expect(fetches).toBe(1);
      expect(foreignReads).toBe(0);
      expect(controller.snapshot()).toBe(state);
      expect(s.fixture.read().errors).toEqual(s.expectedErrors);
      flushSync(() => {
        callbacks.forEach((callback) => callback());
        controller.mount();
        controller.select(1);
        controller.query('invalid retry');
        old.selectSample('success');
      });
      await s.fixture.settle();
      expect(fetches).toBe(1);
      expect(foreignReads).toBe(0);
      expect(controller.snapshot()).toBe(state);
      expect(s.fixture.read().errors).toEqual(s.expectedErrors);
      if (descriptor) Object.defineProperty(window, 'Byond', descriptor);
      else Reflect.deleteProperty(window, 'Byond');
      await navigate(s.fixture, 'workbench');
      await navigate(s.fixture, 'archive');
      expect(s.current()).not.toBe(old);
      expect(s.controller().snapshot().data).toEqual(sample);
      expect(fetches).toBe(2);
      s.expectOneOwner();
    } finally {
      if (descriptor) Object.defineProperty(window, 'Byond', descriptor);
      else Reflect.deleteProperty(window, 'Byond');
      await s.dispose();
    }
  });
}

test('archive retirement continues through a throwing timer cancellation and replayed callbacks stay inert', async () => {
  const owned = createOwnedBoundary({}, {});
  owned.install();
  const failures: unknown[] = [];
  const callbacks: Array<() => void> = [];
  const failure = Error('injected archive cancellation failure');
  let active = true;
  let fetches = 0;
  let cancellations = 0;
  const session = createScreenSession(
    'archive',
    {
      lease: {
        route: 'archive',
        hostEpoch: 1,
        screenEpoch: 1,
        isCurrent: () => active,
        onRetire: () => () => {},
      },
      validateBoundary: owned.validate,
      onWorkbenchAction() {},
      lifecycle: {
        mounted() {},
        unmounted() {},
        pending() {},
        error: (error) => failures.push(error),
      },
    },
    {
      archive: {
        fetch: async () => {
          fetches++;
          return body('Cannot find sample archive');
        },
      },
      schedule(callback) {
        callbacks.push(callback);
        return callbacks.length;
      },
      cancel() {
        cancellations++;
        throw failure;
      },
    },
  );
  if (session.route !== 'archive') throw Error('wrong route');
  const controller = session.snapshot().controller;
  try {
    controller.mount();
    for (let turn = 0; turn < 12; turn++) await Promise.resolve();
    expect(fetches).toBe(1);
    expect(callbacks).toHaveLength(1);
    const state = controller.snapshot();
    active = false;
    session.retire();
    expect(cancellations).toBe(1);
    expect(failures).toEqual([failure]);
    owned.dispose();
    expect(() => callbacks.forEach((callback) => callback())).not.toThrow();
    controller.mount();
    controller.select(1);
    controller.query('retired cancellation');
    session.selectSample('success');
    session.retire();
    for (let turn = 0; turn < 12; turn++) await Promise.resolve();
    expect(cancellations).toBe(1);
    expect(fetches).toBe(1);
    expect(controller.snapshot()).toBe(state);
  } finally {
    active = false;
    session.retire();
    owned.dispose();
  }
});

afterAll(() => {
  try {
    expect(networkGuard.attempted).toBe(0);
    boundary.dispose();
  } finally {
    networkGuard.restore();
    Reflect.deleteProperty(globalThis, '__disconnectedWebpackContext');
  }
});
