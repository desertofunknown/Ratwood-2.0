import '../test-network-guard';

import { expect, test } from 'bun:test';
import { pathToFileURL } from 'node:url';

import { networkGuard } from '../test-network-guard';
import type * as Binding from './module-binding';
import type * as Bootstrap from './host-bootstrap';
import type * as Deferred from './deferred-probe';

const url = (file: string) =>
  pathToFileURL(`${import.meta.dir}/dist/${file}`).href;
const bootstrap = () =>
  import(url('host-bootstrap.js')) as Promise<typeof Bootstrap>;
const singleton = () =>
  import(url('endpoint-binding.js')) as Promise<typeof Binding>;
const rawDeferred = () =>
  import(url('deferred-probe.js')) as Promise<typeof Deferred>;
const scenario = process.env.LOADING_PROOF_CASE;
if (!scenario)
  throw new Error('Run run-proof.ts for fresh-process ESM isolation.');

function foreign(
  target: object,
  property: 'Byond' | 'hubStorage',
  inherited = false,
) {
  let reads = 0;
  const previousPrototype = Object.getPrototypeOf(target);
  const previous = Object.getOwnPropertyDescriptor(target, property);
  const holder = inherited ? Object.create(previousPrototype) : target;
  Object.defineProperty(holder, property, {
    configurable: true,
    get() {
      reads++;
      throw new Error('Foreign getter must not run.');
    },
  });
  if (inherited) Object.setPrototypeOf(target, holder);
  return {
    reads: () => reads,
    restore() {
      if (inherited) Object.setPrototypeOf(target, previousPrototype);
      else if (previous) Object.defineProperty(target, property, previous);
      else Reflect.deleteProperty(target, property);
    },
  };
}

