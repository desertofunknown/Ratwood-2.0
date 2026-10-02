import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { MaterialRow, ScrapperData } from '../interfaces/Scrapper/types';

const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
Reflect.set(globalThis, 'Byond', { windowId: 'scrapper' });
const backend = await import('../backend');
const { ScrapperContent } = await import(
  '../interfaces/Scrapper/ScrapperContent'
);
if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
else Reflect.deleteProperty(globalThis, 'Byond');

const material = (): MaterialRow => ({
  path: '/obj/item/natural/cloth',
  name: 'Finely woven cloth of the northern guild',
  price: 3,
  cap: 10,
  held: 6,
  items: 2,
  left: 4,
  advertise: true,
  enabled: true,
});
const desk = (): ScrapperData => ({
  budget: 50,
  is_keyholder: true,
  materials: [material()],
  total_items: 2,
});
type BackendState = NonNullable<Parameters<typeof backend.backendReducer>[0]>;
let store: Store;
let previousStore: Store;
let previousByond: PropertyDescriptor | undefined;
let container: HTMLDivElement;
let root: Root;
let sendMessage: ReturnType<typeof mock>;
const env = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousActEnvironment: boolean | undefined;

beforeEach(() => {
  previousActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  sendMessage = mock();
  Reflect.set(globalThis, 'Byond', { windowId: 'scrapper', sendMessage });
  previousStore = backend.globalStore;
  store = createStore<{ backend: BackendState }>((state, action) => ({
    backend: backend.backendReducer(state?.backend, action) as BackendState,
  }));
  backend.setGlobalStore(store);
  store.dispatch(backend.backendUpdate({ data: desk() }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  backend.setGlobalStore(previousStore);
  if (previousByond) Object.defineProperty(globalThis, 'Byond', previousByond);
  else Reflect.deleteProperty(globalThis, 'Byond');
  env.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});
const Connected = () => {
  useSyncExternalStore(store.subscribe, store.getState);
  return <ScrapperContent />;
};
const render = async () => {
  await act(async () => root.render(<Connected />));
};
const update = async (data: Partial<ScrapperData>) => {
  await act(async () => store.dispatch(backend.backendUpdate({ data })));
};
const updateRow = async (changes: Partial<MaterialRow>) => {
  const data: ScrapperData = store.getState().backend.data;
  await update({ materials: [{ ...data.materials[0], ...changes }] });
};
const button = (label: string, scope: ParentNode = container) => {
  const found = Array.from(scope.querySelectorAll('button')).find(
    (element) => element.textContent?.trim() === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
};
const field = (name: string, scope: ParentNode = container) =>
  scope.querySelector<HTMLInputElement>(`input[aria-label$=" ${name}"]`)!;
const click = async (element: HTMLElement) => {
  await act(async () => element.click());
};
const enter = async (element: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

test('ledger keeps full names and distinguishes held units, remaining cap and physical items', async () => {
  await render();
  expect(container.querySelector('caption')?.textContent).toBe(
    'Materials Bought',
  );
  expect(container.textContent).toContain(material().name);
  expect(container.querySelector('.Scrapper__stock')?.textContent).toBe(
    '6 held4 of 10 left2 items',
  );
  expect(button('Empty (2)').disabled).toBe(false);
  await updateRow({ held: 12, left: 0, items: 4 });
  expect(container.querySelector('.Scrapper__stock')?.textContent).toBe(
    '12 held0 of 10 left4 items',
  );
  await updateRow({ cap: 0, left: -1 });
  expect(container.querySelector('.Scrapper__stock')?.textContent).toBe(
    '12 heldno cap4 items',
  );
  expect(container.querySelector('h1')).toBeNull();
});

test.each(['price', 'cap'] as const)(
  '%s submits immediate native drafts, accepts zero and values above the old artificial limit',
  async (name) => {
    await render();
    const label = name === 'price' ? 'Price' : 'Cap';
    await enter(field(name), '12500');
    await click(button(label));
    await enter(field(name), '0');
    await act(async () =>
      field(name)
        .closest('form')!
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        ),
    );
    expect(sendMessage.mock.calls).toEqual([
      [`act/set_${name}`, { path: material().path, value: 12500 }],
      [`act/set_${name}`, { path: material().path, value: 0 }],
    ]);
  },
);

test.each([
  '',
  '-1',
  '1.5',
  'NaN',
  'Infinity',
  '1e3',
  '2x',
  ' 2 ',
  '9007199254740992',
])(
  'invalid numeric draft %j cannot be submitted by click or native form submit',
  async (value) => {
    await render();
    for (const name of ['price', 'cap']) {
      await enter(field(name), value);
      expect(field(name).getAttribute('aria-invalid')).toBe('true');
      expect(field(name).getAttribute('aria-describedby')).toBeTruthy();
      const save = button(name === 'price' ? 'Price' : 'Cap');
      expect(save.disabled).toBe(true);
      await click(save);
      await act(async () =>
        field(name)
          .closest('form')!
          .dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true }),
          ),
      );
    }
    expect(sendMessage).not.toHaveBeenCalled();
  },
);

