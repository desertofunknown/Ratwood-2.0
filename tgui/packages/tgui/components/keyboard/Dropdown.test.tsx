import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { act, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { Dropdown } from './Dropdown';

let container: HTMLDivElement;
let root: Root;
const env = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousActEnvironment: boolean | undefined;
beforeEach(() => {
  previousActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  env.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});
const render = async (content: ReactNode) => {
  await act(async () => root.render(content));
};
const trigger = () =>
  container.querySelector<HTMLButtonElement>('.Dropdown__control')!;
// Floating may keep exiting content mounted. Scope to this open trigger's menu.
const menu = () => {
  const id = trigger().getAttribute('aria-controls');
  return id ? document.getElementById(id) : null;
};
const entries = () =>
  Array.from(
    menu()?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
  );
const key = async (
  element: HTMLElement,
  value: string,
  init: KeyboardEventInit = {},
  type = 'keydown',
) => {
  const event = new KeyboardEvent(type, {
    key: value,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  await act(async () => element.dispatchEvent(event));
  return event;
};
const open = async (value = 'ArrowDown') => {
  await act(async () => trigger().focus());
  await key(trigger(), value);
  expect(trigger().getAttribute('aria-expanded')).toBe('true');
  expect(menu()?.getAttribute('role')).toBe('listbox');
};
const active = () => document.activeElement as HTMLElement;
const options = ['Alpha', 'Apricot', 'Beta', 'Bravo'];

for (const selected of [null, undefined, '', 'Beta']) {
  test(`selection ${JSON.stringify(selected)} preserves display and initial focus`, async () => {
    await render(
      <Dropdown
        options={['', ...options]}
        selected={selected}
        onSelected={mock()}
      />,
    );
    expect(
      trigger().querySelector('.Dropdown__selected-text')?.textContent,
    ).toBe(selected ?? 'Select...');
    await open();
    expect(active()).toBe(
      entries()[
        selected === null || selected === undefined
          ? 0
          : ['', ...options].indexOf(selected)
      ],
    );
    expect(
      entries().filter(
        (entry) => entry.getAttribute('aria-selected') === 'true',
      ),
    ).toHaveLength(selected === null || selected === undefined ? 0 : 1);
  });
}

test('numeric zero stays distinct from string zero and callbacks return values', async () => {
  const onSelected = mock();
  // The upstream type excludes bare numeric selections; this adapter supports
  // them at runtime. Cast only at that boundary to exercise its explicit branch.
  const numericSelected = 0 as unknown as ComponentProps<
    typeof Dropdown
  >['selected'];
  await render(
    <Dropdown
      options={[{ value: 0, displayText: 'Number' }]}
      selected={numericSelected}
      onSelected={onSelected}
    />,
  );
  expect(trigger().querySelector('.Dropdown__selected-text')?.textContent).toBe(
    '0',
  );
  await open();
  expect(entries()[0].getAttribute('aria-selected')).toBe('true');
  await key(active(), 'Enter');
  expect(onSelected).toHaveBeenLastCalledWith(0);
  expect(active()).toBe(trigger());
  await render(
    <Dropdown
      options={[{ value: 0, displayText: 'Number' }]}
      selected="0"
      onSelected={onSelected}
    />,
  );
  await open();
  expect(entries()[0].getAttribute('aria-selected')).toBe('false');
  await key(active(), 'Escape');
  await render(
    <Dropdown
      options={['0']}
      selected={numericSelected}
      onSelected={onSelected}
    />,
  );
  await open();
  expect(entries()[0].getAttribute('aria-selected')).toBe('false');
  await key(active(), ' ');
  expect(onSelected).toHaveBeenLastCalledWith('0');
});

test('object selections match by value rather than identity or display label', async () => {
  const onSelected = mock();
  await render(
    <Dropdown
      options={[
        { value: 7, displayText: 'Seven' },
        { value: 8, displayText: 'Eight' },
      ]}
      selected={{ value: 8, displayText: 'Different object' }}
      displayText="Current choice"
      onSelected={onSelected}
    />,
  );
  expect(trigger().textContent).toBe('Current choice');
  await open();
  expect(menu()?.getAttribute('aria-label')).toBe('Current choice');
  expect(active()).toBe(entries()[1]);
  await act(async () => entries()[0].click());
  expect(onSelected).toHaveBeenCalledWith(7);
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  expect(active()).toBe(trigger());
});

for (const [openingKey, index] of [
  ['ArrowDown', 0],
  ['ArrowUp', 3],
  ['Home', 0],
  ['End', 3],
  ['Enter', 0],
  [' ', 0],
] as const) {
  test(`${JSON.stringify(openingKey)} opens with expected focus`, async () => {
    await render(
      <Dropdown options={options} selected={null} onSelected={mock()} />,
    );
    await open(openingKey);
    expect(active()).toBe(entries()[index]);
  });
}

test('navigation wraps and Home/End move without selecting', async () => {
  const onSelected = mock();
  await render(
    <Dropdown options={options} selected="Beta" onSelected={onSelected} />,
  );
  await open();
  expect(active()).toBe(entries()[2]);
  for (const [value, index] of [
    ['End', 3],
    ['ArrowDown', 0],
    ['ArrowUp', 3],
    ['Home', 0],
  ] as const) {
    expect((await key(active(), value)).defaultPrevented).toBe(true);
    expect(active()).toBe(entries()[index]);
  }
  expect(onSelected).not.toHaveBeenCalled();
});

test('typeahead cycles letters, extends prefixes and resets on reopen', async () => {
  await render(
    <Dropdown options={options} selected="Bravo" onSelected={mock()} />,
  );
  await open();
  await key(active(), 'a');
  expect(active()).toBe(entries()[0]);
  await key(active(), 'a');
  expect(active()).toBe(entries()[1]);
  await key(active(), 'p');
  expect(active()).toBe(entries()[1]);
  await key(active(), 'Escape');
  await open();
  await key(active(), 'b');
  expect(active()).toBe(entries()[2]);
});

for (const activation of ['Enter', ' ']) {
  test(`${JSON.stringify(activation)} ignores repeat and selects once`, async () => {
    const onSelected = mock();
    await render(
      <Dropdown options={options} selected="Beta" onSelected={onSelected} />,
    );
    await key(trigger(), activation, { repeat: true });
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    await open(activation);
    await key(active(), activation, { repeat: true });
    expect(onSelected).not.toHaveBeenCalled();
    await key(active(), activation);
    expect(onSelected).toHaveBeenCalledTimes(1);
    expect(onSelected).toHaveBeenCalledWith('Beta');
    expect(active()).toBe(trigger());
  });
}

for (const shiftKey of [false, true]) {
  test(`Tab closes without preventing traversal (shift=${shiftKey})`, async () => {
    await render(
      <Dropdown options={options} selected={null} onSelected={mock()} />,
    );
    await open();
    expect((await key(active(), 'Tab', { shiftKey })).defaultPrevented).toBe(
      false,
    );
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(active()).toBe(trigger());
  });
}

test('Escape closes without selection and reopen restores selected focus', async () => {
  const onSelected = mock();
  await render(
    <Dropdown options={options} selected="Beta" onSelected={onSelected} />,
  );
  await open();
  await key(active(), 'Home');
  await key(active(), 'Escape');
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  expect(active()).toBe(trigger());
  expect(onSelected).not.toHaveBeenCalled();
  await open();
  expect(active()).toBe(entries()[2]);
});

for (const mode of ['pointer', 'focus']) {
  test(`outside ${mode} closes without stealing focus`, async () => {
    await render(
      <>
        <Dropdown options={options} selected={null} onSelected={mock()} />
        <button type="button" id="outside">
          Outside
        </button>
      </>,
    );
    await open();
    const outside = container.querySelector<HTMLButtonElement>('#outside')!;
    await act(async () => {
      if (mode === 'pointer') {
        outside.dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true }),
        );
      }
      outside.focus();
    });
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(active()).toBe(outside);
  });
}

