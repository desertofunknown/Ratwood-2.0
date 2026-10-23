import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, type ReactNode, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const tguiRoot = resolve(import.meta.dir, '../../..');

if (!process.env.TGUI_MIACRAFT_MEMBERSHIP_TEST_CHILD) {
  test('MiaCraft membership behavior (isolated layout shell)', () => {
    const result = spawnSync(
      process.execPath,
      [
        'test',
        '--tsconfig-override',
        resolve(tguiRoot, 'tsconfig.json'),
        import.meta.path,
      ],
      {
        cwd: tguiRoot,
        timeout: 30000,
        env: { ...process.env, TGUI_MIACRAFT_MEMBERSHIP_TEST_CHILD: '1' },
        encoding: 'utf8',
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
    expect(result.status).toBe(0);
  });
} else {
  const Shell = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  Shell.Content = Shell;
  // Only native window chrome is replaced. MiaCraft, backend, search, checkbox,
  // collapsibles, and craft buttons remain production code. The child process
  // prevents this layout mock from leaking into other repository tests.
  mock.module(resolve(tguiRoot, 'packages/tgui/layouts'), () => ({
    Window: Shell,
  }));
  const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  Reflect.set(globalThis, 'Byond', { windowId: 'miacraft-membership' });
  const backend: typeof import('../backend') = await import(
    resolve(tguiRoot, 'packages/tgui/backend')
  );
  const { MiaCraft } = await import(
    resolve(tguiRoot, 'packages/tgui/interfaces/MiaCraft')
  );
  if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
  else Reflect.deleteProperty(globalThis, 'Byond');

  type Recipe = {
    name: string;
    path: string;
    req_text?: string | null;
    craftingdifficulty: string;
    tool_text: string;
    catalyst_text: string;
    sellprice: string;
    ref?: string;
  };
  const recipe = (
    name: string,
    path: string,
    reqText: string | null = ' 1 Iron ingot, 1 Stick',
  ): Recipe => ({
    name,
    path,
    req_text: reqText,
    craftingdifficulty: 'Easy',
    tool_text: 'Knife',
    catalyst_text: 'Water',
    sellprice: '4',
  });
  const initialData = () => ({
    busy: false,
    showonlycraftable: false,
    craftability: {
      Hammer: 1,
      Saw: 0,
      Awl: 1,
      Ribbon: 1,
      'Blue Dye': true,
      Cord: '1',
      Dye: null,
      Wax: 0,
      Fog: 0,
      Nails: false,
    } as Record<string, unknown>,
    crafting_recipes: {
      Zeta: {
        saw: recipe('Saw', '/recipe/saw'),
        nails: recipe('Nails', '/recipe/nails'),
        hammer: recipe('Hammer', '/recipe/hammer'),
      },
      Empty: { fog: recipe('Fog', '/recipe/fog') },
      Alpha: {
        ribbonSecond: recipe('Ribbon', '/recipe/ribbon-second'),
        wax: recipe('Wax', '/recipe/wax'),
        awl: recipe('Awl', '/recipe/awl'),
        missing: recipe('Missing', '/recipe/missing'),
        ribbonFirst: recipe('Ribbon', '/recipe/ribbon-first'),
        blue: recipe('Blue Dye', '/recipe/blue'),
        cord: recipe('Cord', '/recipe/cord'),
        dye: recipe('Dye', '/recipe/dye'),
      },
    } as Record<string, Record<string, Recipe> | Recipe[]>,
  });
  type Data = ReturnType<typeof initialData> & {
    craftability_by_path?: unknown;
  };
  const pyrobolt = '/datum/crafting_recipe/roguetown/engineering/pyrobolt';
  const pyroboltFive = `${pyrobolt}_five`;
  const collidingRecipes = () => ({
    craftability: { 'pyroclastic bolt': 1 },
    craftability_by_path: { [pyroboltFive]: 0, [pyrobolt]: 1 },
    crafting_recipes: {
      Ammunition: [
        recipe('pyroclastic bolt', pyroboltFive, ' 5 bolt, 5 fyritius'),
        recipe('pyroclastic bolt', pyrobolt, ' 1 bolt, 1 fyritius'),
      ],
    },
  });
  type BackendState = NonNullable<Parameters<typeof backend.backendReducer>[0]>;
  let previousStore: Store;
  let store: Store;
  let previousByond: PropertyDescriptor | undefined;
  let previousAct: PropertyDescriptor | undefined;
  let previousFocus: HTMLElement | null;
  let container: HTMLDivElement;
  let root: Root;
  let sendMessage: ReturnType<typeof mock>;
  let data: Data;

  beforeEach(() => {
    previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
    previousAct = Object.getOwnPropertyDescriptor(
      globalThis,
      'IS_REACT_ACT_ENVIRONMENT',
    );
    previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    sendMessage = mock();
    Reflect.set(globalThis, 'Byond', {
      windowId: 'miacraft-membership',
      sendMessage,
    });
    previousStore = backend.globalStore;
    store = createStore<{ backend: BackendState }>((state, action) => ({
      backend: backend.backendReducer(state?.backend, action) as BackendState,
    }));
    backend.setGlobalStore(store);
    data = initialData();
    store.dispatch(backend.backendUpdate({ data }));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    try {
      await act(async () => root.unmount());
    } finally {
      container.remove();
      backend.setGlobalStore(previousStore);
      if (previousFocus?.isConnected) previousFocus.focus();
      if (previousByond) {
        Object.defineProperty(globalThis, 'Byond', previousByond);
      } else Reflect.deleteProperty(globalThis, 'Byond');
      if (previousAct) {
        Object.defineProperty(
          globalThis,
          'IS_REACT_ACT_ENVIRONMENT',
          previousAct,
        );
      } else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    }
  });
  const Connected = () => {
    useSyncExternalStore(store.subscribe, store.getState);
    return <MiaCraft />;
  };
  const render = async (patch: Partial<Data> = {}) => {
    await act(async () => {
      store.dispatch(backend.backendUpdate({ data: patch }));
      root.render(<Connected />);
    });
    await act(async () => {
      await new Promise((done) => setTimeout(done, 10));
    });
  };
  const update = async (patch: Partial<Data>) => {
    await act(async () => {
      store.dispatch(backend.backendUpdate({ data: patch }));
    });
  };
  const replaceCatalog = async (
    crafting_recipes: Data['crafting_recipes'] | [],
    patch: Partial<Data> = {},
  ) => {
    await act(async () => {
      store.dispatch(
        backend.backendUpdate({
          static_data: { crafting_recipes },
          data: patch,
        }),
      );
    });
  };
  const titles = () =>
    [...container.querySelectorAll<HTMLElement>('.Button--fluid')].map(
      (element) => element.textContent!.trim(),
    );
  const buttons = (label: string) =>
    [...container.querySelectorAll<HTMLElement>('.Button')].filter(
      (element) => element.textContent!.trim() === label,
    );
  const button = (label: string, index = 0) => {
    const element = buttons(label)[index];
    if (!element) {
      throw new Error(`Missing production button ${label} #${index}`);
    }
    return element;
  };
  const click = async (label: string, index = 0) => {
    await act(async () => button(label, index).click());
  };
  const expandCategories = async () => {
    // Each test invokes this only when the categories currently present are closed.
    for (const title of titles()) await click(title);
  };
  const search = async (value: string) => {
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search recipes by name or ingredients"]',
    );
    if (!input) throw new Error('Missing production search input');
    await act(async () => {
      input.focus();
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return input;
  };
  const checkbox = () => {
    const input = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    if (!input) throw new Error('Missing production craftability checkbox');
    return input;
  };

  test('static catalog replacement learns and forgets recipes in an expanded category without resetting search or filtering', async () => {
    await render({
      craftability: { Fallback: 1, 'Next stage': 0, Unaffordable: 1 },
      craftability_by_path: { '/recipe/old-stage': 1 },
      crafting_recipes: {
        Stages: [
          recipe('Old stage', '/recipe/old-stage', ' 1 Iron ingot'),
          recipe('Fallback', '/recipe/fallback', ' 1 Iron ingot'),
        ],
      },
    });
    const input = await search('iron');
    await act(async () => checkbox().click());
    await update({ showonlycraftable: true });
    await click('Stages');
    await click('Old stage');
    const category = button('Stages');
    expect(titles()).toEqual(['Stages', 'Fallback', 'Old stage']);

    await replaceCatalog(
      {
        Stages: [
          recipe('Next stage', '/recipe/next-stage', ' 2 Iron ingot'),
          recipe('Unaffordable', '/recipe/unaffordable', ' 1 Iron ingot'),
          recipe('Fallback', '/recipe/fallback', ' 1 Iron ingot'),
          recipe('Unmatched', '/recipe/unmatched', ' 1 Cloth'),
        ],
      },
      {
        craftability_by_path: {
          '/recipe/next-stage': 1,
          '/recipe/unaffordable': 0,
          '/recipe/unmatched': 1,
        },
      },
    );
    expect(titles()).toEqual(['Stages', 'Fallback', 'Next stage']);
    expect(button('Stages')).toBe(category);
    expect(input.value).toBe('iron');
    expect(input.isConnected).toBe(true);
    expect(checkbox().checked).toBe(true);
    expect(button('Next stage').style.backgroundColor).toBe('');
    expect(button('Fallback').style.backgroundColor).toBe('');
    expect(container.textContent).not.toContain('Old stage');
    // The array slot stays mounted, but every action must use its new recipe.
    expect(container.textContent).toContain('2 Iron ingot');
    await click('🛠', 1);
    for (const label of ['1x', '2x', '3x', '5x', '∞']) await click(label);
    await click('🛠', 0);
    expect(sendMessage.mock.calls).toEqual([
      ['act/checkboxonlycraftable', { state: true }],
      ['act/craft', { item: '/recipe/next-stage' }],
      ['act/craft', { item: '/recipe/next-stage' }],
      ['act/craft', { item: '/recipe/next-stage', amount: 2 }],
      ['act/craft', { item: '/recipe/next-stage', amount: 3 }],
      ['act/craft', { item: '/recipe/next-stage', amount: 5 }],
      ['act/craft', { item: '/recipe/next-stage', auto: true }],
      ['act/craft', { item: '/recipe/fallback' }],
    ]);
  });

  test('static catalog replacement removes obsolete categories and craft controls while retaining closed categories', async () => {
    const retained = { kept: recipe('Kept', '/recipe/kept') };
    await render({
      craftability: { Kept: 1, Removed: 1, Gained: 1 },
      crafting_recipes: {
        Zeta: { removed: recipe('Removed', '/recipe/removed') },
        Alpha: retained,
      },
    });
    const category = button('Alpha');
    await click('Zeta');
    await click('Removed');
    const obsoleteCraft = button('🛠');
    const obsoleteRepeat = button('2x');
    await replaceCatalog({
      Beta: { gained: recipe('Gained', '/recipe/gained') },
      Alpha: retained,
    });
    expect(titles()).toEqual(['Alpha', 'Beta']);
    expect(button('Alpha')).toBe(category);
    expect(obsoleteCraft.isConnected).toBe(false);
    expect(obsoleteRepeat.isConnected).toBe(false);
    expect(buttons('🛠')).toHaveLength(0);
    // Detached production DOM nodes cannot dispatch a forgotten recipe action.
    await act(async () => {
      obsoleteCraft.click();
      obsoleteRepeat.click();
    });
    expect(sendMessage).not.toHaveBeenCalled();
    await click('Beta');
    expect(titles()).toEqual(['Alpha', 'Beta', 'Gained']);
    await click('🛠');
    expect(sendMessage.mock.calls).toEqual([
      ['act/craft', { item: '/recipe/gained' }],
    ]);
  });

  test('unchanged static catalogs and updates omitting the catalog preserve expanded details and local state', async () => {
    await render({ showonlycraftable: true });
    const input = await search('iron');
    await expandCategories();
    await click('Awl');
    const before = titles();
    const category = button('Alpha');
    const expandedRecipe = button('Awl');
    const details = container.querySelector('.LabeledList');
    expect(details).not.toBeNull();
    for (const catalog of [
      data.crafting_recipes,
      structuredClone(data.crafting_recipes),
    ]) {
      await replaceCatalog(catalog);
      expect(titles()).toEqual(before);
      expect(button('Alpha')).toBe(category);
      expect(button('Awl')).toBe(expandedRecipe);
      expect(container.querySelector('.LabeledList')).toBe(details);
      expect(input.value).toBe('iron');
      expect(checkbox().checked).toBe(true);
    }
    // Ordinary data-only messages omit static_data. The real reducer retains
    // the previous catalog, rather than treating an omitted field as empty.
    await update({ busy: true });
    expect(titles()).toEqual(before);
    expect(container.querySelector('.LabeledList')).toBe(details);
    expect(input.value).toBe('iron');
    expect(checkbox().checked).toBe(true);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test.each([
    ['object', {}],
    ['array', []],
  ] as [string, Data['crafting_recipes'] | []][])(
    'empty static catalog %s can gain recipes and become empty again without stale controls',
    async (_label, empty) => {
      // An empty DM list can arrive as an array; no null/missing initial
      // catalog is promised by ui_static_data, which always sets this field.
      await replaceCatalog(empty);
      await render({ showonlycraftable: true, craftability: { Learned: 1 } });
      const input = await search('iron');
      expect(titles()).toEqual([]);
      await replaceCatalog({
        Knowledge: [recipe('Learned', '/recipe/learned', ' 1 Iron ingot')],
      });
      expect(titles()).toEqual(['Knowledge']);
      await click('Knowledge');
      expect(titles()).toEqual(['Knowledge', 'Learned']);
      const obsoleteCraft = button('🛠');
      await replaceCatalog(empty);
      expect(titles()).toEqual([]);
      expect(buttons('🛠')).toHaveLength(0);
      expect(obsoleteCraft.isConnected).toBe(false);
      expect(input.value).toBe('iron');
      expect(checkbox().checked).toBe(true);
      await act(async () => obsoleteCraft.click());
      expect(sendMessage).not.toHaveBeenCalled();
    },
  );

  test('per-path overrides show only the affordable same-name variant and send its exact path', async () => {
    await render({ ...collidingRecipes(), showonlycraftable: true });
    expect(titles()).toEqual(['Ammunition']);
    await expandCategories();
    expect(titles()).toEqual(['Ammunition', 'pyroclastic bolt']);
    expect(button('pyroclastic bolt').style.backgroundColor).toBe('');
    await click('pyroclastic bolt');
    expect(container.textContent).toContain('1 bolt, 1 fyritius');
    expect(container.textContent).not.toContain('5 bolt, 5 fyritius');
    await click('🛠');
    await click('2x');
    expect(sendMessage.mock.calls).toEqual([
      ['act/craft', { item: pyrobolt }],
      ['act/craft', { item: pyrobolt, amount: 2 }],
    ]);
  });

  test('per-path show-all preserves duplicate order, grey state, and every variant action', async () => {
    await render(collidingRecipes());
    await expandCategories();
    expect(titles()).toEqual([
      'Ammunition',
      'pyroclastic bolt',
      'pyroclastic bolt',
    ]);
    expect(button('pyroclastic bolt', 0).style.backgroundColor).toBe('grey');
    expect(button('pyroclastic bolt', 1).style.backgroundColor).toBe('');
    await click('pyroclastic bolt', 0);
    await click('pyroclastic bolt', 1);
    const details = [...container.querySelectorAll('.LabeledList')];
    expect(details).toHaveLength(2);
    expect(details[0].textContent).toContain('5 bolt, 5 fyritius');
    expect(details[1].textContent).toContain('1 bolt, 1 fyritius');
    for (const index of [0, 1]) {
      // Affordability is presentation only; the server still validates actions.
      await click('🛠', index);
      for (const label of ['1x', '2x', '3x', '5x', '∞']) {
        await click(label, index);
      }
    }
    expect(sendMessage.mock.calls).toEqual(
      [pyroboltFive, pyrobolt].flatMap((item) => [
        ['act/craft', { item }],
        ['act/craft', { item }],
        ['act/craft', { item, amount: 2 }],
        ['act/craft', { item, amount: 3 }],
        ['act/craft', { item, amount: 5 }],
        ['act/craft', { item, auto: true }],
      ]),
    );
  });

  test('old payloads without overrides retain name-based duplicates, ordering, and actions', async () => {
    const { craftability_by_path: _overrides, ...legacy } = collidingRecipes();
    await render({ ...legacy, showonlycraftable: true });
    await expandCategories();
    expect(titles()).toEqual([
      'Ammunition',
      'pyroclastic bolt',
      'pyroclastic bolt',
    ]);
    for (const index of [0, 1]) {
      expect(button('pyroclastic bolt', index).style.backgroundColor).toBe('');
      await click('🛠', index);
    }
    expect(sendMessage.mock.calls).toEqual([
      ['act/craft', { item: pyroboltFive }],
      ['act/craft', { item: pyrobolt }],
    ]);
    await update({ craftability: { 'pyroclastic bolt': 0 } });
    expect(titles()).toEqual([]);
  });

  test('replacement and in-place path override updates refresh filtering and grey state', async () => {
    await render(collidingRecipes());
    await expandCategories();
    const replacement: Record<string, unknown> = {
      [pyroboltFive]: 1,
      [pyrobolt]: 0,
    };
    await update({ craftability_by_path: replacement });
    expect(button('pyroclastic bolt', 0).style.backgroundColor).toBe('');
    expect(button('pyroclastic bolt', 1).style.backgroundColor).toBe('grey');
    await update({ showonlycraftable: true });
    expect(titles()).toEqual(['Ammunition', 'pyroclastic bolt']);
    await click('🛠');
    replacement[pyroboltFive] = 0;
    replacement[pyrobolt] = 1;
    await update({ craftability_by_path: replacement });
    expect(titles()).toEqual(['Ammunition', 'pyroclastic bolt']);
    await click('🛠');
    await update({ showonlycraftable: false });
    expect(button('pyroclastic bolt', 0).style.backgroundColor).toBe('grey');
    expect(button('pyroclastic bolt', 1).style.backgroundColor).toBe('');
    // In-place ownership/enumerability changes must also be freshly observed.
    Object.defineProperty(replacement, pyroboltFive, { enumerable: false });
    await update({ busy: true });
    expect(button('pyroclastic bolt', 0).style.backgroundColor).toBe('');
    Object.defineProperty(replacement, pyroboltFive, { enumerable: true });
    await update({ busy: false });
    expect(button('pyroclastic bolt', 0).style.backgroundColor).toBe('grey');
    delete replacement[pyroboltFive];
    await update({ craftability_by_path: replacement });
    expect(button('pyroclastic bolt', 0).style.backgroundColor).toBe('');
    await update({
      craftability_by_path: {},
      craftability: { 'pyroclastic bolt': 0 },
    });
    for (const index of [0, 1]) {
      expect(button('pyroclastic bolt', index).style.backgroundColor).toBe(
        'grey',
      );
    }
    await update({
      craftability_by_path: undefined,
      craftability: { 'pyroclastic bolt': 1 },
    });
    for (const index of [0, 1]) {
      expect(button('pyroclastic bolt', index).style.backgroundColor).toBe('');
    }
    expect(sendMessage.mock.calls).toEqual([
      ['act/craft', { item: pyroboltFive }],
      ['act/craft', { item: pyrobolt }],
    ]);
  });

  test('path overrides preserve name-or-ingredient search and confirmed checkbox behavior', async () => {
    await render(collidingRecipes());
    await search('PyRoClAsTiC');
    await expandCategories();
    expect(titles()).toEqual([
      'Ammunition',
      'pyroclastic bolt',
      'pyroclastic bolt',
    ]);
    await search('5 FYRITIUS');
    expect(titles()).toEqual(['Ammunition', 'pyroclastic bolt']);
    expect(button('pyroclastic bolt').style.backgroundColor).toBe('grey');
    await act(async () => checkbox().click());
    expect(titles()).toEqual(['Ammunition', 'pyroclastic bolt']);
    await update({ showonlycraftable: true });
    expect(titles()).toEqual([]);
    await search('1 fYrItIuS');
    expect(titles()).toEqual(['Ammunition']);
    await expandCategories();
    expect(titles()).toEqual(['Ammunition', 'pyroclastic bolt']);
    await click('🛠');
    await search('pyrobolt'); // Hidden path is not searchable.
    expect(titles()).toEqual([]);
    await search('no such material');
    expect(titles()).toEqual([]);
    await search('');
    await expandCategories();
    expect(titles()).toEqual(['Ammunition', 'pyroclastic bolt']);
    expect(sendMessage.mock.calls).toEqual([
      ['act/checkboxonlycraftable', { state: true }],
      ['act/craft', { item: pyrobolt }],
    ]);
  });

  test('mounted overrides enforce strict values, own enumerable keys, and malformed-map fallback', async () => {
    await render(collidingRecipes());
    await expandCategories();
    for (const value of [true, '1', null, undefined, 2]) {
      await update({
        craftability_by_path: { [pyroboltFive]: value, [pyrobolt]: 1 },
      });
      expect(button('pyroclastic bolt', 0).style.backgroundColor).toBe('grey');
      expect(button('pyroclastic bolt', 1).style.backgroundColor).toBe('');
    }
    const inherited = Object.create({ [pyroboltFive]: 0 });
    Object.defineProperty(inherited, pyrobolt, { value: 0 });
    for (const overrides of [inherited, null, [], '1', 1, undefined]) {
      await update({ craftability_by_path: overrides });
      for (const index of [0, 1]) {
        expect(button('pyroclastic bolt', index).style.backgroundColor).toBe(
          '',
        );
      }
    }
    await update({
      craftability: { 'pyroclastic bolt': 0 },
      craftability_by_path: { [pyroboltFive]: 0, [pyrobolt]: 1 },
    });
    expect(button('pyroclastic bolt', 0).style.backgroundColor).toBe('grey');
    expect(button('pyroclastic bolt', 1).style.backgroundColor).toBe('');
    await update({ showonlycraftable: true });
    expect(titles()).toEqual(['Ammunition', 'pyroclastic bolt']);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('keeps category and recipe order, duplicate names, and strict numeric-one backgrounds', async () => {
    await render();
    expect(titles()).toEqual(['Alpha', 'Empty', 'Zeta']);
    await expandCategories();
    expect(titles()).toEqual([
      'Alpha',
      'Awl',
      'Blue Dye',
      'Cord',
      'Dye',
      'Missing',
      'Ribbon',
      'Ribbon',
      'Wax',
      'Empty',
      'Fog',
      'Zeta',
      'Hammer',
      'Nails',
      'Saw',
    ]);
    for (const name of ['Awl', 'Ribbon', 'Hammer']) {
      for (const element of buttons(name)) {
        expect(element.style.backgroundColor).toBe('');
      }
    }
    for (const name of [
      'Blue Dye',
      'Cord',
      'Dye',
      'Missing',
      'Wax',
      'Fog',
      'Nails',
      'Saw',
    ]) {
      expect(button(name).style.backgroundColor).toBe('grey');
    }
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('filters uncraftable recipes and empty categories without changing duplicate order or paths', async () => {
    await render({ showonlycraftable: true });
    expect(titles()).toEqual(['Alpha', 'Zeta']);
    await expandCategories();
    expect(titles()).toEqual([
      'Alpha',
      'Awl',
      'Ribbon',
      'Ribbon',
      'Zeta',
      'Hammer',
    ]);
    await click('🛠', 1);
    await click('🛠', 2);
    expect(sendMessage.mock.calls).toEqual([
      ['act/craft', { item: '/recipe/ribbon-second' }],
      ['act/craft', { item: '/recipe/ribbon-first' }],
    ]);
  });

  test('real checkbox sends its existing state action and follows backend confirmation', async () => {
    await render();
    await act(async () => checkbox().click());
    expect(sendMessage.mock.calls).toEqual([
      ['act/checkboxonlycraftable', { state: true }],
    ]);
    // Clicking requests a server change, rather than locally filtering recipes.
    expect(titles()).toEqual(['Alpha', 'Empty', 'Zeta']);
    await update({ showonlycraftable: true });
    expect(checkbox().checked).toBe(true);
    expect(titles()).toEqual(['Alpha', 'Zeta']);
    await act(async () => checkbox().click());
    expect(sendMessage.mock.calls).toEqual([
      ['act/checkboxonlycraftable', { state: true }],
      ['act/checkboxonlycraftable', { state: false }],
    ]);
    await update({ showonlycraftable: false });
    expect(checkbox().checked).toBe(false);
    expect(titles()).toEqual(['Alpha', 'Empty', 'Zeta']);
  });

  test('case-insensitive search composes with craftability filtering and hides empty categories', async () => {
    await render();
    await search('RIB');
    expect(titles()).toEqual(['Alpha']);
    await expandCategories();
    expect(titles()).toEqual(['Alpha', 'Ribbon', 'Ribbon']);
    await search('SaW');
    expect(titles()).toEqual(['Zeta']);
    await expandCategories();
    expect(titles()).toEqual(['Zeta', 'Saw']);
    expect(button('Saw').style.backgroundColor).toBe('grey');
    await update({ showonlycraftable: true });
    expect(titles()).toEqual([]);
    await search('NO SUCH RECIPE');
    expect(titles()).toEqual([]);
    await search('');
    expect(titles()).toEqual(['Alpha', 'Zeta']);
    await expandCategories();
    expect(titles()).toEqual([
      'Alpha',
      'Awl',
      'Ribbon',
      'Ribbon',
      'Zeta',
      'Hammer',
    ]);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('all craft controls retain exact paths, amounts, auto flags, and recipe details', async () => {
    await render();
    await click('Zeta');
    await click('🛠', 0);
    await click('Hammer');
    expect(container.textContent).toContain('1 Iron ingot, 1 Stick');
    expect(container.textContent).toContain('Easy');
    expect(container.textContent).toContain('Knife');
    expect(container.textContent).toContain('Water');
    expect(container.textContent).toContain('Sell Price');
    for (const label of ['1x', '2x', '3x', '5x', '∞']) await click(label);
    // Grey recipes are not newly disabled by the membership optimization.
    await click('🛠', 2);
    expect(sendMessage.mock.calls).toEqual([
      ['act/craft', { item: '/recipe/hammer' }],
      ['act/craft', { item: '/recipe/hammer' }],
      ['act/craft', { item: '/recipe/hammer', amount: 2 }],
      ['act/craft', { item: '/recipe/hammer', amount: 3 }],
      ['act/craft', { item: '/recipe/hammer', amount: 5 }],
      ['act/craft', { item: '/recipe/hammer', auto: true }],
      ['act/craft', { item: '/recipe/saw' }],
    ]);
  });

  test('replacement and same-reference craftability updates refresh filtering and backgrounds', async () => {
    await render();
    await expandCategories();
    const replacement = { Saw: 1, Hammer: 0, Ribbon: '1' };
    await update({ craftability: replacement });
    expect(button('Saw').style.backgroundColor).toBe('');
    expect(button('Hammer').style.backgroundColor).toBe('grey');
    expect(button('Ribbon').style.backgroundColor).toBe('grey');
    await update({ showonlycraftable: true });
    expect(titles()).toEqual(['Zeta', 'Saw']);
    replacement.Saw = 0;
    replacement.Hammer = 1;
    await update({ craftability: replacement });
    expect(titles()).toEqual(['Zeta', 'Hammer']);
    expect(button('Hammer').style.backgroundColor).toBe('');
    await update({ showonlycraftable: false });
    expect(button('Saw').style.backgroundColor).toBe('grey');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('own enumerable prototype-like names work while inherited and hidden names stay uncraftable', async () => {
    const craftability: Record<string, unknown> = Object.create({
      inherited: 1,
    });
    Object.defineProperties(craftability, {
      hidden: { value: 1 },
      constructor: { value: 1, enumerable: true },
    });
    // Avoid the special __proto__ object-literal syntax.
    Object.defineProperty(craftability, '__proto__', {
      value: 1,
      enumerable: true,
    });
    await render({
      craftability,
      crafting_recipes: {
        Keys: Object.fromEntries(
          ['inherited', 'hidden', 'constructor', '__proto__', 'toString'].map(
            (name) => [name, recipe(name, `/recipe/${name}`)],
          ),
        ),
      },
    });
    await click('Keys');
    for (const name of ['inherited', 'hidden', 'toString']) {
      expect(button(name).style.backgroundColor).toBe('grey');
    }
    for (const name of ['constructor', '__proto__']) {
      expect(button(name).style.backgroundColor).toBe('');
    }
    await update({ showonlycraftable: true });
    expect(titles()).toEqual(['Keys', '__proto__', 'constructor']);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('ingredient search uses name OR visible ingredients with mixed case, array categories, no results, and clear', async () => {
    // ui_static_data supplies a category map of recipe arrays. Ingredient text
    // mirrors build_display_cache rather than embedding hidden recipe paths.
    await render({
      crafting_recipes: {
        Zeta: [recipe('Brace', '/recipe/brace', ' 2 Iron ingot, 1 Stick')],
        Alpha: [
          recipe('Unrelated', '/recipe/unrelated', ' 1 Cloth'),
          recipe('Iron ring', '/recipe/ring', ' 1 Gold ingot'),
          recipe('Iron nail', '/recipe/nail', ' 1 Iron ingot'),
        ],
      },
    });
    const input = await search('IrOn');
    expect(input.placeholder).toBe('Name or ingredients...');
    expect(titles()).toEqual(['Alpha', 'Zeta']);
    await expandCategories();
    expect(titles()).toEqual([
      'Alpha',
      'Iron nail', // Matches both fields, but appears only once.
      'Iron ring', // Name-only match.
      'Zeta',
      'Brace', // Ingredient-only match.
    ]);
    await search('ON inG');
    expect(titles()).toEqual(['Alpha', 'Iron nail', 'Zeta', 'Brace']);
    await click('Brace');
    expect(container.textContent).toContain('2 Iron ingot, 1 Stick');
    await search('NO SUCH MATERIAL');
    expect(titles()).toEqual([]);
    await search('');
    expect(titles()).toEqual(['Alpha', 'Zeta']);
    await expandCategories();
    expect(titles()).toEqual([
      'Alpha',
      'Iron nail',
      'Iron ring',
      'Unrelated',
      'Zeta',
      'Brace',
    ]);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('missing, null, and empty ingredient text retain name search without inventing ingredients', async () => {
    const missing = recipe('Missing ingredients', '/recipe/missing');
    delete missing.req_text;
    await render({
      crafting_recipes: {
        Sewing: [
          missing,
          recipe('Null ingredients', '/recipe/null', null),
          recipe('Empty ingredients', '/recipe/empty', ''),
          recipe('Bandage', '/recipe/bandage', ' 1 Cloth'),
        ],
      },
    });
    await search('ingredients');
    await expandCategories();
    expect(titles()).toEqual([
      'Sewing',
      'Empty ingredients',
      'Missing ingredients',
      'Null ingredients',
    ]);
    await search('cLoTh');
    expect(titles()).toEqual(['Sewing', 'Bandage']);
    await search('undefined');
    expect(titles()).toEqual([]);
    await search('');
    await expandCategories();
    expect(titles()).toEqual([
      'Sewing',
      'Bandage',
      'Empty ingredients',
      'Missing ingredients',
      'Null ingredients',
    ]);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('search ignores categories, tools, catalysts, hidden metadata, and recipes outside the received catalog', async () => {
    await render({
      craftability: { Belt: 1, 'Forbidden relic': 1 },
      crafting_recipes: {
        Tailoring: [
          {
            ...recipe('Belt', '/datum/crafting_recipe/secret_path', ' 2 Cloth'),
            ref: 'hidden-reference-marker',
          },
        ],
      },
    });
    for (const query of [
      'tailoring',
      'knife',
      'water',
      'easy',
      '4',
      'secret_path',
      'hidden-reference-marker',
      'forbidden relic',
      'belt cloth',
      'cloths',
      ' cloth ',
    ]) {
      await search(query);
      expect(titles()).toEqual([]);
    }
    await search('cloth');
    expect(titles()).toEqual(['Tailoring']);
    await expandCategories();
    expect(titles()).toEqual(['Tailoring', 'Belt']);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('ingredient-filtered duplicate variants retain stable order and exact craft paths', async () => {
    await render({
      craftability: { Ribbon: 1 },
      crafting_recipes: {
        Sewing: [
          recipe('Ribbon', '/recipe/ribbon-second', ' 2 Hemp fibre'),
          recipe('Awl', '/recipe/awl', ' 1 Iron ingot'),
          recipe('Ribbon', '/recipe/ribbon-first', ' 2 Silk fibre'),
        ],
      },
    });
    await search('fIbRe');
    await expandCategories();
    expect(titles()).toEqual(['Sewing', 'Ribbon', 'Ribbon']);
    expect(sendMessage).not.toHaveBeenCalled();
    await click('🛠', 0);
    await click('🛠', 1);
    await search('silk');
    expect(titles()).toEqual(['Sewing', 'Ribbon']);
    await click('Ribbon');
    expect(container.textContent).toContain('2 Silk fibre');
    await click('2x');
    await click('∞');
    await search('');
    expect(titles()).toEqual(['Sewing', 'Awl', 'Ribbon', 'Ribbon']);
    expect(sendMessage.mock.calls).toEqual([
      ['act/craft', { item: '/recipe/ribbon-second' }],
      ['act/craft', { item: '/recipe/ribbon-first' }],
      ['act/craft', { item: '/recipe/ribbon-first', amount: 2 }],
      ['act/craft', { item: '/recipe/ribbon-first', auto: true }],
    ]);
  });

  test('ingredient search composes with confirmed checkbox state and fresh strict craftability', async () => {
    await render({
      craftability: { Hammer: 1, Brace: true, Awl: 1, Sword: 0 },
      crafting_recipes: {
        Zeta: [recipe('Sword', '/recipe/sword', ' 2 Iron ingot')],
        Alpha: [
          recipe('Hammer', '/recipe/hammer', ' 1 Iron ingot'),
          recipe('Brace', '/recipe/brace', ' 1 Iron ingot'),
          recipe('Awl', '/recipe/awl', ' 1 Cloth'),
        ],
      },
    });
    await search('iron');
    await expandCategories();
    expect(titles()).toEqual(['Alpha', 'Brace', 'Hammer', 'Zeta', 'Sword']);
    expect(button('Hammer').style.backgroundColor).toBe('');
    expect(button('Brace').style.backgroundColor).toBe('grey');
    expect(button('Sword').style.backgroundColor).toBe('grey');
    expect(sendMessage).not.toHaveBeenCalled();
    await act(async () => checkbox().click());
    expect(sendMessage.mock.calls).toEqual([
      ['act/checkboxonlycraftable', { state: true }],
    ]);
    expect(titles()).toEqual(['Alpha', 'Brace', 'Hammer', 'Zeta', 'Sword']);
    await update({ showonlycraftable: true });
    expect(titles()).toEqual(['Alpha', 'Hammer']);
    const replacement = { Hammer: 0, Brace: 1, Sword: 0 };
    await update({ craftability: replacement });
    expect(titles()).toEqual(['Alpha', 'Brace']);
    expect(button('Brace').style.backgroundColor).toBe('');
    replacement.Brace = 0;
    replacement.Sword = 1;
    await update({ craftability: replacement });
    expect(titles()).toEqual(['Zeta']);
    await expandCategories();
    expect(titles()).toEqual(['Zeta', 'Sword']);
    expect(button('Sword').style.backgroundColor).toBe('');
    await search('cloth');
    expect(titles()).toEqual([]);
    await search('');
    expect(titles()).toEqual(['Zeta']);
    expect(sendMessage.mock.calls).toEqual([
      ['act/checkboxonlycraftable', { state: true }],
    ]);
  });
}
