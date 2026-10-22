// Shared DOM stimuli, not a selection implementation. Production records are
// produced in a separate process from both candidate implementations.
export type Data = {
  items: string[];
  init_value?: string | number;
  title?: string;
  message?: string;
  enable_preview?: boolean;
  previewing?: boolean;
  timeout?: number;
  large_buttons?: boolean;
  swapped_buttons?: boolean;
};
export type Call = [string, Record<string, unknown>];
export type Harness = {
  host: HTMLElement;
  calls: Call[];
  update(data: Partial<Data>): Promise<void>;
  settle(action?: () => void): Promise<void>;
  destroy(): Promise<void>;
};
export type Factory = (data: Data) => Promise<Harness>;
export const base = (data: Partial<Data> = {}): Data => ({
  items: ['apple', 'banana', 'blueberry', 'carrot'],
  init_value: 'apple',
  title: 'Choose exactly',
  message: 'A literal <b>prompt</b>.',
  enable_preview: true,
  previewing: false,
  large_buttons: false,
  swapped_buttons: false,
  ...data,
});
const selectors = {
  content: '.InputModal,[data-testid="content"]',
  option: '.ListInput__option,[data-testid="option"]',
  search: 'input[placeholder="Search choices..."],[data-testid="search"]',
  toggle: '.ListInput__searchToggle,[data-testid="search-toggle"]',
  confirm: '.input-button__submit,[data-testid="confirm"]',
  cancel: '.input-button__cancel,[data-testid="cancel"]',
  preview: '.InputModal__preview,[data-testid="preview"]',
};
export type Target = keyof typeof selectors;
export const elements = (h: Harness, target: Target) => [
  ...h.host.querySelectorAll<HTMLElement>(selectors[target]),
];
export function element(h: Harness, target: Target, index = 0) {
  const result = elements(h, target)[index];
  if (!result) throw Error(`Missing ${target}[${index}]: ${h.host.innerHTML}`);
  return result;
}
const disabled = (el?: HTMLElement) =>
  !!el &&
  (el.hasAttribute('disabled') ||
    el.getAttribute('aria-disabled') === 'true' ||
    el.classList.contains('Button--disabled'));