test('empty menus focus the listbox and navigation never selects', async () => {
  const onSelected = mock();
  await render(
    <Dropdown options={[]} selected={undefined} onSelected={onSelected} />,
  );
  await open();
  expect(active()).toBe(menu()!);
  expect(menu()?.textContent).toBe('No options');
  for (const value of [
    'ArrowDown',
    'ArrowUp',
    'Home',
    'End',
    'a',
    'Enter',
    ' ',
  ]) {
    await key(active(), value);
  }
  expect(onSelected).not.toHaveBeenCalled();
  await key(active(), 'Escape');
  expect(active()).toBe(trigger());
});

test('disabled controls cannot open or cycle and disabling an open dropdown closes it', async () => {
  const onSelected = mock();
  const content = (disabled: boolean) => (
    <Dropdown
      buttons
      disabled={disabled}
      options={options}
      selected="Beta"
      onSelected={onSelected}
    />
  );
  await render(content(true));
  for (const button of container.querySelectorAll<HTMLButtonElement>(
    'button',
  )) {
    expect(button.disabled).toBe(true);
    await act(async () => button.click());
    await key(button, 'Enter');
    await key(button, ' ');
  }
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  expect(onSelected).not.toHaveBeenCalled();
  await render(content(false));
  await open();
  await render(content(true));
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  expect(onSelected).not.toHaveBeenCalled();
});

