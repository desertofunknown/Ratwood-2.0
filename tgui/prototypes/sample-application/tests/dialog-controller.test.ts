import { expect, test } from 'bun:test';

import { createOwnedBoundary } from '../boundary';
import type { SessionContext } from '../contracts';
import {
  type ActiveDialog,
  createDialogController,
  type DialogKind,
} from '../dialogs/controller';

// These tests exercise only the owned adapter. The standalone models' keyboard,
// sanitization, and native-editor equivalence have their own independent oracles.
function setup() {
  const scope = {};
  const endpoint = Object.freeze({});
  const boundary = createOwnedBoundary(endpoint, scope);
  boundary.install();
  let current = true;
  let validations = 0;
  const errors: unknown[] = [];
  const nativeActions: unknown[] = [];
  const context: SessionContext = {
    lease: {
      route: 'dialogs',
      hostEpoch: 1,
      screenEpoch: 1,
      isCurrent: () => current,
      onRetire: () => () => {},
    },
    validateBoundary() {
      validations++;
      boundary.validate();
    },
    onWorkbenchAction: (...args) => nativeActions.push(args),
    lifecycle: {
      mounted() {},
      unmounted() {},
      pending() {},
      error: (error) => errors.push(error),
    },
  };
  const controller = createDialogController(context);
  return {
    controller,
    context,
    scope,
    boundary,
    errors,
    nativeActions,
    validations: () => validations,
    revoke() {
      current = false;
    },
    dispose() {
      current = false;
      controller.retire();
      boundary.dispose();
      expect(nativeActions).toEqual([]);
    },
  };
}

function active<K extends DialogKind>(
  controller: ReturnType<typeof createDialogController>,
  kind: K,
) {
  const result = controller.snapshot().active;
  if (!result || result.kind !== kind) throw Error(`Expected ${kind} dialog.`);
  return result as Extract<ActiveDialog, { kind: K }>;
}

const state = (dialog: ActiveDialog) =>
  dialog.kind === 'confirmation'
    ? dialog.controller.getSnapshot()
    : dialog.controller.snapshot();

/** Retain every family of capability, including the event object side effect. */
function challenge(dialog: ActiveDialog) {
  let prevented = 0;
  const key = { key: 'Enter', preventDefault: () => prevented++ };
  switch (dialog.kind) {
    case 'selection': {
      const c = dialog.controller;
      c.deliver({ items: ['stale item'], timeout: 0.1 });
      c.select('stale item');
      c.query('stale query');
      c.toggleSearch();
      c.submit();
      c.submitEntry('stale entry');
      c.cancel();
      c.preview();
      c.key(key);
      c.close();
      break;
    }
    case 'text':
    case 'number': {
      const c = dialog.controller;
      c.deliver({ timeout: 0.1, placeholder: 'stale', init_value: 9 });
      c.setValue(dialog.kind === 'text' ? 'stale text' : 9);
      c.validate(false);
      c.adjust(1);
      c.min();
      c.max();
      c.reset();
      c.submit();
      c.cancel();
      c.key(key);
      c.close();
      break;
    }
    case 'confirmation': {
      const c = dialog.controller;
      c.deliver({ buttons: ['stale choice'], timeout: 0.1 });
      c.focus(0);
      c.choose(0);
      c.keyDown(key);
      c.keyDown({ ...key, key: 'Escape' });
      c.close();
    }
  }
  return prevented;
}

