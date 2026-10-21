import { expect, spyOn, test } from 'bun:test';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { NumberInput as CoreNumberInput } from 'tgui-core/base-components';

import { NumberInput } from './NumberInput';

async function fixture(
  run: (h: Awaited<ReturnType<typeof harness>>) => Promise<void>,
) {
  const h = await harness();
  try {
    await run(h);
  } finally {
    await h.dispose();
  }
}
async function harness() {
  const env = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const oldAct = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  const style = document.body.style,
    oldCss = style.cssText;
  const oldHyphen = Object.getOwnPropertyDescriptor(style, 'pointer-events');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let mounted = true,
    nextId = 100000;
  type Timer = { delay: number; repeat: boolean; callback: () => void };
  const timers = new Map<number, Timer>();
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const add = document.addEventListener.bind(document),
    remove = document.removeEventListener.bind(document);
  const timeout = globalThis.setTimeout,
    interval = globalThis.setInterval;
  const clearTimeout = globalThis.clearTimeout,
    clearInterval = globalThis.clearInterval;
  // Control only core gesture/focus timers. No real interval can outlive a test.
  const spies = [
    spyOn(document, 'addEventListener').mockImplementation(
      (type, listener, options) => {
        if (type === 'mousemove' || type === 'mouseup') {
          if (!listeners.has(type)) listeners.set(type, new Set());
          listeners.get(type)!.add(listener);
        }
        add(type, listener, options);
      },
    ),
    spyOn(document, 'removeEventListener').mockImplementation(
      (type, listener, options) => {
        listeners.get(type)?.delete(listener);
        remove(type, listener, options);
      },
    ),
    spyOn(globalThis, 'setTimeout').mockImplementation(((
      callback,
      delay,
      ...args
    ) => {
      if (delay === 250 || delay === 10) {
        const id = ++nextId;
        timers.set(id, {
          delay,
          repeat: false,
          callback: () => callback(...args),
        });
        return id;
      }
      return timeout(callback, delay, ...args);
    }) as typeof setTimeout),
    spyOn(globalThis, 'setInterval').mockImplementation(((
      callback,
      delay,
      ...args
    ) => {
      if (delay === 400) {
        const id = ++nextId;
        timers.set(id, {
          delay,
          repeat: true,
          callback: () => callback(...args),
        });
        return id;
      }
      return interval(callback, delay, ...args);
    }) as typeof setInterval),
    spyOn(globalThis, 'clearTimeout').mockImplementation((id) => {
      if (!timers.delete(Number(id))) clearTimeout(id);
    }),
    spyOn(globalThis, 'clearInterval').mockImplementation((id) => {
      if (!timers.delete(Number(id))) clearInterval(id);
    }),
  ];
  const mouse = async (target: EventTarget, type: string, screenY = 100) => {
    await act(async () =>
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, screenY })),
    );
  };
  return {
    container,
    timers,
    listeners,
    render: async (node: ReactNode) => {
      await act(async () => root.render(node));
    },
    unmount: async () => {
      await act(async () => root.unmount());
      mounted = false;
    },
    start: async (index = 0) =>
      mouse(container.querySelectorAll('.NumberInput')[index], 'mousedown'),
    move: async () => mouse(document, 'mousemove', 90),
    end: async () => mouse(document, 'mouseup', 90),
    tick: async (delay: number) => {
      for (const [id, timer] of [...timers]) {
        if (timer.delay !== delay || !timers.has(id)) continue;
        if (!timer.repeat) timers.delete(id);
        await act(async () => timer.callback());
      }
    },
    clean: () => {
      expect(timers.size).toBe(0);
      expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
    },
    // happyDOM lacks this browser CSS alias. ONLY explicit CSS contract tests
    // enable this shim. These tests do not establish real-browser rendering.
    aliasCss: () =>
      Object.defineProperty(style, 'pointer-events', {
        configurable: true,
        get: () => style.getPropertyValue('pointer-events'),
        set: (value: string) => style.setProperty('pointer-events', value),
      }),
    dispose: async () => {
      try {
        if (mounted) await act(async () => root.unmount());
      } finally {
        for (const [type, set] of listeners) {
          for (const listener of set) remove(type, listener);
        }
        for (const spy of spies) spy.mockRestore();
        timers.clear();
        container.remove();
        style.cssText = oldCss;
        if (oldHyphen) {
          Object.defineProperty(style, 'pointer-events', oldHyphen);
        } else Reflect.deleteProperty(style, 'pointer-events');
        env.IS_REACT_ACT_ENVIRONMENT = oldAct;
      }
    },
  };
}
const props = { value: 5, minValue: 0, maxValue: 100, step: 1 };
for (const active of [false, true]) {
  for (const transition of ['unmount', 'disable']) {
    test(`NumberInput cancels ${active ? 'active' : 'pending'} drag on ${transition}`, async () =>
      fixture(async (h) => {
        const calls: string[] = [];
        const callbacks = {
          onChange: (v: number) => calls.push(`change:${v}`),
          onDrag: (v: number) => calls.push(`drag:${v}`),
        };
        await h.render(<NumberInput {...props} {...callbacks} />);
        await h.start();
        expect(h.timers.size).toBe(2);
        expect(h.listeners.get('mousemove')?.size).toBe(1);
        expect(h.listeners.get('mouseup')?.size).toBe(1);
        if (active) {
          await h.tick(250);
          await h.move();
        }
        if (transition === 'unmount') await h.unmount();
        else await h.render(<NumberInput {...props} {...callbacks} disabled />);
        h.clean();
        await h.tick(250);
        await h.tick(400);
        await h.move();
        await h.end();
        h.clean();
        expect(calls).toEqual([]);
      }));
  }
}
test('NumberInput repeated start replaces owned handles without callbacks', async () =>
  fixture(async (h) => {
    const calls: number[] = [];
    await h.render(<NumberInput {...props} onDrag={(v) => calls.push(v)} />);
    await h.start();
    const oldTimers = [...h.timers.keys()];
    await h.tick(250);
    await h.move();
    await h.start();
    expect(oldTimers.every((id) => !h.timers.has(id))).toBe(true);
    expect(h.timers.size).toBe(2);
    expect(h.listeners.get('mousemove')?.size).toBe(1);
    expect(h.listeners.get('mouseup')?.size).toBe(1);
    expect(calls).toEqual([]);
    await h.unmount();
    h.clean();
  }));
