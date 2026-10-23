import '../test-network-guard';
// This existing test-only parser correction is needed for genuine compiled
// Svelte table rows in Happy DOM, not by either application entry in a browser.
import '../../treasury-ledger/test-dom';

import { pathToFileURL } from 'node:url';

import { expect, test } from 'bun:test';

import type { Fixture } from '../runtime';
import { networkGuard } from '../test-network-guard';
import type * as Bootstrap from './application-bootstrap';
import type { DeferredSession } from './deferred-screens';
import type * as Binding from './module-binding';

// GlobalRegistrator exposes a separate Window object. Guard its API aliases too;
// changing globalThis.fetch alone does not prove window.fetch was replaced.
let windowNetworkAttempts = 0;
const denyWindowNetwork = () => {
  windowNetworkAttempts++;
  throw new Error(
    'Window network APIs are forbidden in emitted application tests.',
  );
};
for (const name of [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'Worker',
]) {
  Object.defineProperty(window, name, {
    configurable: true,
    writable: true,
    value: denyWindowNetwork,
  });
}
Object.defineProperty(window.navigator, 'sendBeacon', {
  configurable: true,
  value: denyWindowNetwork,
});

const scenario = process.env.LOADING_APPLICATION_CASE;
const mode = process.env.LOADING_APPLICATION_MODE;
const arm = process.env.LOADING_APPLICATION_ARM;
if (
  !scenario ||
  !['workbench', 'eager', 'lazy'].includes(mode ?? '') ||
  !['react', 'svelte'].includes(arm ?? '')
) {
  throw new Error(
    'Run run-application.ts for checked, fresh-process artifact isolation.',
  );
}
const url = (file: string) =>
  pathToFileURL(`${import.meta.dir}/dist/application/${mode}/${arm}/${file}`)
    .href;
const bootstrap = () =>
  import(url('application-bootstrap.js')) as Promise<typeof Bootstrap>;
const singleton = () =>
  import(url('endpoint-binding.js')) as Promise<typeof Binding>;
const application = () =>
  import(url('app.js')) as Promise<{ start(): Promise<Fixture> }>;
const auxiliary = () => {
  const path = process.env.LOADING_APPLICATION_AUXILIARY;
  if (!path || !/^[\w.-]+\.js$/.test(path)) {
    throw new Error('Missing audited direct auxiliary module URL.');
  }
  return import(url(path));
};

function foreign(
  target: object,
  property: 'Byond' | 'hubStorage',
  inherited: boolean,
) {
  let reads = 0;
  const previous = Object.getOwnPropertyDescriptor(target, property);
  const prototype = Object.getPrototypeOf(target);
  const holder = inherited ? Object.create(prototype) : target;
  Object.defineProperty(holder, property, {
    configurable: true,
    get() {
      reads++;
      throw new Error('Foreign application accessor must never be read.');
    },
  });
  if (inherited) Object.setPrototypeOf(target, holder);
  return {
    reads: () => reads,
    restore() {
      if (inherited) Object.setPrototypeOf(target, prototype);
      else if (previous) Object.defineProperty(target, property, previous);
      else Reflect.deleteProperty(target, property);
    },
  };
}

function element<T extends HTMLElement = HTMLElement>(
  target: ParentNode,
  selector: string,
): T {
  const node = target.querySelector<T>(selector);
  if (!node) {
    throw new Error(`Expected emitted application element: ${selector}`);
  }
  return node;
}
async function click(fixture: Fixture, node: HTMLElement) {
  // Do not import source React/flushSync: that would be a second React identity.
  node.click();
  await fixture.settle();
}
async function eventually(fixture: Fixture, predicate: () => boolean) {
  const deadline = Date.now() + 2500;
  while (!predicate() && Date.now() < deadline) await fixture.settle();
  expect(predicate()).toBe(true);
}
function expectClean(fixture: Fixture, errors: string[] = []) {
  const final = fixture.read();
  expect(final.rootMounted).toBe(false);
  expect(final.active).toBe(false);
  expect(final.subscriptions).toBe(0);
  expect(final.pendingDisposals).toBe(0);
  expect(final.mounts).toBe(final.unmounts);
  expect(final.errors).toEqual(errors);
  expect(final.nativeSubscriptionAttempts).toBe(0);
  expect(fixture.target.childElementCount).toBe(0);
  expect('sampleApplication' in window).toBe(false);
  expect(document.getElementById('fixture-controls')!.childElementCount).toBe(
    0,
  );
}