test('owned dialog commands retain exact identity and never act on the sample backend', () => {
  const s = setup();
  const manager = s.controller;
  try {
    expect(manager.snapshot().active).toBeNull();
    expect(manager.snapshot().actions).toEqual([]);
    manager.open('selection', 'small');
    const selection = active(manager, 'selection');
    selection.controller.select('  amber dusk  ');
    selection.controller.submit();
    selection.controller.preview();
    expect(manager.snapshot().active).toBe(selection);
    expect(manager.snapshot().actions.slice(-2)).toEqual([
      {
        kind: 'selection',
        epoch: selection.epoch,
        action: 'submit',
        params: { entry: '  amber dusk  ' },
      },
      {
        kind: 'selection',
        epoch: selection.epoch,
        action: 'preview_toggle',
        params: { entry: '  amber dusk  ' },
      },
    ]);
    manager.open('confirmation', 'exact');
    const confirmation = active(manager, 'confirmation');
    for (const index of [0, 1, 2, 3, 4]) confirmation.controller.choose(index);
    expect(
      manager
        .snapshot()
        .actions.slice(-5)
        .map((event) => event.params),
    ).toEqual([
      { choice: 'Same' },
      { choice: 'Same' },
      { choice: 'same' },
      { choice: '  Same  ' },
      { choice: '' },
    ]);
    expect(manager.snapshot().active).toBe(confirmation);
    manager.open('text', 'default');
    const text = active(manager, 'text');
    for (const value of ['', '  unchanged whitespace  ']) {
      text.controller.setValue(value);
      text.controller.submit();
      expect(manager.snapshot().actions.at(-1)?.params).toEqual({
        entry: value,
      });
    }
    manager.open('number', 'missing-default');
    const number = active(manager, 'number');
    number.controller.submit();
    expect(manager.snapshot().actions.at(-1)?.params).toEqual({
      entry: undefined,
    });
    expect(
      Object.hasOwn(manager.snapshot().actions.at(-1)!.params!, 'entry'),
    ).toBe(true);
    number.controller.setValue(0);
    number.controller.submit();
    expect(manager.snapshot().actions.at(-1)?.params).toEqual({ entry: 0 });
    expect(s.errors).toEqual([]);
  } finally {
    s.dispose();
  }
});

for (const [oldKind, replacement] of [
  ['selection', 'text'],
  ['text', 'number'],
  ['number', 'confirmation'],
  ['confirmation', 'selection'],
] as const) {
  test(`${oldKind} to ${replacement}: replacement revokes retained handlers, deliveries and subscriptions before validation`, () => {
    const s = setup();
    const manager = s.controller;
    try {
      manager.open(oldKind);
      const old = manager.snapshot().active!;
      let oldNotifications = 0;
      const stop = old.controller.subscribe(() => oldNotifications++);
      manager.open(replacement);
      const next = manager.snapshot().active!;
      expect(next.epoch).toBeGreaterThan(old.epoch);
      const oldState = state(old);
      const nextState = state(next);
      const before = manager.snapshot();
      const validations = s.validations();
      const notifications = oldNotifications;
      const lateStop = old.controller.subscribe(() => oldNotifications++);
      expect(challenge(old)).toBe(0);
      expect(challenge(old)).toBe(0);
      stop();
      stop();
      lateStop();
      expect(state(old)).toBe(oldState);
      expect(state(next)).toBe(nextState);
      expect(manager.snapshot()).toBe(before);
      expect(s.validations()).toBe(validations);
      expect(oldNotifications).toBe(notifications);
      expect(s.errors).toEqual([]);
    } finally {
      s.dispose();
    }
  });
}

