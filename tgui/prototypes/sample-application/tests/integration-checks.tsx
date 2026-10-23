import { reactBoundaryErrors } from './host-react-error-capture';
import '../test-environment';
import '../../treasury-ledger/test-dom';

import { afterAll, expect, test } from 'bun:test';
import { useLayoutEffect } from 'react';
import { flushSync } from 'react-dom';

import { storage } from '../../../packages/common/storage';
import * as backend from '../../../packages/tgui/backend';
import { setWindowPosition, setupDrag } from '../../../packages/tgui/drag';
import { Window } from '../../../packages/tgui/layouts/Window';
import { createDemoData } from '../../crafting-workbench/fixtures';
import { getPreviewResponse } from '../../market-quote/fixtures';
import { boundary } from '../bootstrap';
import type { ScreenProps, ScreenRenderer } from '../contracts';
import type { ValidatedEndpointBinding } from '../endpoint-binding';
import { createFixture, sampleConfig } from '../runtime';
import { ReactScreen } from '../screens/react';
import { createScreenSession } from '../screens/session';
import { SvelteScreen } from '../screens/svelte';
import { networkGuard } from '../test-network-guard';
import {
  button,
  click,
  element,
  enter,
  expectCraftRejected,
  mountedFixture,
  navigate,
} from './integration-helpers';

// The same lexical banner identifier used by the production module AST define.
declare const __sampleEndpointFacade: ValidatedEndpointBinding['facade'];

const arms = [
  ['React', ReactScreen],
  ['React-owned Svelte', SvelteScreen],
] as const;

