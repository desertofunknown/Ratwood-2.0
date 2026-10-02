import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type {
  RosterEntry,
  TalkstatueData,
} from '../interfaces/Talkstatue/TalkstatueContent';

const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
Reflect.set(globalThis, 'Byond', { windowId: 'talkstatue' });
const backend = await import('../backend');
const { TalkstatueContent } = await import(
  '../interfaces/Talkstatue/TalkstatueContent'
);
if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
else Reflect.deleteProperty(globalThis, 'Byond');

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

const entry = (key: string, status = 'Available'): RosterEntry => ({
  key,
  name: key,
  status,
  message: `Work from ${key}`,
  advjob: 'Woodsman',
  nom_de_guerre: '',
});
const initialData = (): TalkstatueData => ({
  is_merc: 0,
  is_adventurer: 0,
  is_wretch: 0,
  is_bathhouse: 0,
  my_key: 'Me',
  message_char_limit: 300,
  merc_status_options: ['Available', 'Contracted', 'Do not Disturb'],
  adv_status_options: ['Available', 'Away', 'Resting', 'Do not Disturb'],
  wretch_status_options: [
    'Available',
    'On a Job',
    'Lying Low',
    'Do not Disturb',
  ],
  mercenaries: [
    entry('Cinder', 'Do not Disturb'),
    entry('Briar', 'Contracted'),
    entry('Aster'),
  ],
  adventurers: [
    entry('Dawn', 'Resting'),
    entry('Me'),
    entry('Cinder', 'Do not Disturb'),
    entry('Aster'),
  ],
  wretches: [entry('Secret'), entry('Me'), entry('Hidden', 'Do not Disturb')],
});
beforeEach(() => {
  previousActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  sendMessage = mock();
  Reflect.set(globalThis, 'Byond', { windowId: 'talkstatue', sendMessage });
  previousStore = backend.globalStore;
  store = createStore<{ backend: BackendState }>((state, action) => ({
    backend: backend.backendReducer(state?.backend, action) as BackendState,
  }));
  backend.setGlobalStore(store);
  store.dispatch(backend.backendUpdate({ data: initialData() }));
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
  return <TalkstatueContent />;
};
const render = async () => {
  await act(async () => root.render(<Connected />));
};
const update = async (data: Partial<TalkstatueData>) => {
  await act(async () => store.dispatch(backend.backendUpdate({ data })));
};
const button = (label: string) => {
  const result = Array.from(container.querySelectorAll('button')).find(
    (entry) =>
      (entry.getAttribute('aria-label') || entry.textContent) === label,
  );
  if (!result) throw new Error(`Missing button ${label}`);
  return result;
};
const click = async (element: HTMLElement) => {
  await act(async () => element.click());
};

const selectStatus = async (status: string) => {
  const select = container.querySelector('select')!;
  await act(async () => {
    select.value = status;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

test('public roster preserves full names, status ordering and source arrays without leaking wretches', async () => {
  const data = initialData();
  const keys = data.mercenaries.map((e) => e.key);
  await update(data);
  await render();
  expect(
    Array.from(container.querySelectorAll('h3')).map((e) => e.textContent),
  ).toEqual(['Aster', 'Briar', 'Cinder']);
  expect(data.mercenaries.map((e) => e.key)).toEqual(keys);
  expect(container.textContent).not.toContain('Secret');
  expect(container.textContent).not.toContain('Wretches (3)');
  expect(container.querySelector('select')).toBeNull();
  await click(button('Contact a Mercenary'));
  await click(button('Broadcast to All'));
  expect(sendMessage.mock.calls).toEqual([
    ['act/contact_merc', {}],
    ['act/broadcast_mercs', {}],
  ]);
});

test.each([
  [
    'mercs',
    'is_merc',
    'set_merc_status',
    'edit_merc_message',
    'Mercenaries (3)',
    'mercenaries',
  ],
  [
    'adventurers',
    'is_adventurer',
    'set_adv_status',
    'edit_adv_message',
    'Adventurers (4)',
    'adventurers',
  ],
  [
    'wretches',
    'is_wretch',
    'set_wretch_status',
    'edit_wretch_message',
    'Wretches (3)',
    'wretches',
  ],
] as const)(
  'unregistered %s can select the first status and edit without optimistic registration',
  async (_tab, role, statusAction, messageAction, tabLabel, list) => {
    await update({ [role]: 1, [list]: [] });
    await render();
    await click(button(tabLabel.replace(/\(\d\)/, '(0)')));
    const select = container.querySelector('select')!;
    expect(select.value).toBe('');
    expect(select.selectedOptions[0].textContent).toBe('Not Registered');
    await selectStatus('Available');
    await click(button('Edit Message'));
    expect(sendMessage.mock.calls).toEqual([
      [`act/${statusAction}`, { status: 'Available' }],
      [`act/${messageAction}`, {}],
    ]);
    expect(select.value).toBe('');
    await update({ [list]: [entry('Me')] });
    expect(select.value).toBe('Available');
  },
);

test('adventurer contact uses registry keys and DND has no message action', async () => {
  await update({ is_adventurer: 1 });
  await render();
  await click(button('Adventurers (4)'));
  expect(
    Array.from(container.querySelectorAll('h3')).map((e) => e.textContent),
  ).toEqual(['Aster', 'Me', 'Cinder', 'Dawn']);
  expect(container.querySelector('[aria-label="Message: Cinder"]')).toBeNull();
  await click(button('Message: Aster'));
  await click(button('Message: Me'));
  await click(button('Contact an Adventurer'));
  await click(button('Take Myself Off'));
  expect(sendMessage.mock.calls).toEqual([
    ['act/contact_adventurer', { key: 'Aster' }],
    ['act/contact_adventurer', { key: 'Me' }],
    ['act/pick_adventurer', {}],
    ['act/leave_adv', {}],
  ]);
  await update({ is_adventurer: 0 });
  expect(container.querySelector('select')).toBeNull();
  expect(container.textContent).not.toContain('Take Myself Off');
});

test('bathhouse may contact aliases but not own or DND wretches; losing role hides selected private roster', async () => {
  await update({
    is_bathhouse: 1,
    wretches: [
      { ...entry('Secret'), name: 'The Silent Crow' },
      entry('Me'),
      entry('Hidden', 'Do not Disturb'),
    ],
  });
  await render();
  await click(button('Wretches (3)'));
  expect(container.querySelector('select')).toBeNull();
  expect(container.textContent).not.toContain('Woodsman');
  expect(container.querySelector('[aria-label="Message: Me"]')).toBeNull();
  expect(container.querySelector('[aria-label="Message: Hidden"]')).toBeNull();
  await click(button('Message: The Silent Crow'));
  await click(button('Contact a Wretch'));
  expect(sendMessage.mock.calls).toEqual([
    ['act/contact_wretch', { key: 'Secret' }],
    ['act/pick_wretch', {}],
  ]);
  await update({ is_bathhouse: 0 });
  expect(container.textContent).not.toContain('The Silent Crow');
  expect(button('Mercenaries (3)').getAttribute('aria-pressed')).toBe('true');
});

test('wretches can edit their nom but cannot send bathhouse messages', async () => {
  await update({ is_wretch: 1 });
  await render();
  await click(button('Wretches (3)'));
  await click(button('Nom de Guerre'));
  await selectStatus('Lying Low');
  expect(sendMessage.mock.calls).toEqual([
    ['act/edit_wretch_nom', {}],
    ['act/set_wretch_status', { status: 'Lying Low' }],
  ]);
  expect(container.querySelector('[aria-label^="Message:"]')).toBeNull();
  expect(container.textContent).not.toContain('Contact a Wretch');
});

test('messages remain literal text and empty rosters are explicit', async () => {
  await update({
    mercenaries: [
      { ...entry('Name & Company'), message: '<b>Tools</b> & trade' },
    ],
  });
  await render();
  expect(container.textContent).toContain('<b>Tools</b> & trade');
  expect(container.querySelector('b')).toBeNull();
  await update({
    mercenaries: [],
    adventurers: [],
    wretches: [],
    is_wretch: 1,
  });
  expect(container.textContent).toContain('No mercenaries have registered.');
  await click(button('Adventurers (0)'));
  expect(container.textContent).toContain('No adventurers have registered.');
  await click(button('Wretches (0)'));
  expect(container.textContent).toContain('No wretches have registered.');
  expect(sendMessage).not.toHaveBeenCalled();
});