test('cancellation is a command; titlebar, acknowledgement, dismiss and retirement have separate effects', () => {
  const s = setup();
  const manager = s.controller;
  try {
    manager.open('selection');
    const first = active(manager, 'selection');
    first.controller.cancel();
    expect(manager.snapshot().active).toBe(first);
    expect(manager.snapshot().actionCount).toBe(1);
    expect(manager.snapshot().actions.at(-1)).toEqual({
      kind: 'selection',
      epoch: first.epoch,
      action: 'cancel',
    });
    first.controller.close();
    expect(manager.snapshot().active).toBeNull();
    expect(manager.snapshot().closeReason).toBe('titlebar');
    expect(manager.snapshot().actionCount).toBe(1);
    const closed = manager.snapshot();
    expect(challenge(first)).toBe(0);
    expect(manager.snapshot()).toBe(closed);

    manager.open('text');
    active(manager, 'text').controller.submit();
    manager.acknowledge();
    expect(manager.snapshot().active).toBeNull();
    expect(manager.snapshot().closeReason).toBe('acknowledged');
    expect(manager.snapshot().actionCount).toBe(2);
    manager.open('number');
    manager.dismiss();
    expect(manager.snapshot().active).toBeNull();
    expect(manager.snapshot().closeReason).toBe('dismissed');
    expect(manager.snapshot().actionCount).toBe(2);
    manager.open('confirmation');
    s.revoke();
    manager.retire();
    expect(manager.snapshot().closeReason).toBe('retired');
    expect(manager.snapshot().actionCount).toBe(2);
    expect(s.errors).toEqual([]);
  } finally {
    s.dispose();
  }
});

for (const kind of ['selection', 'text', 'number', 'confirmation'] as const) {
  test(`${kind}: route lease retirement revokes delivery, manager and model subscriptions without boundary inspection`, () => {
    const s = setup();
    const manager = s.controller;
    try {
      manager.open(kind);
      const old = manager.snapshot().active!;
      let notifications = 0;
      const stops = [
        old.controller.subscribe(() => notifications++),
        manager.subscribe(() => notifications++),
      ];
      s.revoke();
      const before = state(old);
      const validations = s.validations();
      expect(challenge(old)).toBe(0);
      manager.deliverTimeout(0);
      manager.open('selection');
      manager.acknowledge();
      manager.dismiss();
      expect(state(old)).toBe(before);
      expect(notifications).toBe(0);
      expect(s.validations()).toBe(validations);
      manager.retire();
      const retired = manager.snapshot();
      const retiredOld = state(old);
      const after = notifications;
      const lateStop = manager.subscribe(() => notifications++);
      expect(challenge(old)).toBe(0);
      manager.open('text');
      manager.deliverTimeout(1);
      manager.retire();
      stops.forEach((stop) => {
        stop();
        stop();
      });
      lateStop();
      expect(manager.snapshot()).toBe(retired);
      expect(state(old)).toBe(retiredOld);
      expect(notifications).toBe(after);
      expect(s.validations()).toBe(validations);
      expect(s.errors).toEqual([]);
    } finally {
      s.dispose();
    }
  });

  test(`${kind}: an unowned boundary replacement retires once without reading or using its getter`, () => {
    const s = setup();
    const manager = s.controller;
    const owned = Object.getOwnPropertyDescriptor(s.scope, 'Byond')!;
    let foreignReads = 0;
    try {
      manager.open(kind);
      const old = manager.snapshot().active!;
      const count = manager.snapshot().actionCount;
      Object.defineProperty(s.scope, 'Byond', {
        configurable: true,
        get() {
          foreignReads++;
          throw Error('A foreign native endpoint must never be read.');
        },
      });
      expect(() => manager.deliverTimeout(0.2)).not.toThrow();
      expect(s.errors.map(String)).toEqual([
        'Error: Disconnected sample shell refuses native or unowned globals.',
      ]);
      expect(manager.snapshot().closeReason).toBe('boundary-error');
      expect(manager.snapshot().actionCount).toBe(count);
      const retired = manager.snapshot();
      const oldState = state(old);
      const validations = s.validations();
      expect(challenge(old)).toBe(0);
      manager.open('selection');
      manager.deliverTimeout(0);
      manager.acknowledge();
      manager.dismiss();
      Object.defineProperty(s.scope, 'Byond', owned);
      manager.open('text');
      expect(manager.snapshot()).toBe(retired);
      expect(state(old)).toBe(oldState);
      expect(s.validations()).toBe(validations);
      expect(s.errors).toHaveLength(1);
      expect(foreignReads).toBe(0);
    } finally {
      Object.defineProperty(s.scope, 'Byond', owned);
      s.dispose();
    }
  });
}

