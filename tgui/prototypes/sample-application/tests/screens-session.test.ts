import { expect, test } from 'bun:test';

import { createOwnedBoundary } from '../boundary';
import type { Route, SessionContext } from '../contracts';
import { createScreenSession } from '../screens/session';

function setup(route: Route) {
  const boundary = createOwnedBoundary({}, {});
  boundary.install();
  let current = true;
  const errors: unknown[] = [];
  const context: SessionContext = {
    lease: {
      route,
      hostEpoch: 1,
      screenEpoch: 1,
      isCurrent: () => current,
      onRetire: () => () => {},
    },
    validateBoundary: boundary.validate,
    onWorkbenchAction: () => {},
    lifecycle: {
      mounted() {},
      unmounted() {},
      pending() {},
      error: (error) => errors.push(error),
    },
  };
  return {
    boundary,
    context,
    errors,
    revoke: () => {
      current = false;
    },
  };
}

test('screen retirement still closes sources if a timer cancellation throws', () => {
  const env = setup('treasury');
  const callbacks: Array<() => void> = [];
  const delays: number[] = [];
  const canceled: unknown[] = [];
  const failure = new Error('injected cancellation failure');
  const session = createScreenSession('treasury', env.context, {
    schedule(callback, delay) {
      callbacks.push(callback);
      delays.push(delay);
      return callbacks.length;
    },
    cancel(timer) {
      canceled.push(timer);
      if (timer === 1) throw failure;
    },
  });
  if (session.route !== 'treasury') throw Error('wrong route');
  session.controller.open();
  session.controller.draft('oldest-only');
  expect(delays).toEqual([80, 250]);
  env.revoke();
  session.retire();
  expect(canceled).toEqual([1, 2]);
  expect(env.errors).toEqual([failure]);
  expect(session.controller.snapshot()).toEqual({ open: false, draft: '' });
  session.retire();
  expect(canceled).toEqual([1, 2]);
  env.boundary.dispose();
  // Replay genuinely captured timer callbacks after ownership disappeared.
  // They must fence before reaching the original model's boundary assertion.
  expect(() => callbacks.forEach((callback) => callback())).not.toThrow();
  expect(session.controller.snapshot()).toEqual({ open: false, draft: '' });
});

for (const route of ['treasury', 'readability'] as const) {
  test(`${route} controller-construction failure disposes its already-owned source`, () => {
    const env = setup(route);
    let validations = 0;
    const failure = new Error('injected controller construction failure');
    env.context.validateBoundary = () => {
      env.boundary.validate();
      if (++validations === 3) throw failure;
    };
    expect(() => createScreenSession(route, env.context)).toThrow(failure);
    // 1 = adapter; 2 = source; 3 = controller (fails); 4 = source.dispose.
    // Treasury's source disposal also validates its ledger_close action.
    expect(validations).toBe(route === 'treasury' ? 5 : 4);
    expect(env.errors).toEqual([]);
    env.boundary.dispose();
  });
}

test('one cleanup boundary failure does not skip the remaining owned source', () => {
  const env = setup('readability');
  let validations = 0;
  let failValidation = false;
  env.context.validateBoundary = () => {
    env.boundary.validate();
    validations++;
    if (failValidation) throw Error('injected retirement boundary failure');
  };
  const session = createScreenSession('readability', env.context);
  if (session.route !== 'readability') throw Error('wrong route');
  session.controller.open();
  const beforeRetirement = validations;
  failValidation = true;
  env.revoke();
  session.retire();
  expect(validations - beforeRetirement).toBe(2);
  expect(env.errors).toHaveLength(2);
  const afterRetirement = validations;
  session.controller.toggle('fullscreen');
  session.deliverNext();
  session.retire();
  expect(validations).toBe(afterRetirement);
  env.boundary.dispose();
});
