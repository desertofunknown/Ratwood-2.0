import '../test-environment';
import '../../treasury-ledger/test-dom';

import { afterAll, expect, test } from 'bun:test';
import { useLayoutEffect } from 'react';
import { flushSync } from 'react-dom';

import { createController as createStandaloneConfirmation } from '../../alert-prompt/model';
import { createController as createStandaloneSelection } from '../../selection-prompt/model';
import { createController as createStandaloneValue } from '../../value-prompts/model';
import { boundary } from '../bootstrap';
import type { ScreenProps, ScreenRenderer } from '../contracts';
import type { ActiveDialog, DialogKind } from '../dialogs/controller';
import { createFixture, type Fixture } from '../runtime';
import { ReactScreen } from '../screens/react';
import {
  createScreenSession,
  type OwnedScreenSession,
} from '../screens/session';
import { SvelteScreen } from '../screens/svelte';
import { networkGuard } from '../test-network-guard';
import {
  click,
  controlledClock,
  element,
  navigate,
} from './integration-helpers';

// Real source-mounted React and Svelte components in Happy DOM. These checks do
// not establish native BYOND, browser layout, accessibility or performance acceptance.
const arms = [
  ['React', ReactScreen],
  ['React-owned Svelte', SvelteScreen],
] as const;
const promptSelector = '.SelectionPrompt, .ValuePrompt, .AlertPrompt';
type DialogSession = Extract<OwnedScreenSession, { route: 'dialogs' }>;

async function mountedDialogs(Screen: ScreenRenderer) {
  const target = document.createElement('div');
  document.body.append(target);
  const clock = controlledClock();
  const sessions: OwnedScreenSession[] = [];
  const expectedErrors: string[] = [];
  const fixture = createFixture(target, Screen, (route, context) => {
    const session = createScreenSession(route, context, clock);
    sessions.push(session);
    return session;
  });
  const current = () => {
    const session = fixture.sessionManager.snapshot().session;
    expect(session?.route).toBe('dialogs');
    return session as DialogSession;
  };
  const manager = () => current().controller;
  function active<K extends DialogKind>(kind: K) {
    const dialog = manager().snapshot().active;
    if (!dialog || dialog.kind !== kind)
      throw Error(`Expected ${kind} dialog.`);
    return dialog as Extract<ActiveDialog, { kind: K }>;
  }
  const expectOneOwner = () => {
    expect(
      sessions.filter((session) => session.lease.isCurrent()),
    ).toHaveLength(1);
    expect(fixture.read().mounts - fixture.read().unmounts).toBe(1);
    expect(target.querySelectorAll('[data-sample-screen-target]')).toHaveLength(
      1,
    );
    expect(target.querySelectorAll('.Window')).toHaveLength(1);
    expect(fixture.read().nativeSubscriptionAttempts).toBe(0);
    expect(fixture.read().errors).toEqual(expectedErrors);
  };
  async function dispose() {
    try {
      await fixture.dispose();
      expect(fixture.read().subscriptions).toBe(0);
      expect(fixture.read().pendingDisposals).toBe(0);
      expect(fixture.read().mounts).toBe(fixture.read().unmounts);
      expect(fixture.read().errors).toEqual(expectedErrors);
      expect(fixture.read().nativeSubscriptionAttempts).toBe(0);
      expect(clock.pending.size).toBe(0);
      expect(sessions.every((session) => !session.lease.isCurrent())).toBe(
        true,
      );
    } finally {
      target.remove();
    }
  }
  try {
    fixture.resume();
    await fixture.settle();
    await navigate(fixture, 'dialogs');
    expectOneOwner();
  } catch (error) {
    await dispose();
    throw error;
  }
  return {
    fixture,
    target,
    clock,
    sessions,
    expectedErrors,
    current,
    manager,
    active,
    expectOneOwner,
    dispose,
    async launch(id: string) {
      const launcher = element<HTMLButtonElement>(
        target,
        `[data-sample-id="${id}"]`,
      );
      launcher.focus();
      await click(fixture, launcher);
      expect(target.querySelectorAll(promptSelector)).toHaveLength(1);
      expectOneOwner();
      return launcher;
    },
  };
}

