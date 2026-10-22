import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { flushSync, tick } from 'svelte';
import { createElement } from 'react';
import { flushSync as flushReact } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { CraftingWorkbench as ReactWorkbench } from '../Workbench';

import { mountWorkbench } from './adapter';

const act = async (callback: () => unknown) => {
  const result = flushSync(callback);
  await result;
  await tick();
};

import { PAGE_SIZE, type WorkbenchRecipe } from '../model';
import type { WorkbenchData } from '../model';

const recipe = (
  name: string,
  path: string,
  req_text = ' 1 Iron ingot',
): WorkbenchRecipe => ({
  name,
  path,
  req_text,
  tool_text: 'Needle',
  catalyst_text: 'Water',
  craftingdifficulty: 'Hard',
  sellprice: 12,
});
const initialData = (): WorkbenchData => ({
  crafting_recipes: {
    Zeta: [recipe('Saw', '/saw', ' 2 Wood'), recipe('Hammer', '/hammer')],
    Alpha: {
      silk: recipe('Ribbon', '/ribbon/silk', ' 2 Silk fibre'),
      awl: recipe('Awl', '/awl'),
      hemp: recipe('Ribbon', '/ribbon/hemp', ' 2 Hemp fibre'),
    },
  },
  craftability: { Ribbon: 1, Awl: 1, Saw: true, Hammer: 0 },
  showonlycraftable: 0,
});

let container: HTMLDivElement;
let root: ReturnType<typeof mountWorkbench> | undefined;
let data: WorkbenchData;
let onAction: ReturnType<typeof mock>;
let previousFocus: HTMLElement | null;

beforeEach(() => {
  previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  container = document.createElement('div');
  document.body.append(container);
  root = undefined;
  data = initialData();
  onAction = mock();
});
afterEach(async () => {
  if (root) await root.unmount();
  container.remove();
  if (previousFocus?.isConnected) previousFocus.focus();
});

const render = async (patch: Partial<WorkbenchData> = {}) => {
  data = { ...data, ...patch };
  if (root) await root.update(data);
  else root = mountWorkbench(container, data, onAction);
  await tick();
};
const rows = () => [
  ...container.querySelectorAll<HTMLButtonElement>('.Workbench__recipe'),
];
const names = () =>
  rows().map(
    (row) => row.querySelector('.Workbench__recipe-name')!.textContent,
  );
