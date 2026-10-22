import { expect } from 'bun:test';
export type Call = [string, Record<string, unknown>];
export type Data = {
  buttons?: string[];
  message?: string;
  title?: string;
  autofocus?: boolean | number;
  large_buttons?: boolean | number;
  swapped_buttons?: boolean | number;
  timeout?: number;
};
export type Harness = {
  host: HTMLElement;
  calls: Call[];
  settle(action?: () => void): Promise<void>;
  update(patch: Data): Promise<void>;
  destroy(): Promise<void>;
};
export type Factory = (data: Data) => Promise<Harness>;
export const base = (patch: Data = {}): Data => ({
  buttons: ['Yes', 'No', 'Cancel'],
  message: 'Choose carefully.',
  title: 'Alert',
  autofocus: 1,
  large_buttons: 0,
  swapped_buttons: 0,
  timeout: 0,
  ...patch,
});
export const choices = (h: Harness) => [
  ...h.host.querySelectorAll<HTMLElement>(
    '.InputModal__choice,[data-alert-choice]',
  ),
];
export const content = (h: Harness) =>
  h.host.querySelector<HTMLElement>('.InputModal,[data-alert-content]')!;
export function state(h: Harness) {
  const buttons = choices(h);
  const active = document.activeElement;
  const stack = buttons[0]?.closest('.Stack');
  const footer = h.host.querySelector<HTMLElement>('[data-verbose]');
  const progress = h.host.querySelector<HTMLElement>(
    '.AlertModal__LoaderProgress,.AlertPrompt__timeout-progress',
  );
  return {
    labels: buttons.map((b) => b.textContent),
    selected: buttons.map(
      (b) =>
        b.classList.contains('Button--selected') ||
        b.getAttribute('aria-pressed') === 'true',
    ),
    focus:
      buttons.indexOf(active as HTMLElement) >= 0
        ? buttons.indexOf(active as HTMLElement)
        : h.host.contains(active)
          ? 'autofocus'
          : 'outside',
    vertical: footer
      ? footer.dataset.verbose === 'true'
      : (stack?.classList.contains('Stack--vertical') ?? false),
    reverse: footer
      ? buttons.length > 0 && footer.dataset.reversed === 'true'
      : stack?.classList.contains('Stack--reverse') ||
        stack?.classList.contains('Stack--reverse--vertical') ||
        false,
    fluid: buttons.map((b) =>
      footer
        ? footer.dataset.verbose === 'true' ||
          footer.dataset.largeButtons === 'true'
        : b.classList.contains('Button--fluid'),
    ),
    loader: progress?.style.width ?? null,
    calls: h.calls.map(([a, p]) => [a, { ...p }]),
  };
}
export async function key(
  h: Harness,
  key: string,
  opts: KeyboardEventInit = {},
  target: HTMLElement = content(h),
) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  await h.settle(() => target.dispatchEvent(event));
  return event.defaultPrevented;
}
export async function runScenarios(make: Factory) {
  const records: Record<string, unknown[]> = {};
  async function scenario(
    name: string,
    data: Data,
    run: (h: Harness, record: (extra?: unknown) => void) => Promise<void>,
  ) {
    const h = await make(base(data));
    records[name] = [];
    const record = (extra?: unknown) =>
      records[name].push({ state: state(h), extra: extra ?? null });
    try {
      record();
      await run(h, record);
    } finally {
      await h.destroy();
    }
  }
  await scenario('navigation-focus-separation', {}, async (h, r) => {
    expect(state(h).selected).toEqual([true, false, false]);
    for (const k of ['ArrowLeft', 'ArrowRight', 'Tab', 'Tab'])
      r(await key(h, k));
    r(await key(h, 'Tab', { shiftKey: true }));
    await h.settle(() => choices(h)[2].focus());
    r();
    r(await key(h, 'ArrowRight', {}, choices(h)[2]));
    expect(state(h).focus).toBe(2);
    expect(state(h).selected).toEqual([true, false, false]);
    r(await key(h, 'Enter', {}, choices(h)[2]));
    r(await key(h, ' ', {}, choices(h)[2]));
    expect(h.calls).toEqual([
      ['choose', { choice: 'Yes' }],
      ['choose', { choice: 'Yes' }],
    ]);
    r(await key(h, 'Escape', {}, choices(h)[2]));
    expect(h.calls.at(-1)).toEqual(['cancel', {}]);
  });
  await scenario(
    'identity-case-space-duplicate-empty',
    { buttons: ['Yes', 'yes', ' yes ', 'same', 'same', ''] },
    async (h, r) => {
      for (let i = 0; i < choices(h).length; i++) {
        await h.settle(() => choices(h)[i].click());
        r();
      }
      expect(h.calls.map((c) => c[1].choice)).toEqual([
        'Yes',
        'yes',
        ' yes ',
        'same',
        'same',
        '',
      ]);
    },
  );
  await scenario('modifiers-repeat-up-down', {}, async (h, r) => {
    for (const opts of [
      { altKey: true },
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { repeat: true },
    ]) {
      r(await key(h, 'ArrowRight', opts));
      r(await key(h, 'Enter', opts));
      r(await key(h, ' ', opts));
    }
    for (const k of ['ArrowUp', 'ArrowDown', 'Home', 'End', 'a']) {
      const before = state(h);
      expect(await key(h, k)).toBe(false);
      expect(state(h)).toEqual(before);
      r();
    }
    for (const k of ['Escape', 'Esc'])
      r(await key(h, k, { ctrlKey: true, repeat: true }));
  });
  await scenario('delivery-out-of-range', {}, async (h, r) => {
    await h.settle(() => choices(h)[2].focus());
    r();
    await h.update({ buttons: ['only'] });
    r();
    expect(state(h).selected).toEqual([false]);
    expect(await key(h, 'Enter')).toBe(true);
    expect(await key(h, ' ')).toBe(true);
    expect(h.calls).toEqual([]);
    r();
    r(await key(h, 'ArrowRight'));
    r(await key(h, 'Enter'));
    await h.update({ buttons: [] });
    r();
    for (const k of ['ArrowRight', 'ArrowLeft', 'Tab', 'Enter', ' '])
      r(await key(h, k));
  });
  await scenario(
    'empty-initial',
    { buttons: [], autofocus: 0 },
    async (h, r) => {
      for (const k of [
        'Enter',
        ' ',
        'ArrowLeft',
        'ArrowRight',
        'Tab',
        'Escape',
      ])
        r(await key(h, k));
    },
  );
  for (const large of [0, 1])
    for (const swap of [0, 1])
      for (const [label, buttons] of [
        ['short', ['One', 'Two', 'Three']],
        ['18', ['123456789012345678']],
        ['19', ['1234567890123456789']],
        ['four', ['A', 'B', 'C', 'D']],
      ] as const) {
        await scenario(
          `layout-${label}-${large}-${swap}`,
          {
            buttons: [...buttons],
            large_buttons: large,
            swapped_buttons: swap,
            autofocus: 0,
          },
          async (h, r) => {
            await h.update({ large_buttons: !large, swapped_buttons: !swap });
            r();
          },
        );
      }
  await scenario('timeout-delivered-only', { timeout: 0.75 }, async (h, r) => {
    const before = state(h);
    await new Promise((done) => setTimeout(done, 50));
    await h.settle();
    expect(state(h)).toEqual(before);
    r();
    for (const timeout of [0.25, 0, 1.5, -0.5]) {
      await h.update({ timeout });
      r();
    }
  });
  await scenario(
    'autofocus-toggle-lifecycle',
    { autofocus: 0 },
    async (h, r) => {
      expect(state(h).focus).toBe('outside');
      await h.update({ autofocus: 1 });
      r();
      expect(state(h).focus).toBe('autofocus');
      await h.settle(() => choices(h)[1].focus());
      await h.update({ message: 'Updated' });
      r();
      expect(state(h).focus).toBe(1);
      await h.update({ autofocus: 0 });
      r();
      await h.update({ autofocus: 1 });
      r();
      expect(state(h).focus).toBe('autofocus');
      expect(state(h).selected).toEqual([false, true, false]);
    },
  );
  await scenario('verbose-transition-remounts-choices', {}, async (h, r) => {
    for (const buttons of [
      ['A', 'B', 'C', 'D'],
      ['A', 'B', 'C'],
      ['A', '1234567890123456789', 'C'],
      ['A', '123456789012345678', 'C'],
    ]) {
      await h.settle(() => choices(h)[1].focus());
      r();
      await h.update({ buttons });
      r();
      expect(state(h).selected[1]).toBe(true);
      expect(state(h).focus).toBe('outside');
    }
  });
  await scenario(
    'numeric-truthy-flags',
    { autofocus: 2, large_buttons: -1, swapped_buttons: 2 },
    async (h, r) => {
      await h.update({ autofocus: 0, large_buttons: 0, swapped_buttons: 0 });
      r();
    },
  );
  await scenario(
    'omitted-defaults',
    {
      buttons: undefined,
      message: undefined,
      title: undefined,
      autofocus: undefined,
      large_buttons: undefined,
      swapped_buttons: undefined,
      timeout: undefined,
    },
    async (h, r) => {
      r(await key(h, 'Enter'));
      r(await key(h, 'Escape'));
      expect(h.calls).toEqual([['cancel', {}]]);
    },
  );
  return records;
}