test(scenario, async () => {
  const entry = await bootstrap();
  const { binding, facade } = await singleton();
  expect(entry.eagerIdentity.binding).toBe(binding);
  expect(entry.eagerIdentity.facade).toBe(facade);
  expect(Object.isFrozen(binding)).toBe(true);
  expect(Object.isFrozen(facade)).toBe(true);
  for (const name of [
    '__sampleEndpointBinding',
    '__sampleEndpointFacade',
    '__loadingExcludedStories',
  ]) {
    expect(name in globalThis).toBe(false);
    expect(name in window).toBe(false);
  }

  if (scenario === 'uninstalled facade fails closed') {
    for (const operation of [
      () => binding.read(),
      () => facade.windowId,
      () => facade.winset('fixture', {}),
      () => facade.winget('fixture', 'pos'),
      () => facade.sendMessage('ping/reply'),
      () => facade.subscribe(),
      () => entry.retainedEagerSend('ping/reply'),
    ])
      expect(operation).toThrow('has not been installed');
    expect('Byond' in globalThis).toBe(false);
    expect('Byond' in window).toBe(false);
  } else if (
    scenario === 'cold production refuses before install without getter reads'
  ) {
    const replacement = foreign(window, 'hubStorage');
    try {
      await expect(import(url('production-host.js'))).rejects.toThrow(
        'has not been installed',
      );
      expect(replacement.reads()).toBe(0);
    } finally {
      replacement.restore();
    }
  } else if (scenario.startsWith('startup ')) {
    const [, location, property, ownership] = scenario.split(' ');
    const target = location === 'global' ? globalThis : window;
    const replacement = foreign(
      target,
      property as 'Byond' | 'hubStorage',
      ownership === 'inherited',
    );
    try {
      expect(() => entry.createOwnedModuleHost()).toThrow('unowned globals');
      expect(() => binding.read()).toThrow('has not been installed');
      expect(replacement.reads()).toBe(0);
    } finally {
      replacement.restore();
    }
  } else {
    const host = entry.createOwnedModuleHost();
    expect(binding.read()).toBe(host.endpoint.api);
    expect(host.eagerIdentity.binding).toBe(binding);
    expect(Object.getOwnPropertyDescriptor(globalThis, 'Byond')?.value).toBe(
      host.endpoint.api,
    );
    expect(Object.getOwnPropertyDescriptor(window, 'Byond')?.value).toBe(
      host.endpoint.api,
    );
    try {
      if (
        scenario === 'real host and deferred modules share one owned binding'
      ) {
        const production = await host.loadProductionHost();
        const deferred = await host.loadDeferredProbe();
        expect(production.hostIdentity.binding).toBe(binding);
        expect(deferred.deferredIdentity.binding).toBe(binding);
        expect(production.hostIdentity.facade).toBe(facade);
        expect(deferred.deferredIdentity.facade).toBe(facade);
        expect(production.reactUseState).toBe(deferred.reactUseState);
        expect(production.svelteTick).toBe(deferred.svelteTick);
        expect(typeof production.reactUseState).toBe('function');
        expect(typeof production.svelteTick).toBe('function');
        await production.svelteTick();
        expect(typeof production.productionWindow).toBe('function');
        expect(production.storage.impl).toBe(0);
        await production.storage.set('loading-proof', 'memory-only');
        expect(await production.storage.get('loading-proof')).toBe(
          'memory-only',
        );
        await production.setupDrag();
        await production.setWindowPosition([12, 34]);
        production.backend.sendAct('checkboxonlycraftable', { state: true });
        deferred.sendSampleFilter(false);
        entry.retainedEagerSend('ping/reply');
        deferred.retainedDeferredSend('ping/reply');
        expect(host.endpoint.calls.map((call) => call.method)).toEqual([
          'winget',
          'winset',
          'sendMessage',
          'sendMessage',
          'sendMessage',
          'sendMessage',
        ]);
        expect(host.endpoint.calls[3].arguments).toEqual([
          'act/checkboxonlycraftable',
          { state: false },
        ]);
        let duplicateValidator = 0;
        expect(() =>
          binding.install(host.endpoint.api, () => {
            duplicateValidator++;
          }),
        ).toThrow('only be installed once');
        expect(duplicateValidator).toBe(0);
        expect(host.endpoint.subscriptions).toBe(0);
      } else if (scenario.startsWith('warm foreign ')) {
        const [, , location, property, ownership] = scenario.split(' ');
        const production = await host.loadProductionHost();
        const target = location === 'global' ? globalThis : window;
        const replacement = foreign(
          target,
          property as 'Byond' | 'hubStorage',
          ownership === 'inherited',
        );
        try {
          const count = host.endpoint.totalRecordedCalls;
          for (const operation of [
            () => facade.windowId,
            () => facade.winset('fixture', {}),
            () => facade.winget('fixture', 'pos'),
            () => facade.sendMessage('ping/reply'),
            () => facade.subscribe(),
            () => entry.retainedEagerSend('ping/reply'),
            () => production.setWindowPosition([1, 2]),
            () =>
              production.backend.sendAct('checkboxonlycraftable', {
                state: true,
              }),
          ])
            expect(operation).toThrow('unowned globals');
          // Cold entry, but already evaluated common production chunk.
          await expect(rawDeferred()).rejects.toThrow('unowned globals');
          expect(host.endpoint.totalRecordedCalls).toBe(count);
          expect(host.endpoint.subscriptions).toBe(0);
          host.retire();
          expect(property in target).toBe(true);
          if (ownership !== 'inherited')
            expect(
              Object.getOwnPropertyDescriptor(target, property)?.get,
            ).toBeDefined();
          expect(replacement.reads()).toBe(0);
        } finally {
          replacement.restore();
        }
      } else if (scenario.startsWith('cold pending retire ')) {
        const pending = scenario.endsWith('production')
          ? host.loadProductionHost()
          : host.loadDeferredProbe();
        host.retire();
        await expect(pending).rejects.toThrow('unowned globals');
        expect(host.endpoint.totalRecordedCalls).toBe(0);
        expect(() => entry.retainedEagerSend('ping/reply')).toThrow(
          'unowned globals',
        );
        expect(() => entry.createOwnedModuleHost()).toThrow(
          'only be installed once',
        );
        expect('Byond' in globalThis).toBe(false);
        expect('Byond' in window).toBe(false);
      } else if (scenario.startsWith('cold pending foreign ')) {
        const pending = scenario.endsWith('production')
          ? host.loadProductionHost()
          : host.loadDeferredProbe();
        const replacement = foreign(window, 'hubStorage');
        try {
          await expect(pending).rejects.toThrow('unowned globals');
          expect(host.endpoint.totalRecordedCalls).toBe(0);
          expect(replacement.reads()).toBe(0);
        } finally {
          replacement.restore();
        }
      } else if (
        scenario ===
        'cached imports and retained callbacks lose authority at retirement'
      ) {
        const production = await host.loadProductionHost();
        const deferred = await host.loadDeferredProbe();
        const pending = host.loadDeferredProbe();
        host.retire();
        await expect(pending).rejects.toThrow('unowned globals');
        const cached = await rawDeferred();
        expect(cached).toBe(deferred);
        const count = host.endpoint.totalRecordedCalls;
        for (const operation of [
          () => cached.sendSampleFilter(true),
          () => cached.retainedDeferredSend('ping/reply'),
          () => entry.retainedEagerSend('ping/reply'),
          () => production.setWindowPosition([1, 2]),
        ])
          expect(operation).toThrow('unowned globals');
        expect(host.endpoint.totalRecordedCalls).toBe(count);
      } else throw new Error(`Unknown proof scenario: ${scenario}`);
    } finally {
      host.retire();
    }
  }
  expect(networkGuard.attempted).toBe(0);
});