export function state(h: Harness) {
  const options = elements(h, 'option');
  const input = elements(h, 'search')[0] as HTMLInputElement | undefined;
  const preview = elements(h, 'preview')[0];
  const active = document.activeElement;
  const focus =
    (Object.keys(selectors) as Target[])
      .filter((k) => k !== 'content')
      .find((k) => elements(h, k).includes(active as HTMLElement)) ?? 'other';
  const labels = options.map((el) => {
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[aria-hidden="true"]').forEach((e) => e.remove());
    return copy.textContent ?? '';
  });
  const progress = h.host.querySelector<HTMLElement>(
    '.AlertModal__LoaderProgress,[data-testid="timeout"]',
  );
  return {
    prompt:
      h.host.querySelector('.InputModal__prompt,[data-testid="prompt"]')
        ?.textContent ?? '',
    reversedButtons:
      h.host.querySelector<HTMLElement>('.InputButtons')?.style
        .flexDirection === 'row-reverse' ||
      !!h.host.querySelector('.SelectionPrompt__buttons--swapped'),
    largeButtons:
      elements(h, 'confirm')[0]?.classList.contains('Button--fluid') ||
      !!h.host.querySelector('.SelectionPrompt__footer--large'),
    labels,
    selected: options.findIndex(
      (el) =>
        el.classList.contains('Button--selected') ||
        el.getAttribute('aria-selected') === 'true' ||
        el.getAttribute('aria-pressed') === 'true',
    ),
    search: input?.value ?? null,
    focus,
    confirmDisabled: disabled(elements(h, 'confirm')[0]),
    preview: preview
      ? { label: preview.textContent?.trim(), disabled: disabled(preview) }
      : null,
    timeout: progress
      ? progress.tagName === 'PROGRESS'
        ? `${Number(progress.getAttribute('value')) * 100}%`
        : progress.style.width
      : null,
    calls: h.calls.map(([action, params]) => [
      action,
      Object.fromEntries(
        Object.entries(params).map(([key, value]) => [
          key,
          value === undefined ? { undefined: true } : value,
        ]),
      ),
    ]),
  };
}
export async function click(h: Harness, target: Target, index = 0) {
  await h.settle(() => element(h, target, index).click());
}
export async function focus(h: Harness, target: Target, index = 0) {
  await h.settle(() => element(h, target, index).focus());
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
      value.length === 1
        ? value.toUpperCase().charCodeAt(0)
        : ({ Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38 }[value] ?? 0),
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
export async function query(h: Harness, value: string) {
  const input = element(h, 'search') as HTMLInputElement;
  await h.settle(() => {
    input.focus();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const assert = (condition: unknown, message: string) => {
  if (!condition) throw Error(message);
};
export async function runScenarios(make: Factory) {
  const records: Record<string, unknown[]> = {};
  async function scenario(
    name: string,
    data: Data,
    fn: (h: Harness, record: (extra?: unknown) => void) => Promise<void>,
  ) {
    const h = await make(data);
    records[name] = [];
    const record = (extra?: unknown) =>
      records[name].push({
        ...state(h),
        ...(extra === undefined ? {} : { extra }),
      });
    try {
      await fn(h, record);
    } finally {
      await h.destroy();
    }
  }
  for (const init_value of [undefined, 2, 'missing', 'Banana', '  banana  ']) {
    await scenario(
      `identity/default-${String(init_value)}`,
      base({
        items: [
          'banana',
          'Banana',
          '  banana  ',
          'banana (2)',
          'banana (2) (2)',
          '<b>literal</b>',
        ],
        init_value,
      }),
      async (h, record) => {
        record();
        await click(h, 'confirm');
        record();
        const expected =
          typeof init_value === 'string' &&
          h.host.textContent?.includes(init_value) &&
          init_value !== 'missing'
            ? init_value
            : 'banana';
        assert(
          h.calls[0]?.[1].entry === expected,
          'Default must preserve exact known identity or fall back to first.',
        );
        for (let i = 0; i < 6; i++) {
          await click(h, 'option', i);
          await click(h, 'confirm');
          record();
        }
        assert(
          h.calls
            .slice(1)
            .map((c) => c[1].entry)
            .join('|') ===
            'banana|Banana|  banana  |banana (2)|banana (2) (2)|<b>literal</b>',
          'Exact delivered identity/order changed.',
        );
      },
    );
  }
  for (const count of [0, 8, 9]) {
    await scenario(
      `mount-threshold-${count}`,
      base({ items: Array.from({ length: count }, (_, i) => `item ${i}`) }),
      async (h, record) => {
        assert(
          (state(h).search !== null) === count > 8,
          'Search threshold is mount-only >8.',
        );
        record();
        await h.update({
          items: ['replacement'],
          init_value: 'replacement',
          title: 'Delivered title',
        });
        record();
        assert(
          (state(h).search !== null) === count > 8,
          'Update must not reset search visibility.',
        );
      },
    );
  }
  await scenario(
    'filter-fallback-restores-stored-selection',
    base({ init_value: 'blueberry' }),
    async (h, record) => {
      await click(h, 'toggle');
      record();
      await query(h, 'BAN');
      record();
      await click(h, 'confirm');
      record();
      assert(h.calls.at(-1)?.[1].entry === 'banana', 'Fallback submit wrong.');
      await query(h, '');
      record();
      await click(h, 'confirm');
      assert(
        h.calls.at(-1)?.[1].entry === 'blueberry',
        'Filtering overwrote stored selection.',
      );
      await query(h, ' ban ');
      record();
      assert(elements(h, 'option').length === 0, 'Query was trimmed.');
      await click(h, 'confirm');
      await click(h, 'preview');
      record();
      assert(h.calls.length === 2, 'Disabled no-results controls emitted.');
      await h.update({ previewing: true, timeout: 0.25 });
      record();
      await click(h, 'preview');
      record();
      assert(
        h.calls.at(-1)?.[0] === 'preview_toggle' &&
          h.calls.at(-1)?.[1].entry === 'apple',
        'Stop fallback must use first full-list item.',
      );
      assert(
        state(h).preview?.label === 'Stop',
        'Preview must not optimistically toggle.',
      );
      await h.update({ previewing: false });
      record();
      await query(h, 'err');
      record();
      assert(
        elements(h, 'option').length === 1,
        'Substring filtering changed.',
      );
    },
  );
  await scenario(
    'arrows-and-repeat-shortcuts',
    base({
      items: [
        'apple',
        'banana',
        'banana',
        'Banana',
        'blueberry',
        '2 pears',
        '2 plums',
      ],
    }),
    async (h, record) => {
      await focus(h, 'option');
      assert(
        state(h).focus === 'option',
        'Focus selection must keep focus on the option.',
      );
      for (const k of [
        'ArrowUp',
        'ArrowDown',
        'b',
        'B',
        'b',
        'b',
        'z',
        'b',
        'ArrowDown',
        'b',
        '2',
        '2',
        '2',
        '!',
        'Tab',
        'Home',
      ]) {
        const target = document.activeElement;
        const prevented = await key(h, 'option', k);
        record({ key: k, prevented });
        assert(
          document.activeElement === target,
          'Arrow/shortcut moved focus.',
        );
      }
      for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) {
        record({
          modifier,
          prevented: await key(h, 'option', 'b', { [modifier]: true }),
        });
      }
      await key(h, 'option', 'Enter');
      record();
      assert(h.calls.length === 1, 'Option Enter emitted more than once.');
      await key(h, 'option', ' ');
      record();
      assert(
        h.calls.length === 1,
        'Option captureKeys=false gained Space action.',
      );
    },
  );
  await scenario(
    'shortcut-reset-reference-and-mutation',
    base(),
    async (h, record) => {
      await focus(h, 'option');
      await key(h, 'option', 'b');
      record();
      await h.update({ items: ['apple', 'banana', 'blueberry', 'carrot'] });
      await key(h, 'option', 'b');
      record();
      const items = ['apple', 'banana', 'blueberry', 'carrot'];
      await h.update({ items });
      await key(h, 'option', 'b');
      record();
      items[2] = 'blackberry';
      await h.update({ items });
      await key(h, 'option', 'b');
      record();
      assert(
        state(h).labels[state(h).selected] === 'Blackberry',
        'Same-reference mutation incorrectly reset shortcut cycling.',
      );
      await click(h, 'option', 2);
      await key(h, 'option', 'b');
      record();
      await click(h, 'toggle');
      await query(h, 'b');
      await click(h, 'toggle');
      await key(h, 'option', 'b');
      record();
    },
  );
  await scenario(
    'visible-search-editing-focus-controls',
    base({
      items: [
        'apple',
        'apricot',
        'banana',
        'blueberry',
        'carrot',
        'date',
        'fig',
        'grape',
        'kiwi',
      ],
    }),
    async (h, record) => {
      await focus(h, 'option');
      record({ prevented: await key(h, 'option', 'B') });
      assert(
        state(h).search === 'B' && state(h).focus === 'search',
        'Visible shortcut must transfer to search with case preserved.',
      );
      const original = element(h, 'search');
      record({ prevented: await key(h, 'search', 'a') });
      await query(h, 'Ba');
      record();
      assert(
        element(h, 'search') === original,
        'Input editing remounted search.',
      );
      record({ legacyEscape: await key(h, 'search', 'Esc') });
      assert(
        h.calls.length === 1 && h.calls[0][0] === 'cancel',
        'Production React normalizes legacy Esc to Escape before modal handling.',
      );
      await focus(h, 'search');
      await key(h, 'search', 'Enter');
      record();
      assert(h.calls.length === 2, 'Search Enter duplicated action.');
      await focus(h, 'search');
      await key(h, 'search', 'Escape');
      record();
      assert(
        h.calls.at(-1)?.[0] === 'cancel',
        'Search Escape must cancel once.',
      );
      await focus(h, 'confirm');
      record({ prevented: await key(h, 'confirm', 'b') });
      assert(state(h).search === 'Ba', 'Footer letter changed query.');
      await key(h, 'confirm', 'Enter');
      record();
      await key(h, 'confirm', ' ');
      record();
      await focus(h, 'preview');
      await key(h, 'preview', 'Enter');
      record();
      await key(h, 'preview', ' ');
      record();
      await focus(h, 'cancel');
      await key(h, 'cancel', 'Enter');
      record();
      await key(h, 'cancel', ' ');
      record();
      record({ legacyEscape: await key(h, 'cancel', 'Esc') });
      await key(h, 'cancel', 'Escape');
      record();
      await focus(h, 'toggle');
      await key(h, 'toggle', 'Enter');
      record();
      await key(h, 'toggle', ' ');
      record();
    },
  );
  await scenario('focus-click-double-click', base(), async (h, record) => {
    await focus(h, 'option', 2);
    record();
    await click(h, 'option', 1);
    record();
    await h.settle(() =>
      element(h, 'option', 3).dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
      ),
    );
    record();
    assert(
      h.calls.length === 1 && h.calls[0][1].entry === 'carrot',
      'Double click must submit exact clicked item once.',
    );
  });
  await scenario(
    'delivered-timeout-only-and-static-preservation',
    base(),
    async (h, record) => {
      await click(h, 'option', 2);
      await click(h, 'toggle');
      await query(h, 'berry');
      record();
      for (const timeout of [1, 0.375, 0, undefined]) {
        await h.update({ timeout, previewing: true });
        record();
      }
      await h.settle();
      record();
      assert(h.calls.length === 0, 'Delivery/timer invented action.');
      assert(
        state(h).search === 'berry' && state(h).labels.join() === 'Blueberry',
        'Dynamic-only update discarded static/local state.',
      );
      await query(h, '');
      await click(h, 'confirm');
      record();
      assert(
        h.calls[0][1].entry === 'blueberry',
        'Dynamic delivery reset selection.',
      );
    },
  );
  await scenario(
    'empty-previewing-stop',
    base({ items: [], previewing: true }),
    async (h, record) => {
      record();
      await click(h, 'preview');
      record();
      assert(
        h.calls.length === 1,
        'Stop disabled while previewing with empty items.',
      );
    },
  );
  await scenario(
    'defensive-large-swapped-flags',
    base({ large_buttons: true, swapped_buttons: true }),
    async (h, record) => {
      record();
      await click(h, 'confirm');
      await click(h, 'cancel');
      record();
    },
  );

  await scenario(
    'same-session-selection-and-preview-deliveries',
    base({ init_value: 'blueberry' }),
    async (h, record) => {
      await h.update({
        init_value: 'carrot',
        items: ['carrot', 'blueberry', 'apple', 'banana'],
      });
      record();
      await click(h, 'preview');
      record();
      assert(
        h.calls.at(-1)?.[1].entry === 'blueberry',
        'Updated default reset mount selection.',
      );
      assert(
        state(h).preview?.label === 'Listen',
        'Listen optimistically changed label.',
      );
      await h.update({ previewing: true });
      record();
      await click(h, 'preview');
      record();
      await h.update({ enable_preview: false });
      record();
      assert(
        elements(h, 'preview').length === 0,
        'Disabled preview still rendered.',
      );
      await h.update({ enable_preview: true });
      record();
      await click(h, 'toggle');
      await query(h, 'unmatched');
      record({ prevented: await key(h, 'confirm', 'Enter') });
      record({ prevented: await key(h, 'confirm', ' ') });
      assert(h.calls.length === 2, 'Disabled keyboard confirm emitted action.');
    },
  );
  await scenario(
    'control-repeat-and-modifier-keydown',
    base(),
    async (h, record) => {
      for (const target of [
        'confirm',
        'preview',
        'cancel',
        'toggle',
      ] as const) {
        await focus(h, target);
        for (const k of ['Enter', ' ']) {
          record({
            target,
            key: k,
            prevented: await key(h, target, k, { repeat: true, ctrlKey: true }),
          });
        }
      }
    },
  );
  await scenario(
    'react-key-normalization-aliases',
    base(),
    async (h, record) => {
      await focus(h, 'option');
      for (const k of ['Down', 'Up', 'Spacebar'])
        record({ key: k, prevented: await key(h, 'option', k) });
      assert(h.calls.length === 0, 'Legacy option Space must remain inert.');
      await focus(h, 'confirm');
      record({ prevented: await key(h, 'confirm', 'Spacebar') });
      assert(
        h.calls.length === 1 && h.calls[0][0] === 'submit',
        'React-normalized footer Spacebar must submit once.',
      );
      await click(h, 'toggle');
      await query(h, 'b');
      record({ prevented: await key(h, 'search', 'Down') });
      record({ prevented: await key(h, 'search', 'Up') });
    },
  );
  return records;
}
