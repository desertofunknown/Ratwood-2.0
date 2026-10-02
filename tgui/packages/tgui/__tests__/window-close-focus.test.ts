import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { applyMiddleware, createStore, type Store } from 'common/redux';

const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
Reflect.set(globalThis, 'Byond', { windowId: 'window-close-focus' });
const backend = await import('../backend');
if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
else Reflect.deleteProperty(globalThis, 'Byond');

let previousByond: PropertyDescriptor | undefined;
let store: Store;
let winset: ReturnType<typeof mock>;
let hasFocus: ReturnType<typeof spyOn>;
const settleFocus = () => new Promise((resolve) => setTimeout(resolve, 10));

beforeEach(() => {
  previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  winset = mock(() => Promise.resolve());
  Reflect.set(globalThis, 'Byond', {
    windowId: 'window-close-focus',
    winset,
    sendMessage: mock(),
  });
  hasFocus = spyOn(document, 'hasFocus').mockReturnValue(false);
  const initialBackend = {
    ...backend.backendReducer(undefined, { type: '@@INIT' }),
    suspended: false as const,
  };
  store = createStore(
    (state, action) => ({
      backend: backend.backendReducer(state?.backend ?? initialBackend, action),
    }),
    applyMiddleware(backend.backendMiddleware),
  );
});

afterEach(async () => {
  await settleFocus();
  hasFocus.mockRestore();
  if (previousByond) Object.defineProperty(globalThis, 'Byond', previousByond);
  else Reflect.deleteProperty(globalThis, 'Byond');
});

test('a background window closes without taking keyboard focus from another dialog', async () => {
  store.dispatch({ type: 'suspend' });
  await settleFocus();
  expect(winset.mock.calls).toEqual([
    ['window-close-focus', { 'is-visible': false }],
  ]);
  expect(store.getState().backend.suspended).toBeNumber();
});

test('the focused window still returns keyboard control to the map when closed', async () => {
  hasFocus.mockReturnValue(true);
  winset.mockImplementation(() => {
    // Hiding the native window blurs its browser before the deferred callback.
    hasFocus.mockReturnValue(false);
    return Promise.resolve();
  });
  store.dispatch({ type: 'suspend' });
  await settleFocus();
  expect(winset.mock.calls).toEqual([
    ['window-close-focus', { 'is-visible': false }],
    ['mapwindow.map', { focus: true }],
  ]);
});

test('a delayed close acknowledgement respects focus moved to a newer dialog', async () => {
  hasFocus.mockReturnValue(true);
  store.dispatch(backend.backendSuspendStart());
  hasFocus.mockReturnValue(false);
  store.dispatch({ type: 'suspend' });
  await settleFocus();
  expect(winset.mock.calls).toEqual([
    ['window-close-focus', { 'is-visible': false }],
  ]);
  expect(store.getState().backend.suspending).toBe(false);
});

test('background closure does not queue a later focus transfer', async () => {
  store.dispatch({ type: 'suspend' });
  hasFocus.mockReturnValue(true);
  await settleFocus();
  expect(winset.mock.calls).toEqual([
    ['window-close-focus', { 'is-visible': false }],
  ]);
});
