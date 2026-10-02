import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
Reflect.set(globalThis, 'Byond', { windowId: 'decree-register' });
const backend = await import('../backend');
const { DecreeRegister } = await import(
  '../interfaces/DecreeSetter/DecreeRegister'
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
let timerSpy: ReturnType<typeof spyOn>;
let clearTimerSpy: ReturnType<typeof spyOn>;
let dateSpy: ReturnType<typeof spyOn>;
const timers = new Map<number, () => void>();
let timerId = 20000;
let now = 100000;
const env = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousActEnvironment: boolean | undefined;
const longName =
  'The Ancient Charter of the Free Merchants and the Outer Marches';
const decree = (id = 'old', category = 'ancient') => ({
  id,
  name: longName,
  year: 1420,
  category,
  mechanical: 'The Crown may not tax these goods above 15%.',
  flavor:
    'By the hand of our ruler, the complete charter stands.\nAll its terms remain binding.',
});
const state = (overrides = {}) => ({
  id: 'old',
  active: true,
  cooldown_left: 0,
  sequestration_locked: false,
  ...overrides,
});

beforeEach(() => {
  previousActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  sendMessage = mock();
  Reflect.set(globalThis, 'Byond', {
    windowId: 'decree-register',
    sendMessage,
  });
  previousStore = backend.globalStore;
  store = createStore<{ backend: BackendState }>((current, action) => ({
    backend: backend.backendReducer(current?.backend, action) as BackendState,
  }));
  backend.setGlobalStore(store);
  store.dispatch(
    backend.backendUpdate({
      data: {
        decrees: [decree(), decree('new', 'new')],
        states: [state(), state({ id: 'new', active: false })],
        revoke_used_today: false,
        restore_used_today: false,
      },
    }),
  );
  timers.clear();
  now = 100000;
  dateSpy = spyOn(Date, 'now').mockImplementation(() => now);
  const realSetTimeout = window.setTimeout.bind(window);
  const realClearTimeout = window.clearTimeout.bind(window);
  timerSpy = spyOn(window, 'setTimeout').mockImplementation(((
    callback,
    delay,
    ...args
  ) => {
    if (delay !== 3000) return realSetTimeout(callback, delay, ...args);
    const id = ++timerId;
    timers.set(id, callback as () => void);
    return id;
  }) as typeof window.setTimeout);
  clearTimerSpy = spyOn(window, 'clearTimeout').mockImplementation((id) => {
    if (!timers.delete(id)) realClearTimeout(id);
  });
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
  timerSpy.mockRestore();
  clearTimerSpy.mockRestore();
  dateSpy.mockRestore();
  env.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});
const Connected = () => {
  useSyncExternalStore(store.subscribe, store.getState);
  return <DecreeRegister />;
};
const render = async () => {
  await act(async () => root.render(<Connected />));
};
const update = async (data: Record<string, unknown>) => {
  await act(async () => store.dispatch(backend.backendUpdate({ data })));
};
const button = (label: string) => {
  const found = Array.from(container.querySelectorAll('button')).find(
    (element) => element.textContent?.trim() === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
};
const click = async (element: HTMLElement) => {
  await act(async () => element.click());
};
const expire = async () => {
  now += 3000;
  await act(async () => {
    const callbacks = [...timers.values()];
    timers.clear();
    callbacks.forEach((callback) => callback());
  });
};

describe('Decree register', () => {
  test('preserves full names, year, mechanics and complete native charter lore', async () => {
    await render();
    expect(container.querySelector('h2')?.textContent).toBe(
      `${longName} of 1420`,
    );
    expect(container.textContent).toContain(decree().mechanical);
    expect(container.textContent).toContain('In force');
    expect(container.textContent).toContain('Revocation: available');
    expect(container.textContent).toContain('Restoration: available');
    const details = container.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent).toBe('Charter text');
    expect(details.querySelector('.DecreeRegister__lore')?.textContent).toBe(
      decree().flavor,
    );
    details.open = true;
    await update({
      decrees: [
        { ...decree(), flavor: 'The succeeding ruler now signs this charter.' },
      ],
    });
    expect(details.open).toBe(true);
    expect(details.textContent).toContain(
      'The succeeding ruler now signs this charter.',
    );
  });
  test('two activations send only toggle with the original id, without optimistic state changes', async () => {
    await render();
    await click(button('Suspend'));
    expect(sendMessage).not.toHaveBeenCalled();
    expect(timers.size).toBe(1);
    expect(container.textContent).toContain('Confirm within 3 seconds.');
    await click(button('Confirm Suspend?'));
    expect(sendMessage.mock.calls).toEqual([['act/toggle', { id: 'old' }]]);
    expect(timers.size).toBe(0);
    expect(container.textContent).toContain('In force');
    await click(button('Suspend'));
    expect(sendMessage.mock.calls).toHaveLength(1);
  });
  test('three-second timeout requires a fresh confirmation', async () => {
    await render();
    await click(button('Suspend'));
    await expire();
    expect(timers.size).toBe(0);
    await click(button('Suspend'));
    expect(sendMessage).not.toHaveBeenCalled();
    await click(button('Confirm Suspend?'));
    expect(sendMessage.mock.calls).toHaveLength(1);
  });
  test('an expired confirmation cannot submit when its browser timer is delayed', async () => {
    await render();
    await click(button('Suspend'));
    now += 3000;
    await click(button('Confirm Suspend?'));
    expect(sendMessage).not.toHaveBeenCalled();
    expect(timers.size).toBe(1);
    await click(button('Confirm Suspend?'));
    expect(sendMessage.mock.calls).toHaveLength(1);
  });
  test('server state reversal cancels before offering the opposite action', async () => {
    await render();
    await click(button('Suspend'));
    await update({ states: [state({ active: false })] });
    expect(timers.size).toBe(0);
    expect(container.textContent).toContain('Suspended');
    await click(button('Restore'));
    expect(sendMessage).not.toHaveBeenCalled();
    await click(button('Confirm Restore?'));
    expect(sendMessage.mock.calls).toEqual([['act/toggle', { id: 'old' }]]);
  });
  test('missing state cancels confirmation and cannot imply suspension or restoration', async () => {
    await render();
    await click(button('Suspend'));
    await update({ states: [] });
    expect(timers.size).toBe(0);
    expect(container.textContent).toContain('State unavailable');
    expect(container.textContent).not.toContain('Suspended');
    expect(button('Unavailable').disabled).toBe(true);
    await click(button('Unavailable'));
    expect(sendMessage).not.toHaveBeenCalled();
    await update({ states: [state()] });
    await click(button('Suspend'));
    expect(sendMessage).not.toHaveBeenCalled();
  });
  test.each([
    ['cooldown', { cooldown_left: 61 }, 'Cooldown: 1m 1s'],
    [
      'sequestration',
      { sequestration_locked: true },
      'Sequestration prevents changes to this charter.',
    ],
  ] as [string, Record<string, unknown>, string][])(
    '%s entry and release reset armed intent',
    async (_reason, change, note) => {
      await render();
      await click(button('Suspend'));
      await update({ states: [state(change)] });
      expect(timers.size).toBe(0);
      expect(button('Suspend').disabled).toBe(true);
      expect(container.textContent).toContain(note);
      await click(button('Suspend'));
      expect(sendMessage).not.toHaveBeenCalled();
      await update({ states: [state()] });
      await click(button('Suspend'));
      expect(sendMessage).not.toHaveBeenCalled();
      await click(button('Confirm Suspend?'));
      expect(sendMessage.mock.calls).toHaveLength(1);
    },
  );
  test('cooldown ticks remain blocked and sub-minute time is readable', async () => {
    await render();
    await update({ states: [state({ cooldown_left: 59 })] });
    expect(container.textContent).toContain('Cooldown: 59s');
    await update({ states: [state({ cooldown_left: 1 })] });
    expect(button('Suspend').disabled).toBe(true);
    await update({ states: [state()] });
    expect(container.textContent).not.toContain('Cooldown:');
    expect(button('Suspend').disabled).toBe(false);
  });
  test('daily slot consumption and dawn cancel old confirmation intent', async () => {
    await render();
    await click(button('Suspend'));
    await update({ revoke_used_today: true });
    expect(timers.size).toBe(0);
    expect(button('Suspend').disabled).toBe(true);
    expect(container.textContent).toContain('Revocation: used');
    expect(button('Suspend').title).toContain('revocation');
    await update({ revoke_used_today: false });
    await click(button('Suspend'));
    expect(sendMessage).not.toHaveBeenCalled();
  });
  test('revocation and restoration daily slots operate independently', async () => {
    await render();
    await update({ restore_used_today: true });
    expect(button('Suspend').disabled).toBe(false);
    await click(button('New Charters (1)'));
    expect(button('Restore').disabled).toBe(true);
    expect(button('Restore').title).toContain('restoration');
    await update({ restore_used_today: false, revoke_used_today: true });
    await click(button('Restore'));
    expect(sendMessage).not.toHaveBeenCalled();
    await click(button('Confirm Restore?'));
    expect(sendMessage.mock.calls).toEqual([['act/toggle', { id: 'new' }]]);
  });
  test('tabs and row replacement clear timers without carrying confirmation to another decree', async () => {
    await render();
    await click(button('Suspend'));
    await click(button('New Charters (1)'));
    expect(timers.size).toBe(0);
    expect(button('New Charters (1)').getAttribute('aria-pressed')).toBe(
      'true',
    );
    await click(button('Ancient Charters (1)'));
    await click(button('Suspend'));
    expect(sendMessage).not.toHaveBeenCalled();
    await update({
      decrees: [decree('replacement')],
      states: [state({ id: 'replacement' })],
    });
    expect(timers.size).toBe(0);
    await click(button('Suspend'));
    expect(sendMessage).not.toHaveBeenCalled();
    await click(button('Confirm Suspend?'));
    expect(sendMessage.mock.calls).toEqual([
      ['act/toggle', { id: 'replacement' }],
    ]);
  });
  test('unmount clears the confirmation timer', async () => {
    await render();
    await click(button('Suspend'));
    await act(async () => root.render(null));
    expect(timers.size).toBe(0);
    await expire();
    expect(sendMessage).not.toHaveBeenCalled();
  });
  test('empty and absent collections contain no decree actions', async () => {
    await render();
    for (const decrees of [[], undefined]) {
      await update({ decrees, states: undefined });
      expect(container.textContent).toContain('No charters in this category.');
      expect(container.querySelector('article')).toBeNull();
      expect(container.querySelectorAll('button').length).toBe(2);
    }
  });
  test('native category and action controls are focusable and do not override Enter or Space', async () => {
    await render();
    for (const control of container.querySelectorAll('button')) {
      expect(control.type).toBe('button');
      expect(control.tabIndex).toBe(0);
      control.focus();
      expect(document.activeElement).toBe(control);
      for (const key of ['Enter', ' ']) {
        const event = new KeyboardEvent('keydown', {
          key,
          bubbles: true,
          cancelable: true,
        });
        control.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
      }
    }
    // Happy DOM does not synthesize native activation from keyboard events.
    // Browser inspection covers Enter/Space activation for buttons and summary.
    expect(container.querySelector('summary')?.parentElement?.tagName).toBe(
      'DETAILS',
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