test('delivered timeout is state only, preserves dialog identity and allocates no local clock', () => {
  const timeout = globalThis.setTimeout;
  const interval = globalThis.setInterval;
  let scheduled = 0;
  const trap = () => {
    scheduled++;
    throw Error('Dialog controller must not start a local timeout engine.');
  };
  const s = setup();
  try {
    globalThis.setTimeout = trap as unknown as typeof setTimeout;
    globalThis.setInterval = trap as unknown as typeof setInterval;
    for (const kind of [
      'selection',
      'text',
      'number',
      'confirmation',
    ] as const) {
      s.controller.open(kind);
      const dialog = s.controller.snapshot().active!;
      for (const value of [0.75, 0.25, 0, -1, 2]) {
        s.controller.deliverTimeout(value);
        expect(s.controller.snapshot().active).toBe(dialog);
        expect(state(dialog).data.timeout).toBe(value);
        expect(s.controller.snapshot().actionCount).toBe(0);
      }
    }
    expect(scheduled).toBe(0);
    expect(s.errors).toEqual([]);
  } finally {
    globalThis.setTimeout = timeout;
    globalThis.setInterval = interval;
    s.dispose();
  }
});

test('owner failure publishes one terminal snapshot after revoking capabilities and honors reentrant unsubscribe', () => {
  const s = setup();
  const manager = s.controller;
  const owned = Object.getOwnPropertyDescriptor(s.scope, 'Byond')!;
  try {
    manager.open('text');
    const old = active(manager, 'text');
    let sourceNotices = 0;
    let terminalNotices = 0;
    let removedNotices = 0;
    let lateNotices = 0;
    let stopSecond = () => {};
    const stopSource = old.controller.subscribe(() => sourceNotices++);
    const stopFirst = manager.subscribe(() => {
      terminalNotices++;
      expect(manager.snapshot().active).toBeNull();
      expect(manager.snapshot().closeReason).toBe('boundary-error');
      stopSecond();
      const stopLate = manager.subscribe(() => lateNotices++);
      expect(challenge(old)).toBe(0);
      manager.open('number');
      manager.acknowledge();
      manager.deliverTimeout(0);
      stopLate();
    });
    stopSecond = manager.subscribe(() => removedNotices++);
    Object.defineProperty(s.scope, 'Byond', {
      configurable: true,
      value: undefined,
    });
    old.controller.submit();
    expect(terminalNotices).toBe(1);
    expect(sourceNotices).toBe(0);
    expect(removedNotices).toBe(0);
    expect(lateNotices).toBe(0);
    expect(manager.snapshot().actionCount).toBe(0);
    expect(s.errors.map(String)).toEqual([
      'Error: Disconnected sample shell refuses native or unowned globals.',
    ]);
    const terminal = manager.snapshot();
    Object.defineProperty(s.scope, 'Byond', owned);
    manager.open('selection');
    manager.retire();
    stopFirst();
    stopFirst();
    stopSecond();
    stopSource();
    expect(manager.snapshot()).toBe(terminal);
    expect(terminalNotices).toBe(1);
    expect(sourceNotices).toBe(0);
  } finally {
    Object.defineProperty(s.scope, 'Byond', owned);
    s.dispose();
  }
});

test('command history is bounded while preserving total count and active subscriptions unsubscribe idempotently', () => {
  const s = setup();
  try {
    s.controller.open('confirmation', 'exact');
    const dialog = active(s.controller, 'confirmation');
    let notifications = 0;
    const stop = s.controller.subscribe(() => notifications++);
    for (let index = 0; index < 27; index++)
      dialog.controller.choose(index % 5);
    expect(s.controller.snapshot().actionCount).toBe(27);
    expect(s.controller.snapshot().actions).toHaveLength(20);
    expect(s.controller.snapshot().actions[0].params).toEqual({
      choice: 'same',
    });
    expect(notifications).toBe(27);
    stop();
    stop();
    dialog.controller.choose(4);
    expect(notifications).toBe(27);
    expect(s.controller.snapshot().actionCount).toBe(28);
    expect(s.errors).toEqual([]);
  } finally {
    s.dispose();
  }
});

