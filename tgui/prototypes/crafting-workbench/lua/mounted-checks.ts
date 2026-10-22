import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createElement } from 'react';
import { flushSync as flushReact } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { CraftingWorkbench as ReactWorkbench } from '../Workbench';
import { mountWorkbench as mountSvelteWorkbench } from '../svelte/adapter';

import { mountWorkbench } from './adapter';

const act = async (callback: () => unknown) => {
  await callback();
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

describe('Lua VM production-client mounted workbench', () => {
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

  test('neutral updates stay unselected while same-object rows and filters change', async () => {
    await render();
    const input = container.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    input.focus();
    const recipes = data.crafting_recipes.Alpha as Record<
      string,
      WorkbenchRecipe
    >;
    recipes.awl.req_text = 'Fresh unselected requirement';
    data.craftability.Awl = 0;
    await root!.update(data);
    expect(rows()[0].textContent).toContain('Fresh unselected requirement');
    expect(rows()[0].textContent).toContain('Material match: not reported');
    expect(container.querySelector('.Workbench__folio-title')).toBeNull();
    expect(
      container.querySelector('.Workbench')!.getAttribute('data-open'),
    ).toBe('false');
    expect(document.activeElement).toBe(input);
    await search('no matching recipe');
    expect(rows()).toHaveLength(0);
    await click(button('Clear'));
    expect(rows()).toHaveLength(5);
    expect(container.querySelector('.Workbench__folio-title')).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(onAction).not.toHaveBeenCalled();
  });

  test('first and last selections survive refresh and an off-page selected update restores the right row', async () => {
    const large = Array.from({ length: 81 }, (_, index) =>
      recipe(`Recipe ${String(index).padStart(4, '0')}`, `/recipe/${index}`),
    );
    await render({
      crafting_recipes: { Large: large },
      craftability: Object.fromEntries(large.map((entry) => [entry.name, 1])),
    });
    const first = await open('Recipe 0000');
    await root!.update(data);
    expect(first.getAttribute('aria-expanded')).toBe('true');
    await click(button('Craft 1'));
    await click(button('← Back to recipes'));
    expect(document.activeElement).toBe(first);
    await click(button('Show 40 more recipes'));
    await click(button('Show 1 more recipes'));
    await open('Recipe 0080');
    // Server-controlled filter resets the visible page, not the valid selection.
    await render({ showonlycraftable: true });
    expect(rows()).toHaveLength(PAGE_SIZE);
    expect(folio().textContent).toContain('Recipe 0080');
    expect(container.querySelectorAll('[aria-expanded="true"]')).toHaveLength(
      0,
    );
    const input = container.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    input.focus();
    large[80].req_text = 'Updated off-page ingredient';
    await root!.update(data);
    expect(folio().textContent).toContain('Updated off-page ingredient');
    expect(document.activeElement).toBe(input);
    await click(button('Craft 3'));
    expect(onAction.mock.calls).toEqual([
      ['craft', { item: '/recipe/0' }],
      ['craft', { item: '/recipe/80', amount: 3 }],
    ]);
    await click(button('← Back to recipes'));
    expect(rows()).toHaveLength(81);
    expect(document.activeElement).toBe(rows()[80]);
    expect(rows()[80].getAttribute('aria-expanded')).toBe('false');
  });

  test('replacement and removal of an off-page selection clear it without stale actions or resurrection', async () => {
    const large = Array.from({ length: 41 }, (_, index) =>
      recipe(`Recipe ${String(index).padStart(4, '0')}`, `/recipe/${index}`),
    );
    await render({
      crafting_recipes: { Large: large },
      craftability: Object.fromEntries(large.map((entry) => [entry.name, 1])),
    });
    await click(button('Show 1 more recipes'));
    await open('Recipe 0040');
    await render({ showonlycraftable: true });
    const staleCraft = button('Craft 1');
    large[40] = recipe('Recipe 0040', '/replacement');
    await root!.update(data);
    expect(container.querySelector('.Workbench__folio-title')).toBeNull();
    expect(document.activeElement).toBe(
      container.querySelector('input[type="search"]'),
    );
    await click(staleCraft);
    expect(onAction).not.toHaveBeenCalled();
    await click(button('Show 1 more recipes'));
    await open('Recipe 0040');
    await click(button('Craft 1'));
    expect(onAction.mock.calls).toEqual([['craft', { item: '/replacement' }]]);
    await render({ showonlycraftable: false });
    const removedCraft = button('Craft 1');
    large.pop();
    await root!.update(data);
    expect(container.querySelector('.Workbench__folio-title')).toBeNull();
    await click(removedCraft);
    expect(onAction).toHaveBeenCalledTimes(1);
    large.push(recipe('Recipe 0040', '/replacement'));
    await root!.update(data);
    expect(container.querySelector('.Workbench__folio-title')).toBeNull();
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

test('matches React and Svelte element hierarchy, classes, control values, ARIA semantics and visible text', async () => {
  const reactTarget = document.createElement('div');
  document.body.append(reactTarget);
  const reactRoot = createRoot(reactTarget);
  const svelteTarget = document.createElement('div');
  document.body.append(svelteTarget);
  let svelteRoot: ReturnType<typeof mountSvelteWorkbench> | undefined;
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
    svelteRoot = mountSvelteWorkbench(svelteTarget, data, onAction);
    flushReact(() =>
      reactRoot.render(createElement(ReactWorkbench, { data, onAction })),
    );
    expect(tree(container.firstElementChild!)).toEqual(
      tree(reactTarget.firstElementChild!),
    );
    expect(tree(container.firstElementChild!)).toEqual(
      tree(svelteTarget.firstElementChild!),
    );
    await open('Ribbon', 1);
    await svelteTarget
      .querySelectorAll<HTMLButtonElement>('.Workbench__recipe')[2]
      .click();
    await svelteRoot.update(data);
    const reactRows = [
      ...reactTarget.querySelectorAll<HTMLButtonElement>('.Workbench__recipe'),
    ];
    flushReact(() => reactRows[2].click());
    expect(tree(container.firstElementChild!)).toEqual(
      tree(reactTarget.firstElementChild!),
    );
    expect(tree(container.firstElementChild!)).toEqual(
      tree(svelteTarget.firstElementChild!),
    );
    const matchData = { ...data, showonlycraftable: true };
    await render(matchData);
    await svelteRoot.update(matchData);
    flushReact(() =>
      reactRoot.render(
        createElement(ReactWorkbench, { data: matchData, onAction }),
      ),
    );
    expect(tree(container.firstElementChild!)).toEqual(
      tree(reactTarget.firstElementChild!),
    );
    expect(tree(container.firstElementChild!)).toEqual(
      tree(svelteTarget.firstElementChild!),
    );
    const expectedPayloads = [
      { item: '/ribbon/hemp' },
      { item: '/ribbon/hemp', amount: 2 },
      { item: '/ribbon/hemp', amount: 3 },
      { item: '/ribbon/hemp', amount: 5 },
      { item: '/ribbon/hemp', auto: true },
    ];
    for (let index = 0; index < expectedPayloads.length; index++) {
      for (const target of [container, reactTarget, svelteTarget]) {
        const action = target.querySelectorAll<HTMLButtonElement>(
          '.Workbench__actions button',
        )[index];
        flushReact(() => action.click());
      }
    }
    expect(onAction.mock.calls).toEqual(
      expectedPayloads.flatMap((payload) =>
        Array.from({ length: 3 }, () => ['craft', payload]),
      ),
    );
  } finally {
    await svelteRoot?.unmount();
    svelteTarget.remove();
    flushReact(() => reactRoot.unmount());
    reactTarget.remove();
  }
});

test('Lua preserves JS zero/null/empty-string rendering and optional field removal', async () => {
  const zero: WorkbenchRecipe = {
    name: 'Zero',
    path: '/zero',
    req_text: '',
    tool_text: null,
    catalyst_text: '',
    craftingdifficulty: 0,
    sellprice: 0,
  };
  await render({ crafting_recipes: { Test: [zero] } });
  expect(rows()[0].textContent).toContain('Ingredients not listed');
  await open('Zero');
  const fields = () =>
    [...container.querySelectorAll('.Workbench__requirements dd')].map(
      (node) => node.textContent,
    );
  expect(fields()).toEqual(['Not listed', '0', '0']);
  zero.tool_text = 'Needle';
  zero.catalyst_text = 'Water';
  zero.craftingdifficulty = null;
  zero.sellprice = '';
  await root!.update(data);
  expect(fields()).toEqual(['Not listed', 'Needle', 'Water', 'Not listed', '']);
  zero.tool_text = '';
  zero.catalyst_text = null;
  await root!.update(data);
  expect(fields()).toEqual(['Not listed', 'Not listed', '']);
});

test('shared search keeps Unicode case conversion and literal matching', async () => {
  await render({
    crafting_recipes: {
      Équipement: [
        recipe('ÉPÉE', '/é', 'ÉTOFFE [bleue]'),
        recipe('OTHER', '/other'),
      ],
    },
  });
  await search('épée');
  expect(names()).toEqual(['ÉPÉE']);
  await search('étoffe [');
  expect(names()).toEqual(['ÉPÉE']);
  await search('équipement');
  expect(names()).toEqual([]);
});

test('numeric material toggle payloads are JS booleans, including 0, 1, -0 and NaN', async () => {
  await render();
  for (const value of [0, 1, -0, -1, NaN, false, true]) {
    await render({ showonlycraftable: value });
    const checkbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    expect(checkbox.checked).toBe(Boolean(value));
    await click(checkbox);
    expect(onAction.mock.calls.at(-1)).toEqual([
      'checkboxonlycraftable',
      { state: !value },
    ]);
    expect(checkbox.checked).toBe(Boolean(value));
  }
});

test('same-record delivery preserves keyed row, detail, active action and scroll', async () => {
  await render();
  const row = await open('Awl');
  const craft = button('Craft 1');
  const heading = container.querySelector('.Workbench__folio-title');
  craft.focus();
  (folio() as HTMLElement).scrollTop = 53;
  const recipes = data.crafting_recipes.Alpha as Record<
    string,
    WorkbenchRecipe
  >;
  recipes.awl.req_text = 'Updated in place';
  await root!.update(data);
  expect(rows()[0]).toBe(row);
  expect(button('Craft 1')).toBe(craft);
  expect(container.querySelector('.Workbench__folio-title')).toBe(heading);
  expect(document.activeElement).toBe(craft);
  expect((folio() as HTMLElement).scrollTop).toBe(53);
});

test('synchronous demo acknowledgement can reenter Lua without stale filter state', async () => {
  onAction = mock((action: string, payload: { state?: boolean }) => {
    if (action === 'checkboxonlycraftable') {
      data.showonlycraftable = payload.state!;
      root!.update(data);
    }
  });
  await render();
  const checkbox = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  )!;
  await click(checkbox);
  expect(checkbox.checked).toBe(true);
  expect(names()).toEqual(['Awl', 'Ribbon', 'Ribbon']);
  await click(checkbox);
  expect(checkbox.checked).toBe(false);
  expect(names()).toHaveLength(5);
  expect(onAction).toHaveBeenCalledTimes(2);
});

test('unmount detaches every listener, makes stale controls inert, closes the VM, and supports a fresh mount', async () => {
  await render();
  await open('Awl');
  const old = [
    ...container.querySelectorAll<HTMLElement>('button,input,select'),
  ];
  root!.unmount();
  expect(container.children.length).toBe(0);
  for (const node of old) {
    node.click();
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
    const held = new KeyboardEvent('keydown', {
      key: 'Enter',
      repeat: true,
      cancelable: true,
    });
    expect(node.dispatchEvent(held)).toBe(true);
  }
  expect(onAction).not.toHaveBeenCalled();
  expect(() => root!.update(data)).toThrow('Workbench was unmounted.');
  expect(() => root!.unmount()).not.toThrow();
  root = undefined;
  await render();
  await open('Awl');
  await click(button('Craft 1'));
  expect(onAction.mock.calls).toEqual([['craft', { item: '/awl' }]]);
});

test('two mounted VMs have unique ARIA references and independent local state', async () => {
  await render();
  const other = document.createElement('div');
  document.body.append(other);
  const second = mountWorkbench(other, data, onAction);
  try {
    await open('Awl');
    expect(container.querySelector('.Workbench__folio-title')).not.toBeNull();
    expect(other.querySelector('.Workbench__folio-title')).toBeNull();
    expect(container.querySelector('.Workbench__folio')!.id).not.toBe(
      other.querySelector('.Workbench__folio')!.id,
    );
    await search('hemp');
    expect(rows()).toHaveLength(1);
    expect(other.querySelectorAll('.Workbench__recipe')).toHaveLength(5);
  } finally {
    second.unmount();
    other.remove();
  }
});

test('listener removal uses the exact JS identity, including detached detail controls', async () => {
  const originalAdd = HTMLElement.prototype.addEventListener;
  const originalRemove = HTMLElement.prototype.removeEventListener;
  const listeners = new Map<
    HTMLElement,
    Map<string, Set<EventListenerOrEventListenerObject>>
  >();
  let mismatchedRemovals = 0;
  const errors: unknown[] = [];
  const captureError = (event: ErrorEvent) => {
    errors.push(event.error);
    event.preventDefault();
  };
  window.addEventListener('error', captureError);
  HTMLElement.prototype.addEventListener = function (
    this: HTMLElement,
    kind: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (callback) {
      if (!listeners.has(this)) listeners.set(this, new Map());
      const nodeListeners = listeners.get(this)!;
      if (!nodeListeners.has(kind)) nodeListeners.set(kind, new Set());
      nodeListeners.get(kind)!.add(callback);
    }
    if (callback) originalAdd.call(this, kind, callback, options);
  } as typeof originalAdd;
  HTMLElement.prototype.removeEventListener = function (
    this: HTMLElement,
    kind: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) {
    if (callback && !listeners.get(this)?.get(kind)?.delete(callback))
      mismatchedRemovals++;
    if (callback) originalRemove.call(this, kind, callback, options);
  } as typeof originalRemove;
  try {
    await render();
    await open('Awl');
    const oldCraft = button('Craft 1');
    await click(button('← Back to recipes'));
    await open('Ribbon', 1);
    await click(oldCraft);
    expect(onAction).not.toHaveBeenCalled();
    expect(listeners.get(oldCraft)?.get('click')?.size).toBe(0);
    const allControls = [
      ...container.querySelectorAll<HTMLElement>('button,input,select'),
    ];
    root!.unmount();
    const liveListeners = [...listeners.values()]
      .flatMap((events) => [...events.values()])
      .reduce((sum, callbacks) => sum + callbacks.size, 0);
    expect(liveListeners).toBe(0);
    expect(mismatchedRemovals).toBe(0);
    for (const node of [oldCraft, ...allControls]) {
      node.click();
      node.dispatchEvent(new Event('input'));
      node.dispatchEvent(new Event('change'));
      node.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', repeat: true }),
      );
    }
    expect(onAction).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
  } finally {
    root?.unmount();
    HTMLElement.prototype.addEventListener = originalAdd;
    HTMLElement.prototype.removeEventListener = originalRemove;
    window.removeEventListener('error', captureError);
  }
});

test('callback-driven unmount removes controls synchronously and closes only after the Lua callback unwinds', async () => {
  const errors: unknown[] = [];
  const captureError = (event: ErrorEvent) => {
    errors.push(event.error);
    event.preventDefault();
  };
  window.addEventListener('error', captureError);
  try {
    onAction = mock(() => {
      root!.unmount();
      expect(container.children.length).toBe(0);
      expect(() => root!.unmount()).not.toThrow();
      expect(() => root!.update(data)).toThrow('Workbench was unmounted.');
    });
    await render();
    await open('Awl');
    const craft = button('Craft 1');
    await click(craft);
    await click(craft);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([]);
  } finally {
    window.removeEventListener('error', captureError);
  }
});

test('detached cached reset and pagination controls are inert until reinserted', async () => {
  await render({ showonlycraftable: true });
  await search('not present');
  const reset = button('Reset filters');
  await click(button('Clear'));
  const before = container.innerHTML;
  await click(reset);
  expect(container.innerHTML).toBe(before);
  expect(onAction).not.toHaveBeenCalled();
  const large = Array.from({ length: 50 }, (_, index) =>
    recipe(`Recipe ${String(index).padStart(2, '0')}`, `/recipe/${index}`),
  );
  await render({
    crafting_recipes: { Large: large },
    showonlycraftable: false,
  });
  const more = button('Show 10 more recipes');
  await click(more);
  expect(rows()).toHaveLength(50);
  await search('Recipe 0');
  expect(rows()).toHaveLength(10);
  const filteredBefore = container.innerHTML;
  await click(more);
  expect(container.innerHTML).toBe(filteredBefore);
  await click(button('Clear'));
  expect(rows()).toHaveLength(40);
  await click(more);
  expect(rows()).toHaveLength(50);
});
