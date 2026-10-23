import { describe, expect, test } from 'bun:test';

import { createSampleData } from '../display-readability/fixtures';
import {
  createController as createSettingsController,
  type DeliverData,
} from '../display-readability/model';
import { createSample as createSettingsSample } from '../display-readability/sample';
import { createMarketController } from '../market-quote/model';
import { fiftyOneEntries } from '../treasury-ledger/fixtures';
import {
  createController as createLedgerController,
  type DeliverPage,
} from '../treasury-ledger/model';
import {
  buildSamplePage,
  createSample as createLedgerSample,
} from '../treasury-ledger/sample';
import { testClock } from '../treasury-ledger/test-clock';
import { createOwnedBoundary } from './boundary';

const api = () => ({ windowId: 'sample-only', sendMessage() {} });
const present = (target: object, key: string, value: unknown = undefined) =>
  Object.defineProperty(target, key, {
    configurable: true,
    writable: true,
    value,
  });

describe('explicit fixture endpoint ownership', () => {
  for (const key of ['Byond', 'hubStorage']) {
    for (const location of ['scope', 'window']) {
      for (const inherited of [false, true]) {
        test(`refuses ${inherited ? 'inherited' : 'own'} undefined ${location}.${key}`, () => {
          const scope = { window: {} };
          const target = location === 'scope' ? scope : scope.window;
          if (inherited) Object.setPrototypeOf(target, { [key]: undefined });
          else present(target, key);
          expect(() => createOwnedBoundary(api(), scope)).toThrow();
        });

        test(`rechecks ${inherited ? 'inherited' : 'own'} ${location}.${key} before installation`, () => {
          const scope = { window: {} };
          const boundary = createOwnedBoundary(api(), scope);
          const target = location === 'scope' ? scope : scope.window;
          if (inherited) Object.setPrototypeOf(target, { [key]: undefined });
          else present(target, key);
          expect(boundary.install).toThrow();
          expect(
            Object.hasOwn(location === 'scope' ? scope.window : scope, 'Byond'),
          ).toBe(false);
          boundary.dispose();
          expect(key in target).toBe(true);
        });
      }

      test(`never invokes an existing ${location}.${key} getter`, () => {
        const scope = { window: {} };
        const target = location === 'scope' ? scope : scope.window;
        let reads = 0;
        Object.defineProperty(target, key, {
          get() {
            reads++;
            return api();
          },
        });
        expect(() => createOwnedBoundary(api(), scope)).toThrow();
        expect(reads).toBe(0);
      });
    }
  }

  test('existing same identity, fake flags and matching shapes receive no exemption', () => {
    const endpoint = Object.freeze(api());
    for (const existing of [
      endpoint,
      { ...endpoint },
      { disconnected: true, fake: true },
    ]) {
      expect(() =>
        createOwnedBoundary(endpoint, { Byond: existing }),
      ).toThrow();
    }
  });

  test('installs a frozen exact identity on scope and distinct window', () => {
    for (const windowScope of [{}, () => {}]) {
      const scope = { window: windowScope };
      const endpoint = api();
      const boundary = createOwnedBoundary(endpoint, scope);
      expect(Object.isFrozen(endpoint)).toBe(true);
      expect(Object.isFrozen(boundary)).toBe(true);
      expect(boundary.validate).toThrow();
      boundary.install();
      boundary.install();
      expect(boundary.validate).not.toThrow();
      for (const target of [scope, windowScope]) {
        expect(Object.getOwnPropertyDescriptor(target, 'Byond')).toEqual({
          value: endpoint,
          configurable: true,
          enumerable: false,
          writable: false,
        });
      }
      boundary.dispose();
      boundary.dispose();
      expect('Byond' in scope).toBe(false);
      expect('Byond' in windowScope).toBe(false);
      expect(boundary.validate).toThrow();
      expect(boundary.install).toThrow();
    }
  });

  test('supports a scope without a window and a self-referencing browser window', () => {
    for (const scope of [{}, { window: undefined as unknown }]) {
      if ('window' in scope) scope.window = scope;
      const boundary = createOwnedBoundary(api(), scope);
      boundary.install();
      expect(boundary.validate).not.toThrow();
      boundary.dispose();
      expect('Byond' in scope).toBe(false);
    }
  });

  for (const location of ['scope', 'window']) {
    test(`rejects deleted or replaced ${location} identity, even a frozen matching fake`, () => {
      for (const replacement of [
        undefined,
        Object.freeze(api()),
        Object.freeze({ fake: true }),
      ]) {
        const scope = { window: {} };
        const boundary = createOwnedBoundary(api(), scope);
        boundary.install();
        const target = location === 'scope' ? scope : scope.window;
        present(target, 'Byond', replacement);
        expect(boundary.validate).toThrow();
        boundary.dispose();
        expect(Object.getOwnPropertyDescriptor(target, 'Byond')?.value).toBe(
          replacement,
        );
      }
      const scope = { window: {} };
      const boundary = createOwnedBoundary(api(), scope);
      boundary.install();
      Reflect.deleteProperty(
        location === 'scope' ? scope : scope.window,
        'Byond',
      );
      expect(boundary.validate).toThrow();
      boundary.dispose();
    });

    test(`rejects accessor impersonation and leaves changed ${location} descriptors alone`, () => {
      const endpoint = api();
      const scope = { window: {} };
      const boundary = createOwnedBoundary(endpoint, scope);
      boundary.install();
      const target = location === 'scope' ? scope : scope.window;
      let reads = 0;
      const getter = () => {
        reads++;
        return endpoint;
      };
      Object.defineProperty(target, 'Byond', {
        configurable: true,
        get: getter,
      });
      expect(boundary.validate).toThrow();
      boundary.dispose();
      expect(reads).toBe(0);
      expect(Object.getOwnPropertyDescriptor(target, 'Byond')?.get).toBe(
        getter,
      );
    });

    for (const inherited of [false, true]) {
      test(`rejects late ${inherited ? 'inherited' : 'own'} ${location}.hubStorage`, () => {
        const scope = { window: {} };
        const boundary = createOwnedBoundary(api(), scope);
        boundary.install();
        const target = location === 'scope' ? scope : scope.window;
        if (inherited) Object.setPrototypeOf(target, { hubStorage: undefined });
        else present(target, 'hubStorage');
        expect(boundary.validate).toThrow();
        boundary.dispose();
        expect('hubStorage' in target).toBe(true);
        expect(Object.hasOwn(target, 'Byond')).toBe(false);
      });
    }

    test(`rejects a newly inherited ${location}.Byond hidden beneath its own property`, () => {
      const scope = { window: {} };
      const boundary = createOwnedBoundary(api(), scope);
      boundary.install();
      const target = location === 'scope' ? scope : scope.window;
      Object.setPrototypeOf(target, { Byond: undefined });
      expect(boundary.validate).toThrow();
      boundary.dispose();
      expect(Object.hasOwn(target, 'Byond')).toBe(false);
      expect('Byond' in target).toBe(true);
    });
  }

  test('changed data descriptors are not removed, even with the same endpoint value', () => {
    const scope = {};
    const endpoint = api();
    const boundary = createOwnedBoundary(endpoint, scope);
    boundary.install();
    Object.defineProperty(scope, 'Byond', { writable: true });
    expect(boundary.validate).toThrow();
    boundary.dispose();
    expect(Object.getOwnPropertyDescriptor(scope, 'Byond')?.value).toBe(
      endpoint,
    );
  });

  test('window replacement invalidates the boundary and cleanup never touches the new window', () => {
    const original = {};
    const scope: { window: object } = { window: original };
    const endpoint = api();
    const boundary = createOwnedBoundary(endpoint, scope);
    boundary.install();
    scope.window = { Byond: endpoint };
    expect(boundary.validate).toThrow();
    boundary.dispose();
    expect('Byond' in original).toBe(false);
    expect('Byond' in scope).toBe(false);
    expect('Byond' in scope.window).toBe(true);
  });

  test('window replacement before installation fails without writing either target', () => {
    const original = {};
    const scope = { window: original };
    const boundary = createOwnedBoundary(api(), scope);
    scope.window = {};
    expect(boundary.install).toThrow();
    for (const target of [scope, original, scope.window])
      expect('Byond' in target).toBe(false);
    boundary.dispose();
  });

  test('partial installation failure rolls back only its own endpoint', () => {
    const scope = { window: Object.preventExtensions({}) };
    const boundary = createOwnedBoundary(api(), scope);
    expect(boundary.install).toThrow();
    expect('Byond' in scope).toBe(false);
    expect('Byond' in scope.window).toBe(false);
    expect(boundary.validate).toThrow();
    expect(boundary.install).toThrow();
  });
});

