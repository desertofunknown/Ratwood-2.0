import { expect, test } from 'bun:test';
import { createController } from '../model';
import { assertDisconnected } from '../../selection-prompt/network-guard';
test('controller publishes replacement deliveries, keeps selection, unsubscribes, and closes once', () => {
  const calls: unknown[] = [];
  let changes = 0;
  let closes = 0;
  const c = createController(
    { buttons: ['A', 'B', 'C'], message: 'original' },
    (...args) => calls.push(args),
    () => closes++,
  );
  const off = c.subscribe(() => changes++);
  const first = c.getSnapshot();
  expect(first.selected).toBe(0);
  c.focus(2);
  expect(changes).toBe(1);
  expect(c.getSnapshot()).not.toBe(first);
  c.deliver({ buttons: ['Only'] });
  expect(c.getSnapshot().selected).toBe(2);
  expect(c.getSnapshot().message).toBe('');
  c.keyDown({ key: 'Enter', preventDefault() {} });
  expect(calls).toEqual([]);
  off();
  c.close();
  c.close();
  expect(closes).toBe(1);
  expect(changes).toBe(2);
  const closed = c.getSnapshot();
  c.focus(0);
  c.choose(0);
  c.deliver({ buttons: ['stale'] });
  expect(c.getSnapshot()).toBe(closed);
  expect(calls).toEqual([]);
});
test('geometry thresholds and cap follow production formula', () => {
  for (const [data, height, verbose] of [
    [{}, 190, false],
    [{ message: 'x'.repeat(55) }, 212, false],
    [{ message: 'x'.repeat(56) }, 234, false],
    [{ buttons: ['x'.repeat(18)] }, 190, false],
    [{ buttons: ['x'.repeat(19)] }, 236, true],
    [{ buttons: ['A', 'B', 'C', 'D'] }, 374, true],
    [{ message: 'x'.repeat(10000) }, 640, false],
  ] as const) {
    const c = createController(data as any, () => {});
    expect(c.getSnapshot().windowWidth).toBe(500);
    expect(c.getSnapshot().windowHeight).toBe(height);
    expect(c.getSnapshot().verbose).toBe(verbose);
    c.close();
  }
});
for (const name of ['Byond', 'hubStorage'])
  test(`late/inherited ${name} blocks even undefined without invoking getters`, () => {
    expect(() =>
      assertDisconnected(Object.create({ [name]: undefined })),
    ).toThrow();
    const c = createController({ buttons: ['A'] }, () => {
      throw Error('escaped action');
    });
    let reads = 0;
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        reads++;
        throw Error('read forbidden endpoint');
      },
    });
    try {
      expect(() => c.choose(0)).toThrow('refuses native host globals');
      expect(() => c.deliver({})).toThrow('refuses native host globals');
      expect(reads).toBe(0);
    } finally {
      Reflect.deleteProperty(globalThis, name);
      c.close();
    }
  });