for (const Component of [CoreNumberInput, NumberInput]) {
  const name = Component === NumberInput ? 'adapter' : 'core';
  test(`${name} preserves enabled drag callback order and values`, async () =>
    fixture(async (h) => {
      const calls: string[] = [];
      await h.render(
        <Component
          {...props}
          onChange={(v) => calls.push(`change:${v}`)}
          onDrag={(v) => calls.push(`drag:${v}`)}
        />,
      );
      await h.start();
      await h.tick(250);
      await h.move();
      await h.tick(400);
      await h.end();
      expect(calls).toEqual(['drag:15', 'change:15', 'drag:15']);
      h.clean();
    }));
  test(`${name} preserves click-to-edit focus and selection`, async () =>
    fixture(async (h) => {
      const calls: number[] = [];
      await h.render(
        <Component
          {...props}
          onChange={(v) => calls.push(v)}
          onDrag={(v) => calls.push(v)}
        />,
      );
      await h.start();
      await h.end();
      await h.tick(10);
      const input = h.container.querySelector('input')!;
      expect(input.style.display).toBe('inline');
      expect(input.value).toBe('5');
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(1);
      expect(calls).toEqual([]);
      h.clean();
    }));
}
for (const [value, priority] of [
  ['', ''],
  ['painted', ''],
  ['auto', 'important'],
]) {
  test(`CSS alias contract restores ${value || 'empty'} ${priority} on cancellation`, async () =>
    fixture(async (h) => {
      h.aliasCss();
      document.body.style.setProperty('pointer-events', value, priority);
      await h.render(<NumberInput {...props} />);
      await h.start();
      expect(document.body.style.getPropertyValue('pointer-events')).toBe(
        'none',
      );
      await h.unmount();
      h.clean();
      expect(document.body.style.getPropertyValue('pointer-events')).toBe(
        value,
      );
      expect(document.body.style.getPropertyPriority('pointer-events')).toBe(
        priority,
      );
    }));
}
for (const [value, priority] of [
  ['auto', ''],
  ['none', 'important'],
]) {
  test(`CSS alias contract preserves external ${value} ${priority}`, async () =>
    fixture(async (h) => {
      h.aliasCss();
      await h.render(<NumberInput {...props} />);
      await h.start();
      document.body.style.setProperty('pointer-events', value, priority);
      await h.unmount();
      h.clean();
      expect(document.body.style.getPropertyValue('pointer-events')).toBe(
        value,
      );
      expect(document.body.style.getPropertyPriority('pointer-events')).toBe(
        priority,
      );
    }));
}
test('Unmount without gesture leaves pointer style untouched', async () =>
  fixture(async (h) => {
    h.aliasCss();
    document.body.style.setProperty('pointer-events', 'none', 'important');
    await h.render(<NumberInput {...props} />);
    await h.unmount();
    h.clean();
    expect(document.body.style.getPropertyValue('pointer-events')).toBe('none');
    expect(document.body.style.getPropertyPriority('pointer-events')).toBe(
      'important',
    );
  }));
