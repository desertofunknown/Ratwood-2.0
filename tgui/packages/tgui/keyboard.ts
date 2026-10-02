import { releaseHeldKeys, startKeyPassthrough, stopKeyPassthrough } from 'tgui-core/hotkeys';

// Core handles inputs and textareas. Native selects and rich text also own typing.
export function setupKeyboardFocus() {
  let suppressed = false;
  const update = () => {
    const target = document.activeElement;
    const editing = target instanceof HTMLElement &&
      (target.tagName === 'SELECT' || target.isContentEditable);
    if (editing === suppressed) return;
    suppressed = editing;
    if (editing) {
      releaseHeldKeys();
      stopKeyPassthrough();
    } else {
      startKeyPassthrough();
    }
  };
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', () => queueMicrotask(update));
  // A focused node can be removed without emitting focusout.
  document.addEventListener('keydown', update, true);
  document.addEventListener('keyup', update, true);
}
