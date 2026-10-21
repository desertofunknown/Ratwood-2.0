import { expect, spyOn, test } from 'bun:test';
import { act, type ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Knob, Slider as CoreSlider } from 'tgui-core/base-components';

import { Slider } from './Slider';

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
      if (delay === 100 || delay === 10) {
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
  const mouse = async (
    target: EventTarget,
    type: string,
    screenX = 100,
    screenY = 0,
  ) => {
    await act(async () =>
      target.dispatchEvent(
        new MouseEvent(type, { bubbles: true, screenX, screenY }),
      ),
    );
  };
  return {
    container,
    mouse,
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
      mouse(container.querySelectorAll('.Slider')[index], 'mousedown'),
    move: async (screenX = 110) => mouse(document, 'mousemove', screenX),
    end: async () => mouse(document, 'mouseup', 110),
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

for (const Component of [CoreSlider, Slider]) {
  const name = Component === Slider ? 'adapter' : 'core';
  for (const phase of [
    'pending',
    'active',
    'editor-pending',
    'focus-pending',
  ]) {
    test(`${name} Slider cancels ${phase} resources on unmount without callbacks`, async () =>
      fixture(async (h) => {
        const calls: string[] = [];
        const callbacks = {
          onChange: (_event: Event, value: number) =>
            calls.push(`change:${value}`),
          onDrag: (_event: Event, value: number) => calls.push(`drag:${value}`),
        };
        await h.render(<Component {...props} {...callbacks} />);
        await h.start();
        expect([...h.timers.values()].map((timer) => timer.delay)).toEqual([
          100,
        ]);
        expect(h.listeners.get('mouseup')?.size).toBe(1);
        if (phase === 'active') {
          await h.tick(100);
          const originalMove = [...h.listeners.get('mousemove')!];
          const originalEnd = [...h.listeners.get('mouseup')!];
          await h.move();
          // A state update and parent rerender must not lose the installed identities.
          await h.render(
            <Component {...props} {...callbacks} className="rerendered" />,
          );
          await h.move(120);
          expect([...h.listeners.get('mousemove')!]).toEqual(originalMove);
          expect([...h.listeners.get('mouseup')!]).toEqual(originalEnd);
          expect([...h.timers.values()].map((timer) => timer.delay)).toEqual([
            400,
          ]);
        }
        if (phase === 'editor-pending' || phase === 'focus-pending') {
          await h.end();
          expect(calls).toEqual(['change:5', 'drag:5']);
          if (phase === 'focus-pending') {
            await h.tick(100);
            expect([...h.timers.values()].map((timer) => timer.delay)).toEqual([
              10,
            ]);
          }
        }
        const beforeUnmount = [...calls];
        const input = h.container.querySelector('input')!;
        const focus = spyOn(input, 'focus');
        const select = spyOn(input, 'select');
        try {
          await h.unmount();
          h.clean();
          await h.tick(100);
          await h.tick(10);
          await h.tick(400);
          await h.move();
          await h.end();
          h.clean();
          expect(calls).toEqual(beforeUnmount);
          expect(focus).not.toHaveBeenCalled();
          expect(select).not.toHaveBeenCalled();
        } finally {
          focus.mockRestore();
          select.mockRestore();
        }
      }));
  }

  test(`${name} Slider preserves drag arithmetic and captured interval callback value`, async () =>
    fixture(async (h) => {
      const calls: string[] = [];
      await h.render(
        <Component
          {...props}
          step={2}
          stepPixelSize={2}
          onChange={(_event, value) => calls.push(`change:${value}`)}
          onDrag={(_event, value) => calls.push(`drag:${value}`)}
        />,
      );
      await h.start();
      await h.tick(100);
      await h.move(110);
      // Upstream uses V - V % step + minValue % step: 15 becomes 14.
      expect(
        h.container.querySelector('.ProgressBar__content')?.textContent,
      ).toBe('14');
      await h.tick(400);
      await h.move(120);
      expect(
        h.container.querySelector('.ProgressBar__content')?.textContent,
      ).toBe('24');
      await h.tick(400);
      await h.end();
      expect(calls).toEqual(['drag:5', 'drag:5', 'change:24', 'drag:24']);
      h.clean();
    }));

  test(`${name} Slider preserves quick click editing, focus, selection and typed commit`, async () =>
    fixture(async (h) => {
      const calls: string[] = [];
      await h.render(
        <Component
          {...props}
          onChange={(_event, value) => calls.push(`change:${value}`)}
          onDrag={(_event, value) => calls.push(`drag:${value}`)}
        />,
      );
      await h.start();
      await h.end();
      expect(calls).toEqual(['change:5', 'drag:5']);
      await h.tick(100);
      const input = h.container.querySelector('input')!;
      expect(input.style.display).not.toBe('none');
      expect(input.value).toBe('5');
      await h.tick(10);
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(1);
      await act(async () => {
        input.value = '37';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.blur();
      });
      expect(calls).toEqual(['change:5', 'drag:5', 'change:37']);
      expect(input.style.display).toBe('none');
      h.clean();
    }));
}

test('Slider cancellation removes only its exact owned document listeners', async () =>
  fixture(async (h) => {
    const foreignCalls: string[] = [];
    const foreignMove = () => foreignCalls.push('move');
    const foreignEnd = () => foreignCalls.push('end');
    document.addEventListener('mousemove', foreignMove);
    document.addEventListener('mouseup', foreignEnd);
    try {
      await h.render(<Slider {...props} />);
      await h.start();
      await h.tick(100);
      await h.move();
      foreignCalls.length = 0;
      await h.unmount();
      expect(h.timers.size).toBe(0);
      expect([...h.listeners.get('mousemove')!]).toEqual([foreignMove]);
      expect([...h.listeners.get('mouseup')!]).toEqual([foreignEnd]);
      await h.move();
      await h.end();
      expect(foreignCalls).toEqual(['move', 'end']);
    } finally {
      document.removeEventListener('mousemove', foreignMove);
      document.removeEventListener('mouseup', foreignEnd);
    }
    h.clean();
  }));

for (const [value, priority] of [
  ['', ''],
  ['painted', ''],
  ['auto', 'important'],
]) {
  test(`Slider CSS alias contract restores ${value || 'empty'} ${priority} on unmount`, async () =>
    fixture(async (h) => {
      h.aliasCss();
      document.body.style.setProperty('pointer-events', value, priority);
      await h.render(<Slider {...props} />);
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
  test(`Slider CSS alias contract preserves external ${value} ${priority}`, async () =>
    fixture(async (h) => {
      h.aliasCss();
      await h.render(<Slider {...props} />);
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
test('Slider unmount without gesture does not alter body pointer style', async () =>
  fixture(async (h) => {
    h.aliasCss();
    document.body.style.setProperty('pointer-events', 'none', 'important');
    await h.render(<Slider {...props} />);
    await h.unmount();
    h.clean();
    expect(document.body.style.getPropertyValue('pointer-events')).toBe('none');
    expect(document.body.style.getPropertyPriority('pointer-events')).toBe(
      'important',
    );
  }));

for (const active of [false, true]) {
  test(`Slider repeated start replaces ${active ? 'active' : 'pending'} session without callbacks`, async () =>
    fixture(async (h) => {
      const calls: number[] = [];
      await h.render(
        <Slider
          {...props}
          onChange={(_event, value) => calls.push(value)}
          onDrag={(_event, value) => calls.push(value)}
        />,
      );
      await h.start();
      if (active) {
        await h.tick(100);
        await h.move();
      }
      const oldTimers = [...h.timers.keys()];
      await h.start();
      expect(oldTimers.every((id) => !h.timers.has(id))).toBe(true);
      expect([...h.timers.values()].map((timer) => timer.delay)).toEqual([100]);
      expect(h.listeners.get('mousemove')?.size ?? 0).toBe(0);
      expect(h.listeners.get('mouseup')?.size).toBe(1);
      expect(calls).toEqual([]);
      await h.tick(100);
      expect(h.listeners.get('mousemove')?.size).toBe(1);
      expect([...h.timers.values()].map((timer) => timer.delay)).toEqual([400]);
      await h.unmount();
      h.clean();
      expect(calls).toEqual([]);
    }));

  test(`Slider CSS alias contract transfers ${active ? 'active' : 'pending'} ownership between controls`, async () =>
    fixture(async (h) => {
      h.aliasCss();
      document.body.style.setProperty('pointer-events', 'painted', 'important');
      const calls: number[] = [];
      const callbacks = {
        onChange: (_event: Event, value: number) => calls.push(value),
        onDrag: (_event: Event, value: number) => calls.push(value),
      };
      const first = <Slider key="first" {...props} {...callbacks} />;
      const second = <Slider key="second" {...props} {...callbacks} />;
      await h.render([first, second]);
      await h.start();
      if (active) {
        await h.tick(100);
        await h.move();
        expect(
          h.container
            .querySelectorAll('.Slider')[0]
            .querySelector('.Slider__popupValue'),
        ).not.toBeNull();
      }
      const oldTimers = [...h.timers.keys()];
      const oldEnd = [...h.listeners.get('mouseup')!];
      const oldMove = [...(h.listeners.get('mousemove') ?? [])];
      await h.start(1);
      expect(oldTimers.every((id) => !h.timers.has(id))).toBe(true);
      expect(
        oldEnd.every((listener) => !h.listeners.get('mouseup')!.has(listener)),
      ).toBe(true);
      expect(
        oldMove.every(
          (listener) => !h.listeners.get('mousemove')!.has(listener),
        ),
      ).toBe(true);
      expect(
        h.container
          .querySelectorAll('.Slider')[0]
          .querySelector('.Slider__popupValue'),
      ).toBeNull();
      const newTimers = [...h.timers.keys()];
      const newEnd = [...h.listeners.get('mouseup')!];
      await h.render([second]);
      expect([...h.timers.keys()]).toEqual(newTimers);
      expect([...h.listeners.get('mouseup')!]).toEqual(newEnd);
      expect(document.body.style.getPropertyValue('pointer-events')).toBe(
        'none',
      );
      expect(calls).toEqual([]);
      await h.tick(100);
      expect(h.listeners.get('mousemove')?.size).toBe(1);
      await h.move();
      expect(h.container.querySelector('.Slider__popupValue')).not.toBeNull();
      await h.unmount();
      h.clean();
      expect(calls).toEqual([]);
      expect(document.body.style.getPropertyValue('pointer-events')).toBe(
        'painted',
      );
      expect(document.body.style.getPropertyPriority('pointer-events')).toBe(
        'important',
      );
    }));
}

test('Slider new gesture cancels prior quick-click editor activation and focus', async () =>
  fixture(async (h) => {
    const calls: string[] = [];
    await h.render(
      <Slider
        {...props}
        onChange={(_event, value) => calls.push(`change:${value}`)}
        onDrag={(_event, value) => calls.push(`drag:${value}`)}
      />,
    );
    await h.start();
    await h.end();
    const oldTimers = [...h.timers.keys()];
    expect(calls).toEqual(['change:5', 'drag:5']);
    const input = h.container.querySelector('input')!;
    const focus = spyOn(input, 'focus');
    try {
      await h.start();
      expect(oldTimers.every((id) => !h.timers.has(id))).toBe(true);
      await h.tick(100);
      await h.tick(10);
      expect(input.style.display).toBe('none');
      expect(focus).not.toHaveBeenCalled();
      expect([...h.timers.values()].map((timer) => timer.delay)).toEqual([400]);
      expect(h.listeners.get('mousemove')?.size).toBe(1);
      expect(h.listeners.get('mouseup')?.size).toBe(1);
      expect(calls).toEqual(['change:5', 'drag:5']);
      await h.unmount();
      h.clean();
    } finally {
      focus.mockRestore();
    }
  }));

// Knob shares the patched DraggableControl. Keep this smoke scope to its
// vertical drag lifecycle rather than claiming coverage of Floating rendering.
for (const active of [false, true]) {
  test(`Knob shared DraggableControl cancels ${active ? 'active' : 'pending'} drag on unmount`, async () =>
    fixture(async (h) => {
      const calls: number[] = [];
      await h.render(
        <Knob
          {...props}
          onChange={(_event, value) => calls.push(value)}
          onDrag={(_event, value) => calls.push(value)}
        />,
      );
      await h.mouse(h.container.querySelector('.Knob')!, 'mousedown', 100, 100);
      expect(h.listeners.get('mouseup')?.size).toBe(1);
      if (active) {
        await h.tick(100);
        await h.mouse(document, 'mousemove', 100, 90);
        expect(h.listeners.get('mousemove')?.size).toBe(1);
      }
      await h.unmount();
      h.clean();
      await h.tick(100);
      await h.tick(400);
      await h.mouse(document, 'mousemove', 100, 80);
      await h.mouse(document, 'mouseup', 100, 80);
      h.clean();
      expect(calls).toEqual([]);
    }));
}

test('Knob shared DraggableControl preserves vertical arithmetic and callback values', async () =>
  fixture(async (h) => {
    const calls: string[] = [];
    await h.render(
      <Knob
        {...props}
        onChange={(_event, value) => calls.push(`change:${value}`)}
        onDrag={(_event, value) => calls.push(`drag:${value}`)}
      />,
    );
    await h.mouse(h.container.querySelector('.Knob')!, 'mousedown', 100, 100);
    await h.tick(100);
    await h.mouse(document, 'mousemove', 100, 90);
    await h.tick(400);
    await h.mouse(document, 'mouseup', 100, 90);
    expect(calls).toEqual(['drag:5', 'change:15', 'drag:15']);
    h.clean();
  }));

for (const active of [false, true]) {
  test(`StrictMode Slider acquires then cancels ${active ? 'active' : 'pending'} resources after effect replay`, async () =>
    fixture(async (h) => {
      const calls: number[] = [];
      await h.render(
        <StrictMode>
          <Slider
            {...props}
            onChange={(_event, value) => calls.push(value)}
            onDrag={(_event, value) => calls.push(value)}
          />
        </StrictMode>,
      );
      await h.start();
      expect([...h.timers.values()].map((timer) => timer.delay)).toEqual([100]);
      expect(h.listeners.get('mouseup')?.size).toBe(1);
      if (active) {
        await h.tick(100);
        await h.move();
        expect(h.listeners.get('mousemove')?.size).toBe(1);
        expect([...h.timers.values()].map((timer) => timer.delay)).toEqual([
          400,
        ]);
      }
      await h.unmount();
      h.clean();
      await h.tick(100);
      await h.tick(400);
      await h.move();
      await h.end();
      h.clean();
      expect(calls).toEqual([]);
    }));
}