test('CSS alias contract replacement ownership survives old adapter unmount', async () =>
  fixture(async (h) => {
    h.aliasCss();
    document.body.style.setProperty('pointer-events', 'painted');
    const calls: number[] = [];
    const first = (
      <NumberInput key="first" {...props} onDrag={(v) => calls.push(v)} />
    );
    const second = (
      <NumberInput key="second" {...props} onDrag={(v) => calls.push(v)} />
    );
    await h.render([first, second]);
    await h.start();
    await h.tick(250);
    await h.move();
    const oldListeners = [...h.listeners.get('mousemove')!];
    await h.start(1);
    expect(
      oldListeners.every(
        (listener) => !h.listeners.get('mousemove')!.has(listener),
      ),
    ).toBe(true);
    await h.render([second]);
    expect(h.timers.size).toBe(2);
    expect(h.listeners.get('mousemove')?.size).toBe(1);
    expect(document.body.style.getPropertyValue('pointer-events')).toBe('none');
    expect(calls).toEqual([]);
    await h.unmount();
    h.clean();
    expect(document.body.style.getPropertyValue('pointer-events')).toBe(
      'painted',
    );
  }));

test('Disabled NumberInput never acquires gesture resources', async () =>
  fixture(async (h) => {
    await h.render(<NumberInput {...props} disabled />);
    await h.start();
    h.clean();
  }));

test('Cancelling NumberInput removes only its own document listeners', async () =>
  fixture(async (h) => {
    const calls: string[] = [];
    const foreignMove = () => calls.push('move');
    const foreignEnd = () => calls.push('end');
    document.addEventListener('mousemove', foreignMove);
    document.addEventListener('mouseup', foreignEnd);
    try {
      await h.render(<NumberInput {...props} />);
      await h.start();
      await h.unmount();
      expect(h.timers.size).toBe(0);
      expect([...h.listeners.get('mousemove')!]).toEqual([foreignMove]);
      expect([...h.listeners.get('mouseup')!]).toEqual([foreignEnd]);
      await h.move();
      await h.end();
      expect(calls).toEqual(['move', 'end']);
    } finally {
      document.removeEventListener('mousemove', foreignMove);
      document.removeEventListener('mouseup', foreignEnd);
    }
    h.clean();
  }));
