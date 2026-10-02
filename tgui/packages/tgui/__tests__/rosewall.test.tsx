import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type {
  AdvertEntry,
  RosewallData,
} from '../interfaces/Rosewall/RosewallContent';

const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
Reflect.set(globalThis, 'Byond', { windowId: 'rosewall' });
const backend = await import('../backend');
const { RosewallContent } = await import(
  '../interfaces/Rosewall/RosewallContent'
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

const advert = (key: string, status = 'Available'): AdvertEntry => ({
  key,
  name: key,
  status,
  message: `Services from ${key}`,
  advjob: 'Bathhouse attendant',
});
const initialData = (): RosewallData => ({
  is_bathhouse: 0,
  my_key: 'Me',
  message_char_limit: 300,
  status_options: ['Available', 'Hired', 'Do not Disturb'],
  adverts: [
    advert('Cinder', 'Do not Disturb'),
    advert('Briar'),
    advert('Dawn', 'Hired'),
    advert('Aster'),
  ],
});
beforeEach(() => {
  previousActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  sendMessage = mock();
  Reflect.set(globalThis, 'Byond', { windowId: 'rosewall', sendMessage });
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
  return <RosewallContent />;
};
const render = async () => {
  await act(async () => root.render(<Connected />));
};
const update = async (data: Partial<RosewallData>) => {
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

test('sorts availability then name without mutating the incoming registry', async () => {
  const data = initialData();
  const original = data.adverts.map((entry) => entry.key);
  await update(data);
  await render();
  expect(
    Array.from(container.querySelectorAll('h3')).map(
      (entry) => entry.textContent,
    ),
  ).toEqual(['Aster', 'Briar', 'Dawn', 'Cinder']);
  expect(data.adverts.map((entry) => entry.key)).toEqual(original);
  expect(container.querySelector('select')).toBeNull();
  expect(container.textContent).toContain('Pinned Adverts (4)');
  expect(container.textContent).toContain(
    "Perfumed slips pinned by the bathhouse's workers. Peruse, and send an offer.",
  );
  expect(sendMessage).not.toHaveBeenCalled();
});

test('offers and portraits target the exact advert key, with DND and own offers absent', async () => {
  await update({ my_key: 'Briar' });
  await render();
  const offers = Array.from(container.querySelectorAll('button')).filter(
    (entry) => entry.textContent === 'Send Offer',
  );
  expect(offers.map((entry) => entry.getAttribute('aria-label'))).toEqual([
    'Send Offer: Aster',
    'Send Offer: Dawn',
  ]);
  await click(button('Send Offer: Dawn'));
  await click(button('Examine Headshot: Cinder'));
  await click(button('Examine Headshot: Briar'));
  expect(sendMessage.mock.calls).toEqual([
    ['act/send_offer', { key: 'Dawn' }],
    ['act/examine_headshot', { key: 'Cinder' }],
    ['act/examine_headshot', { key: 'Briar' }],
  ]);
});

test('unpinned workers see honest status and can explicitly pin through a status action', async () => {
  await update({ is_bathhouse: 1 });
  await render();
  const select = container.querySelector('select')!;
  expect(select.value).toBe('');
  expect(select.selectedOptions[0].textContent).toBe('Not Pinned');
  expect(container.textContent).not.toContain('Take Down');
  await click(button('Pin an Advert'));
  expect(container.querySelectorAll('h3').length).toBe(4);
  await act(async () => {
    select.value = 'Hired';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(sendMessage.mock.calls).toEqual([
    ['act/edit_advert', {}],
    ['act/set_status', { status: 'Hired' }],
  ]);
  await update({ adverts: [...initialData().adverts, advert('Me', 'Hired')] });
  expect(select.value).toBe('Hired');
  expect(button('Edit Advert')).toBeTruthy();
  expect(button('Take Down')).toBeTruthy();
});

test('owner controls track acknowledgements, removal, and revoked eligibility', async () => {
  await update({ is_bathhouse: 1, adverts: [advert('Me')] });
  await render();
  await click(button('Edit Advert'));
  await click(button('Take Down'));
  expect(container.querySelector('select')?.value).toBe('Available');
  await update({ adverts: [advert('Me', 'Do not Disturb')] });
  expect(container.querySelector('select')?.value).toBe('Do not Disturb');
  await update({ is_bathhouse: 0 });
  expect(container.querySelector('.Rosewall__registry')).toBeNull();
  expect(button('Examine Headshot: Me')).toBeTruthy();
  expect(sendMessage.mock.calls).toEqual([
    ['act/edit_advert', {}],
    ['act/remove_advert', {}],
  ]);
  await update({ is_bathhouse: 1, adverts: [] });
  expect(button('Pin an Advert')).toBeTruthy();
  expect(container.querySelector('select')?.value).toBe('');
  expect(container.textContent).toContain('No adverts have been pinned.');
});

test('incoming availability and advert removal immediately change offer access', async () => {
  await update({ adverts: [advert('Aster')] });
  await render();
  expect(button('Send Offer: Aster')).toBeTruthy();
  await update({ adverts: [advert('Aster', 'Do not Disturb')] });
  expect(container.querySelectorAll('button').length).toBe(1);
  await update({ adverts: [] });
  expect(container.querySelectorAll('button').length).toBe(0);
  expect(container.querySelector('ul')).toBeNull();
  expect(sendMessage).not.toHaveBeenCalled();
});

test('full names and adverts remain plain text, including markup-like characters', async () => {
  const entry = {
    ...advert('long-key'),
    name: 'Aster of the Far Northern Rosewood Court',
    message: '<img src=x onerror=alert(1)> & perfumed oils',
    advjob: 'Attendant to the visiting northern household',
  };
  await update({ adverts: [entry] });
  await render();
  expect(container.querySelector('h3')?.textContent).toBe(entry.name);
  expect(container.textContent).toContain(entry.message);
  expect(container.textContent).toContain(entry.advjob);
  expect(container.querySelector('img')).toBeNull();
  await click(button(`Send Offer: ${entry.name}`));
  expect(sendMessage.mock.calls).toEqual([
    ['act/send_offer', { key: 'long-key' }],
  ]);
});
