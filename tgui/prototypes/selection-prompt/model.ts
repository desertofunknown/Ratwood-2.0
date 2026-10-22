import { assertDisconnected } from './network-guard';
export type Data = {
  items: string[];
  init_value?: string | number;
  title?: string;
  message?: string;
  enable_preview?: boolean;
  previewing?: boolean;
  timeout?: number;
  large_buttons?: boolean;
  swapped_buttons?: boolean;
};
export type Act = (
  action: 'submit' | 'cancel' | 'preview_toggle',
  params?: { entry: string | undefined },
) => void;
export type Key = {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  preventDefault(): void;
};
export function createController(
  initial: Data,
  act: Act,
  onClose: () => void = () => {},
) {
  assertDisconnected();
  let data = initial,
    selection = initial.init_value;
  let searchBarVisible = initial.items.length > 8,
    searchQuery = '',
    searchFocus = 0,
    closed = false;
  let shortcut: { key: string; selection: string } | null = null;
  const listeners = new Set<() => void>();
  function project() {
    const filteredItems = data.items.filter((item) =>
      item.toLowerCase().includes(searchQuery.toLowerCase()),
    );
    const selected = Math.max(0, filteredItems.indexOf(selection as string));
    return {
      data,
      selection,
      searchBarVisible,
      searchQuery,
      searchFocus,
      closed,
      filteredItems,
      selected,
      selectedItem: filteredItems[selected],
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
  function select(item: string) {
    if (!allowed()) return;
    shortcut = null;
    selection = item;
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
      if (patch.items && patch.items !== data.items) shortcut = null;
      data = { ...data, ...patch };
      notify();
    },
    select,
    query: (value: string) => {
      if (!allowed()) return;
      if (searchQuery !== value) shortcut = null;
      searchQuery = value;
      notify();
    },
    toggleSearch: () => {
      if (!allowed()) return;
      searchBarVisible = !searchBarVisible;
      searchQuery = '';
      shortcut = null;
      notify();
    },
    submit: () => {
      if (state.selectedItem !== undefined)
        emit('submit', { entry: state.selectedItem });
    },
    submitEntry: (entry: string) => emit('submit', { entry }),
    cancel: () => emit('cancel'),
    preview: () => {
      if (
        data.enable_preview &&
        (data.previewing || state.selectedItem !== undefined)
      )
        emit('preview_toggle', { entry: state.selectedItem ?? data.items[0] });
    },
    key: (event: Key, target: 'content' | 'search' | 'control' = 'content') => {
      if (!allowed()) return;
      const key = normalizedKey(event.key);
      if (key === 'Escape') {
        event.preventDefault();
        emit('cancel');
        return;
      }
      if (target === 'control') return;
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        event.preventDefault();
        if (state.filteredItems.length)
          select(
            state.filteredItems[
              (state.selected +
                (key === 'ArrowDown' ? 1 : -1) +
                state.filteredItems.length) %
                state.filteredItems.length
            ],
          );
      } else if (key === 'Enter') {
        event.preventDefault();
        controller.submit();
      } else if (
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        /^[a-z0-9]$/i.test(key) &&
        target !== 'search'
      ) {
        event.preventDefault();
        if (searchBarVisible) {
          if (searchQuery !== key) shortcut = null;
          searchQuery = key;
          searchFocus++;
          notify();
        } else {
          const letter = key.toLowerCase();
          const matches = [
            ...new Set(
              data.items.filter((item) =>
                item.toLowerCase().startsWith(letter),
              ),
            ),
          ];
          const repeat =
            shortcut?.key === letter && shortcut.selection === selection;
          const index = repeat
            ? (matches.indexOf(selection as string) + 1) % matches.length
            : 0;
          const match = matches[index];
          shortcut =
            match === undefined ? null : { key: letter, selection: match };
          if (match !== undefined) {
            selection = match;
            notify();
          }
        }
      }
    },
    close: () => {
      if (!allowed()) return;
      closed = true;
      shortcut = null;
      notify();
      onClose();
    },
  };
  return controller;
}
export type Controller = ReturnType<typeof createController>;
export function targetKind(target: EventTarget | null) {
  const node = target as HTMLElement;
  if (node.closest('[data-control]')) return 'control' as const;
  return node.matches('input') ? ('search' as const) : ('content' as const);
}
export const label = (item: string) =>
  item.replace(/^\w/, (c) => c.toUpperCase());

/** Match tgui-core Button keydown activation, suppressing native double activation. */
export function controlKey(event: Key, action: () => void, disabled = false) {
  const key = normalizedKey(event.key);
  if (key === 'Enter' || key === ' ') {
    event.preventDefault();
    if (!disabled) action();
  } else if (key === 'Escape') {
    event.preventDefault();
  }
}

/** Relevant legacy aliases normalized by production React SyntheticKeyboardEvent. */
function normalizedKey(key: string) {
  return (
    (
      {
        Esc: 'Escape',
        Up: 'ArrowUp',
        Down: 'ArrowDown',
        Spacebar: ' ',
      } as Record<string, string>
    )[key] ?? key
  );
}