for (const [name, Screen] of arms) {
  test(`${name}: four local screens share the real store and Window without a transport`, async () => {
    const s = await mountedFixture(Screen);
    const { fixture, target } = s;
    try {
      expect(target.querySelectorAll('.Window')).toHaveLength(1);
      expect(element(target, '.TitleBar__title').textContent).toBe(
        sampleConfig().title,
      );
      expect(target.querySelectorAll('.Workbench__recipe')).toHaveLength(9);
      const hostEpoch = fixture.read().hostEpoch;
      const window = element(target, '.Window');
      const buckets = [
        ...target.querySelectorAll<HTMLButtonElement>('.Workbench__recipe'),
      ].filter(
        (row) =>
          row.querySelector('.Workbench__recipe-name')?.textContent ===
          'Wooden bucket',
      );
      expect(buckets).toHaveLength(2);
      await click(fixture, buckets[1]);
      const beforeCraft = fixture.endpoint.totalRecordedCalls;
      for (const label of [
        'Craft 1',
        'Craft 2',
        'Craft 3',
        'Craft 5',
        'Repeat',
      ]) {
        await click(fixture, button(target, label));
      }
      expect(fixture.endpoint.totalRecordedCalls).toBe(beforeCraft + 5);
      expect(
        fixture.endpoint.calls.slice(-5).map((call) => call.arguments),
      ).toEqual([
        ['act/craft', { item: '/sample/bucket/planks' }],
        ['act/craft', { item: '/sample/bucket/planks', amount: 2 }],
        ['act/craft', { item: '/sample/bucket/planks', amount: 3 }],
        ['act/craft', { item: '/sample/bucket/planks', amount: 5 }],
        ['act/craft', { item: '/sample/bucket/planks', auto: true }],
      ]);
      const data = fixture.store.getState().backend.data;
      const selected = Object.values(data.crafting_recipes.Woodworking).find(
        (recipe: any) => recipe.path === '/sample/bucket/planks',
      ) as { req_text: string };
      selected.req_text = 'SAMPLE integration update: seven wooden planks';
      fixture.update({ data });
      await fixture.settle();
      expect(element(target, '.Workbench__requirements').textContent).toContain(
        selected.req_text,
      );

      const beforeLocalScreens = fixture.endpoint.totalRecordedCalls;
      await navigate(fixture, 'treasury');
      expect(s.current('treasury').controller.snapshot().page).toBeUndefined();
      await s.advance(80);
      expect(target.querySelectorAll('tbody tr')).toHaveLength(50);
      await click(fixture, button(target, 'Older'));
      await s.advance(80);
      expect(s.current('treasury').controller.snapshot().page?.page).toBe(2);
      expect(target.querySelectorAll('tbody tr')).toHaveLength(1);
      const treasurySearch = element<HTMLInputElement>(
        target,
        '.SampleApplication__screen input',
      );
      await enter(fixture, treasurySearch, '  BOUNDARY-only needle  ');
      await s.advance(249);
      expect(s.current('treasury').controller.snapshot().page?.page).toBe(2);
      await s.advance(81);
      expect(s.current('treasury').controller.snapshot().page?.shown).toBe(1);
      expect(element(target, 'tbody').textContent).toContain(
        'boundary-only needle',
      );
      expect(treasurySearch.value).toBe('  BOUNDARY-only needle  ');

      await navigate(fixture, 'market');
      await click(fixture, element(target, '[data-market-side="import"]'));
      const market = s.current('market').controller;
      expect(market.snapshot().request?.side).toBe('import');
      expect(market.snapshot().serverResponse).toBeNull();
      await click(
        fixture,
        element(target, '[data-sample-deliver="market-current"]'),
      );
      expect(market.snapshot().serverResponse).not.toBeNull();
      expect(market.snapshot().quoteState?.response).toBeTruthy();
      expect(target.textContent).toContain('No shipment was placed.');

      await navigate(fixture, 'readability');
      const readability = s.current('readability');
      const toggle = element<HTMLButtonElement>(
        target,
        '[data-toggle-id="fullscreen"]',
      );
      expect(toggle.getAttribute('aria-pressed')).toBe('false');
      await click(fixture, toggle);
      expect(readability.pendingCount()).toBe(1);
      expect(toggle.getAttribute('aria-pressed')).toBe('false');
      await click(
        fixture,
        element(target, '[data-sample-deliver="readability"]'),
      );
      expect(readability.pendingCount()).toBe(0);
      expect(toggle.getAttribute('aria-pressed')).toBe('true');
      expect(fixture.endpoint.totalRecordedCalls).toBe(beforeLocalScreens);
      expect(fixture.read().hostEpoch).toBe(hostEpoch);
      expect(element(target, '.Window')).toBe(window);
      expect(networkGuard.attempted).toBe(0);
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: local navigation revokes a captured craft callback synchronously, before React commits`, async () => {
    const s = await mountedFixture(Screen);
    const { fixture, target } = s;
    try {
      const old = s.current('workbench');
      const action = fixture.action!;
      expect(typeof action).toBe('function');
      const workbench = element(target, '.Workbench');
      const hostEpoch = fixture.read().hostEpoch;
      const screenEpoch = fixture.read().screenEpoch;
      // No flushSync and no await: React has not committed the route header.
      // The renderer may already detach its owned stale content synchronously.
      expect(fixture.sessionManager.navigate('treasury')).toBe(true);
      expect(
        element(target, '[data-sample-route="workbench"]').getAttribute(
          'aria-current',
        ),
      ).toBe('page');
      expect(old.lease.isCurrent()).toBe(false);
      expectCraftRejected(fixture, action);
      expect(fixture.read().hostEpoch).toBe(hostEpoch);
      expect(fixture.read().screenEpoch).toBe(screenEpoch + 1);
      fixture.sessionManager.navigate('workbench');
      expect(old.lease.isCurrent()).toBe(false);
      expectCraftRejected(fixture, action);
      await fixture.settle();
      expect(s.current('workbench')).not.toBe(old);
      expect(element(target, '.Workbench')).not.toBe(workbench);
      expectCraftRejected(fixture, action);
      // Exercise the endpoint's bounded log before checking the stale callback.
      for (let index = 0; index < 205; index++)
        fixture.endpoint.api.sendMessage('ping/reply');
      expect(fixture.endpoint.dropped).toBeGreaterThan(0);
      expectCraftRejected(fixture, action);
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: same-route navigation is a no-op, while leaving resets draft, selection and focus`, async () => {
    const s = await mountedFixture(Screen);
    const { fixture, target } = s;
    try {
      const search = element<HTMLInputElement>(
        target,
        '.Workbench input[type="search"]',
      );
      await enter(fixture, search, 'bucket');
      expect(target.querySelectorAll('.Workbench__recipe')).toHaveLength(2);
      const firstRecipe = element<HTMLButtonElement>(
        target,
        '.Workbench__recipe',
      );
      await click(fixture, firstRecipe);
      const detail = element(target, '.Workbench__requirements');
      const craft = button(target, 'Craft 1');
      craft.focus();
      const active = s.current('workbench');
      const before = fixture.read();
      expect(fixture.navigate('workbench')).toBe(false);
      await fixture.settle();
      expect(s.current('workbench')).toBe(active);
      expect(fixture.read().screenEpoch).toBe(before.screenEpoch);
      expect(fixture.read().hostEpoch).toBe(before.hostEpoch);
      expect(fixture.read().mounts).toBe(before.mounts);
      expect(element(target, '.Workbench__requirements')).toBe(detail);
      expect(document.activeElement).toBe(craft);
      await navigate(fixture, 'readability');
      expect(document.activeElement).toBe(
        element(target, '.SampleApplication__heading'),
      );
      await navigate(fixture, 'workbench');
      expect(
        element<HTMLInputElement>(target, '.Workbench input[type="search"]')
          .value,
      ).toBe('');
      expect(target.querySelectorAll('.Workbench__recipe')).toHaveLength(9);
      expect(target.querySelector('.Workbench__requirements')).toBeNull();
      expect(document.activeElement).toBe(
        element(target, '.SampleApplication__heading'),
      );
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: canceled treasury timers cannot revive an old visit or affect the replacement`, async () => {
    const s = await mountedFixture(Screen);
    const { fixture } = s;
    try {
      await navigate(fixture, 'treasury');
      await s.advance(80);
      const old = s.current('treasury');
      await enter(
        fixture,
        element<HTMLInputElement>(s.target, '.SampleApplication__screen input'),
        'stale search',
      );
      old.controller.refresh();
      const queued = [...s.clock.pending.values()].map(
        ({ callback }) => callback,
      );
      expect(queued.length).toBeGreaterThanOrEqual(2);
      fixture.sessionManager.navigate('market');
      expect(old.lease.isCurrent()).toBe(false);
      expect(old.controller.snapshot().open).toBe(false);
      expect(s.clock.pending.size).toBe(0);
      fixture.sessionManager.navigate('treasury');
      await fixture.settle();
      await s.advance(80);
      const fresh = s.current('treasury');
      const snapshot = fresh.controller.snapshot();
      const beforeCalls = fixture.endpoint.totalRecordedCalls;
      flushSync(() => {
        queued.forEach((callback) => callback());
        old.controller.open();
        old.controller.draft('cannot re-open retired controller');
        old.controller.page(2);
        old.controller.refresh();
      });
      await fixture.settle();
      expect(old.controller.snapshot()).toEqual({ open: false, draft: '' });
      expect(fresh.controller.snapshot()).toBe(snapshot);
      expect(snapshot.draft).toBe('');
      expect(snapshot.page?.page).toBe(1);
      expect(fixture.endpoint.totalRecordedCalls).toBe(beforeCalls);
      expect(s.clock.pending.size).toBe(0);
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: queued readability delivery and retained callbacks stay retired after leave-return`, async () => {
    const s = await mountedFixture(Screen);
    const { fixture, target } = s;
    try {
      await navigate(fixture, 'readability');
      const old = s.current('readability');
      await click(fixture, element(target, '[data-toggle-id="fullscreen"]'));
      expect(old.pendingCount()).toBe(1);
      const deliver = old.deliverNext;
      fixture.sessionManager.navigate('treasury');
      expect(old.lease.isCurrent()).toBe(false);
      expect(old.pendingCount()).toBe(0);
      expect(old.controller.snapshot()).toEqual({ open: false });
      fixture.sessionManager.navigate('readability');
      await fixture.settle();
      const fresh = s.current('readability');
      const snapshot = fresh.controller.snapshot();
      flushSync(() => {
        deliver();
        old.controller.open();
        old.controller.toggle('fullscreen');
        old.controller.select('hud_colorblind_palette', 'protan');
      });
      await fixture.settle();
      expect(fresh.controller.snapshot()).toBe(snapshot);
      expect(fresh.pendingCount()).toBe(0);
      expect(old.controller.snapshot()).toEqual({ open: false });
      expect(
        element(target, '[data-toggle-id="fullscreen"]').getAttribute(
          'aria-pressed',
        ),
      ).toBe('false');
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: old market responses cannot publish into a fresh visit`, async () => {
    const s = await mountedFixture(Screen);
    const { fixture, target } = s;
    try {
      await navigate(fixture, 'market');
      await click(fixture, element(target, '[data-market-side="import"]'));
      const old = s.current('market');
      const oldState = old.controller.snapshot();
      const response = getPreviewResponse(
        oldState.sample,
        oldState.request!,
        oldState.draft,
        'current',
      );
      const deliver = old.controller.deliver;
      fixture.sessionManager.navigate('workbench');
      expect(old.lease.isCurrent()).toBe(false);
      expect(old.controller.snapshot().request).toBeNull();
      fixture.sessionManager.navigate('market');
      await fixture.settle();
      await click(fixture, element(target, '[data-market-side="import"]'));
      const fresh = s.current('market');
      const snapshot = fresh.controller.snapshot();
      expect(snapshot.draft.id).not.toBe(oldState.draft.id);
      let deliveries = 0;
      const unsubscribe = fresh.controller.subscribe(() => deliveries++);
      flushSync(() => {
        deliver(response);
        old.controller.openQuote(oldState.request!);
        old.controller.deliverPreview('current');
        old.controller.setQuantity('99');
      });
      await fixture.settle();
      expect(deliveries).toBe(0);
      expect(fresh.controller.snapshot()).toBe(snapshot);
      expect(snapshot.serverResponse).toBeNull();
      expect(old.controller.snapshot().request).toBeNull();
      // Even delivery through the current controller must obey real correlation.
      flushSync(() => fresh.controller.deliver(response));
      await fixture.settle();
      expect(fresh.controller.snapshot().quoteState?.response).toBeFalsy();
      expect(fresh.controller.snapshot().deliveryNote).toContain(
        'Stale or mismatched',
      );
      await click(
        fixture,
        element(target, '[data-sample-deliver="market-current"]'),
      );
      expect(fresh.controller.snapshot().quoteState?.response).toBeTruthy();
      unsubscribe();
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: close, resume, coalesced host transitions, refresh and pooled key replacement fence old actions`, async () => {
    const s = await mountedFixture(Screen);
    const { fixture, target } = s;
    try {
      const beforeClose = fixture.action!;
      await click(fixture, element(target, '[aria-label="Close window"]'));
      expect(fixture.read().suspending).toBe(true);
      expect(fixture.read().active).toBe(false);
      expect(
        fixture.endpoint.calls.some(
          (call) =>
            call.method === 'sendMessage' && call.arguments[0] === 'suspend',
        ),
      ).toBe(true);
      expectCraftRejected(fixture, beforeClose);
      fixture.dispatch('suspend');
      await fixture.settle();
      expect(target.querySelector('.Window')).toBeNull();
      fixture.resume();
      await fixture.settle();
      expect(target.querySelectorAll('.Window')).toHaveLength(1);
      expectCraftRejected(fixture, beforeClose);

      const beforeBatched = fixture.action!;
      const old = s.current('workbench');
      const hostEpoch = fixture.read().hostEpoch;
      fixture.store.dispatch({ type: 'suspend' });
      fixture.store.dispatch({
        type: 'update',
        payload: { config: sampleConfig(), data: createDemoData() },
      });
      expect(old.lease.isCurrent()).toBe(false);
      expect(fixture.read().hostEpoch).toBeGreaterThan(hostEpoch);
      expectCraftRejected(fixture, beforeBatched);
      await fixture.settle();
      expectCraftRejected(fixture, beforeBatched);

      for (const [away, back] of [
        [{ refreshing: true }, { refreshing: false }],
        [
          { interface: { name: 'UnrelatedSample', layout: 'Window' } },
          { interface: sampleConfig().interface },
        ],
        [
          { interface: { name: 'SampleApplication', layout: 'OtherLayout' } },
          { interface: sampleConfig().interface },
        ],
      ]) {
        const action = fixture.action!;
        const session = s.current('workbench');
        fixture.update({ config: away });
        expect(session.lease.isCurrent()).toBe(false);
        expect(fixture.read().active).toBe(false);
        expectCraftRejected(fixture, action);
        fixture.update({ config: back });
        await fixture.settle();
        expect(fixture.read().active).toBe(true);
        expectCraftRejected(fixture, action);
      }
      const beforeKey = fixture.action!;
      const oldNode = element(target, '.Workbench');
      fixture.update({
        config: {
          window: sampleConfig('sample-application-replacement').window,
        },
      });
      await fixture.settle();
      expect(element(target, '.Workbench')).not.toBe(oldNode);
      expectCraftRejected(fixture, beforeKey);
      fixture.update({ config: { status: 1 } });
      expect(target.querySelector('.Window__dimmer')).not.toBeNull();
      fixture.update({ config: { status: 2 } });
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: removing and remounting the React root retires the chosen screen and cleans every subscription`, async () => {
    const s = await mountedFixture(Screen);
    const { fixture, target } = s;
    try {
      await navigate(fixture, 'treasury');
      const old = s.current('treasury');
      const delayed = [...s.clock.callbacks];
      fixture.unmountRoot();
      expect(old.lease.isCurrent()).toBe(false);
      expect(old.controller.snapshot().open).toBe(false);
      expect(fixture.read().rootMounted).toBe(false);
      await fixture.settle();
      expect(fixture.read().mounts).toBe(fixture.read().unmounts);
      expect(fixture.read().pendingDisposals).toBe(0);
      expect(s.clock.pending.size).toBe(0);
      fixture.mountRoot();
      await fixture.settle();
      expect(fixture.read().route).toBe('treasury');
      expect(s.current('treasury')).not.toBe(old);
      expect(target.querySelectorAll('.Window')).toHaveLength(1);
      const fresh = s.current('treasury').controller.snapshot();
      flushSync(() => delayed.forEach((callback) => callback()));
      expect(s.current('treasury').controller.snapshot()).toBe(fresh);
      await s.advance(80);
      expect(target.querySelectorAll('tbody tr')).toHaveLength(50);
      await fixture.dispose();
      const disposed = fixture.read();
      await fixture.dispose();
      expect(fixture.read()).toEqual(disposed);
      expect(() => fixture.navigate('workbench')).toThrow('disposed');
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: tracked delayed view disposal does not keep a retired lease valid or clear a newer screen`, async () => {
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = false;
    const DelayedScreen: ScreenRenderer = (props: ScreenProps) => {
      useLayoutEffect(
        () => () => {
          if (!held) {
            held = true;
            props.lifecycle.pending(delayed);
          }
        },
        [],
      );
      return <Screen {...props} />;
    };
    const s = await mountedFixture(DelayedScreen);
    const { fixture, target } = s;
    try {
      const old = s.current('workbench');
      const stale = fixture.action!;
      fixture.navigate('readability');
      const next = s.current('readability');
      expect(old.lease.isCurrent()).toBe(false);
      expect(next.lease.isCurrent()).toBe(true);
      expect(fixture.read().pendingDisposals).toBeGreaterThan(0);
      expectCraftRejected(fixture, stale);
      let settled = false;
      const waiting = fixture.settle().then(() => {
        settled = true;
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 30));
      expect(settled).toBe(false);
      expect(
        element(target, '.SampleApplication__screen').dataset.activeScreen,
      ).toBe('readability');
      release();
      await waiting;
      expect(fixture.read().pendingDisposals).toBe(0);
      expect(next.lease.isCurrent()).toBe(true);
      expect(element(target, '[data-toggle-id="fullscreen"]')).toBeDefined();
      expectCraftRejected(fixture, stale);
    } finally {
      release();
      await s.dispose();
    }
  });
}

test('failed root creation restores global store and storage ownership before the next fixture', async () => {
  const originalStore = backend.globalStore;
  const originalStorage = Object.getOwnPropertyDescriptors(storage);
  expect(() =>
    createFixture({} as HTMLElement, ReactScreen, createScreenSession),
  ).toThrow();
  expect(backend.globalStore).toBe(originalStore);
  for (const name of ['get', 'set', 'remove', 'clear']) {
    expect(Object.getOwnPropertyDescriptor(storage, name)).toEqual(
      originalStorage[name],
    );
  }
  const s = await mountedFixture(ReactScreen);
  try {
    expect(s.fixture.read().active).toBe(true);
    expect(s.target.querySelectorAll('.Window')).toHaveLength(1);
  } finally {
    await s.dispose();
  }
  expect(backend.globalStore).toBe(originalStore);
});

test('fixture cleanup restores owned storage methods without deleting another owner replacement', async () => {
  const original = Object.getOwnPropertyDescriptor(storage, 'get');
  const s = await mountedFixture(ReactScreen);
  const foreignGet = async () => 'foreign test-only owner';
  try {
    Object.defineProperty(storage, 'get', {
      configurable: true,
      writable: true,
      value: foreignGet,
    });
    await s.fixture.dispose();
    expect(storage.get).toBe(foreignGet);
  } finally {
    await s.dispose();
    if (original) Object.defineProperty(storage, 'get', original);
    else Reflect.deleteProperty(storage, 'get');
  }
});

test('emitted production functions use the lexical guarded facade, not a quoted define or native global', () => {
  for (const source of [
    setWindowPosition.toString(),
    backend.backendMiddleware.toString(),
    backend.sendAct.toString(),
    Window.toString(),
  ]) {
    expect(source).toContain('__sampleEndpointFacade.');
    expect(source).not.toMatch(/\bByond\s*\./);
    expect(source).not.toMatch(/["']__sampleEndpointFacade["']\s*\./);
  }
  expect(Object.hasOwn(globalThis, '__sampleEndpointBinding')).toBe(false);
  expect(Object.hasOwn(globalThis, '__sampleEndpointFacade')).toBe(false);
  expect(Object.hasOwn(window, '__sampleEndpointBinding')).toBe(false);
  expect(Object.hasOwn(window, '__sampleEndpointFacade')).toBe(false);
});

for (const [arm, Screen] of arms) {
  for (const mutation of [
    'global Byond',
    'window Byond',
    'window hubStorage',
  ] as const) {
    test(`${arm}: actual Window Close and direct/retained production calls refuse late ${mutation}`, async () => {
      const sample = await mountedFixture(Screen);
      const target = mutation === 'global Byond' ? globalThis : window;
      const property =
        mutation === 'window hubStorage' ? 'hubStorage' : 'Byond';
      const original = Object.getOwnPropertyDescriptor(target, property);
      const capturedWinset = __sampleEndpointFacade.winset;
      const capturedSend = __sampleEndpointFacade.sendMessage;
      const capturedCraft = backend.sendAct;
      const before = sample.fixture.endpoint.totalRecordedCalls;
      const beforeSubscriptions = sample.fixture.endpoint.subscriptions;
      let foreignReads = 0;
      let foreignCalls = 0;
      const foreign = new Proxy(
        {
          windowId: 'inert-replacement-no-transport',
          sendMessage() {
            foreignCalls++;
          },
          winset() {
            foreignCalls++;
            return Promise.resolve();
          },
          winget() {
            foreignCalls++;
            return Promise.resolve({ x: 0, y: 0 });
          },
        },
        {
          get(object, key, receiver) {
            foreignReads++;
            return Reflect.get(object, key, receiver);
          },
        },
      );
      Object.defineProperty(target, property, {
        configurable: true,
        value: foreign,
      });
      try {
        expect(() => boundary.validate()).toThrow('unowned globals');
        // This follows the actual close element -> real backend middleware path,
        // not fixture.dispatch (which already has its own entry validation).
        const eventErrors = reactBoundaryErrors.capture(() => {
          flushSync(() =>
            element<HTMLElement>(sample.target, '.TitleBar__close').click(),
          );
        });
        expect(eventErrors).toHaveLength(1);
        expect(String(eventErrors[0])).toContain('unowned globals');
        expect(() => setWindowPosition([17, 23])).toThrow('unowned globals');
        await expect(setupDrag()).rejects.toThrow('unowned globals');
        expect(() => capturedWinset('fixture', { focus: true })).toThrow(
          'unowned globals',
        );
        expect(() => capturedSend('ping/reply')).toThrow('unowned globals');
        expect(() =>
          capturedCraft('craft', { item: '/sample/bucket/planks' }),
        ).toThrow('unowned globals');
        expect(sample.fixture.endpoint.totalRecordedCalls).toBe(before);
        expect(sample.fixture.endpoint.subscriptions).toBe(beforeSubscriptions);
        expect(foreignReads).toBe(0);
        expect(foreignCalls).toBe(0);
        expect(sample.fixture.read().suspending).toBe(false);
      } finally {
        if (original) Object.defineProperty(target, property, original);
        else Reflect.deleteProperty(target, property);
        await sample.dispose();
      }
    });
  }
}

afterAll(() => {
  try {
    expect(networkGuard.attempted).toBe(0);
    boundary.dispose();
  } finally {
    reactBoundaryErrors.restore();
    networkGuard.restore();
    Reflect.deleteProperty(globalThis, '__disconnectedWebpackContext');
  }
});
