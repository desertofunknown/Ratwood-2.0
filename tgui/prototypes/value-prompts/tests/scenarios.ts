// Neutral DOM stimuli shared by independent production and candidate processes.
// No modal, candidate, sanitizer, reducer, or validity implementation is imported.
export type Kind = 'number' | 'text';
export type Data = {
  title?: string;
  message?: string;
  timeout?: number;
  large_buttons?: boolean;
  swapped_buttons?: boolean;
  init_value?: number;
  min_value?: number;
  max_value?: number;
  round_value?: boolean;
  placeholder?: string;
  multiline?: boolean;
  max_length?: number;
  preview_leadin?: string | null;
  disable_paste?: boolean;
  bigmodal?: boolean;
  spellcheck?: boolean;
};
export type Call = [string, Record<string, unknown>];
const defaults = {
  input: 'input[type="number"],textarea,[data-testid="input"]',
  confirm: '.input-button__submit,[data-testid="confirm"]',
  cancel: '.input-button__cancel,[data-testid="cancel"]',
  min: '.Button:has(.fa-angle-double-left),[data-testid="min"]',
  decrease: '.Button:has(.fa-angle-down),[data-testid="decrease"]',
  increase: '.Button:has(.fa-angle-up),[data-testid="increase"]',
  max: '.Button:has(.fa-angle-double-right),[data-testid="max"]',
  reset: '.Button:has(.fa-redo),[data-testid="reset"]',
  prompt: '.InputModal__prompt,[data-testid="prompt"]',
  hints:
    '.InputModal__hint,[data-testid="hint"],[data-testid="preview"],[data-testid="count"]',
  timeout: '.AlertModal__LoaderProgress,[data-testid="timeout"]',
};
export type Target = keyof typeof defaults;
export type Harness = {
  host: HTMLElement;
  calls: Call[];
  selectors?: Partial<Record<Target, string>>;
  settle(action?: () => void): Promise<void>;
  update(data: Partial<Data>): Promise<void>;
  destroy(): Promise<void>;
};
export type Factory = (kind: Kind, data: Data) => Promise<Harness>;
export const base = (kind: Kind, data: Data = {}): Data => ({
  title: 'Value prompt',
  message: 'A literal <b>prompt</b>.',
  timeout: 0,
  large_buttons: false,
  swapped_buttons: false,
  ...(kind === 'number'
    ? { init_value: 5, min_value: 0, max_value: 10, round_value: true }
    : {
        placeholder: 'seed',
        multiline: false,
        max_length: 100,
        preview_leadin: 'Preview:',
      }),
  ...data,
});
export const elements = (h: Harness, target: Target) => [
  ...h.host.querySelectorAll<HTMLElement>(
    h.selectors?.[target] ?? defaults[target],
  ),
];
export function element(h: Harness, target: Target) {
  const el = elements(h, target)[0];
  if (!el) throw Error(`Missing ${target}: ${h.host.innerHTML}`);
  return el;
}
const disabled = (el: HTMLElement) =>
  el.hasAttribute('disabled') ||
  el.getAttribute('aria-disabled') === 'true' ||
  el.classList.contains('Button--disabled');
