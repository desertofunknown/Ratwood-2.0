import { assertDisconnected } from '../selection-prompt/network-guard';

export type BooleanLike = boolean | number;
export type Data = {
  title?: string;
  message?: string;
  buttons?: string[];
  autofocus?: BooleanLike;
  large_buttons?: BooleanLike;
  swapped_buttons?: BooleanLike;
  timeout?: number;
};
export type Act = (
  action: 'choose' | 'cancel',
  params?: { choice: string },
) => void;
export type Key = {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
  preventDefault(): void;
};
export type Snapshot = {
  data: Data;
  buttons: string[];
  message: string;
  selected: number;
  closed: boolean;
  verbose: boolean;
  windowWidth: 500;
  windowHeight: number;
  timeoutVisible: boolean;
};

/** Fixture-only state: never imports a backend or writes to a native host. */
export function createController(
  initial: Data,
  act: Act,
  onClose: () => void = () => {},
) {
  assertDisconnected();
  let data = { ...initial };
  let selected = 0;
  let closed = false;
  const listeners = new Set<() => void>();
  function project(): Snapshot {
    const buttons = data.buttons === undefined ? [] : data.buttons;
    const message = data.message === undefined ? '' : data.message;
    const verbose =
      buttons.some((button) => button.length > 18) || buttons.length > 3;
    return {
      data,
      buttons,
      message,
      selected,
      closed,
      verbose,
      windowWidth: 500,
      windowHeight: Math.min(
        640,
        190 +
          Math.ceil(message.length / 55) * 22 +
          (verbose ? buttons.length * 46 : 0),
      ),
      timeoutVisible: !!data.timeout,
    };
  }
  let state = project();
  function notify() {
    state = project();
    listeners.forEach((listener) => listener());
  }
  function allowed() {
    assertDisconnected();
    return !closed;
  }
  function navigate(direction: number) {
    if (!state.buttons.length) return;
    selected =
      (selected + direction + state.buttons.length) % state.buttons.length;
    notify();
  }
  const controller = {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    deliver: (next: Data) => {
      if (!allowed()) return;
      data = { ...next };
      notify();
    },
    close: () => {
      if (!allowed()) return;
      closed = true;
      notify();
      onClose();
    },
    focus: (index: number) => {
      if (!allowed()) return;
      selected = index;
      notify();
    },
    choose: (index: number) => {
      if (!allowed()) return;
      const choice = state.buttons[index];
      if (choice !== undefined) act('choose', { choice });
    },
    keyDown: (event: Key) => {
      if (!allowed()) return;
      switch (event.key) {
        case ' ':
        case 'Enter':
          event.preventDefault();
          controller.choose(selected);
          return;
        case 'ArrowLeft':
          event.preventDefault();
          navigate(-1);
          return;
        case 'Tab':
          event.preventDefault();
          navigate(event.shiftKey ? -1 : 1);
          return;
        case 'ArrowRight':
          event.preventDefault();
          navigate(1);
          return;
        default:
          if (event.key === 'Escape' || event.key === 'Esc') act('cancel');
      }
    },
  };
  return controller;
}
export type Controller = ReturnType<typeof createController>;
