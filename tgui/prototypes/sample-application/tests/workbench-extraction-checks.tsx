import '../test-environment';
import '../../treasury-ledger/test-dom';

import { afterAll, expect, test } from 'bun:test';

import { boundary } from '../bootstrap';
import type {
  ScreenFactory,
  ScreenRenderer,
  SessionContext,
} from '../contracts';
import { createFixture } from '../runtime';
import { ReactScreen } from '../screens/react';
import { createScreenSession } from '../screens/session';
import {
  createWorkbenchSession,
  type SessionClock,
  type WorkbenchSession,
} from '../screens/session-core';
import { SvelteScreen } from '../screens/svelte';
import { SvelteScreenOwner } from '../screens/svelte-owner';
import { WorkbenchReactScreen } from '../screens/workbench-react';
import { WorkbenchSvelteScreen } from '../screens/workbench-svelte';
import { networkGuard } from '../test-network-guard';
import { button, click, element } from './integration-helpers';

const factories = [
  [
    'original public factory',
    (context: SessionContext, clock: SessionClock) =>
      createScreenSession('workbench', context, clock),
  ],
  ['eager workbench factory', createWorkbenchSession],
] as const;

for (const [name, create] of factories) {
  test(`${name}: validation and clock reads retain their exact order and retired actions stay inert`, () => {
    const events: string[] = [];
    let active = true;
    const lease: SessionContext['lease'] = {
      route: 'workbench',
      hostEpoch: 1,
      screenEpoch: 2,
      isCurrent() {
        events.push('current');
        return active;
      },
      onRetire: () => () => {},
    };
    const context: SessionContext = {
      get lease() {
        events.push('lease');
        return lease;
      },
      get validateBoundary() {
        events.push('validator');
        return () => events.push('validate');
      },
      get onWorkbenchAction() {
        events.push('action');
        return () => events.push('dispatch');
      },
      lifecycle: {
        mounted() {},
        unmounted() {},
        pending() {},
        error(error) {
          throw error;
        },
      },
    };
    const clock: SessionClock = {
      get schedule() {
        events.push('schedule');
        return () => 1;
      },
      get cancel() {
        events.push('cancel');
        return () => {};
      },
    };
    const session = create(context, clock) as WorkbenchSession;
    expect(events).toEqual([
      'lease',
      'validator',
      'validate',
      'schedule',
      'cancel',
      'action',
    ]);
    expect(session.route).toBe('workbench');
    expect(session.lease).toBe(lease);
    events.length = 0;
    session.action('craft', { item: '/sample/plough' });
    expect(events).toEqual(['lease', 'current', 'dispatch']);
    events.length = 0;
    active = false;
    session.action('craft', { item: '/sample/plough' });
    expect(events).toEqual(['lease', 'current']);
    events.length = 0;
    active = true;
    session.retire();
    session.retire();
    session.action('craft', { item: '/sample/plough' });
    expect(events).toEqual([]);
  });

  test(`${name}: failed validation touches no clock or action`, () => {
    const failure = new Error('expected validation refusal');
    const context = {
      lease: {},
      validateBoundary() {
        throw failure;
      },
      get onWorkbenchAction() {
        throw Error('action must not be read');
      },
    } as unknown as SessionContext;
    const clock = {
      get schedule(): never {
        throw Error('clock must not be read');
      },
    };
    expect(() => create(context, clock)).toThrow(failure);
  });
}

const eagerFactory: ScreenFactory = (route, context) =>
  route === 'workbench'
    ? createWorkbenchSession(context)
    : createScreenSession(route, context);