const button = (text: string) => {
  const found = [
    ...container.querySelectorAll<HTMLButtonElement>('button'),
  ].find((element) => element.textContent === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
};
const click = async (element: HTMLElement) => {
  await act(async () => element.click());
};
const open = async (name: string, index = 0) => {
  const row = rows().filter(
    (row) => row.querySelector('.Workbench__recipe-name')!.textContent === name,
  )[index];
  if (!row) throw new Error(`Missing recipe: ${name} #${index}`);
  await click(row);
  return row;
};
const search = async (value: string) => {
  const input = container.querySelector<HTMLInputElement>(
    'input[type="search"]',
  )!;
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const selectCategory = async (value: string) => {
  const select = container.querySelector('select')!;
  await act(async () => {
    select.value = value === '' ? '' : `category:${value}`;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const folio = () => container.querySelector('.Workbench__folio')!;

describe('Svelte production-client mounted workbench', () => {
  test('orders categories and variants without pre-mounting recipe details', async () => {
    await render();
    expect(names()).toEqual(['Awl', 'Ribbon', 'Ribbon', 'Hammer', 'Saw']);
    expect(container.querySelectorAll('.Workbench__requirements')).toHaveLength(
      0,
    );
    expect(container.textContent).toContain('5 recipes matched');
    expect(container.querySelectorAll('[aria-expanded="false"]')).toHaveLength(
      5,
    );
    expect(onAction).not.toHaveBeenCalled();
  });

  test('opens a single folio, preserves every backend field, and restores list focus and scroll', async () => {
    await render();
    const list = container.querySelector<HTMLDivElement>('.Workbench__list')!;
    list.scrollTop = 120;
    const row = await open('Ribbon', 1);
    expect(document.activeElement).toBe(
      container.querySelector('.Workbench__folio-title'),
    );
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(folio().textContent).toContain(' 2 Hemp fibre');
    for (const value of [
      'Needle',
      'Water',
      'Hard',
      '12',
      'advisory, not readiness',
      'Same-name recipes',
    ]) {
      expect(folio().textContent).toContain(value);
    }
    expect(container.querySelectorAll('.Workbench__requirements')).toHaveLength(
      1,
    );
    await click(button('← Back to recipes'));
    expect(document.activeElement).toBe(row);
    expect(list.scrollTop).toBe(120);
    expect(row.getAttribute('aria-expanded')).toBe('false');
  });

  test('dispatches exact default, batch and repeat payloads for the selected duplicate path', async () => {
    await render();
    await open('Ribbon', 1);
    for (const label of [
      'Craft 1',
      'Craft 2',
      'Craft 3',
      'Craft 5',
      'Repeat',
    ]) {
      await click(button(label));
    }
    expect(onAction.mock.calls).toEqual([
      ['craft', { item: '/ribbon/hemp' }],
      ['craft', { item: '/ribbon/hemp', amount: 2 }],
      ['craft', { item: '/ribbon/hemp', amount: 3 }],
      ['craft', { item: '/ribbon/hemp', amount: 5 }],
      ['craft', { item: '/ribbon/hemp', auto: true }],
    ]);
  });

  test('a missing material hint does not disable any crafting action or invent readiness', async () => {
    await render();
    await open('Hammer');
    expect(folio().textContent).toContain('Material match: not reported');
    for (const label of [
      'Craft 1',
      'Craft 2',
      'Craft 3',
      'Craft 5',
      'Repeat',
    ]) {
      expect(button(label).disabled).toBe(false);
    }
    await click(button('Craft 1'));
    expect(onAction.mock.calls).toEqual([['craft', { item: '/hammer' }]]);
    expect(folio().textContent).not.toContain('Missing:');
    expect(folio().textContent).not.toContain('Cancel');
  });

  test('checkbox sends the original negation payload and stays server controlled until acknowledgment', async () => {
    await render();
    const checkbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    await click(checkbox);
    expect(onAction.mock.calls).toEqual([
      ['checkboxonlycraftable', { state: true }],
    ]);
    expect(checkbox.checked).toBe(false);
    expect(names()).toHaveLength(5);
    await render({ showonlycraftable: 1 });
    expect(checkbox.checked).toBe(true);
    expect(names()).toEqual(['Awl', 'Ribbon', 'Ribbon']);
    await click(checkbox);
    expect(onAction.mock.calls[1]).toEqual([
      'checkboxonlycraftable',
      { state: false },
    ]);
    expect(checkbox.checked).toBe(true);
    await render({ showonlycraftable: false });
    expect(names()).toHaveLength(5);
  });

  test('search is literal, case insensitive and limited to name and ingredient text; clear returns every variant', async () => {
    await render();
    await search('FIBRE');
    expect(names()).toEqual(['Ribbon', 'Ribbon']);
    await search('hemp');
    expect(names()).toEqual(['Ribbon']);
    await open('Ribbon');
    await click(button('Craft 1'));
    expect(onAction.mock.calls[0]).toEqual(['craft', { item: '/ribbon/hemp' }]);
    for (const value of [
      'fibre ',
      'Needle',
      'Water',
      'Hard',
      '12',
      '/ribbon',
      'Alpha',
    ]) {
      await search(value);
      expect(rows()).toHaveLength(0);
      expect(
        container.querySelectorAll('.Workbench__requirements'),
      ).toHaveLength(0);
    }
    await click(button('Clear'));
    expect(names()).toEqual(['Awl', 'Ribbon', 'Ribbon', 'Hammer', 'Saw']);
    expect(document.activeElement).toBe(
      container.querySelector('input[type="search"]'),
    );
  });

  test('category and empty-result reset retain server ownership of the material filter', async () => {
    await render({ showonlycraftable: true });
    await selectCategory('Zeta');
    expect(rows()).toHaveLength(0);
    await search('not present');
    await click(button('Reset filters'));
    expect(container.querySelector('select')!.value).toBe('');
    expect(
      container.querySelector<HTMLInputElement>('input[type="search"]')!.value,
    ).toBe('');
    expect(onAction.mock.calls).toEqual([
      ['checkboxonlycraftable', { state: false }],
    ]);
    expect(
      container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .checked,
    ).toBe(true);
    expect(names()).toEqual(['Awl', 'Ribbon', 'Ribbon']);
    await render({ showonlycraftable: false });
    expect(names()).toHaveLength(5);
  });

  test('a removed category falls back to all categories without moving an active filter focus', async () => {
    await render();
    await selectCategory('Alpha');
    const select = container.querySelector('select')!;
    select.focus();
    await render({ crafting_recipes: { Zeta: data.crafting_recipes.Zeta } });
    expect(select.value).toBe('');
    expect(names()).toEqual(['Hammer', 'Saw']);
    expect(document.activeElement).toBe(select);
    expect(onAction).not.toHaveBeenCalled();
    // Reintroducing the old category must not resurrect the discarded filter.
    await render({ crafting_recipes: initialData().crafting_recipes });
    expect(select.value).toBe('');
    expect(names()).toEqual(['Awl', 'Ribbon', 'Ribbon', 'Hammer', 'Saw']);
  });

  test('category disappearance preserves search, closes removed selection and blocks stale actions', async () => {
    await render();
    await selectCategory('Alpha');
    await search('Iron');
    await open('Awl');
    const oldCraft = button('Craft 1');
    await render({ crafting_recipes: { Zeta: data.crafting_recipes.Zeta } });
    expect(container.querySelector('select')!.value).toBe('');
    expect(
      container.querySelector<HTMLInputElement>('input[type="search"]')!.value,
    ).toBe('Iron');
    expect(names()).toEqual(['Hammer']);
    expect(container.querySelectorAll('.Workbench__requirements')).toHaveLength(
      0,
    );
    expect(document.activeElement).toBe(
      container.querySelector('input[type="search"]'),
    );
    await click(oldCraft);
    expect(onAction).not.toHaveBeenCalled();
    await open('Hammer');
    await click(button('Craft 1'));
    expect(onAction.mock.calls).toEqual([['craft', { item: '/hammer' }]]);
  });

  test('special-character recipe and category labels remain literal text and exact action paths', async () => {
    const name = '<img src=x onerror=alert(1)> & "[]"';
    const path = '/recipe/"[a]&<b>';
    await render({
      crafting_recipes: {
        '<category>&"': [recipe(name, path, ' 2 [cloth] & thread')],
      },
    });
    expect(container.querySelector('img')).toBeNull();
    await search('[cloth]');
    await open(name);
    await click(button('Craft 1'));
    expect(onAction.mock.calls).toEqual([['craft', { item: path }]]);
    expect(folio().textContent).toContain(name);
    await click(button('← Back to recipes'));
    await selectCategory('<category>&"');
    expect(names()).toEqual([name]);
  });

  test('removed or replaced selected source slots close rather than silently switch paths', async () => {
    await render();
    await open('Ribbon', 1);
    const oldCraft = button('Craft 1');
    await render({
      crafting_recipes: {
        Alpha: { hemp: recipe('Ribbon', '/replacement', ' 2 Hemp fibre') },
      },
    });
    expect(container.querySelectorAll('.Workbench__requirements')).toHaveLength(
      0,
    );
    expect(
      container.querySelector('.Workbench')!.getAttribute('data-open'),
    ).toBe('false');
    await click(oldCraft);
    expect(onAction).not.toHaveBeenCalled();
    await open('Ribbon');
    await click(button('Craft 1'));
    expect(onAction.mock.calls).toEqual([['craft', { item: '/replacement' }]]);
    await render({ crafting_recipes: {} });
    expect(container.querySelectorAll('.Workbench__requirements')).toHaveLength(
      0,
    );
    expect(document.activeElement).toBe(
      container.querySelector('input[type="search"]'),
    );
  });

  test('search, category and server material updates cannot leave stale selected craft actions', async () => {
    await render();
    await open('Hammer');
    await render({ showonlycraftable: true });
    expect(container.querySelectorAll('.Workbench__requirements')).toHaveLength(
      0,
    );
    await open('Awl');
    await selectCategory('Zeta');
    expect(container.querySelectorAll('.Workbench__requirements')).toHaveLength(
      0,
    );
    await selectCategory('Alpha');
    await open('Awl');
    await search('silk');
    expect(container.querySelectorAll('.Workbench__requirements')).toHaveLength(
      0,
    );
    expect(onAction).not.toHaveBeenCalled();
  });

  test('renders fresh fields and strict material hints even when backend records mutate in place', async () => {
    await render();
    await open('Awl');
    const recipes = data.crafting_recipes.Alpha as Record<
      string,
      WorkbenchRecipe
    >;
    recipes.awl.req_text = ' 9 New ingredient';
    data.craftability.Awl = 0;
    await root!.update(data);
    expect(folio().textContent).toContain(' 9 New ingredient');
    expect(folio().textContent).toContain('Material match: not reported');
    await click(button('Craft 1'));
    expect(onAction.mock.calls).toEqual([['craft', { item: '/awl' }]]);
  });

  test('a refresh of the selected recipe preserves active filter focus and detail scroll', async () => {
    await render();
    await open('Awl');
    const detail = folio() as HTMLElement;
    detail.scrollTop = 82;
    const input = container.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    input.focus();
    const recipes = data.crafting_recipes.Alpha as Record<
      string,
      WorkbenchRecipe
    >;
    recipes.awl.req_text = 'Fresh material requirement';
    await root!.update(data);
    expect(folio().textContent).toContain('Fresh material requirement');
    expect(document.activeElement).toBe(input);
    expect(detail.scrollTop).toBe(82);
    expect(onAction).not.toHaveBeenCalled();
  });

  test('a 1,282 recipe catalog mounts 40 rows initially, reveals all without loss, and resets pagination', async () => {
    const large = Array.from({ length: 1282 }, (_, index) =>
      recipe(`Recipe ${String(index).padStart(4, '0')}`, `/recipe/${index}`),
    );
    await render({ crafting_recipes: { Large: large } });
    expect(rows()).toHaveLength(PAGE_SIZE);
    expect(container.textContent).toContain('1282 recipes matched');
    expect(container.querySelectorAll('.Workbench__requirements')).toHaveLength(
      0,
    );
    const more = button('Show 40 more recipes');
    more.focus();
    // Native button semantics provide keyboard activation; .click() supplies the
    // activation that Happy DOM does not synthesize from keyboard events.
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    expect(more.dispatchEvent(enter)).toBe(true);
    await click(more);
    expect(rows()).toHaveLength(80);
    expect(document.activeElement).toBe(rows()[40]);
    while (container.querySelector('.Workbench__more')) {
      await click(container.querySelector<HTMLElement>('.Workbench__more')!);
    }
    expect(rows()).toHaveLength(1282);
    expect(new Set(names()).size).toBe(1282);
    await open('Recipe 1281');
    await click(button('Craft 1'));
    expect(onAction.mock.calls).toEqual([['craft', { item: '/recipe/1281' }]]);
    await click(button('← Back to recipes'));
    expect(document.activeElement).toBe(rows()[1281]);
    await search('Recipe 000');
    expect(rows()).toHaveLength(10);
    await click(button('Clear'));
    expect(rows()).toHaveLength(PAGE_SIZE);
  });

  test('repeated open/back cycles do not duplicate details, actions, or lose focus', async () => {
    await render();
    for (let index = 0; index < 20; index++) {
      const row = await open('Ribbon', index % 2);
      expect(
        container.querySelectorAll('.Workbench__requirements'),
      ).toHaveLength(1);
      await click(button('← Back to recipes'));
      expect(document.activeElement).toBe(row);
      expect(
        container.querySelectorAll('.Workbench__requirements'),
      ).toHaveLength(0);
    }
    expect(onAction).not.toHaveBeenCalled();
  });

  test('native keyboard controls remain available without global shortcuts or repeated craft keydown bursts', async () => {
    await render();
    await open('Awl');
    const craft = button('Craft 1');
    expect(craft.type).toBe('button');
    expect(craft.tabIndex).toBe(0);
    for (const key of ['Enter', ' ']) {
      const first = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
      });
      expect(craft.dispatchEvent(first)).toBe(true);
      const repeat = new KeyboardEvent('keydown', {
        key,
        repeat: true,
        bubbles: true,
        cancelable: true,
      });
      expect(craft.dispatchEvent(repeat)).toBe(false);
      expect(repeat.defaultPrevented).toBe(true);
    }
    const input = container.querySelector('input')!;
    for (const key of ['Tab', 'Enter', ' ', 'Escape', 'ArrowDown', 'c']) {
      expect(
        input.dispatchEvent(
          new KeyboardEvent('keydown', {
            key,
            bubbles: true,
            cancelable: true,
          }),
        ),
      ).toBe(true);
    }
    expect(onAction).not.toHaveBeenCalled();
    await click(craft);
    expect(onAction.mock.calls).toEqual([['craft', { item: '/awl' }]]);
  });
});

test('matches React element hierarchy, classes, control values, ARIA semantics and visible text', async () => {
  const reactTarget = document.createElement('div');
  document.body.append(reactTarget);
  const reactRoot = createRoot(reactTarget);
  const normalize = (value: string | null) =>
    (value ?? '').replace(/\s+/g, ' ').trim();
  const tree = (element: Element): unknown => {
    const attributes = [...element.attributes]
      .filter(
        (attribute) =>
          attribute.name === 'class' ||
          attribute.name === 'role' ||
          attribute.name === 'type' ||
          attribute.name === 'tabindex' ||
          attribute.name.startsWith('aria-') ||
          attribute.name === 'data-open',
      )
      .map((attribute) => [
        attribute.name,
        ['aria-controls', 'aria-labelledby'].includes(attribute.name)
          ? attribute.value.replace(/^.*-(folio|recipe)$/, '$1')
          : normalize(attribute.value),
      ])
      .sort(([a], [b]) => a.localeCompare(b));
    return {
      tag: element.tagName,
      attributes,
      text: element.children.length
        ? undefined
        : normalize(element.textContent),
      value:
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLOptionElement
          ? element.value
          : undefined,
      checked:
        element instanceof HTMLInputElement && element.type === 'checkbox'
          ? element.checked
          : undefined,
      disabled:
        element instanceof HTMLButtonElement ? element.disabled : undefined,
      children: [...element.children].map(tree),
    };
  };
  try {
    await render();
    flushReact(() =>
      reactRoot.render(createElement(ReactWorkbench, { data, onAction })),
    );
    expect(tree(container.firstElementChild!)).toEqual(
      tree(reactTarget.firstElementChild!),
    );
    await open('Ribbon', 1);
    const reactRows = [
      ...reactTarget.querySelectorAll<HTMLButtonElement>('.Workbench__recipe'),
    ];
    flushReact(() => reactRows[2].click());
    expect(tree(container.firstElementChild!)).toEqual(
      tree(reactTarget.firstElementChild!),
    );
    const matchData = { ...data, showonlycraftable: true };
    await render(matchData);
    flushReact(() =>
      reactRoot.render(
        createElement(ReactWorkbench, { data: matchData, onAction }),
      ),
    );
    expect(tree(container.firstElementChild!)).toEqual(
      tree(reactTarget.firstElementChild!),
    );
  } finally {
    flushReact(() => reactRoot.unmount());
    reactTarget.remove();
  }
});
