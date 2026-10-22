import { expect, test } from 'bun:test';
import { installTripwires, attempted } from './tripwires';
import {
  base,
  runScenarios,
  type Factory,
  type Data,
  type Call,
  element,
  click,
  query,
  state,
  key,
  focus,
} from './scenarios';
import { createReactSelectionPrompt, mountReact } from '../react-mount';
import { createSvelteSelectionPrompt, mountSvelte } from '../svelte-mount';
import { createController } from '../model';
import { preview } from '../preview';
import { assertDisconnected } from '../network-guard';
installTripwires(false);
const pause = () => new Promise<void>((done) => setTimeout(done, 12));
const factories = {
  React: createReactSelectionPrompt,
  Svelte: createSvelteSelectionPrompt,
};
for (const [name, mount] of Object.entries(factories)) {
  const make: Factory = async (data) => {
    const host = document.createElement('div');
    document.body.append(host);
    const calls: Call[] = [];
    const session = mount(host, data, (action, params) =>
      calls.push([action, params ?? {}]),
    );
    const settle = async (action?: () => void) => {
      action?.();
      await pause();
    };
    await settle();
    return {
      host,
      calls,
      settle,
      update: async (data) => settle(() => session.update(data)),
      destroy: async () => {
        session.destroy();
        await pause();
        host.remove();
      },
    };
  };
  test(`${name}: mounted DOM records match independent actual production oracle`, async () => {
    const actual = JSON.parse(JSON.stringify(await runScenarios(make)));
    const expected = await Bun.file(process.env.SELECTION_ORACLE_PATH!).json();
    for (const scenario of Object.keys(expected)) {
      expect(actual[scenario], `${name} / ${scenario}`).toEqual(
        expected[scenario],
      );
    }
    expect(Object.keys(actual)).toEqual(Object.keys(expected));
    expect(attempted()).toEqual([]);
  }, 30000);
  test(`${name}: fresh remount resets state; updates retain it`, async () => {
    const first = await make(base());
    await click(first, 'option', 2);
    await click(first, 'toggle');
    await query(first, 'blue');
    await first.update({
      init_value: 'banana',
      items: ['apple', 'banana', 'blueberry', 'carrot'],
    });
    expect(state(first).search).toBe('blue');
    await click(first, 'confirm');
    expect(first.calls).toEqual([['submit', { entry: 'blueberry' }]]);
    await first.destroy();
    const next = await make(base({ init_value: 'banana' }));
    expect(state(next).search).toBe(null);
    await click(next, 'confirm');
    expect(next.calls).toEqual([['submit', { entry: 'banana' }]]);
    await next.destroy();
  });
  test(`${name}: close is local only; stale DOM/controller actions after teardown are inert`, async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const calls: Call[] = [];
    let closes = 0;
    const session = mount(
      host,
      base(),
      (action, params) => calls.push([action, params ?? {}]),
      () => {
        closes++;
        session.controller.close();
      },
    );
    await pause();
    const stale = host.querySelector<HTMLElement>('[data-testid="confirm"]')!;
    host.querySelector<HTMLElement>('[data-testid="close"]')!.click();
    await pause();
    expect(closes).toBe(1);
    expect(calls).toEqual([]);
    expect(host.textContent).toBe('');
    stale.click();
    session.controller.submit();
    session.controller.preview();
    session.controller.cancel();
    session.update({ previewing: true });
    session.destroy();
    session.destroy();
    await pause();
    expect(calls).toEqual([]);
    expect(closes).toBe(1);
    host.remove();
  });
  test(`${name}: no per-mount document/window listeners or timers survive repeated teardown`, async () => {
    // Track only candidate-owned global listeners/timers. React's delegated root
    // listeners live on removed host nodes and its one-time selectionchange
    // initialization is warmed before measuring, not silently ignored.
    const warm = await make(base());
    await warm.destroy();
    const liveTimers = new Set<unknown>();
    const liveIntervals = new Set<unknown>();
    const timeout = globalThis.setTimeout,
      clearTimeoutOriginal = globalThis.clearTimeout;
    const interval = globalThis.setInterval,
      clearIntervalOriginal = globalThis.clearInterval;
    const records: {
      target: EventTarget;
      type: string;
      listener: EventListenerOrEventListenerObject;
      capture: boolean;
    }[] = [];
    const add = EventTarget.prototype.addEventListener,
      remove = EventTarget.prototype.removeEventListener;
    globalThis.setTimeout = ((fn: any, delay: any, ...args: any[]) => {
      let id: any;
      id = timeout(() => {
        liveTimers.delete(id);
        fn(...args);
      }, delay);
      liveTimers.add(id);
      return id;
    }) as any;
    globalThis.clearTimeout = ((id: any) => {
      liveTimers.delete(id);
      clearTimeoutOriginal(id);
    }) as any;
    globalThis.setInterval = ((...args: any[]) => {
      const id = (interval as any)(...args);
      liveIntervals.add(id);
      return id;
    }) as any;
    globalThis.clearInterval = ((id: any) => {
      liveIntervals.delete(id);
      clearIntervalOriginal(id);
    }) as any;
    EventTarget.prototype.addEventListener = function (
      type,
      listener,
      options,
    ) {
      const capture =
        typeof options === 'boolean' ? options : !!options?.capture;
      if (
        (this === document || this === window) &&
        listener &&
        !records.some(
          (r) =>
            r.target === this &&
            r.type === type &&
            r.listener === listener &&
            r.capture === capture,
        )
      )
        records.push({ target: this, type, listener, capture });
      return add.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (
      type,
      listener,
      options,
    ) {
      const capture =
        typeof options === 'boolean' ? options : !!options?.capture;
      const index = records.findIndex(
        (r) =>
          r.target === this &&
          r.type === type &&
          r.listener === listener &&
          r.capture === capture,
      );
      if (index >= 0) records.splice(index, 1);
      return remove.call(this, type, listener, options);
    };
    try {
      for (let i = 0; i < 3; i++) {
        const h = await make(
          base({
            items: Array.from({ length: 9 }, (_, i) => `entry ${i}`),
            timeout: 0.5,
          }),
        );
        await query(h, 'entry');
        await h.destroy();
      }
      await pause();
      expect(records.map((r) => r.type)).toEqual([]);
      expect(liveTimers.size).toBe(0);
      expect(liveIntervals.size).toBe(0);
    } finally {
      globalThis.setTimeout = timeout;
      globalThis.clearTimeout = clearTimeoutOriginal;
      globalThis.setInterval = interval;
      globalThis.clearInterval = clearIntervalOriginal;
      EventTarget.prototype.addEventListener = add;
      EventTarget.prototype.removeEventListener = remove;
    }
  });
}
test('closed controller unsubscribe and reentrant action cannot emit twice', () => {
  let count = 0,
    notifications = 0;
  const controller = createController(base(), () => {
    count++;
    controller.close();
    controller.submit();
  });
  const unsubscribe = controller.subscribe(() => notifications++);
  controller.submit();
  expect(count).toBe(1);
  expect(controller.snapshot().closed).toBe(true);
  unsubscribe();
  const before = notifications;
  controller.deliver({ previewing: true });
  controller.select('carrot');
  controller.query('a');
  controller.toggleSearch();
  controller.preview();
  controller.cancel();
  expect(notifications).toBe(before);
  expect(count).toBe(1);
  expect(attempted()).toEqual([]);
});

