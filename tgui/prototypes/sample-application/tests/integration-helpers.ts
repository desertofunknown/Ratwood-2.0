import { expect } from 'bun:test';
import { flushSync } from 'react-dom';

import type { Route, ScreenRenderer } from '../contracts';
import { createFixture, type Fixture } from '../runtime';
import {
  createScreenSession,
  type OwnedScreenSession,
} from '../screens/session';

/** Explicitly retain canceled callbacks to challenge retirement, not just cancel(). */
export function controlledClock() {
  let now = 0;
  let serial = 0;
  const pending = new Map<number, { at: number; callback: () => void }>();
  const callbacks: Array<() => void> = [];
  return {
    pending,
    callbacks,
    schedule(callback: () => void, delay: number) {
      callbacks.push(callback);
      pending.set(++serial, { at: now + delay, callback });
      return serial;
    },
    cancel(id: unknown) {
      pending.delete(id as number);
    },
    advance(milliseconds: number) {
      const until = now + milliseconds;
      let turns = 0;
      while (true) {
        const next = [...pending].sort(
          (a, b) => a[1].at - b[1].at || a[0] - b[0],
        )[0];
        if (!next || next[1].at > until) break;
        if (++turns > 1000) throw Error('Unexpected sample timer loop.');
        now = next[1].at;
        pending.delete(next[0]);
        next[1].callback();
      }
      now = until;
    },
  };
}

export async function mountedFixture(Screen: ScreenRenderer) {
  const target = document.createElement('div');
  document.body.append(target);
  const clock = controlledClock();
  const sessions: OwnedScreenSession[] = [];
  const fixture = createFixture(target, Screen, (route, context) => {
    const session = createScreenSession(route, context, clock);
    sessions.push(session);
    return session;
  });
  try {
    fixture.resume();
    await fixture.settle();
  } catch (error) {
    try {
      await fixture.dispose();
    } finally {
      target.remove();
    }
    throw error;
  }
  return {
    fixture,
    target,
    clock,
    sessions,
    current<R extends Route>(route: R) {
      const session = fixture.sessionManager.snapshot().session;
      expect(session?.route).toBe(route);
      return session as Extract<OwnedScreenSession, { route: R }>;
    },
    async advance(milliseconds: number) {
      flushSync(() => clock.advance(milliseconds));
      await fixture.settle();
    },
    async dispose() {
      try {
        await fixture.dispose();
        const final = fixture.read();
        expect(final.subscriptions).toBe(0);
        expect(final.pendingDisposals).toBe(0);
        expect(final.mounts).toBe(final.unmounts);
        expect(final.errors).toEqual([]);
        expect(final.nativeSubscriptionAttempts).toBe(0);
        expect(clock.pending.size).toBe(0);
        expect(sessions.every((session) => !session.lease.isCurrent())).toBe(
          true,
        );
      } finally {
        target.remove();
      }
    },
  };
}

export function button(target: HTMLElement, label: string) {
  const node = [...target.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!node) throw Error(`Expected button: ${label}`);
  return node;
}

export function element<T extends HTMLElement = HTMLElement>(
  target: HTMLElement,
  selector: string,
) {
  const node = target.querySelector<T>(selector);
  if (!node) throw Error(`Expected element: ${selector}`);
  return node;
}

export async function click(fixture: Fixture, node: HTMLElement) {
  flushSync(() => node.click());
  await fixture.settle();
}

export async function navigate(fixture: Fixture, route: Route) {
  await click(
    fixture,
    element(fixture.target, `[data-sample-route="${route}"]`),
  );
  expect(fixture.read().route).toBe(route);
  expect(
    element(fixture.target, '.SampleApplication__screen').dataset.activeScreen,
  ).toBe(route);
  expect(
    fixture.target.querySelectorAll('[data-sample-screen-host]'),
  ).toHaveLength(1);
  expect(
    fixture.target.querySelectorAll('[data-sample-screen-target]'),
  ).toHaveLength(1);
  expect(fixture.read().mounts - fixture.read().unmounts).toBe(1);
}

export async function enter(
  fixture: Fixture,
  input: HTMLInputElement,
  value: string,
) {
  flushSync(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await fixture.settle();
}

export function expectCraftRejected(
  fixture: Fixture,
  action: NonNullable<Fixture['action']>,
) {
  const before = fixture.endpoint.totalRecordedCalls;
  action('craft', { item: '/sample/plough' });
  // Monotonic count remains sound even when the retained endpoint log rolls over.
  expect(fixture.endpoint.totalRecordedCalls).toBe(before);
}
