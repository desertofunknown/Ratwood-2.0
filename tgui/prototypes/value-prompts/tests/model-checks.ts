import { expect, test } from 'bun:test';
import {
  clamp,
  controlKey,
  createController,
  removeAllSkiplines,
  sanitizeMultiline,
  type Act,
  type Key,
} from '../model';
import { createSample } from '../fixtures';

function recorder() {
  const calls: Array<[string, { entry: unknown } | undefined]> = [];
  const act: Act = (action, params) => {
    calls.push([action, params]);
  };
  return { act, calls };
}
function key(key: string, modifiers: Partial<Key> = {}) {
  let prevented = false;
  return {
    key,
    ...modifiers,
    preventDefault: () => {
      prevented = true;
    },
    prevented: () => prevented,
  };
}

test('numeric mount state stays undefined while reset uses delivered fallback', () => {
  const { act, calls } = recorder();
  const c = createController('number', {}, act);
  expect(c.snapshot().value).toBeUndefined();
  expect(c.snapshot().minValue).toBe(0);
  expect(c.snapshot().maxValue).toBe(10000);
  c.submit();
  expect(calls).toEqual([['submit', { entry: undefined }]]);
  c.deliver({ init_value: 3, max_value: 2 });
  expect(c.snapshot().value).toBeUndefined();
  expect(c.snapshot().isValid).toBe(true);
  c.reset();
  expect(c.snapshot().value).toBe(3);
  c.deliver({ init_value: undefined });
  c.reset();
  expect(c.snapshot().value).toBe(0);
});

test('zero initializes without fallback and only editor validity gates submit', () => {
  const { act, calls } = recorder();
  const c = createController(
    'number',
    { init_value: 0, min_value: -2, max_value: 2 },
    act,
  );
  c.validate(false);
  c.deliver({ init_value: 1, max_value: 5 });
  c.submit();
  c.adjust(1);
  expect(c.snapshot().value).toBe(0);
  expect(calls).toEqual([]);
  c.max();
  expect(c.snapshot().value).toBe(5);
  expect(c.snapshot().isValid).toBe(false);
  c.validate(true);
  c.submit();
  expect(calls).toEqual([['submit', { entry: 5 }]]);
});

test('exact hundredth arithmetic, ordered clamp and integer step', () => {
  const c = createController(
    'number',
    { init_value: 0.99, min_value: 0.98, max_value: 1.005 },
    () => {},
  );
  c.adjust(1);
  expect(c.snapshot().value).toBe(1);
  c.adjust(1);
  expect(c.snapshot().value).toBe(1.005);
  c.adjust(-1);
  expect(c.snapshot().value).toBe(0.99);
  c.min();
  c.adjust(-1);
  expect(c.snapshot().value).toBe(0.98);
  c.deliver({ min_value: -10, max_value: 10, round_value: true });
  c.setValue(-1.005);
  c.adjust(-1);
  expect(c.snapshot().value).toBe(-2);
  expect(c.snapshot().step).toBe(1);
  expect(clamp(5, 10, 0)).toBe(10);
  expect(clamp(NaN, 0, 1)).toBeNaN();
  const missing = createController('number', {}, () => {});
  missing.adjust(1);
  expect(missing.snapshot().value).toBeNaN();
});

test('infinite limit controls disabled, reset compares current delivered init', () => {
  const c = createController(
    'number',
    { init_value: 2, min_value: -Infinity, max_value: Infinity },
    () => {},
  );
  expect(c.snapshot().minDisabled).toBe(true);
  expect(c.snapshot().maxDisabled).toBe(true);
  c.min();
  c.max();
  expect(c.snapshot().value).toBe(2);
  expect(c.snapshot().resetDisabled).toBe(true);
  c.deliver({ init_value: 4 });
  expect(c.snapshot().resetDisabled).toBe(false);
  c.reset();
  expect(c.snapshot().value).toBe(4);
});

