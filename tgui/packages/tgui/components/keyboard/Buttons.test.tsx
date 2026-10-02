import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Floating } from 'tgui-core/base-components';

import { Button, ImageButton } from './Buttons';

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
const control = (selector = '.Button') => {
  const element = container.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing control: ${selector}`);
  return element;
};
const keyDown = async (element: HTMLElement, key: string) => {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => {
    element.focus();
    element.dispatchEvent(event);
  });
  return event;
};

for (const tooltip of [undefined, 'Action hint']) {
  const hint = tooltip ? 'with a tooltip' : 'without a tooltip';

  test(`Button activates once per Enter, Space and pointer click ${hint}`, async () => {
    const onClick = mock();
    await render(
      <Button tooltip={tooltip} onClick={onClick}>Act</Button>,
    );
    const element = control();
    expect((await keyDown(element, 'Enter')).defaultPrevented).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect((await keyDown(element, ' ')).defaultPrevented).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(2);
    await act(async () => element.click());
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  test(`Button keeps disabled and captureKeys behavior ${hint}`, async () => {
    const onClick = mock();
    await render(
      <Button disabled tooltip={tooltip} onClick={onClick}>Act</Button>,
    );
    const element = control();
    expect(element.tabIndex).toBe(-1);
    await keyDown(element, 'Enter');
    await keyDown(element, ' ');
    await act(async () => element.click());
    expect(onClick).not.toHaveBeenCalled();

    await render(
      <Button captureKeys={false} tooltip={tooltip} onClick={onClick}>
        Act
      </Button>,
    );
    expect((await keyDown(control(), 'Enter')).defaultPrevented).toBe(false);
    expect((await keyDown(control(), ' ')).defaultPrevented).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
    await act(async () => control().click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test(`Button preserves a custom keyboard handler ${hint}`, async () => {
    const onClick = mock();
    const onKeyDown = mock((event) => event.preventDefault());
    await render(
      <Button tooltip={tooltip} onClick={onClick} onKeyDown={onKeyDown}>
        Act
      </Button>,
    );
    const event = await keyDown(control(), 'Enter');
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    // A supplied handler replaces CoreButton's default activation handler.
    expect(onClick).not.toHaveBeenCalled();
  });

  test(`Checkbox keeps its selected state and keyboard handler ${hint}`, async () => {
    const onClick = mock();
    await render(
      <Button.Checkbox checked tooltip={tooltip} onClick={onClick}>
        Check
      </Button.Checkbox>,
    );
    expect(control().classList.contains('Button--selected')).toBe(true);
    await keyDown(control(), 'Enter');
    await keyDown(control(), ' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  test(`Confirm requires a second activation and resets on blur ${hint}`, async () => {
    const onClick = mock();
    await render(
      <Button.Confirm tooltip={tooltip} onClick={onClick}>
        Remove
      </Button.Confirm>,
    );
    await keyDown(control(), 'Enter');
    expect(control().textContent).toBe('Confirm?');
    expect(onClick).not.toHaveBeenCalled();
    await keyDown(control(), ' ');
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(control().textContent).toBe('Remove');
    await keyDown(control(), 'Enter');
    await act(async () => control().blur());
    expect(control().textContent).toBe('Remove');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test(`File opens its existing picker once per activation ${hint}`, async () => {
    await render(
      <Button.File accept=".txt" tooltip={tooltip} onSelectFiles={mock()}>
        Load
      </Button.File>,
    );
    const input = control('input[type="file"]');
    const picker = mock((event: Event) => event.preventDefault());
    input.addEventListener('click', picker);
    await keyDown(control(), 'Enter');
    await keyDown(control(), ' ');
    await act(async () => control().click());
    expect(picker).toHaveBeenCalledTimes(3);
  });

  test(`ImageButton activates once for Enter and Space ${hint}`, async () => {
    const onClick = mock();
    await render(
      <ImageButton tooltip={tooltip} onClick={onClick}>Image</ImageButton>,
    );
    const element = control('.ImageButton__container');
    await keyDown(element, 'Enter');
    expect(onClick).toHaveBeenCalledTimes(1);
    await keyDown(element, ' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  test(`disabled compound buttons block keyboard and pointer activation ${hint}`, async () => {
    const onClick = mock();
    const picker = mock((event: Event) => event.preventDefault());
    await render(
      <>
        <Button.Checkbox disabled tooltip={tooltip} onClick={onClick}>
          Check
        </Button.Checkbox>
        <Button.Confirm disabled tooltip={tooltip} onClick={onClick}>
          Remove
        </Button.Confirm>
        <Button.File disabled accept=".txt" tooltip={tooltip} onSelectFiles={mock()}>
          Load
        </Button.File>
        <ImageButton disabled tooltip={tooltip} onClick={onClick}>
          Image
        </ImageButton>
      </>,
    );
    control('input[type="file"]').addEventListener('click', picker);
    const elements = container.querySelectorAll<HTMLElement>(
      '.Button, .ImageButton__container',
    );
    expect(elements.length).toBe(4);
    for (const element of elements) {
      expect(element.tabIndex).toBe(-1);
      await keyDown(element, 'Enter');
      await keyDown(element, ' ');
      await act(async () => element.click());
    }
    expect(onClick).not.toHaveBeenCalled();
    expect(picker).not.toHaveBeenCalled();
    expect(elements[1].textContent).toBe('Remove');
  });
}

test('Floating composes its click interaction with the child handler', async () => {
  const onClick = mock();
  await render(
    <Floating content="Open content" preventPortal>
      <button onClick={onClick}>Open</button>
    </Floating>,
  );
  await act(async () => control('button').click());
  expect(onClick).toHaveBeenCalledTimes(1);
  expect(container.querySelector('.Floating')?.textContent).toBe('Open content');
});

test('Floating stops bubbling without discarding the child click callback', async () => {
  const onChildClick = mock();
  const onParentClick = mock();
  await render(
    <div onClick={onParentClick}>
      <Floating content="Open content" stopChildPropagation preventPortal>
        <button onClick={onChildClick}>Open</button>
      </Floating>
    </div>,
  );
  await act(async () => control('button').click());
  expect(onChildClick).toHaveBeenCalledTimes(1);
  expect(onParentClick).not.toHaveBeenCalled();
  expect(container.querySelector('.Floating')?.textContent).toBe('Open content');
});

test('Floating keeps text references working', async () => {
  await render(<Floating content="Open content" preventPortal>Open</Floating>);
  await act(async () => control('div').click());
  expect(container.querySelector('.Floating')?.textContent).toBe('Open content');
});

test('Floating preserves callbacks while its open state is controlled', async () => {
  const onClick = mock();
  await render(
    <Floating content="Open content" handleOpen={false} preventPortal>
      <button onClick={onClick}>Open</button>
    </Floating>,
  );
  await act(async () => control('button').click());
  expect(onClick).toHaveBeenCalledTimes(1);
  expect(container.querySelector('.Floating')).toBeNull();
});

test('tooltip event callbacks can stop propagation to a parent control', async () => {
  const onParentKey = mock();
  const onParentClick = mock();
  const onClick = mock((event) => event.stopPropagation());
  const onKeyDown = mock((event) => event.stopPropagation());
  await render(
    <div onClick={onParentClick} onKeyDown={onParentKey}>
      <Button tooltip="Action hint" onClick={onClick} onKeyDown={onKeyDown}>
        Act
      </Button>
    </div>,
  );
  await keyDown(control(), 'Enter');
  await act(async () => control().click());
  expect(onClick).toHaveBeenCalledTimes(1);
  expect(onKeyDown).toHaveBeenCalledTimes(1);
  expect(onParentClick).not.toHaveBeenCalled();
  expect(onParentKey).not.toHaveBeenCalled();
});

test('tooltip hover preserves mouse callbacks, activation and Escape dismissal', async () => {
  const onClick = mock();
  const onMouseMove = mock();
  await render(
    <Button tooltip="Action hint" onClick={onClick} onMouseMove={onMouseMove}>
      Act
    </Button>,
  );
  const element = control();
  await act(async () => {
    element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
  expect(onMouseMove).toHaveBeenCalledTimes(1);
  expect(document.querySelector('.Tooltip')?.textContent).toBe('Action hint');
  await keyDown(element, 'Enter');
  expect(onClick).toHaveBeenCalledTimes(1);
  expect((await keyDown(element, 'Escape')).defaultPrevented).toBe(true);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
  expect(document.querySelector('.Tooltip')).toBeNull();
});