// JSON-safe action values distinguish undefined, non-finite numbers and null.
function serial(value: unknown): unknown {
  if (value === undefined) return { undefined: true };
  if (typeof value === 'number' && !Number.isFinite(value))
    return { number: String(value) };
  if (Array.isArray(value)) return value.map(serial);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, serial(v)]),
    );
  return value;
}
export function state(h: Harness) {
  const input = element(h, 'input') as HTMLInputElement | HTMLTextAreaElement;
  const controls = [
    'confirm',
    'cancel',
    'min',
    'decrease',
    'increase',
    'max',
    'reset',
  ] as const;
  const validity = input.validity;
  return {
    draft: input.value,
    validity: {
      valid: validity.valid,
      rangeUnderflow: validity.rangeUnderflow,
      rangeOverflow: validity.rangeOverflow,
      stepMismatch: validity.stepMismatch,
      badInput: validity.badInput,
      tooLong: validity.tooLong,
    },
    constraints: Object.fromEntries(
      ['type', 'min', 'max', 'step', 'maxlength'].map((k) => [
        k,
        input.getAttribute(k),
      ]),
    ),
    selection:
      input.tagName === 'TEXTAREA'
        ? [input.selectionStart, input.selectionEnd]
        : null,
    focus:
      (['input', ...controls] as const).find((k) =>
        elements(h, k).includes(document.activeElement as HTMLElement),
      ) ?? 'other',
    disabled: Object.fromEntries(
      controls
        .filter((k) => elements(h, k).length)
        .map((k) => [k, disabled(element(h, k))]),
    ),
    prompt: elements(h, 'prompt')[0]?.textContent ?? '',
    hints: elements(h, 'hints').map((e) => e.textContent),
    timeout: elements(h, 'timeout')[0]?.style.width ?? null,
    largeButtons:
      element(h, 'confirm').classList.contains('Button--fluid') ||
      h.host.querySelector('[data-large-buttons="true"]') !== null,
    reversedButtons:
      h.host.querySelector<HTMLElement>('.InputButtons')?.style
        .flexDirection === 'row-reverse' ||
      h.host.querySelector('[data-swapped-buttons="true"]') !== null,
    calls: serial(h.calls),
  };
}
export async function focus(h: Harness, target: Target = 'input') {
  await h.settle(() => element(h, target).focus());
}
export async function click(h: Harness, target: Target) {
  // click() intentionally does not synthesize browser pointer focus. Scenarios
  // needing focus transfer do it explicitly rather than guessing browser defaults.
  await h.settle(() => element(h, target).click());
}
export async function type(h: Harness, value: string) {
  const input = element(h, 'input') as HTMLInputElement | HTMLTextAreaElement;
  await h.settle(() => {
    input.focus();
    const prototype =
      input.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(
      input,
      value,
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
export async function key(
  h: Harness,
  target: Target,
  value: string,
  modifiers: KeyboardEventInit = {},
) {
  const el = element(h, target);
  const event = new KeyboardEvent('keydown', {
    key: value,
    keyCode:
      { Enter: 13, Escape: 27, Tab: 9, ' ': 32 }[value] ??
      (value.length === 1 ? value.toUpperCase().charCodeAt(0) : 0),
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  await h.settle(() => el.dispatchEvent(event));
  await h.settle(() =>
    (document.activeElement ?? el).dispatchEvent(
      new KeyboardEvent('keyup', {
        key: value,
        bubbles: true,
        cancelable: true,
        ...modifiers,
      }),
    ),
  );
  return event.defaultPrevented;
}
export async function transfer(h: Harness, name: 'paste' | 'drop') {
  const event = new Event(name, { bubbles: true, cancelable: true });
  await h.settle(() => element(h, 'input').dispatchEvent(event));
  return event.defaultPrevented;
}
const assert = (condition: unknown, message: string) => {
  if (!condition) throw Error(message);
};
export async function runScenarios(make: Factory) {
  const records: Record<string, unknown[]> = {};
  async function scenario(
    name: string,
    kind: Kind,
    data: Data,
    run: (h: Harness, record: (extra?: unknown) => void) => Promise<void>,
  ) {
    const h = await make(kind, base(kind, data));
    records[name] = [];
    const record = (extra?: unknown) =>
      records[name].push({
        ...state(h),
        ...(extra === undefined ? {} : { extra }),
      });
    try {
      await run(h, record);
    } finally {
      await h.destroy();
    }
  }
  for (const round_value of [true, false]) {
    await scenario(
      `number/native-${round_value ? 'integer' : 'float'}`,
      'number',
      { round_value, init_value: 1, min_value: 0, max_value: 2 },
      async (h, r) => {
        r();
        for (const draft of ['1.234', '3', '-1', '1']) {
          await type(h, draft);
          r({ typed: draft });
          const before = h.calls.length;
          const valid = (element(h, 'input') as HTMLInputElement).validity
            .valid;
          r({ enterPrevented: await key(h, 'input', 'Enter') });
          assert(
            h.calls.length === before + (valid ? 1 : 0),
            'Native validity must gate input Enter.',
          );
        }
        await focus(h, 'increase');
        await click(h, 'increase');
        r();
        assert(
          (element(h, 'input') as HTMLInputElement).step ===
            (round_value ? '1' : 'any'),
          'Float input step is any, not adjustment 0.01.',
        );
      },
    );
  }
  await scenario(
    'number/equivalent-numeric-spelling',
    'number',
    { init_value: 0, min_value: 0, max_value: 20, round_value: false },
    async (h, r) => {
      r();
      // Native value assignment plus input reproduces the final spelling, not
      // physical key insertion. Keep the real production controlled input as
      // the oracle for leading zeros and equivalent fractional spellings.
      for (const draft of ['', '07', '007.50', '7.500', '7.50']) {
        await type(h, draft);
        r({ typed: draft });
        await click(h, 'confirm');
        r();
      }
    },
  );
  for (const recovery of ['min', 'max', 'reset'] as const) {
    await scenario(
      `number/invalid-recover-${recovery}`,
      'number',
      {},
      async (h, r) => {
        await type(h, '11');
        r();
        await click(h, 'confirm');
        r();
        assert(h.calls.length === 0, 'Invalid footer emitted.');
        await focus(h, recovery);
        await click(h, recovery);
        r();
        await click(h, 'confirm');
        r();
        assert(h.calls.length === 1, 'Recovery did not re-enable footer.');
      },
    );
  }
  await scenario(
    'number/focused-buffer-and-delivery',
    'number',
    {},
    async (h, r) => {
      await type(h, '7');
      r();
      await h.update({
        init_value: 2,
        timeout: 0.5,
        message: 'Delivered prompt',
      });
      r();
      await click(h, 'reset');
      r({ withoutPointerFocus: true });
      await click(h, 'confirm');
      r();
      await focus(h, 'min');
      await click(h, 'min');
      r();
      await h.update({ init_value: 9 });
      r();
      await focus(h, 'reset');
      await click(h, 'reset');
      r();
    },
  );
  await scenario(
    'number/delivered-bounds-native-parent-divergence',
    'number',
    {},
    async (h, r) => {
      r();
      await h.update({ max_value: 3 });
      r();
      await click(h, 'confirm');
      r();
      await type(h, '4');
      r();
      await click(h, 'confirm');
      r();
      await h.update({ max_value: 10 });
      r();
      await click(h, 'confirm');
      r();
      await type(h, '6');
      r();
      await click(h, 'confirm');
      r();
    },
  );
  for (const init_value of [0, undefined]) {
    await scenario(
      `number/default-${String(init_value)}`,
      'number',
      { init_value },
      async (h, r) => {
        r();
        await click(h, 'confirm');
        r();
        await type(h, '');
        r({ typedEmpty: true });
        await key(h, 'input', 'Enter');
        r();
        await type(h, '2');
        await focus(h, 'reset');
        await click(h, 'reset');
        r();
        await click(h, 'confirm');
        r();
      },
    );
  }
  await scenario(
    'number/clamp-fractional-and-negative',
    'number',
    { init_value: 0.99, min_value: 0.98, max_value: 1.005, round_value: false },
    async (h, r) => {
      for (const target of [
        'increase',
        'increase',
        'decrease',
        'min',
        'decrease',
      ] as const) {
        await focus(h, target);
        await click(h, target);
        r({ target });
      }
      await type(h, '1');
      r({ minusPrevented: await key(h, 'input', '-') });
      await type(h, '0.99');
      r();
    },
  );
  for (const kind of ['number', 'text'] as const) {
    await scenario(`${kind}/footer-keyboard-once`, kind, {}, async (h, r) => {
      for (const target of ['confirm', 'cancel'] as const) {
        await focus(h, target);
        for (const k of ['Enter', ' ']) {
          const before = h.calls.length;
          r({ target, key: k, prevented: await key(h, target, k) });
          assert(
            h.calls.length === before + 1,
            'Footer key must emit exactly once.',
          );
        }
      }
      await focus(h, 'input');
      r({ tabPrevented: await key(h, 'input', 'Tab') });
      r({ escapePrevented: await key(h, 'input', 'Escape') });
      await focus(h, 'cancel');
      r({ footerEscapePrevented: await key(h, 'cancel', 'Escape') });
    });
    await scenario(
      `${kind}/large-swapped-delivered-timeout`,
      kind,
      { large_buttons: true, swapped_buttons: true },
      async (h, r) => {
        r();
        await type(h, kind === 'number' ? '7' : 'edited');
        r();
        for (const timeout of [1, 0.375, 0, undefined]) {
          await h.update({ timeout });
          r();
        }
        assert(h.calls.length === 0, 'Timeout delivery invented an action.');
        await click(h, 'confirm');
        r();
      },
    );
  }
  for (const multiline of [false, true]) {
    await scenario(
      `text/newlines-${multiline}`,
      'text',
      { multiline },
      async (h, r) => {
        r();
        await type(h, ' one\n\n\ntwo\r\n\r\n\r\nthree\rfour ');
        r();
        await h.update({ placeholder: 'replacement', timeout: 0.25 });
        r();
        await click(h, 'confirm');
        r();
        await key(h, 'input', 'Enter');
        r();
        await type(h, '   ');
        r();
        await click(h, 'confirm');
        r();
      },
    );
  }
  for (const length of [29, 30]) {
    await scenario(
      `text/enter-threshold-${length}`,
      'text',
      { placeholder: 'x'.repeat(length) },
      async (h, r) => {
        r({
          shiftEnterPrevented: await key(h, 'input', 'Enter', {
            shiftKey: true,
          }),
        });
        assert(
          h.calls.length === (length === 29 ? 1 : 0),
          'Visual multiline threshold changed.',
        );
        await focus(h);
        r({ enterPrevented: await key(h, 'input', 'Enter') });
      },
    );
  }
  await scenario(
    'text/explicit-multiline-short',
    'text',
    { multiline: true, placeholder: 'short' },
    async (h, r) => {
      r({
        shiftEnterPrevented: await key(h, 'input', 'Enter', { shiftKey: true }),
      });
      assert(h.calls.length === 0, 'Multiline Shift+Enter must not submit.');
      r({ enterPrevented: await key(h, 'input', 'Enter') });
    },
  );
  await scenario(
    'text/mount-default-count-and-maxlength',
    'text',
    { placeholder: 'raw\n\n\nseed', max_length: 5 },
    async (h, r) => {
      r();
      await click(h, 'confirm');
      r();
      await h.update({
        placeholder: 'new',
        max_length: 0,
        preview_leadin: null,
      });
      r();
      await type(h, 'abcdef');
      r();
      await h.update({ max_length: 10001, preview_leadin: 'Now:' });
      r();
      await h.update({ max_length: 10 });
      r();
      await click(h, 'confirm');
      r();
    },
  );
  for (const modifier of ['ctrlKey', 'metaKey'] as const) {
    await scenario(
      `text/markup-${modifier}`,
      'text',
      { placeholder: 'abcdef' },
      async (h, r) => {
        for (const mark of ['b', 'i', 'u']) {
          await focus(h);
          await h.settle(() =>
            (element(h, 'input') as HTMLTextAreaElement).setSelectionRange(
              1,
              4,
            ),
          );
          r({
            mark,
            prevented: await key(h, 'input', mark, { [modifier]: true }),
          });
          await click(h, 'confirm');
          r();
        }
      },
    );
  }
  for (const disable_paste of [false, true]) {
    await scenario(
      `text/transfer-suppression-${disable_paste}`,
      'text',
      { disable_paste },
      async (h, r) => {
        for (const name of ['paste', 'drop'] as const) {
          const prevented = await transfer(h, name);
          r({ event: name, prevented });
          assert(
            prevented === disable_paste,
            'Paste/drop prevention mismatch.',
          );
        }
        await h.update({ disable_paste: !disable_paste });
        r({ event: 'paste', prevented: await transfer(h, 'paste') });
      },
    );
  }
  return records;
}
