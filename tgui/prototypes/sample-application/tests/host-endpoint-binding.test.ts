import { expect, test } from 'bun:test';

import { createEndpoint } from '../../crafting-workbench/browser-integration/endpoint';
import { createOwnedBoundary } from '../boundary';
import {
  createValidatedEndpointBinding,
  endpointBanner,
  type ValidatedEndpointBinding,
} from '../endpoint-binding';

function setup() {
  const scope = { window: {} };
  const endpoint = createEndpoint();
  const boundary = createOwnedBoundary(endpoint.api, scope);
  boundary.install();
  const binding = createValidatedEndpointBinding();
  binding.install(endpoint.api, boundary.validate);
  return { scope, endpoint, boundary, binding };
}

test('binding facade refuses every operation before registration', () => {
  const binding = createValidatedEndpointBinding();
  expect(Object.isFrozen(binding)).toBe(true);
  expect(Object.isFrozen(binding.facade)).toBe(true);
  for (const operation of [
    () => binding.read(),
    () => binding.facade.windowId,
    () => binding.facade.winset('fixture', {}),
    () => binding.facade.winget('fixture', 'pos'),
    () => binding.facade.sendMessage('ping/reply'),
    () => binding.facade.subscribe(),
  ])
    expect(operation).toThrow('has not been installed');
});

test('binding registration is once-only and normal methods reach only the captured fake', async () => {
  const { endpoint, boundary, binding } = setup();
  try {
    expect(binding.read()).toBe(endpoint.api);
    expect(binding.facade.windowId).toBe(endpoint.api.windowId);
    await binding.facade.winset('fixture', { size: '100x100' });
    await binding.facade.winget('fixture', 'pos');
    binding.facade.sendMessage('ping/reply');
    expect(endpoint.calls.map((call) => call.method)).toEqual([
      'winset',
      'winget',
      'sendMessage',
    ]);
    expect(() => binding.facade.subscribe()).toThrow('Native subscriptions');
    expect(endpoint.subscriptions).toBe(1);
    let duplicateValidator = 0;
    expect(() =>
      binding.install(endpoint.api, () => {
        duplicateValidator++;
      }),
    ).toThrow('only be installed once');
    expect(duplicateValidator).toBe(0);
  } finally {
    boundary.dispose();
  }
});

test('binding rejects unfrozen or unvalidated endpoint installation', () => {
  const binding = createValidatedEndpointBinding();
  const endpoint = createEndpoint();
  expect(() => binding.install(endpoint.api, () => {})).toThrow(
    'frozen fixture API',
  );
  Object.freeze(endpoint.api);
  expect(() =>
    binding.install(endpoint.api, () => {
      throw new Error('unowned fixture');
    }),
  ).toThrow('unowned fixture');
  expect(() => binding.read()).toThrow('has not been installed');
});

for (const targetName of ['global', 'window'] as const) {
  test(`late ${targetName} replacement fences property, direct and retained method calls without inspecting it`, () => {
    const { scope, endpoint, boundary, binding } = setup();
    const target = targetName === 'global' ? scope : scope.window;
    const original = Object.getOwnPropertyDescriptor(target, 'Byond')!;
    const retained = binding.facade.sendMessage;
    let foreignReads = 0;
    Object.defineProperty(target, 'Byond', {
      configurable: true,
      get() {
        foreignReads++;
        throw new Error('foreign getter must never run');
      },
    });
    try {
      const before = endpoint.totalRecordedCalls;
      for (const operation of [
        () => binding.facade.windowId,
        () => binding.facade.winset('fixture', {}),
        () => binding.facade.winget('fixture', 'pos'),
        () => binding.facade.sendMessage('ping/reply'),
        () => retained('ping/reply'),
        () => binding.facade.subscribe(),
      ])
        expect(operation).toThrow('unowned globals');
      expect(endpoint.totalRecordedCalls).toBe(before);
      expect(endpoint.subscriptions).toBe(0);
      expect(foreignReads).toBe(0);
    } finally {
      Object.defineProperty(target, 'Byond', original);
      boundary.dispose();
    }
  });
}

test('late hubStorage and disposed ownership fence retained facade methods', () => {
  const { scope, endpoint, boundary, binding } = setup();
  const retained = binding.facade.winset;
  Object.defineProperty(scope.window, 'hubStorage', {
    configurable: true,
    value: undefined,
  });
  expect(() => retained('fixture', {})).toThrow('unowned globals');
  Reflect.deleteProperty(scope.window, 'hubStorage');
  boundary.dispose();
  expect(() => retained('fixture', {})).toThrow('unowned globals');
  expect(endpoint.totalRecordedCalls).toBe(0);
});

test('generated banner is self-contained, lexical and exposes the guarded facade', () => {
  const keys = Reflect.ownKeys(globalThis);
  const evaluate = new Function(
    `${endpointBanner}\nreturn { binding: __sampleEndpointBinding, facade: __sampleEndpointFacade };`,
  );
  const built = evaluate() as {
    binding: ValidatedEndpointBinding;
    facade: ValidatedEndpointBinding['facade'];
  };
  expect(Reflect.ownKeys(globalThis)).toEqual(keys);
  expect(() => built.facade.windowId).toThrow('has not been installed');
  const { scope, endpoint, boundary } = setup();
  try {
    built.binding.install(endpoint.api, boundary.validate);
    expect(built.facade).toBe(built.binding.facade);
    expect(built.facade.windowId).toBe(endpoint.api.windowId);
    built.facade.sendMessage('ping/reply');
    expect(endpoint.totalRecordedCalls).toBe(1);
    Reflect.deleteProperty(scope, 'Byond');
    expect(() => built.facade.sendMessage('ping/reply')).toThrow(
      'unowned globals',
    );
    expect(endpoint.totalRecordedCalls).toBe(1);
  } finally {
    boundary.dispose();
  }
});
