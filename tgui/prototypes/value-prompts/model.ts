import { assertDisconnected } from '../selection-prompt/network-guard';

export type Kind = 'number' | 'text';
export type Data = {
  title?: string;
  message?: string;
  timeout?: number;
  large_buttons?: boolean | number;
  swapped_buttons?: boolean | number;
  init_value?: number;
  min_value?: number;
  max_value?: number;
  round_value?: boolean | number;
  placeholder?: string;
  multiline?: boolean;
  max_length?: number;
  preview_leadin?: string | null;
  disable_paste?: boolean;
  bigmodal?: boolean;
  spellcheck?: boolean | number;
};
export type Value = string | number | undefined;
export type Act = (
  action: 'submit' | 'cancel',
  params?: { entry: Value },
) => void;
export type Key = {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  preventDefault(): void;
};
export type KeyTarget = 'content' | 'footer' | 'button';

export const sanitizeMultiline = (value: string) =>
  value.replace(/(\n|\r\n){3,}/g, '\n\n');
export const removeAllSkiplines = (value: string) =>
  value.replace(/[\r\n]+/g, '');
// Deliberately the ordered comparisons used by tgui-core 4.3.3, not
// Math.min/Math.max: reversed bounds and NaN have observably different behavior.
export const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;
export const isEscape = (key: string) => key === 'Escape' || key === 'Esc';

/** Parent modal state only. Native validity and editor buffers belong to the view. */
export function createController(
  kind: Kind,
  initial: Data,
  act: Act,
  onClose: () => void = () => {},
) {
  assertDisconnected();
  let data = { ...initial };
  let value: Value =
    kind === 'number' ? initial.init_value : initial.placeholder || '';
  let isValid = true;
  let closed = false;
  const listeners = new Set<() => void>();
  function project() {
    const minValue = data.min_value === undefined ? 0 : data.min_value;
    const maxValue = data.max_value === undefined ? 10000 : data.max_value;
    const message = data.message === undefined ? '' : data.message;
    const text = kind === 'text' ? (value as string) : '';
    const visualMultiline = !!data.multiline || text.length >= 30;
    const count =
      data.max_length! > 0 && data.max_length! <= 10000
        ? `${text.length} / ${data.max_length}`
        : `${text.length} characters`;
    let windowHeight =
      kind === 'number'
        ? 205 +
          Math.min(160, Math.ceil(message.length / 50) * 22) +
          (message.length && data.large_buttons ? 5 : 0)
        : 210 +
          Math.min(160, Math.max(22, Math.ceil(message.length / 55) * 22)) +
          (data.multiline ? 225 : visualMultiline ? 80 : 0) +
          (message.length && data.large_buttons ? 5 : 0) +
          (data.preview_leadin ? 30 : 0);
    if (kind === 'text' && data.bigmodal) windowHeight = 560;
    return {
      kind,
      data,
      value,
      isValid,
      closed,
      minValue,
      maxValue,
      step: data.round_value ? 1 : 0.01,
      visualMultiline,
      count,
      preview: data.preview_leadin
        ? `${data.preview_leadin} ${text.trim() || '...'}`
        : null,
      windowWidth:
        kind === 'text'
          ? data.bigmodal
            ? 620
            : data.multiline
              ? 560
              : 480
          : 480,
      windowHeight,
      timeoutVisible: !!data.timeout,
      submitDisabled: kind === 'number' && !isValid,
      minDisabled: value === minValue || minValue === -Infinity,
      maxDisabled: value === maxValue || maxValue === Infinity,
      decreaseDisabled: !isValid || (value as number) <= minValue,
      increaseDisabled: !isValid || (value as number) >= maxValue,
      resetDisabled: value === data.init_value,
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
  function setValue(next: Value) {
    if (!allowed()) return;
    if (kind === 'text') {
      if (typeof next !== 'string')
        throw TypeError('Text input requires a string.');
      if (next === value) return;
      value = data.multiline
        ? sanitizeMultiline(next)
        : removeAllSkiplines(next);
    } else {
      if (typeof next !== 'number' && next !== undefined)
        throw TypeError('Number input requires a number or undefined.');
      value = next;
    }
    notify();
  }
  function emit(action: Parameters<Act>[0], params?: Parameters<Act>[1]) {
    if (allowed()) act(action, params);
  }
  const controller = {
    snapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    deliver: (patch: Partial<Data>) => {
      if (!allowed()) return;
      data = { ...data, ...patch };
      notify();
    },
    setValue,
    validate: (valid: boolean) => {
      if (!allowed() || kind !== 'number' || valid === isValid) return;
      isValid = valid;
      notify();
    },
    adjust: (direction: number) => {
      if (!allowed() || kind !== 'number') return;
      if (direction < 0 ? state.decreaseDisabled : state.increaseDisabled)
        return;
      setValue(
        clamp(
          Math.round(((value as number) + direction * state.step) * 100) / 100,
          state.minValue,
          state.maxValue,
        ),
      );
    },
    min: () => {
      if (kind === 'number' && !state.minDisabled)
        setValue(state.minValue ?? 0);
    },
    max: () => {
      if (kind === 'number' && !state.maxDisabled)
        setValue(state.maxValue ?? 10000);
    },
    reset: () => {
      if (kind === 'number' && !state.resetDisabled)
        setValue(data.init_value ?? 0);
    },
    submit: () => {
      if (!state.submitDisabled) emit('submit', { entry: value });
    },
    cancel: () => emit('cancel'),
    key: (event: Key, target: KeyTarget = 'content') => {
      if (!allowed()) return;
      if (kind === 'text') {
        if (isEscape(event.key)) {
          event.preventDefault();
          emit('cancel');
          return;
        }
        if (target === 'footer') return;
        if (
          event.key === 'Enter' &&
          (!state.visualMultiline || !event.shiftKey)
        ) {
          event.preventDefault();
          controller.submit();
        }
      } else {
        if (target === 'button' || target === 'footer') {
          if (isEscape(event.key)) emit('cancel');
          return;
        }
        if (event.key === 'Enter' && isValid) {
          event.preventDefault();
          controller.submit();
        }
        if (isEscape(event.key)) emit('cancel');
      }
    },
    close: () => {
      if (!allowed()) return;
      closed = true;
      notify();
      onClose();
    },
  };
  return controller;
}
export type Controller = ReturnType<typeof createController>;

/** Child Button key handling; parent key() must still receive the bubble. */
export function controlKey(event: Key, action: () => void, disabled = false) {
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
    event.preventDefault();
    if (!disabled) action();
  } else if (isEscape(event.key)) event.preventDefault();
}