test('cycle controls wrap and ignore repeated activation', async () => {
  const onSelected = mock();
  await render(
    <Dropdown
      buttons
      options={options}
      selected="Alpha"
      onSelected={onSelected}
    />,
  );
  const [previous, next] =
    container.querySelectorAll<HTMLButtonElement>('.Dropdown__button');
  await key(previous, 'Enter');
  expect(onSelected).toHaveBeenLastCalledWith('Bravo');
  await key(next, ' ');
  expect(onSelected).toHaveBeenLastCalledWith('Apricot');
  await key(next, ' ', { repeat: true });
  expect(onSelected).toHaveBeenCalledTimes(2);
});

test('open-menu document listeners are removed on close and unmount', async () => {
  const add = spyOn(document, 'addEventListener');
  const remove = spyOn(document, 'removeEventListener');
  try {
    await render(
      <Dropdown options={options} selected={null} onSelected={mock()} />,
    );
    for (const end of ['close', 'unmount']) {
      const start = add.mock.calls.length;
      await open();
      const registrations = add.mock.calls
        .slice(start)
        .filter(([type]) => type === 'pointerdown' || type === 'focusin');
      expect(registrations.some(([type]) => type === 'pointerdown')).toBe(true);
      expect(registrations.some(([type]) => type === 'focusin')).toBe(true);
      if (end === 'close') await key(active(), 'Escape');
      else await render(null);
      for (const [type, listener, capture] of registrations) {
        expect(
          remove.mock.calls.some(
            (call) =>
              call[0] === type && call[1] === listener && call[2] === capture,
          ),
        ).toBe(true);
      }
    }
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  } finally {
    add.mockRestore();
    remove.mockRestore();
  }
});

test('pointer trigger toggles and calls onClick once per activation', async () => {
  const onClick = mock();
  await render(
    <Dropdown
      options={options}
      selected={null}
      onSelected={mock()}
      onClick={onClick}
    />,
  );
  await act(async () => trigger().click());
  expect(trigger().getAttribute('aria-expanded')).toBe('true');
  expect(onClick).toHaveBeenCalledTimes(1);
  await act(async () =>
    entries()[1].dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    ),
  );
  expect(trigger().getAttribute('aria-expanded')).toBe('true');
  await act(async () => trigger().click());
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  expect(onClick).toHaveBeenCalledTimes(2);
});

test('typeahead expires after its timeout without sleeping', async () => {
  const now = spyOn(Date, 'now').mockReturnValue(1000);
  try {
    await render(
      <Dropdown options={options} selected="Bravo" onSelected={mock()} />,
    );
    await open();
    await key(active(), 'a');
    expect(active()).toBe(entries()[0]);
    now.mockReturnValue(1701);
    await key(active(), 'b');
    expect(active()).toBe(entries()[2]);
  } finally {
    now.mockRestore();
  }
});