async function journey(Screen: ScreenRenderer, createSession: ScreenFactory) {
  const target = document.createElement('div');
  document.body.append(target);
  const fixture = createFixture(target, Screen, createSession);
  const normalized = (text: string | null) => text?.replace(/\s+/g, ' ').trim();
  const snapshot = () => {
    const workbench = element(target, '.Workbench');
    return {
      text: normalized(workbench.textContent),
      open: workbench.getAttribute('data-open'),
      buttons: [...workbench.querySelectorAll('button')].map((node) => ({
        text: normalized(node.textContent),
        disabled: node.disabled,
        selected: node.getAttribute('aria-selected'),
      })),
      values: [...workbench.querySelectorAll('input,select')].map(
        (node) => (node as HTMLInputElement).value,
      ),
      windows: target.querySelectorAll('.Window').length,
      hosts: target.querySelectorAll('[data-sample-screen-host]').length,
      targets: target.querySelectorAll('[data-sample-screen-target]').length,
      liveMounts: fixture.read().mounts - fixture.read().unmounts,
    };
  };
  try {
    fixture.resume();
    await fixture.settle();
    const initial = snapshot();
    const session = fixture.sessionManager.snapshot().session;
    expect(fixture.navigate('workbench')).toBe(false);
    expect(fixture.sessionManager.snapshot().session).toBe(session);
    const buckets = [
      ...target.querySelectorAll<HTMLButtonElement>('.Workbench__recipe'),
    ].filter(
      (node) =>
        normalized(
          node.querySelector('.Workbench__recipe-name')!.textContent,
        ) === 'Wooden bucket',
    );
    expect(buckets).toHaveLength(2);
    await click(fixture, buckets[1]);
    await click(fixture, button(target, 'Craft 3'));
    const action = fixture.endpoint.calls.at(-1)!.arguments;
    expect(action).toEqual([
      'act/craft',
      { item: '/sample/bucket/planks', amount: 3 },
    ]);
    const selected = snapshot();
    const data = fixture.store.getState().backend.data;
    const recipe = Object.values(data.crafting_recipes.Woodworking).find(
      (entry: any) => entry.path === '/sample/bucket/planks',
    ) as { req_text: string };
    recipe.req_text = 'SAME-OBJECT extraction delivery: eleven wooden planks';
    fixture.update({ data });
    await fixture.settle();
    expect(element(target, '.Workbench__requirements').textContent).toContain(
      'eleven wooden planks',
    );
    const updated = snapshot();
    const staleAction = fixture.action!;
    const oldTarget = element(target, '[data-sample-screen-target]');
    const before = fixture.endpoint.totalRecordedCalls;
    fixture.sessionManager.navigate('treasury');
    expect(session!.lease.isCurrent()).toBe(false);
    expect(oldTarget.isConnected).toBe(false);
    staleAction('craft', { item: '/sample/bucket/planks' });
    expect(fixture.endpoint.totalRecordedCalls).toBe(before);
    fixture.navigate('workbench');
    await fixture.settle();
    expect(fixture.sessionManager.snapshot().session).not.toBe(session);
    expect(element(target, '.Workbench').getAttribute('data-open')).toBe(
      'false',
    );
    const reset = snapshot();
    fixture.unmountRoot();
    expect(target.querySelector('[data-sample-screen-target]')).toBeNull();
    fixture.mountRoot();
    await fixture.settle();
    const remounted = snapshot();
    await fixture.dispose();
    const disposed = fixture.read();
    expect(disposed.subscriptions).toBe(0);
    expect(disposed.pendingDisposals).toBe(0);
    expect(disposed.mounts).toBe(disposed.unmounts);
    expect(disposed.errors).toEqual([]);
    expect(disposed.nativeSubscriptionAttempts).toBe(0);
    return { initial, selected, updated, reset, remounted, action };
  } finally {
    await fixture.dispose();
    target.remove();
  }
}

for (const [name, Original, Eager] of [
  ['React', ReactScreen, WorkbenchReactScreen],
  ['React-owned Svelte', SvelteScreen, WorkbenchSvelteScreen],
] as const) {
  test(`${name}: eager workbench preserves the original UI, exact action, same-object updates and lease teardown`, async () => {
    const Candidate: ScreenRenderer = (props) =>
      props.session.route === 'workbench' ? (
        <Eager {...props} />
      ) : (
        <Original {...props} />
      );
    expect(await journey(Candidate, eagerFactory)).toEqual(
      await journey(Original, createScreenSession),
    );
  });
}

for (const mode of ['delayed rejection', 'synchronous throw'] as const) {
  test(`extracted Svelte owner tracks ${mode} without removing the replacement`, async () => {
    let reject!: (error: Error) => void;
    const delayed = new Promise<void>((_, fail) => {
      reject = fail;
    });
    // Observe it immediately even when this scenario uses the synchronous path.
    void delayed.catch(() => {});
    const failure = new Error(`expected ${mode}`);
    let serial = 0;
    const destroyed: number[] = [];
    const Screen: ScreenRenderer = (props) => (
      <SvelteScreenOwner
        {...props}
        mountContent={(target) => {
          const id = ++serial;
          target.textContent = `Owned test view ${id}`;
          return {
            update() {},
            unmount() {
              destroyed.push(id);
              if (id !== 1) return Promise.resolve();
              if (mode === 'synchronous throw') throw failure;
              return delayed;
            },
          };
        }}
      />
    );
    const target = document.createElement('div');
    document.body.append(target);
    const fixture = createFixture(target, Screen, eagerFactory);
    try {
      fixture.resume();
      await fixture.settle();
      const old = element(target, '[data-sample-screen-target]');
      fixture.navigate('market');
      expect(old.isConnected).toBe(false);
      expect(destroyed).toEqual([1]);
      expect(fixture.read().pendingDisposals).toBe(1);
      const replacement = element(target, '[data-sample-screen-target]');
      const focused = document.activeElement;
      if (mode === 'delayed rejection') reject(failure);
      await fixture.settle();
      expect(element(target, '[data-sample-screen-target]')).toBe(replacement);
      expect(replacement.isConnected).toBe(true);
      expect(document.activeElement).toBe(focused);
      expect(fixture.read().errors).toEqual([String(failure)]);
      expect(fixture.read().pendingDisposals).toBe(0);
      await fixture.dispose();
      expect(destroyed).toEqual([1, 2]);
      expect(fixture.read().mounts).toBe(fixture.read().unmounts);
      expect(fixture.read().subscriptions).toBe(0);
    } finally {
      reject(failure);
      await fixture.dispose();
      target.remove();
    }
  });
}

afterAll(() => {
  expect(networkGuard.attempted).toBe(0);
  boundary.dispose();
  networkGuard.restore();
  Reflect.deleteProperty(globalThis, '__disconnectedWebpackContext');
});