for (const kind of ['selection', 'text', 'number', 'confirmation'] as const) {
  test(`${kind}: a throwing model subscriber cannot strand titlebar close or the other subscriber`, () => {
    const s = setup();
    const failure = Error('Injected dialog subscriber failure.');
    try {
      s.controller.open(kind);
      const dialog = s.controller.snapshot().active!;
      let observed = 0;
      dialog.controller.subscribe(() => {
        throw failure;
      });
      const stop = dialog.controller.subscribe(() => observed++);
      expect(() => dialog.controller.close()).not.toThrow();
      expect(s.controller.snapshot().active).toBeNull();
      expect(s.controller.snapshot().closeReason).toBe('titlebar');
      expect(s.controller.snapshot().actionCount).toBe(0);
      expect(observed).toBe(1);
      expect(s.errors).toEqual([failure]);
      const closed = s.controller.snapshot();
      const stateAfterClose = state(dialog);
      expect(challenge(dialog)).toBe(0);
      stop();
      expect(s.controller.snapshot()).toBe(closed);
      expect(state(dialog)).toBe(stateAfterClose);
      expect(s.errors).toEqual([failure]);
    } finally {
      s.dispose();
    }
  });
}

for (const interruption of ['retire', 'newer-open'] as const) {
  test(`a reentrant ${interruption} during model construction wins over the outer dialog open`, () => {
    const s = setup();
    const validate = s.context.validateBoundary;
    let validations = 0;
    try {
      s.controller.open('selection');
      const old = s.controller.snapshot().active!;
      s.context.validateBoundary = () => {
        validate();
        // The first validation is the public manager's ownership gate. The
        // second occurs inside construction of the replacement domain model.
        if (++validations !== 2) return;
        if (interruption === 'retire') s.controller.retire();
        else s.controller.open('confirmation', 'exact');
      };
      s.controller.open('number');
      if (interruption === 'retire') {
        expect(s.controller.snapshot().active).toBeNull();
        expect(s.controller.snapshot().closeReason).toBe('retired');
      } else {
        expect(s.controller.snapshot().active?.kind).toBe('confirmation');
        expect(s.controller.snapshot().active?.scenario).toBe('exact');
      }
      const current = s.controller.snapshot();
      expect(challenge(old)).toBe(0);
      expect(s.controller.snapshot()).toBe(current);
      expect(s.controller.snapshot().actionCount).toBe(0);
      expect(s.errors).toEqual([]);
    } finally {
      s.dispose();
    }
  });
}

for (const operation of [
  'open',
  'acknowledge',
  'dismiss',
  'deliver',
] as const) {
  test(`${operation} cannot affect a newer dialog opened reentrantly by its boundary validator`, () => {
    const s = setup();
    const validate = s.context.validateBoundary;
    let replaced = false;
    try {
      s.controller.open('selection');
      s.context.validateBoundary = () => {
        validate();
        if (replaced) return;
        replaced = true;
        s.controller.open('text', 'default');
      };
      if (operation === 'open') s.controller.open('number');
      else if (operation === 'acknowledge') s.controller.acknowledge();
      else if (operation === 'dismiss') s.controller.dismiss();
      else s.controller.deliverTimeout(0.1);
      const next = active(s.controller, 'text');
      expect(next.controller.snapshot().data.timeout).toBe(0.72);
      expect(next.controller.snapshot().closed).toBe(false);
      expect(s.controller.snapshot().actionCount).toBe(0);
      expect(s.errors).toEqual([]);
    } finally {
      s.dispose();
    }
  });
}