async function mountedJourney(fixture: Fixture) {
  const target = fixture.target;
  const initial = fixture.read();
  const originalWindow = element(target, '.Window');
  const store = fixture.store;
  expect(initial.rootMounted).toBe(true);
  expect(initial.active).toBe(true);
  expect(initial.route).toBe('workbench');
  expect(initial.mounts - initial.unmounts).toBe(1);
  expect(initial.errors).toEqual([]);
  expect(target.querySelectorAll('.Window')).toHaveLength(1);
  expect(target.querySelectorAll('[data-sample-screen-host]')).toHaveLength(1);
  expect(target.querySelectorAll('[data-sample-screen-target]')).toHaveLength(
    1,
  );
  expect(target.querySelectorAll('.Workbench__recipe')).toHaveLength(9);
  expect(element(target, '.TitleBar__title').textContent).toBe(
    'Tithewood sample application',
  );
  const oldSession = fixture.sessionManager.snapshot().session!;
  const oldAction = fixture.action!;
  expect(typeof oldAction).toBe('function');
  expect(fixture.navigate('workbench')).toBe(false);
  expect(fixture.sessionManager.snapshot().session).toBe(oldSession);

  const buckets = [
    ...target.querySelectorAll<HTMLButtonElement>('.Workbench__recipe'),
  ].filter(
    (node) =>
      node.querySelector('.Workbench__recipe-name')?.textContent ===
      'Wooden bucket',
  );
  expect(buckets).toHaveLength(2);
  await click(fixture, buckets[1]);
  const craft = [...target.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent?.trim() === 'Craft 3',
  )!;
  expect(craft).toBeDefined();
  await click(fixture, craft);
  expect(fixture.endpoint.calls.at(-1)?.arguments).toEqual([
    'act/craft',
    { item: '/sample/bucket/planks', amount: 3 },
  ]);
  const data = fixture.store.getState().backend.data;
  const selected = Object.values(data.crafting_recipes.Woodworking).find(
    (recipe: any) => recipe.path === '/sample/bucket/planks',
  ) as { req_text: string };
  selected.req_text =
    'EMITTED APPLICATION same-object update: thirteen wooden planks';
  fixture.update({ data });
  await fixture.settle();
  expect(element(target, '.Workbench__requirements').textContent).toContain(
    'thirteen wooden planks',
  );

  if (mode !== 'workbench') {
    const count = fixture.endpoint.totalRecordedCalls;
    for (const route of [
      'treasury',
      'market',
      'readability',
      'archive',
      'dialogs',
    ] as const) {
      await click(fixture, element(target, `[data-sample-route="${route}"]`));
      await eventually(
        fixture,
        () => !!target.querySelector('[data-sample-screen-target]'),
      );
      expect(fixture.read().route).toBe(route);
      expect(
        element(target, '.SampleApplication__screen').dataset.activeScreen,
      ).toBe(route);
      expect(target.querySelectorAll('[data-sample-screen-host]')).toHaveLength(
        1,
      );
      expect(
        target.querySelectorAll('[data-sample-screen-target]'),
      ).toHaveLength(1);
      expect(fixture.read().mounts - fixture.read().unmounts).toBe(1);
      expect(element(target, '.Window')).toBe(originalWindow);
      expect(fixture.store).toBe(store);
      expect(fixture.read().hostEpoch).toBe(initial.hostEpoch);
      expect(oldSession.lease.isCurrent()).toBe(false);
      oldAction('craft', { item: '/sample/bucket/planks' });
      expect(fixture.endpoint.totalRecordedCalls).toBe(count);
      if (route === 'treasury') {
        await eventually(
          fixture,
          () => target.querySelectorAll('tbody tr').length === 50,
        );
      } else if (route === 'market') {
        await click(fixture, element(target, '[data-market-side="import"]'));
        await click(
          fixture,
          element(target, '[data-sample-deliver="market-current"]'),
        );
        expect(target.textContent).toContain('No shipment was placed.');
      } else if (route === 'readability') {
        const toggle = element(target, '[data-toggle-id="fullscreen"]');
        expect(toggle.getAttribute('aria-pressed')).toBe('false');
        await click(fixture, toggle);
        expect(toggle.getAttribute('aria-pressed')).toBe('false');
        await click(
          fixture,
          element(target, '[data-sample-deliver="readability"]'),
        );
        expect(toggle.getAttribute('aria-pressed')).toBe('true');
      } else if (route === 'dialogs') {
        const launcher = element(target, '[data-sample-id="selection-small"]');
        await click(fixture, launcher);
        await click(
          fixture,
          element(target, '[aria-label="Close sample window"]'),
        );
        expect(
          target.querySelector('[aria-label="Close sample window"]'),
        ).toBeNull();
        expect(document.activeElement).toBe(launcher);
      }
      expect(fixture.read().errors).toEqual([]);
    }
    expect(fixture.endpoint.totalRecordedCalls).toBe(count);
    await click(fixture, element(target, '[data-sample-route="workbench"]'));
    expect(element(target, '.Workbench').getAttribute('data-open')).toBe(
      'false',
    );
    expect(fixture.sessionManager.snapshot().session).not.toBe(oldSession);
  }
  const actionBeforeUnmount = fixture.action!;
  const currentSession = fixture.sessionManager.snapshot().session!;
  const count = fixture.endpoint.totalRecordedCalls;
  fixture.unmountRoot();
  expect(currentSession.lease.isCurrent()).toBe(false);
  expect(target.querySelector('[data-sample-screen-target]')).toBeNull();
  actionBeforeUnmount('craft', { item: '/sample/bucket/planks' });
  expect(fixture.endpoint.totalRecordedCalls).toBe(count);
  fixture.mountRoot();
  await fixture.settle();
  expect(fixture.read().rootMounted).toBe(true);
  expect(fixture.read().active).toBe(true);
  expect(target.querySelectorAll('.Workbench__recipe')).toHaveLength(9);
  expect(fixture.store).toBe(store);
  expect(fixture.sessionManager.snapshot().session).not.toBe(currentSession);
  const afterRemount = fixture.endpoint.totalRecordedCalls;
  actionBeforeUnmount('craft', { item: '/sample/bucket/planks' });
  expect(fixture.endpoint.totalRecordedCalls).toBe(afterRemount);
}