test('clean values refresh, dirty drafts survive external changes, and acknowledgements release drafts', async () => {
  await render();
  await updateRow({ price: 8, cap: 20 });
  expect(field('price').value).toBe('8');
  expect(field('cap').value).toBe('20');
  await enter(field('price'), '12');
  await enter(field('cap'), '30');
  await updateRow({ price: 9, cap: 25 });
  expect(field('price').value).toBe('12');
  expect(field('cap').value).toBe('30');
  await click(button('Price'));
  await click(button('Cap'));
  await updateRow({ price: 12, cap: 30 });
  expect(button('Price').disabled).toBe(true);
  expect(button('Cap').disabled).toBe(true);
  await updateRow({ price: 13, cap: 40 });
  expect(field('price').value).toBe('13');
  expect(field('cap').value).toBe('40');
  await enter(field('price'), '0013');
  expect(button('Price').disabled).toBe(true);
  await updateRow({ price: 14 });
  expect(field('price').value).toBe('14');
});

test('drafts stay with material paths after row reorder and never leak into replacement rows', async () => {
  const other = {
    ...material(),
    path: '/obj/item/ingot/iron',
    name: 'Iron ingot',
    price: 8,
  };
  await update({ materials: [material(), other] });
  await render();
  await enter(field('price'), '17');
  await update({ materials: [other, material()] });
  const rows = container.querySelectorAll('tbody tr');
  expect(field('price', rows[0]).value).toBe('8');
  expect(field('price', rows[1]).value).toBe('17');
  await click(button('Price', rows[1]));
  expect(sendMessage.mock.calls[0]).toEqual([
    'act/set_price',
    { path: material().path, value: 17 },
  ]);
  await update({ materials: [other] });
  await update({ materials: [material()] });
  expect(field('price').value).toBe('3');
});

test('all proprietor actions use exact paths and advertising stays available on disabled materials', async () => {
  await render();
  await click(button('Withdraw'));
  await click(button('Empty All (2)'));
  await click(button('Disable'));
  await click(button('Quiet'));
  await click(button('Empty (2)'));
  await updateRow({ enabled: false, advertise: false });
  expect(button('Advertise').disabled).toBe(false);
  await click(button('Advertise'));
  await click(button('Enable'));
  expect(sendMessage.mock.calls).toEqual([
    ['act/withdraw', {}],
    ['act/dump_all', {}],
    ['act/toggle_enable', { path: material().path }],
    ['act/toggle_advertise', { path: material().path }],
    ['act/dump_held', { path: material().path }],
    ['act/toggle_advertise', { path: material().path }],
    ['act/toggle_enable', { path: material().path }],
  ]);
});

test('empty coffer and stock disable empty actions, while held units remain recoverable', async () => {
  await render();
  await update({ budget: 0, total_items: 0 });
  await updateRow({ held: 0, items: 0, left: 10 });
  for (const label of ['Withdraw', 'Empty All (0)', 'Empty (0)']) {
    expect(button(label).disabled).toBe(true);
    await click(button(label));
  }
  expect(sendMessage).not.toHaveBeenCalled();
  await updateRow({ held: 2 });
  expect(button('Empty (0)').disabled).toBe(false);
  expect(button('Empty All (0)').disabled).toBe(false);
  await click(button('Empty (0)'));
  expect(sendMessage.mock.calls).toEqual([
    ['act/dump_held', { path: material().path }],
  ]);
});

test('permission loss removes controls and visitors retain prices and complete stock facts', async () => {
  await render();
  await enter(field('price'), '17');
  await update({ is_keyholder: false });
  expect(container.querySelectorAll('button, input').length).toBe(0);
  expect(container.textContent).toContain('3m');
  expect(container.textContent).toContain(material().name);
  expect(container.textContent).toContain('6 held4 of 10 left2 items');
  await update({ is_keyholder: true });
  expect(field('price').value).toBe('3');
  expect(sendMessage).not.toHaveBeenCalled();
});

test('empty data renders the authored empty state and remount resets local drafts', async () => {
  await render();
  await enter(field('price'), '17');
  await act(async () => root.render(null));
  await render();
  expect(field('price').value).toBe('3');
  await update({ materials: [] });
  expect(container.textContent).toContain('No materials configured.');
  expect(container.querySelector('table')).toBeNull();
});