async function typeDraft(
  fixture: Fixture,
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  flushSync(() => {
    input.focus();
    Object.getOwnPropertyDescriptor(
      input.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await fixture.settle();
}

const dialogState = (dialog: ActiveDialog) =>
  dialog.kind === 'confirmation'
    ? dialog.controller.getSnapshot()
    : dialog.controller.snapshot();

function retainedCommands(dialog: ActiveDialog) {
  if (dialog.kind === 'confirmation') {
    dialog.controller.choose(0);
    dialog.controller.deliver({ buttons: ['retired'], timeout: 0 });
    dialog.controller.keyDown({ key: 'Escape', preventDefault() {} });
  } else {
    dialog.controller.submit();
    dialog.controller.cancel();
    dialog.controller.deliver({ timeout: 0 });
    if (dialog.kind === 'selection') dialog.controller.query('retired');
    else dialog.controller.setValue(dialog.kind === 'text' ? 'retired' : 9);
  }
  dialog.controller.close();
}

for (const [name, Screen] of arms) {
  test(`${name}: the owned dialog route starts idle and each family closes back to its actual launcher`, async () => {
    const s = await mountedDialogs(Screen);
    try {
      expect(s.manager().snapshot().active).toBeNull();
      expect(s.target.querySelectorAll(promptSelector)).toHaveLength(0);
      expect(document.activeElement).toBe(
        element(s.target, '.SampleApplication__heading'),
      );
      const window = element(s.target, '.Window');
      const calls = s.fixture.endpoint.totalRecordedCalls;
      for (const id of [
        'selection-small',
        'text-default',
        'number-default',
        'confirmation-default',
      ]) {
        const launcher = await s.launch(id);
        await click(
          s.fixture,
          element(s.target, '[aria-label="Close sample window"]'),
        );
        expect(s.manager().snapshot().active).toBeNull();
        expect(s.manager().snapshot().closeReason).toBe('titlebar');
        expect(s.manager().snapshot().actionCount).toBe(0);
        expect(s.target.querySelectorAll(promptSelector)).toHaveLength(0);
        expect(document.activeElement).toBe(launcher);
        expect(element(s.target, '.Window')).toBe(window);
      }
      expect(s.fixture.endpoint.totalRecordedCalls).toBe(calls);
      s.expectOneOwner();
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: Cancel records a pending command, acknowledgement retires it, and titlebar close sends no command`, async () => {
    const s = await mountedDialogs(Screen);
    try {
      const launcher = await s.launch('selection-small');
      const old = s.active('selection');
      const staleConfirm = element(s.target, '[data-testid="confirm"]');
      const calls = s.fixture.endpoint.totalRecordedCalls;
      await click(s.fixture, element(s.target, '[data-testid="cancel"]'));
      expect(s.manager().snapshot().active).toBe(old);
      expect(s.manager().snapshot().actionCount).toBe(1);
      expect(s.manager().snapshot().actions.at(-1)).toEqual({
        kind: 'selection',
        epoch: old.epoch,
        action: 'cancel',
      });
      expect(s.target.querySelectorAll(promptSelector)).toHaveLength(1);
      await click(s.fixture, element(s.target, '[data-dialog-acknowledge]'));
      expect(s.manager().snapshot().active).toBeNull();
      expect(s.manager().snapshot().closeReason).toBe('acknowledged');
      expect(document.activeElement).toBe(launcher);
      const retired = s.manager().snapshot();
      flushSync(() => {
        staleConfirm.click();
        retainedCommands(old);
      });
      await s.fixture.settle();
      expect(s.manager().snapshot()).toBe(retired);
      await s.launch('text-default');
      await click(
        s.fixture,
        element(s.target, '[aria-label="Close sample window"]'),
      );
      expect(s.manager().snapshot().actionCount).toBe(1);
      expect(s.manager().snapshot().closeReason).toBe('titlebar');
      expect(s.fixture.endpoint.totalRecordedCalls).toBe(calls);
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: mounted keyboard navigation submits the exact choice and Escape stays distinct from titlebar close`, async () => {
    const s = await mountedDialogs(Screen);
    try {
      const launcher = await s.launch('selection-small');
      const dialog = s.active('selection');
      const content = element(s.target, '[data-testid="content"]');
      const calls = s.fixture.endpoint.totalRecordedCalls;
      content.focus();
      for (const key of ['ArrowUp', 'Enter', 'Escape']) {
        const event = new KeyboardEvent('keydown', {
          key,
          bubbles: true,
          cancelable: true,
        });
        flushSync(() => content.dispatchEvent(event));
        await s.fixture.settle();
        expect(event.defaultPrevented).toBe(true);
        expect(s.manager().snapshot().active).toBe(dialog);
        expect(s.target.querySelectorAll(promptSelector)).toHaveLength(1);
        if (key === 'ArrowUp') {
          expect(dialog.controller.snapshot().selectedItem).toBe(
            '  amber dusk  ',
          );
          expect(s.manager().snapshot().actionCount).toBe(0);
        } else if (key === 'Enter') {
          expect(s.manager().snapshot().actionCount).toBe(1);
          expect(s.manager().snapshot().actions[0]).toEqual({
            kind: 'selection',
            epoch: dialog.epoch,
            action: 'submit',
            params: { entry: '  amber dusk  ' },
          });
        } else {
          expect(s.manager().snapshot().actionCount).toBe(2);
          expect(s.manager().snapshot().actions[1]).toEqual({
            kind: 'selection',
            epoch: dialog.epoch,
            action: 'cancel',
          });
        }
      }
      await click(
        s.fixture,
        element(s.target, '[aria-label="Close sample window"]'),
      );
      expect(s.manager().snapshot().active).toBeNull();
      expect(s.manager().snapshot().closeReason).toBe('titlebar');
      expect(s.manager().snapshot().actionCount).toBe(2);
      expect(document.activeElement).toBe(launcher);
      expect(s.fixture.endpoint.totalRecordedCalls).toBe(calls);
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: selection whitespace, confirmation duplicate/case/empty choices and empty text stay exact across family transitions`, async () => {
    const s = await mountedDialogs(Screen);
    try {
      const calls = s.fixture.endpoint.totalRecordedCalls;
      await s.launch('selection-small');
      const choices = [
        ...s.target.querySelectorAll<HTMLElement>('[data-testid="option"]'),
      ];
      const whitespace = choices.find(
        (choice) => choice.dataset.entry === '  amber dusk  ',
      );
      expect(whitespace).toBeDefined();
      await click(s.fixture, whitespace!);
      await click(s.fixture, element(s.target, '[data-testid="confirm"]'));
      expect(s.manager().snapshot().actions.at(-1)?.params).toEqual({
        entry: '  amber dusk  ',
      });
      await s.launch('confirmation-exact');
      for (const [index, choice] of [
        'Same',
        'Same',
        'same',
        '  Same  ',
        '',
      ].entries()) {
        await click(
          s.fixture,
          element(s.target, `[data-alert-choice="${index}"]`),
        );
        expect(s.manager().snapshot().actions.at(-1)?.params).toEqual({
          choice,
        });
        expect(s.target.querySelectorAll(promptSelector)).toHaveLength(1);
      }
      await s.launch('text-default');
      const input = element<HTMLTextAreaElement>(s.target, 'textarea');
      await typeDraft(s.fixture, input, '');
      await click(s.fixture, element(s.target, '[data-testid="confirm"]'));
      expect(input.value).toBe('');
      expect(s.manager().snapshot().actions.at(-1)?.params).toEqual({
        entry: '',
      });
      expect(s.manager().snapshot().actionCount).toBe(7);
      expect(s.fixture.endpoint.totalRecordedCalls).toBe(calls);
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: delivered state keeps focused numeric spelling and multiline editor buffers, while replacement resets them`, async () => {
    const s = await mountedDialogs(Screen);
    try {
      await s.launch('number-default');
      const number = s.active('number');
      const input = element<HTMLInputElement>(s.target, 'input[type="number"]');
      await typeDraft(s.fixture, input, '007');
      expect(input.value).toBe('007');
      flushSync(() => {
        number.controller.deliver({ init_value: 2 });
        s.manager().deliverTimeout(0.25);
      });
      await s.fixture.settle();
      expect(s.active('number')).toBe(number);
      expect(element(s.target, 'input[type="number"]')).toBe(input);
      expect(input.value).toBe('007');
      expect(document.activeElement).toBe(input);
      await click(s.fixture, element(s.target, '[data-testid="confirm"]'));
      expect(s.manager().snapshot().actions.at(-1)?.params).toEqual({
        entry: 7,
      });
      await s.launch('text-multiline');
      const text = s.active('text');
      const textarea = element<HTMLTextAreaElement>(s.target, 'textarea');
      const draft = '  first\n\n\nthird  ';
      await typeDraft(s.fixture, textarea, draft);
      expect(textarea.value).toBe(draft);
      flushSync(() => {
        text.controller.deliver({ placeholder: 'replacement seed' });
        s.manager().deliverTimeout(0.25);
      });
      await s.fixture.settle();
      expect(element(s.target, 'textarea')).toBe(textarea);
      expect(textarea.value).toBe(draft);
      expect(document.activeElement).toBe(textarea);
      await click(s.fixture, element(s.target, '[data-testid="confirm"]'));
      expect(s.manager().snapshot().actions.at(-1)?.params).toEqual({
        entry: '  first\n\nthird  ',
      });
      await s.launch('number-default');
      expect(s.active('number').epoch).toBeGreaterThan(number.epoch);
      expect(
        element<HTMLInputElement>(s.target, 'input[type="number"]').value,
      ).toBe('5');
      await s.launch('text-default');
      expect(element<HTMLTextAreaElement>(s.target, 'textarea').value).toBe(
        'A quiet evening',
      );
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: replacing all four families fences retained DOM, handlers, deliveries and subscriptions`, async () => {
    const s = await mountedDialogs(Screen);
    try {
      const ids = [
        'selection-small',
        'text-default',
        'number-default',
        'confirmation-default',
        'selection-search',
      ];
      await s.launch(ids[0]);
      for (const id of ids.slice(1)) {
        const old = s.manager().snapshot().active!;
        const oldView = element(s.target, promptSelector);
        const staleButton = element<HTMLElement>(
          oldView,
          '[data-testid="confirm"], [data-alert-choice="0"]',
        );
        let notices = 0;
        const stop = old.controller.subscribe(() => notices++);
        await s.launch(id);
        const next = s.manager().snapshot().active!;
        const state = s.manager().snapshot();
        const nextState = dialogState(next);
        const oldState = dialogState(old);
        const count = notices;
        const focus = document.activeElement;
        const calls = s.fixture.endpoint.totalRecordedCalls;
        expect(next.epoch).toBeGreaterThan(old.epoch);
        expect(oldView.isConnected).toBe(false);
        flushSync(() => {
          staleButton.click();
          retainedCommands(old);
        });
        await s.fixture.settle();
        expect(s.manager().snapshot()).toBe(state);
        expect(dialogState(next)).toBe(nextState);
        expect(dialogState(old)).toBe(oldState);
        expect(notices).toBe(count);
        expect(document.activeElement).toBe(focus);
        expect(s.fixture.endpoint.totalRecordedCalls).toBe(calls);
        stop();
        stop();
        s.expectOneOwner();
      }
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: timeout controls display delivered fractions without counting down or acknowledging`, async () => {
    const s = await mountedDialogs(Screen);
    try {
      for (const id of [
        'selection-small',
        'text-default',
        'number-default',
        'confirmation-timeout',
      ]) {
        await s.launch(id);
        const dialog = s.manager().snapshot().active!;
        await click(
          s.fixture,
          element(s.target, '[data-dialog-timeout="0.25"]'),
        );
        expect(dialogState(dialog).data.timeout).toBe(0.25);
        const progress = element(
          s.target,
          '[aria-label="Delivered time remaining"]',
        );
        expect(
          progress.tagName === 'PROGRESS'
            ? (progress as HTMLProgressElement).value * 100
            : Number(progress.getAttribute('aria-valuenow')),
        ).toBe(25);
        const before = dialogState(dialog);
        flushSync(() => s.clock.advance(60000));
        await s.fixture.settle();
        expect(dialogState(dialog)).toBe(before);
        expect(s.manager().snapshot().active).toBe(dialog);
        expect(s.manager().snapshot().actionCount).toBe(0);
        expect(s.clock.pending.size).toBe(0);
        await click(s.fixture, element(s.target, '[data-dialog-timeout="0"]'));
        expect(dialogState(dialog).data.timeout).toBe(0);
        expect(
          s.target.querySelector('[aria-label="Delivered time remaining"]'),
        ).toBeNull();
        expect(s.manager().snapshot().active).toBe(dialog);
      }
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: route retirement and a fresh visit cannot be affected or focused by old dialog capabilities`, async () => {
    const s = await mountedDialogs(Screen);
    try {
      const launcher = await s.launch('text-default');
      const oldSession = s.current();
      const old = s.active('text');
      const staleClose = element(
        s.target,
        '[aria-label="Close sample window"]',
      );
      const oldManager = s.manager();
      s.fixture.navigate('workbench');
      expect(oldSession.lease.isCurrent()).toBe(false);
      const oldState = oldManager.snapshot();
      flushSync(() => {
        staleClose.click();
        retainedCommands(old);
        oldManager.open('number');
      });
      await s.fixture.settle();
      expect(document.activeElement).toBe(
        element(s.target, '.SampleApplication__heading'),
      );
      expect(launcher.isConnected).toBe(false);
      expect(oldManager.snapshot()).toBe(oldState);
      await navigate(s.fixture, 'dialogs');
      const fresh = s.manager();
      expect(fresh).not.toBe(oldManager);
      expect(fresh.snapshot().active).toBeNull();
      expect(fresh.snapshot().actionCount).toBe(0);
      await s.launch('number-default');
      const current = fresh.snapshot();
      const focused = document.activeElement;
      const calls = s.fixture.endpoint.totalRecordedCalls;
      flushSync(() => {
        retainedCommands(old);
        oldManager.acknowledge();
        oldManager.deliverTimeout(0);
        oldManager.open('confirmation');
      });
      await s.fixture.settle();
      expect(fresh.snapshot()).toBe(current);
      expect(document.activeElement).toBe(focused);
      expect(s.fixture.endpoint.totalRecordedCalls).toBe(calls);
      s.expectOneOwner();
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: host suspend and root replacement retire dialog state instead of leaking it into the resumed shell`, async () => {
    const s = await mountedDialogs(Screen);
    try {
      await s.launch('confirmation-exact');
      const oldSession = s.current();
      const old = s.active('confirmation');
      const oldManager = s.manager();
      await click(s.fixture, element(s.target, '[data-alert-choice="4"]'));
      s.fixture.dispatch('suspend');
      expect(oldSession.lease.isCurrent()).toBe(false);
      const before = oldManager.snapshot();
      const calls = s.fixture.endpoint.totalRecordedCalls;
      retainedCommands(old);
      oldManager.open('selection');
      expect(oldManager.snapshot()).toBe(before);
      expect(s.fixture.endpoint.totalRecordedCalls).toBe(calls);
      s.fixture.resume();
      await s.fixture.settle();
      expect(s.current()).not.toBe(oldSession);
      expect(s.manager().snapshot().active).toBeNull();
      expect(s.manager().snapshot().actionCount).toBe(0);
      await s.launch('number-default');
      const secondSession = s.current();
      const secondManager = s.manager();
      const second = s.active('number');
      s.fixture.unmountRoot();
      expect(secondSession.lease.isCurrent()).toBe(false);
      s.fixture.mountRoot();
      await s.fixture.settle();
      const next = s.manager().snapshot();
      retainedCommands(second);
      secondManager.deliverTimeout(0);
      secondManager.open('text');
      await s.fixture.settle();
      expect(s.manager().snapshot()).toBe(next);
      expect(next.active).toBeNull();
      expect(document.activeElement).toBe(
        element(s.target, '.SampleApplication__heading'),
      );
      s.expectOneOwner();
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: a replaced owner boundary blocks prompt commands without reading a native-looking getter`, async () => {
    const s = await mountedDialogs(Screen);
    const descriptor = Object.getOwnPropertyDescriptor(window, 'Byond');
    let foreignReads = 0;
    try {
      await s.launch('number-default');
      const old = s.active('number');
      const manager = s.manager();
      const calls = s.fixture.endpoint.totalRecordedCalls;
      const count = manager.snapshot().actionCount;
      const heading = element(s.target, '.SampleApplication__heading');
      heading.focus();
      s.expectedErrors.push(
        'Error: Disconnected sample shell refuses native or unowned globals.',
      );
      Object.defineProperty(window, 'Byond', {
        configurable: true,
        get() {
          foreignReads++;
          throw Error('Foreign host getter read.');
        },
      });
      flushSync(() => old.controller.submit());
      await s.fixture.settle();
      expect(manager.snapshot().closeReason).toBe('boundary-error');
      expect(manager.snapshot().actionCount).toBe(count);
      expect(s.target.querySelectorAll(promptSelector)).toHaveLength(0);
      expect(
        element<HTMLButtonElement>(s.target, '[data-dialog-acknowledge]')
          .disabled,
      ).toBe(true);
      expect(document.activeElement).toBe(heading);
      const retired = manager.snapshot();
      flushSync(() => {
        retainedCommands(old);
        manager.deliverTimeout(0);
        manager.open('text');
      });
      await s.fixture.settle();
      expect(manager.snapshot()).toBe(retired);
      expect(s.target.querySelectorAll(promptSelector)).toHaveLength(0);
      expect(document.activeElement).toBe(heading);
      expect(foreignReads).toBe(0);
      expect(s.fixture.endpoint.totalRecordedCalls).toBe(calls);
      expect(s.fixture.read().errors).toEqual(s.expectedErrors);
      if (descriptor) Object.defineProperty(window, 'Byond', descriptor);
      else Reflect.deleteProperty(window, 'Byond');
      await navigate(s.fixture, 'workbench');
      await navigate(s.fixture, 'dialogs');
      await s.launch('text-default');
      expect(s.manager()).not.toBe(manager);
      expect(s.manager().snapshot().actionCount).toBe(0);
      s.expectOneOwner();
    } finally {
      if (descriptor) Object.defineProperty(window, 'Byond', descriptor);
      else Reflect.deleteProperty(window, 'Byond');
      await s.dispose();
    }
  });

  test(`${name}: pending prompt autofocus cannot steal the next route's focus`, async () => {
    const s = await mountedDialogs(Screen);
    try {
      for (const id of [
        'confirmation-default',
        'number-default',
        'text-default',
      ]) {
        const launcher = element(s.target, `[data-sample-id="${id}"]`);
        // Commit the new prompt, then retire its route before its 1 ms leaf
        // autofocus timer is delivered. Do not wait for it to settle first.
        flushSync(() => {
          launcher.focus();
          launcher.click();
        });
        const old = s.manager().snapshot().active!;
        s.fixture.navigate('workbench');
        await s.fixture.settle();
        expect(document.activeElement).toBe(
          element(s.target, '.SampleApplication__heading'),
        );
        expect(launcher.isConnected).toBe(false);
        expect(s.target.querySelectorAll(promptSelector)).toHaveLength(0);
        retainedCommands(old);
        await navigate(s.fixture, 'dialogs');
        expect(s.manager().snapshot().active).toBeNull();
        expect(document.activeElement).toBe(
          element(s.target, '.SampleApplication__heading'),
        );
      }
      s.expectOneOwner();
    } finally {
      await s.dispose();
    }
  });

  test(`${name}: delayed retired view disposal cannot remove or refocus the replacement dialog`, async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((done) => {
      resolve = done;
    });
    let held = false;
    const Delayed: ScreenRenderer = (props: ScreenProps) => {
      useLayoutEffect(
        () => () => {
          if (props.session.route === 'dialogs' && !held) {
            held = true;
            props.lifecycle.pending(pending);
          }
        },
        [],
      );
      return <Screen {...props} />;
    };
    const s = await mountedDialogs(Delayed);
    try {
      await s.launch('text-default');
      const old = s.active('text');
      s.fixture.navigate('workbench');
      expect(s.fixture.read().pendingDisposals).toBeGreaterThan(0);
      s.fixture.navigate('dialogs');
      for (let turn = 0; turn < 12; turn++) await Promise.resolve();
      flushSync(() => {});
      const launcher = element(s.target, '[data-sample-id="number-default"]');
      flushSync(() => {
        launcher.focus();
        launcher.click();
      });
      for (let turn = 0; turn < 12; turn++) await Promise.resolve();
      flushSync(() => {});
      const current = s.active('number');
      const view = element(s.target, '.ValuePrompt--number');
      const input = element<HTMLInputElement>(s.target, 'input[type="number"]');
      input.focus();
      retainedCommands(old);
      resolve();
      await s.fixture.settle();
      expect(s.active('number')).toBe(current);
      expect(element(s.target, '.ValuePrompt--number')).toBe(view);
      expect(document.activeElement).toBe(input);
      expect(input.value).toBe('5');
      expect(s.fixture.read().pendingDisposals).toBe(0);
      s.expectOneOwner();
    } finally {
      resolve();
      await s.dispose();
    }
  });
}

test('all standalone dialog constructors retain their default native-global refusal inside the owned application', () => {
  expect(() => createStandaloneSelection({ items: [] }, () => {})).toThrow(
    'refuses native host globals',
  );
  expect(() => createStandaloneValue('text', {}, () => {})).toThrow(
    'refuses native host globals',
  );
  expect(() => createStandaloneValue('number', {}, () => {})).toThrow(
    'refuses native host globals',
  );
  expect(() => createStandaloneConfirmation({}, () => {})).toThrow(
    'refuses native host globals',
  );
});

afterAll(() => {
  try {
    expect(networkGuard.attempted).toBe(0);
    boundary.dispose();
  } finally {
    networkGuard.restore();
    Reflect.deleteProperty(globalThis, '__disconnectedWebpackContext');
  }
});