test(`${mode}/${arm}: ${scenario}`, async () => {
  document.body.innerHTML =
    '<div id="fixture-root"></div><aside id="fixture-controls"></aside>';
  const singletonModule = await singleton();
  const { binding, facade } = singletonModule;
  expect(Object.isFrozen(binding)).toBe(true);
  expect(Object.isFrozen(facade)).toBe(true);
  expect(() => binding.read()).toThrow('has not been installed');
  for (const name of [
    '__sampleEndpointBinding',
    '__sampleEndpointFacade',
    '__loadingExcludedStories',
  ]) {
    expect(name in globalThis).toBe(false);
    expect(name in window).toBe(false);
  }
  let entry: typeof Bootstrap | undefined;
  let fixture: Fixture | undefined;
  try {
    if (scenario.startsWith('startup ')) {
      const [, importKind, location, property, ownership] = scenario.split(' ');
      const target = location === 'global' ? globalThis : window;
      const replacement = foreign(
        target,
        property as 'Byond' | 'hubStorage',
        ownership === 'inherited',
      );
      try {
        // A direct app import bypasses the intended bootstrap entry. Depending
        // on static chunk order, its guard can reject the missing binding even
        // before bootstrap reaches the foreign descriptor. Both are fail-closed;
        // the actual bootstrap entry must still reject the foreign ownership.
        await expect(
          importKind === 'bootstrap' ? bootstrap() : application(),
        ).rejects.toThrow(
          importKind === 'bootstrap'
            ? 'unowned globals'
            : /unowned globals|The sample endpoint binding has not been installed\./,
        );
        expect(() => binding.read()).toThrow('has not been installed');
        expect(replacement.reads()).toBe(0);
        expect(property in target).toBe(true);
        expect(document.getElementById('fixture-root')!.childElementCount).toBe(
          0,
        );
        expect('sampleApplication' in window).toBe(false);
      } finally {
        replacement.restore();
      }
    } else {
      entry = await bootstrap();
      expect(await bootstrap()).toBe(entry);
      expect(binding.read()).toBe(entry.endpoint.api);
      expect(Object.isFrozen(entry.endpoint.api)).toBe(true);
      for (const target of [globalThis, window]) {
        const descriptor = Object.getOwnPropertyDescriptor(target, 'Byond')!;
        expect(descriptor.value).toBe(entry.endpoint.api);
        expect(descriptor.get).toBeUndefined();
        expect(descriptor.writable).toBe(false);
        expect(descriptor.enumerable).toBe(false);
        expect(descriptor.configurable).toBe(true);
      }
      let duplicateValidation = 0;
      expect(() =>
        binding.install(entry!.endpoint.api, () => duplicateValidation++),
      ).toThrow('only be installed once');
      expect(duplicateValidation).toBe(0);

      if (scenario === 'pending application import retires before evaluation') {
        const pending = entry.startApplication();
        entry.boundary.dispose();
        await expect(pending).rejects.toThrow('unowned globals');
        expect(entry.endpoint.totalRecordedCalls).toBe(0);
        expect(() => entry!.startApplication()).toThrow('unowned globals');
        expect(document.getElementById('fixture-root')!.childElementCount).toBe(
          0,
        );
        expect('sampleApplication' in window).toBe(false);
      } else if (scenario.startsWith('pending foreign ')) {
        const [, , location, property, ownership] = scenario.split(' ');
        const target = location === 'global' ? globalThis : window;
        const pending = entry.startApplication();
        const replacement = foreign(
          target,
          property as 'Byond' | 'hubStorage',
          ownership === 'inherited',
        );
        try {
          await expect(pending).rejects.toThrow('unowned globals');
          expect(entry.endpoint.totalRecordedCalls).toBe(0);
          expect(replacement.reads()).toBe(0);
          expect(property in target).toBe(true);
          expect(
            document.getElementById('fixture-root')!.childElementCount,
          ).toBe(0);
        } finally {
          replacement.restore();
        }
      } else {
        const startup = entry.startApplication();
        expect(entry.startApplication()).toBe(startup);
        fixture = (await startup) as Fixture;
        expect(fixture.endpoint).toBe(entry.endpoint);
        expect(binding.read()).toBe(fixture.endpoint.api);
        expect(await entry.startApplication()).toBe(fixture);
        const cachedApplication = await application();
        expect(await application()).toBe(cachedApplication);
        expect(typeof cachedApplication.start).toBe('function');
        if (
          scenario ===
          'mounted emitted application preserves real routes and disposal'
        ) {
          await mountedJourney(fixture);
          await fixture.dispose();
          expectClean(fixture);
        } else if (scenario.startsWith('lazy cold auxiliary foreign ')) {
          expect(mode).toBe('lazy');
          const [, , , , location, property, ownership] = scenario.split(' ');
          const target = location === 'global' ? globalThis : window;
          const replacement = foreign(
            target,
            property as 'Byond' | 'hubStorage',
            ownership === 'inherited',
          );
          const count = entry.endpoint.totalRecordedCalls;
          try {
            // Import the real emitted auxiliary URL directly, without the
            // adapter's earlier context validation masking its module guard.
            await expect(auxiliary()).rejects.toThrow('unowned globals');
            expect(replacement.reads()).toBe(0);
            expect(property in target).toBe(true);
            expect(entry.endpoint.totalRecordedCalls).toBe(count);
            expect(fixture.read().route).toBe('workbench');
            expect(fixture.target.querySelectorAll('.Workbench')).toHaveLength(
              1,
            );
          } finally {
            replacement.restore();
          }
          expect(binding.read()).toBe(entry.endpoint.api);
          await fixture.dispose();
          expectClean(fixture);
        } else if (scenario.startsWith('lazy pending auxiliary ')) {
          expect(mode).toBe('lazy');
          const originalWindow = element(fixture.target, '.Window');
          const count = entry.endpoint.totalRecordedCalls;
          fixture.navigate('treasury');
          const stale = fixture.sessionManager.snapshot()
            .session as DeferredSession;
          expect(stale.snapshot().status).toBe('loading');
          // The first turn starts the owned loader; the second calls its real
          // import. No timer, module implementation or production store is mocked.
          await Promise.resolve();
          await Promise.resolve();
          expect(stale.snapshot().status).toBe('loading');
          if (scenario.endsWith('newer navigation wins')) {
            fixture.navigate('market');
            expect(stale.lease.isCurrent()).toBe(false);
            expect(stale.snapshot().status).toBe('retired');
            await eventually(
              fixture,
              () =>
                !!fixture!.target.querySelector('[data-market-side="import"]'),
            );
            const newer = fixture.sessionManager.snapshot()
              .session as DeferredSession;
            expect(newer.snapshot().status).toBe('ready');
            expect(fixture.read().route).toBe('market');
            expect(
              fixture.target.querySelectorAll('[data-sample-screen-target]'),
            ).toHaveLength(1);
            expect(element(fixture.target, '.Window')).toBe(originalWindow);
            expect(stale.snapshot().status).toBe('retired');
            fixture.navigate('treasury');
            await eventually(
              fixture,
              () => fixture!.target.querySelectorAll('tbody tr').length === 50,
            );
            const fresh = fixture.sessionManager.snapshot()
              .session as DeferredSession;
            expect(fresh).not.toBe(stale);
            expect(fresh.snapshot().status).toBe('ready');
            expect(stale.retry()).toBe(false);
            expect(entry.endpoint.totalRecordedCalls).toBe(count);
          } else if (scenario.endsWith('unmount releases old visit')) {
            fixture.unmountRoot();
            expect(stale.lease.isCurrent()).toBe(false);
            expect(stale.snapshot().status).toBe('retired');
            await fixture.settle();
            expect(fixture.target.childElementCount).toBe(0);
            expect(fixture.read().pendingDisposals).toBe(0);
            expect(fixture.read().mounts).toBe(fixture.read().unmounts);
            expect(entry.endpoint.totalRecordedCalls).toBe(count);
            fixture.mountRoot();
            await eventually(
              fixture,
              () => fixture!.target.querySelectorAll('tbody tr').length === 50,
            );
            expect(fixture.sessionManager.snapshot().session).not.toBe(stale);
            expect(stale.snapshot().status).toBe('retired');
            expect(stale.retry()).toBe(false);
          } else if (
            scenario.endsWith('foreign accessor fails without reads')
          ) {
            const replacement = foreign(window, 'hubStorage', false);
            try {
              await eventually(
                fixture,
                () => stale.snapshot().status === 'failed',
              );
              expect(replacement.reads()).toBe(0);
              expect(
                fixture.target.querySelector('[data-sample-screen-target]'),
              ).toBeNull();
              expect(fixture.target.textContent).toContain(
                'Could not load Treasury ledger.',
              );
              expect(entry.endpoint.totalRecordedCalls).toBe(count);
            } finally {
              replacement.restore();
            }
            const failures = fixture.read().errors;
            expect(failures).toHaveLength(1);
            expect(failures[0]).toContain('unowned globals');
            // Pinned Bun can expose function exports from a partially evaluated
            // namespace on retry, then fail in the original session factory.
            // Require a safe visible failure, not the same error string. This
            // is not evidence about browser module-map failure behavior.
            await click(
              fixture,
              element(fixture.target, '[data-deferred-retry]'),
            );
            await eventually(
              fixture,
              () => stale.snapshot().status === 'failed',
            );
            expect(stale.snapshot().attempt).toBe(2);
            const repeated = fixture.read().errors;
            expect(repeated).toHaveLength(2);
            expect(repeated[1].length).toBeGreaterThan(0);
            expect(
              fixture.target.querySelector('[data-sample-screen-target]'),
            ).toBeNull();
            expect(fixture.target.textContent).toContain(
              'Could not load Treasury ledger.',
            );
            expect(binding.read()).toBe(entry.endpoint.api);
            expect(replacement.reads()).toBe(0);
            process.stdout.write(
              `APPLICATION_OBSERVATION ${JSON.stringify({
                kind: 'Bun-only same-URL auxiliary evaluation retry',
                errors: repeated,
                state: stale.snapshot().status,
                foreignAccessorReads: replacement.reads(),
              })}\n`,
            );
            expect(entry.endpoint.totalRecordedCalls).toBe(count);
            await fixture.dispose();
            expectClean(fixture, repeated);
          } else throw new Error(`Unknown lazy application case: ${scenario}`);
          if (!scenario.endsWith('foreign accessor fails without reads')) {
            await fixture.dispose();
            expectClean(fixture);
          }
        } else if (scenario.startsWith('warm foreign ')) {
          const [, , location, property, ownership] = scenario.split(' ');
          const target = location === 'global' ? globalThis : window;
          const action = fixture.action!;
          const count = entry.endpoint.totalRecordedCalls;
          const replacement = foreign(
            target,
            property as 'Byond' | 'hubStorage',
            ownership === 'inherited',
          );
          try {
            for (const operation of [
              () => binding.read(),
              () => facade.sendMessage('ping/reply'),
              () => facade.subscribe(),
              () => entry!.startApplication(),
              () => fixture!.navigate('workbench'),
              () => fixture!.update({ data: {} }),
              () => action('craft', { item: '/sample/bucket/planks' }),
            ]) {
              expect(operation).toThrow('unowned globals');
            }
            await expect(cachedApplication.start()).rejects.toThrow(
              'unowned globals',
            );
            expect(await application()).toBe(cachedApplication);
            expect(entry.endpoint.totalRecordedCalls).toBe(count);
            expect(replacement.reads()).toBe(0);
          } finally {
            replacement.restore();
          }
          await fixture.dispose();
          expectClean(fixture);
        } else if (
          scenario ===
          'cached modules and retained actions lose retirement authority'
        ) {
          const action = fixture.action!;
          const retainedSend = facade.sendMessage;
          const session = fixture.sessionManager.snapshot().session!;
          await fixture.dispose();
          expectClean(fixture);
          entry.boundary.dispose();
          const count = entry.endpoint.totalRecordedCalls;
          expect(session.lease.isCurrent()).toBe(false);
          action('craft', { item: '/sample/bucket/planks' });
          expect(entry.endpoint.totalRecordedCalls).toBe(count);
          expect(await application()).toBe(cachedApplication);
          expect(await bootstrap()).toBe(entry);
          expect(await singleton()).toBe(singletonModule);
          expect(() => retainedSend('ping/reply')).toThrow('unowned globals');
          expect(() => binding.read()).toThrow('unowned globals');
          expect(() => entry!.startApplication()).toThrow('unowned globals');
          expect(() => fixture!.resume()).toThrow('already disposed');
          expect(() => fixture!.mountRoot()).toThrow('already disposed');
          await expect(cachedApplication.start()).rejects.toThrow(
            'unowned globals',
          );
          expect(entry.endpoint.totalRecordedCalls).toBe(count);
          expect('Byond' in globalThis).toBe(false);
          expect('Byond' in window).toBe(false);
        } else throw new Error(`Unknown application case: ${scenario}`);
      }
      expect(entry.endpoint.subscriptions).toBe(0);
    }
    expect(networkGuard.attempted).toBe(0);
    expect(windowNetworkAttempts).toBe(0);
  } finally {
    await fixture?.dispose();
    entry?.boundary.dispose();
  }
}, 15000);
