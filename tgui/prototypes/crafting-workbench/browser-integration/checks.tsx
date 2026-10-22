import './test-environment';

import { afterAll, expect, test } from 'bun:test';

import { endpoint } from './bootstrap';
import { createEndpoint, installEndpoint } from './endpoint';
import { startPage } from './page';
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
const waitUntilIdle = async (button: HTMLButtonElement) => {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (!button.disabled) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Fixture control did not finish.');
};
for (const [name, Arm] of [
  ['react', ReactArm],
  ['svelte', SvelteArm],
] as const) {
  test(`${name}: actual page hides QA without changing workbench; reload restores it`, async () => {
    const previousInspection = Object.getOwnPropertyDescriptor(
      window,
      'workbenchIntegration',
    );
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    try {
      // The second fresh initialization models reload without any saved hide state.
      for (let page = 0; page < 2; page++) {
        const root = document.createElement('div');
        root.id = 'fixture-root';
        const controls = document.createElement('aside');
        controls.id = 'fixture-controls';
        document.body.append(root, controls);
        const fixture = await startPage(Arm, name);
        try {
          const button = (label: string) =>
            [...controls.querySelectorAll<HTMLButtonElement>('button')].find(
              (node) => node.textContent === label,
            )!;
          const hide = button('Hide QA controls until reload');
          expect(hide).toBeDefined();
          expect(controls.isConnected).toBe(true);
          const inspection = Reflect.get(window, 'workbenchIntegration');
          expect(Object.keys(inspection).sort()).toEqual(['arm', 'read']);
          if (page === 1) {
            const run = button('Run lifecycle and action checks');
            run.click();
            expect(hide.disabled).toBe(true);
            hide.click();
            // Also challenge the handler guard directly: dispatched synthetic
            // events can reach disabled elements without native hit testing.
            hide.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(controls.isConnected).toBe(true);
            await waitUntilIdle(run);
            expect(inspection.read().result.checks.length).toBe(25);
          }
          const workbench = root.querySelector('.Workbench');
          const before = fixture.read();
          hide.focus();
          hide.click();
          expect(controls.isConnected).toBe(false);
          expect(document.getElementById('fixture-controls')).toBeNull();
          expect(root.querySelector('.Workbench')).toBe(workbench);
          expect(root.isConnected).toBe(true);
          expect(document.activeElement).toBe(
            root.querySelector('.Layout__content'),
          );
          expect(fixture.endpoint.totalRecordedCalls).toBe(
            before.totalRecordedCalls,
          );
          await waitUntilIdle(hide);
          expect(fixture.endpoint.totalRecordedCalls).toBe(
            before.totalRecordedCalls,
          );
          expect(fixture.read().mounts).toBe(before.mounts);
          expect(fixture.read().subscriptions).toBe(before.subscriptions);
          expect(Reflect.get(window, 'workbenchIntegration')).toBe(inspection);
          expect(inspection.read().state.rootMounted).toBe(true);
        } finally {
          // Remove page-owned handlers even when the panel is already detached.
          for (const button of controls.querySelectorAll('button')) {
            button.onclick = null;
          }
          controls.replaceChildren();
          controls.remove();
          Reflect.deleteProperty(window, 'workbenchIntegration');
          await fixture.dispose();
          expect(fixture.read().subscriptions).toBe(0);
          expect(fixture.read().mounts).toBe(fixture.read().unmounts);
          root.remove();
        }
      }
    } finally {
      if (previousInspection) {
        Object.defineProperty(
          window,
          'workbenchIntegration',
          previousInspection,
        );
      } else Reflect.deleteProperty(window, 'workbenchIntegration');
      if (previousFocus?.isConnected) previousFocus.focus();
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