test('text initial value is raw, identical callbacks no-op, later sanitization exact', () => {
  const initial = 'a\n\n\nb\rc';
  const c = createController('text', { placeholder: initial }, () => {});
  expect(c.snapshot().value).toBe(initial);
  c.setValue(initial);
  expect(c.snapshot().value).toBe(initial);
  c.deliver({ placeholder: 'replacement' });
  expect(c.snapshot().value).toBe(initial);
  c.setValue(`${initial}!`);
  expect(c.snapshot().value).toBe('abc!');
  c.deliver({ multiline: true });
  c.setValue('a\n\n\nb\r\n\r\n\r\nc\rd');
  expect(c.snapshot().value).toBe('a\n\nb\n\nc\rd');
  expect(sanitizeMultiline('a\r\r\rb')).toBe('a\r\r\rb');
  expect(removeAllSkiplines('a\r\n\nb')).toBe('ab');
});

test('text count, preview and visual multiline threshold use current parent value', () => {
  const c = createController(
    'text',
    { max_length: 5, preview_leadin: 'Preview:' },
    () => {},
  );
  expect(c.snapshot().count).toBe('0 / 5');
  expect(c.snapshot().preview).toBe('Preview: ...');
  c.setValue('x'.repeat(29));
  expect(c.snapshot().visualMultiline).toBe(false);
  c.setValue('x'.repeat(30));
  expect(c.snapshot().visualMultiline).toBe(true);
  expect(c.snapshot().count).toBe('30 / 5');
  c.deliver({ max_length: 10001, bigmodal: true, preview_leadin: null });
  expect(c.snapshot().count).toBe('30 characters');
  expect(c.snapshot().preview).toBeNull();
  expect(c.snapshot().windowWidth).toBe(620);
  expect(c.snapshot().windowHeight).toBe(560);
});

test('keyboard matches parent footer exclusions, Escape and unfiltered modifiers', () => {
  const { act, calls } = recorder();
  const c = createController('text', { placeholder: 'short' }, act);
  const shifted = key('Enter', {
    shiftKey: true,
    ctrlKey: true,
    altKey: true,
    metaKey: true,
  });
  c.key(shifted);
  expect(shifted.prevented()).toBe(true);
  expect(calls.length).toBe(1);
  c.setValue('x'.repeat(30));
  const multiline = key('Enter', { shiftKey: true });
  c.key(multiline);
  expect(multiline.prevented()).toBe(false);
  c.key(key('Enter'), 'footer');
  expect(calls.length).toBe(1);
  const escape = key('Esc');
  c.key(escape, 'footer');
  expect(escape.prevented()).toBe(true);
  expect(calls[1]).toEqual(['cancel', undefined]);
  const n = createController('number', { init_value: 2 }, act);
  n.key(key('Enter'), 'button');
  expect(calls.length).toBe(2);
  const numberEscape = key('Escape');
  n.key(numberEscape);
  expect(numberEscape.prevented()).toBe(false);
  n.validate(false);
  const invalid = key('Enter');
  n.key(invalid);
  expect(invalid.prevented()).toBe(false);
});

test('button handling activates once while parent bubble remains inert', () => {
  const { act, calls } = recorder();
  const c = createController('text', {}, act);
  for (const name of ['Enter', ' ', 'Spacebar']) {
    const e = key(name);
    controlKey(e, c.submit);
    c.key(e, 'footer');
    expect(e.prevented()).toBe(true);
  }
  expect(calls.length).toBe(3);
  controlKey(key('Enter'), c.submit, true);
  expect(calls.length).toBe(3);
});

test('timeout delivers only, cancel emits without close, close suspends once', () => {
  let closes = 0,
    changes = 0;
  const s = createSample(
    'number',
    'default',
    () => {},
    () => {
      closes++;
    },
  );
  const unsubscribe = s.controller.subscribe(() => {
    changes++;
  });
  s.deliver({ timeout: 0.25 });
  expect(s.controller.snapshot().data.timeout).toBe(0.25);
  expect(s.actions).toEqual([]);
  expect(changes).toBe(1);
  unsubscribe();
  s.controller.cancel();
  s.controller.submit();
  expect(s.actions.length).toBe(2);
  expect(s.controller.snapshot().closed).toBe(false);
  s.dispose();
  s.dispose();
  const closed = s.controller.snapshot();
  s.deliver({ timeout: 0 });
  s.controller.setValue(7);
  s.controller.validate(false);
  s.controller.submit();
  s.controller.cancel();
  s.controller.key(key('Escape'));
  expect(s.controller.snapshot()).toBe(closed);
  expect(s.actions.length).toBe(2);
  expect(closes).toBe(1);
  expect(changes).toBe(1);
});