test('Shift activation still works on trigger, menu and cycle controls', async () => {
  const onSelected = mock();
  await render(
    <Dropdown
      buttons
      options={options}
      selected="Beta"
      onSelected={onSelected}
    />,
  );
  await key(trigger(), 'Enter', { shiftKey: true });
  expect(trigger().getAttribute('aria-expanded')).toBe('true');
  await key(active(), ' ', { shiftKey: true });
  expect(onSelected).toHaveBeenLastCalledWith('Beta');
  await key(
    container.querySelector<HTMLButtonElement>('.Dropdown__button')!,
    'Enter',
    { shiftKey: true },
  );
  expect(onSelected).toHaveBeenLastCalledWith('Apricot');
});

for (const modifier of ['altKey', 'ctrlKey', 'metaKey'] as const) {
  test(`menu leaves ${modifier} shortcuts untouched`, async () => {
    const onSelected = mock();
    const onKeyUp = mock();
    const onKeyDown = mock();
    await render(
      <div onKeyUp={onKeyUp} onKeyDown={onKeyDown}>
        <Dropdown options={options} selected="Beta" onSelected={onSelected} />
      </div>,
    );
    await open();
    const focused = active();
    for (const value of ['Enter', ' ', 'ArrowDown', 'a']) {
      expect(
        (await key(focused, value, { [modifier]: true })).defaultPrevented,
      ).toBe(false);
      expect(
        (await key(focused, value, { [modifier]: true }, 'keyup'))
          .defaultPrevented,
      ).toBe(false);
    }
    expect(active()).toBe(focused);
    expect(onSelected).not.toHaveBeenCalled();
    expect(onKeyDown).toHaveBeenCalledTimes(4);
    expect(onKeyUp).toHaveBeenCalledTimes(4);
  });

  // Modified shortcuts must remain available to ancestor handlers.
  for (const value of ['Enter', ' ']) {
    test(`trigger leaves ${modifier}+${JSON.stringify(value)} keydown and keyup to ancestors`, async () => {
      const onKeyUp = mock();
      const onKeyDown = mock();
      const onClick = mock();
      const onSelected = mock();
      await render(
        <div onKeyUp={onKeyUp} onKeyDown={onKeyDown}>
          <Dropdown
            options={options}
            selected={null}
            onSelected={onSelected}
            onClick={onClick}
          />
        </div>,
      );
      expect(
        (await key(trigger(), value, { [modifier]: true })).defaultPrevented,
      ).toBe(false);
      expect(
        (await key(trigger(), value, { [modifier]: true }, 'keyup'))
          .defaultPrevented,
      ).toBe(false);
      expect(onKeyDown).toHaveBeenCalledTimes(1);
      expect(onKeyUp).toHaveBeenCalledTimes(1);
      expect(onClick).not.toHaveBeenCalled();
      expect(onSelected).not.toHaveBeenCalled();
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
    });
    test(`cycle controls leave ${modifier}+${JSON.stringify(value)} keydown alone`, async () => {
      const onSelected = mock();
      const onKeyDown = mock();
      await render(
        <div onKeyDown={onKeyDown}>
          <Dropdown
            buttons
            options={options}
            selected="Alpha"
            onSelected={onSelected}
          />
        </div>,
      );
      for (const button of container.querySelectorAll<HTMLButtonElement>(
        '.Dropdown__button',
      )) {
        expect(
          (await key(button, value, { [modifier]: true })).defaultPrevented,
        ).toBe(false);
      }
      expect(onSelected).not.toHaveBeenCalled();
      expect(onKeyDown).toHaveBeenCalledTimes(2);
    });
    test(`cycle controls leave ${modifier}+${JSON.stringify(value)} keyup alone`, async () => {
      const onKeyUp = mock();
      await render(
        <div onKeyUp={onKeyUp}>
          <Dropdown
            buttons
            options={options}
            selected="Alpha"
            onSelected={mock()}
          />
        </div>,
      );
      for (const button of container.querySelectorAll<HTMLButtonElement>(
        '.Dropdown__button',
      )) {
        expect(
          (await key(button, value, { [modifier]: true }, 'keyup'))
            .defaultPrevented,
        ).toBe(false);
      }
      expect(onKeyUp).toHaveBeenCalledTimes(2);
    });
  }
}
