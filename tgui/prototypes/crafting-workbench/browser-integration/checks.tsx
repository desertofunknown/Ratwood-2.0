import './test-environment';

import { afterAll, expect, test } from 'bun:test';

import { endpoint } from './bootstrap';
import { createEndpoint, installEndpoint } from './endpoint';
import { ReactArm } from './react-arm';
import { createFixture } from './runtime';
import { runChecks } from './scenarios';
import { SvelteArm } from './svelte-arm';
import { networkGuard } from './test-network-guard';

for (const [name, Arm] of [
  ['React', ReactArm],
  ['React-owned Svelte', SvelteArm],
] as const) {
  test(`${name}: repeated real store/Window lifecycle across log rollover`, async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const fixture = createFixture(target, Arm);
    try {
      // Start full so all three complete passes exercise bounded-log rollover.
      for (let call = 0; call < 200; call++) {
        endpoint.api.sendMessage('ping/reply');
      }
      const droppedBefore = endpoint.dropped;
      for (let pass = 0; pass < 3; pass++) {
        const results = await runChecks(fixture);
        expect(results.length).toBe(25);
        expect(results.every((result) => result.passed)).toBe(true);
      }
      expect(endpoint.calls.length).toBe(200);
      expect(endpoint.dropped).toBeGreaterThan(droppedBefore);
    } finally {
      await fixture.dispose();
      expect(fixture.read().subscriptions).toBe(0);
      expect(fixture.read().mounts).toBe(fixture.read().unmounts);
      expect(fixture.read().pendingDisposals).toBe(0);
      expect(endpoint.subscriptions).toBe(0);
      expect(networkGuard.attempted).toBe(0);
      target.remove();
    }
  });
}
test('monotonic total detects a new craft call after bounded action-log rollover', () => {
  const fake = createEndpoint();
  const craft = () =>
    fake.api.sendMessage('act/craft', { item: '/sample/plough' });
  for (let call = 0; call < 200; call++) craft();
  const retainedActs = () =>
    fake.calls.filter(
      (call) =>
        call.method === 'sendMessage' && call.arguments[0] === 'act/craft',
    ).length;
  const before = fake.totalRecordedCalls;
  expect(retainedActs()).toBe(200);
  expect(before).toBe(200);
  craft();
  expect(retainedActs()).toBe(200); // The old stale-action assertion would miss this.
  expect(fake.dropped).toBe(1);
  expect(fake.totalRecordedCalls).toBe(before + 1);
  for (let call = 0; call < 200; call++) craft();
  expect(fake.calls.length).toBe(200);
  expect(fake.dropped).toBe(201);
  expect(fake.totalRecordedCalls).toBe(401);
});
test('fake endpoint refuses every existing native/storage global without invoking it', () => {
  for (const name of ['Byond', 'hubStorage']) {
    const target = Object.create({ [name]: undefined });
    expect(() => installEndpoint(target, createEndpoint())).toThrow('refuses');
    expect(Object.hasOwn(target, 'Byond')).toBe(false);
  }
});
test('fake endpoint rejects subscriptions, non-sample and unsupported messages', () => {
  const fake = createEndpoint();
  expect(() => fake.api.subscribe()).toThrow('forbidden');
  expect(() =>
    fake.api.sendMessage('act/craft', { item: '/real/not-allowed' }),
  ).toThrow('sample');
  expect(() =>
    fake.api.sendMessage('act/craft', { item: '/sample/plough', amount: '2' }),
  ).toThrow('sample');
  expect(() => fake.api.sendMessage('other')).toThrow('Unsupported');
  expect(fake.calls).toEqual([]);
});
afterAll(() => {
  expect(networkGuard.attempted).toBe(0);
  networkGuard.restore();
  Reflect.deleteProperty(globalThis, 'Byond');
  Reflect.deleteProperty(globalThis, '__disconnectedWebpackContext');
});
