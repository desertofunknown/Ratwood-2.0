import { assertDisconnected } from './network-guard';

export type ToggleEntry = {
  id: string;
  label: string;
  enabled: boolean | 0 | 1;
  desc: string;
};
export type SelectOption = { label: string; value: string };
export type SelectEntry = {
  id: string;
  label: string;
  value: string;
  desc: string;
  options: SelectOption[];
};
export type SettingsCategory = {
  name: string;
  entries: ToggleEntry[];
  selects?: SelectEntry[];
};
export type SettingsData = { categories: SettingsCategory[] };
export type SettingsCommand =
  | ['toggle', { id: string }]
  | ['select', { id: string; value: string }];
export type SettingsAction = (...command: SettingsCommand) => void;
export type SettingsViewProps = {
  data: SettingsData;
  onToggle: (id: string) => void;
  onSelect: (id: string, value: string) => void;
};
export type DeliverData = (data: SettingsData) => void;
export type State = { open: boolean; data?: SettingsData };
export type Dependencies = {
  action: SettingsAction;
  subscribe: (deliver: DeliverData) => () => void;
};

/** Copy every delivered level, including same-reference nested changes. */
export function copyData(data: SettingsData): SettingsData {
  return {
    categories: data.categories.map((category) => ({
      ...category,
      entries: category.entries.map((entry) => ({ ...entry })),
      ...(category.selects === undefined
        ? {}
        : {
            selects: category.selects.map((entry) => ({
              ...entry,
              options: entry.options.map((option) => ({ ...option })),
            })),
          }),
    })),
  };
}

/** Local lifecycle only. Open/close are NOT backend commands. */
export function createController(
  deps: Dependencies,
  validateBoundary: () => void = assertDisconnected,
) {
  validateBoundary();
  let state: State = { open: false };
  let generation = 0;
  let unsubscribeDelivery: (() => void) | undefined;
  const subscribers = new Set<() => void>();
  const publish = (next: State) => {
    state = next;
    subscribers.forEach((notify) => notify());
  };
  const action: SettingsAction = (...command) => {
    validateBoundary();
    if (state.open) deps.action(...command);
  };
  return {
    snapshot: () => state,
    subscribe(notify: () => void) {
      subscribers.add(notify);
      return () => {
        subscribers.delete(notify);
      };
    },
    open() {
      validateBoundary();
      if (state.open) return;
      const session = ++generation;
      publish({ open: true });
      if (!state.open || generation !== session) return;
      const unsubscribe = deps.subscribe((data) => {
        validateBoundary();
        if (!state.open || generation !== session) return;
        // Same-session deliveries are authoritative, not fenced by invented IDs.
        publish({ open: true, data: copyData(data) });
      });
      if (!state.open || generation !== session) {
        unsubscribe();
        return;
      }
      unsubscribeDelivery = unsubscribe;
    },
    close() {
      validateBoundary();
      if (!state.open) return;
      ++generation;
      const unsubscribe = unsubscribeDelivery;
      unsubscribeDelivery = undefined;
      // Fence callbacks before cleanup can re-enter a delivery.
      publish({ open: false });
      unsubscribe?.();
    },
    toggle: (id: string) => action('toggle', { id }),
    select: (id: string, value: string) => action('select', { id, value }),
  };
}
export type Controller = ReturnType<typeof createController>;