for (const name of ['Byond', 'hubStorage'])
  for (const scopeName of ['global', 'window']) {
    test(`native presence guard refuses ${scopeName}.${name} without reading it`, () => {
      const scope = scopeName === 'global' ? globalThis : window;
      const previous = Object.getOwnPropertyDescriptor(scope, name);
      let reads = 0;
      Object.defineProperty(scope, name, {
        configurable: true,
        get() {
          reads++;
          throw Error('Native getter must never be read');
        },
      });
      try {
        expect(() => createController(base(), () => {})).toThrow(
          'refuses native host globals',
        );
        expect(reads).toBe(0);
      } finally {
        if (previous) Object.defineProperty(scope, name, previous);
        else Reflect.deleteProperty(scope, name);
      }
    });
  }

for (const [name, mount] of Object.entries({
  React: mountReact,
  Svelte: mountSvelte,
})) {
  test(`${name}: actual sample controls deliver state and close locally without action receipt`, async () => {
    const root = document.createElement('div');
    root.id = 'root';
    const controls = document.createElement('div');
    controls.id = 'controls';
    document.body.append(controls, root);
    const dispose = preview(mount);
    await pause();
    const control = (label: string) => {
      const result = [...controls.querySelectorAll('button')].find(
        (x) => x.textContent === label,
      );
      if (!result) throw Error(`Missing ${label}`);
      return result;
    };
    try {
      root.querySelector<HTMLElement>('[data-testid="preview"]')!.click();
      await pause();
      expect(controls.textContent).toContain(
        'Recorded sample action preview_toggle',
      );
      expect(root.querySelector('[data-testid="preview"]')?.textContent).toBe(
        'Listen',
      );
      control('Deliver preview state').click();
      await pause();
      expect(root.querySelector('[data-testid="preview"]')?.textContent).toBe(
        'Stop',
      );
      control('Deliver timeout zero').click();
      await pause();
      expect(root.querySelector('progress')).toBe(null);
      control('Close / suspend sample').click();
      await pause();
      expect(root.textContent).toContain('No Cancel or native close receipt');
      expect(controls.textContent).not.toContain(
        'Recorded sample action cancel',
      );
      control('Fresh mount').click();
      await pause();
      expect(controls.textContent).toContain(
        'Fresh sample. No commands recorded.',
      );
      root.querySelector<HTMLElement>('[data-testid="close"]')!.click();
      await pause();
      expect(root.textContent).toContain('Local sample disposed.');
    } finally {
      dispose();
      await pause();
      root.remove();
      controls.remove();
    }
    expect(attempted()).toEqual([]);
  });
}
test('native guards reject inherited/undefined host signals and late native injection', () => {
  for (const name of ['Byond', 'hubStorage']) {
    expect(() =>
      assertDisconnected(Object.create({ [name]: undefined })),
    ).toThrow();
    const controller = createController(base(), () => {
      throw Error('Action escaped late native guard');
    });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: undefined,
    });
    try {
      expect(() => controller.submit()).toThrow('refuses native host globals');
      expect(() => controller.deliver({ timeout: 0 })).toThrow(
        'refuses native host globals',
      );
    } finally {
      Reflect.deleteProperty(globalThis, name);
      controller.close();
    }
  }
});