// These tests do not import the production backend, open a native transport or
// run timers. A distinct window exercises both global boundaries under Bun too.
function withGlobals(check: (scope: object, windowScope: object) => void) {
  const names = ['window', 'Byond', 'hubStorage'];
  const descriptors = names.map((name) =>
    Object.getOwnPropertyDescriptor(globalThis, name),
  );
  const prototype = Object.getPrototypeOf(globalThis);
  const windowScope = {};
  for (const name of ['Byond', 'hubStorage'])
    Reflect.deleteProperty(globalThis, name);
  present(globalThis, 'window', windowScope);
  try {
    check(globalThis, windowScope);
  } finally {
    Object.setPrototypeOf(globalThis, prototype);
    for (const [index, name] of names.entries()) {
      const descriptor = descriptors[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}

const constructors = [
  () => createLedgerController({ action() {}, subscribe: () => () => {} }),
  () => createLedgerSample(),
  () => createSettingsController({ action() {}, subscribe: () => () => {} }),
  () => createSettingsSample(),
  () => createMarketController(),
];

function preparedOperations(validate?: () => void) {
  const clock = testClock();
  let ledgerDelivery: DeliverPage = () => {};
  const ledger = createLedgerController(
    {
      ...clock,
      action() {},
      subscribe(deliver) {
        ledgerDelivery = deliver;
        return () => {};
      },
    },
    validate,
  );
  ledger.open();
  ledger.draft('pending');
  const sampleClock = testClock();
  const ledgerSample = createLedgerSample(sampleClock, validate);
  ledgerSample.subscribe(() => {});
  ledgerSample.action('ledger_open');

  let settingsDelivery: DeliverData = () => {};
  const settings = createSettingsController(
    {
      action() {},
      subscribe(deliver) {
        settingsDelivery = deliver;
        return () => {};
      },
    },
    validate,
  );
  settings.open();
  const settingsSample = createSettingsSample(undefined, validate);
  settingsSample.queueDelivery(createSampleData());
  const market = createMarketController(undefined, validate);
  const request = {
    side: 'import' as const,
    regionId: 'north',
    goodId: 'wheat',
  };
  market.openQuote(request);
  market.deliverPreview();
  const quote = market.snapshot().serverResponse!;
  return [
    ledger.open,
    ledger.close,
    () => ledger.draft('changed'),
    ledger.clear,
    () => ledger.page(2),
    ledger.refresh,
    () => ledgerDelivery(buildSamplePage(fiftyOneEntries)),
    ...clock.callbacks,
    () => ledgerSample.action('ledger_refresh'),
    () => ledgerSample.subscribe(() => {}),
    () => ledgerSample.replaceEntries([]),
    ledgerSample.dispose,
    ...sampleClock.callbacks,
    settings.open,
    settings.close,
    () => settings.toggle('fullscreen'),
    () => settings.select('hud_colorblind_palette', 'none'),
    () => settingsDelivery(createSampleData()),
    () => settingsSample.action('toggle', { id: 'fullscreen' }),
    () => settingsSample.subscribe(() => {}),
    () => settingsSample.queueDelivery(createSampleData()),
    settingsSample.deliverNext,
    settingsSample.dispose,
    () => market.subscribe(() => {}),
    () => market.selectSample('best-regions'),
    () => market.selectCategory('grain'),
    () => market.toggleExpanded('wheat'),
    () => market.openQuote(request),
    () => market.setQuantity('2'),
    () => market.changeQuantity(1),
    market.fillQuantity,
    () => market.deliver(quote),
    market.deliverPreview,
    market.closeQuote,
    () => market.setSequestered(true),
    market.dispose,
  ];
}

describe('captured validators preserve the standalone refusal boundary', () => {
  for (const key of ['Byond', 'hubStorage']) {
    for (const location of ['scope', 'window']) {
      for (const inherited of [false, true]) {
        test(`default factories and later boundaries refuse ${inherited ? 'inherited' : 'own'} ${location}.${key}`, () => {
          withGlobals((scope, windowScope) => {
            const operations = preparedOperations();
            const target = location === 'scope' ? scope : windowScope;
            if (inherited) Object.setPrototypeOf(target, { [key]: undefined });
            else present(target, key);
            for (const construct of constructors) expect(construct).toThrow();
            for (const operation of operations) expect(operation).toThrow();
          });
        });
      }
    }
  }

  test('default factories still reject the installed owned fake API', () => {
    withGlobals((scope) => {
      const boundary = createOwnedBoundary(api(), scope);
      boundary.install();
      try {
        for (const construct of constructors) expect(construct).toThrow();
        expect(() => preparedOperations(boundary.validate)).not.toThrow();
      } finally {
        boundary.dispose();
      }
    });
  });

  for (const location of ['scope', 'window']) {
    test(`injected validators reject later ${location} identity replacement at every operation`, () => {
      withGlobals((scope, windowScope) => {
        const boundary = createOwnedBoundary(api(), scope);
        boundary.install();
        try {
          const operations = preparedOperations(boundary.validate);
          const target = location === 'scope' ? scope : windowScope;
          const replacement = Object.freeze(api());
          present(target, 'Byond', replacement);
          for (const operation of operations) expect(operation).toThrow();
          boundary.dispose();
          expect(Object.getOwnPropertyDescriptor(target, 'Byond')?.value).toBe(
            replacement,
          );
        } finally {
          boundary.dispose();
        }
      });
    });
  }

  test('every factory and later operation captures the passed validator', () => {
    let blocked = false;
    let checks = 0;
    const validate = () => {
      checks++;
      if (blocked) throw Error('Captured validator refused this operation.');
    };
    withGlobals(() => {
      const operations = preparedOperations(validate);
      expect(checks).toBeGreaterThanOrEqual(5);
      blocked = true;
      for (const operation of operations)
        expect(operation).toThrow('Captured validator');
      const bad = () => {
        throw Error('Rejected construction.');
      };
      expect(() =>
        createLedgerController({ action() {}, subscribe: () => () => {} }, bad),
      ).toThrow('Rejected construction');
      expect(() => createLedgerSample({}, bad)).toThrow(
        'Rejected construction',
      );
      expect(() =>
        createSettingsController(
          { action() {}, subscribe: () => () => {} },
          bad,
        ),
      ).toThrow('Rejected construction');
      expect(() => createSettingsSample(undefined, bad)).toThrow(
        'Rejected construction',
      );
      expect(() => createMarketController(undefined, bad)).toThrow(
        'Rejected construction',
      );
    });
  });
});
