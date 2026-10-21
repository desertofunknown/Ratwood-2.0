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

  const recipe = (name: string, path: string) => ({
    name,
    path,
    req_text: `Materials for ${path}`,
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
    } as Record<string, Record<string, ReturnType<typeof recipe>>>,
  });
  type Data = ReturnType<typeof initialData>;
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
      'input[placeholder="Search..."]',
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
    expect(container.textContent).toContain('Materials for /recipe/hammer');
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
}
