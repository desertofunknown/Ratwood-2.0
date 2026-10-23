import { fixtures as confirmationFixtures } from '../../alert-prompt/fixtures';
import {
  type Act as ConfirmationAct,
  type Controller as ConfirmationController,
  createController as createConfirmationController,
} from '../../alert-prompt/model';
import {
  type Act as SelectionAct,
  type Controller as SelectionController,
  createController as createSelectionController,
} from '../../selection-prompt/model';
import {
  sampleData as selectionData,
  scenarios as selectionScenarios,
  type Scenario as SelectionScenario,
} from '../../selection-prompt/sample';
import {
  sampleData as valueData,
  scenarios as valueScenarios,
  type Scenario as ValueScenario,
} from '../../value-prompts/fixtures';
import {
  type Act as ValueAct,
  type Controller as ValueController,
  createController as createValueController,
} from '../../value-prompts/model';
import type { SessionContext } from '../contracts';

export const dialogKinds = [
  'selection',
  'text',
  'number',
  'confirmation',
] as const;
export type DialogKind = (typeof dialogKinds)[number];
export type DialogSample = Readonly<{ kind: DialogKind; scenario: string }>;
export const dialogSamples: Readonly<Record<DialogKind, readonly string[]>> =
  Object.freeze({
    selection: Object.freeze([...selectionScenarios]),
    text: Object.freeze([...valueScenarios]),
    number: Object.freeze([...valueScenarios]),
    confirmation: Object.freeze(Object.keys(confirmationFixtures)),
  });

type Active<Kind extends DialogKind, Controller> = Readonly<{
  kind: Kind;
  scenario: string;
  epoch: number;
  controller: Controller;
}>;
export type ActiveDialog =
  | Active<'selection', SelectionController>
  | Active<'text', ValueController>
  | Active<'number', ValueController>
  | Active<'confirmation', ConfirmationController>;
type Action<
  Kind extends DialogKind,
  Act extends SelectionAct | ValueAct | ConfirmationAct,
> = Readonly<{
  kind: Kind;
  epoch: number;
  action: Parameters<Act>[0];
  params?: Parameters<Act>[1];
}>;
export type DialogAction =
  | Action<'selection', SelectionAct>
  | Action<'text', ValueAct>
  | Action<'number', ValueAct>
  | Action<'confirmation', ConfirmationAct>;
export type DialogCloseReason =
  | 'titlebar'
  | 'acknowledged'
  | 'dismissed'
  | 'replaced'
  | 'retired'
  | 'boundary-error';
export type DialogSnapshot = Readonly<{
  active: ActiveDialog | null;
  /** Only the newest 20 commands are retained; the count covers this visit. */
  actions: readonly DialogAction[];
  actionCount: number;
  closeReason: DialogCloseReason | null;
}>;
export type DialogController = {
  snapshot(): DialogSnapshot;
  subscribe(notify: () => void): () => void;
  open(kind: DialogKind, scenario?: string): void;
  /** Sample acknowledgement, not a manufactured Cancel or native close. */
  acknowledge(): void;
  dismiss(): void;
  /** Only delivers the existing fraction; never starts a countdown. */
  deliverTimeout(value: number): void;
  retire(): void;
};
type OwnedDialog = {
  active: ActiveDialog;
  retire(): void;
};

/** One local prompt capability at a time, independently of view commit timing. */
export function createDialogController(
  context: SessionContext,
  initial?: DialogSample,
): DialogController {
  context.validateBoundary();
  let retired = false;
  let epoch = 0;
  let revision = 0;
  let owned: OwnedDialog | null = null;
  let actions: readonly DialogAction[] = Object.freeze([]);
  let actionCount = 0;
  let closeReason: DialogCloseReason | null = null;
  const listeners = new Set<(terminal?: boolean) => void>();
  const current = () => !retired && context.lease.isCurrent();
  let snapshot: DialogSnapshot;
  const updateSnapshot = () => {
    snapshot = Object.freeze({
      active: owned?.active ?? null,
      actions,
      actionCount,
      closeReason,
    });
  };
  const report = (error: unknown) => {
    try {
      context.lifecycle.error(error);
    } catch {
      // Reporting must not retain another prompt's capabilities.
    }
  };
  const attempt = (cleanup: () => void) => {
    try {
      cleanup();
    } catch (error) {
      report(error);
    }
  };
  const publish = () => {
    updateSnapshot();
    for (const notify of [...listeners]) attempt(notify);
  };
  const retire = (reason: 'retired' | 'boundary-error') => {
    if (retired) return;
    retired = true;
    revision++;
    closeReason = reason;
    const previous = owned;
    owned = null;
    const terminalListeners = reason === 'boundary-error' ? [...listeners] : [];
    listeners.clear();
    previous?.retire();
    updateSnapshot();
    // Endpoint loss must also remove the still-mounted local subtree. All
    // capabilities and raw observers are revoked before this one terminal
    // notification. Ordinary route/root retirement stays silent.
    for (const notify of terminalListeners) attempt(() => notify(true));
  };
  const validateBoundary = () => {
    try {
      context.validateBoundary();
    } catch (error) {
      // Retire before reporting so diagnostics cannot revive a stale prompt.
      const firstFailure = !retired;
      retire('boundary-error');
      if (firstFailure) report(error);
      throw error;
    }
  };
  const boundaryCurrent = () => {
    if (!current()) return false;
    try {
      validateBoundary();
      return current();
    } catch {
      return false;
    }
  };
  const finish = (reason: 'titlebar' | 'acknowledged' | 'dismissed') => {
    if (!owned) return;
    const transition = ++revision;
    const previous = owned;
    owned = null;
    closeReason = reason;
    previous.retire();
    if (transition === revision) publish();
  };

  function createOwned(kind: DialogKind, scenario: string): OwnedDialog {
    const dialogEpoch = ++epoch;
    let alive = true;
    let cleaning = false;
    let source: SelectionController | ValueController | ConfirmationController;
    let result: OwnedDialog;
    const subscriptions = new Set<() => void>();
    const isCurrent = () => alive && current() && owned === result;
    const allowed = () => isCurrent() && boundaryCurrent() && isCurrent();
    const validateModelBoundary = () => {
      // Private teardown only changes an already-revoked local model. It must
      // neither inspect a replacement endpoint nor emit a close/action.
      if (!cleaning) validateBoundary();
    };
    const gate =
      <Args extends unknown[]>(method: (...args: Args) => void) =>
      (...args: Args) => {
        if (!allowed()) return;
        try {
          method(...args);
        } catch (error) {
          // Boundary loss is already reported and retired. Other model errors
          // (for example, a wrong value type) retain their original behavior.
          if (!retired) throw error;
        }
      };
    const subscribe = (notify: () => void) => {
      if (!allowed()) return () => {};
      let subscribed = true;
      const unsubscribe = source.subscribe(() => {
        // A failed view observer cannot prevent the raw model's later onClose
        // callback or keep the next observer from seeing its state.
        if (subscribed && allowed()) attempt(notify);
      });
      const cleanup = () => {
        if (!subscribed) return;
        subscribed = false;
        subscriptions.delete(cleanup);
        unsubscribe();
      };
      subscriptions.add(cleanup);
      return cleanup;
    };
    const record = (command: DialogAction) => {
      if (!allowed()) return;
      const entry = Object.freeze({
        ...command,
        ...(command.params === undefined
          ? {}
          : { params: Object.freeze({ ...command.params }) }),
      }) as DialogAction;
      actions = Object.freeze([...actions.slice(-19), entry]);
      actionCount++;
      publish();
    };
    const close = () => {
      if (allowed()) finish('titlebar');
    };
    let active: ActiveDialog;
    if (kind === 'selection') {
      const raw = createSelectionController(
        selectionData(scenario as SelectionScenario),
        (action, params) =>
          record({ kind, epoch: dialogEpoch, action, params }),
        close,
        validateModelBoundary,
      );
      source = raw;
      const controller: SelectionController = {
        snapshot: raw.snapshot,
        subscribe,
        deliver: gate(raw.deliver),
        select: gate(raw.select),
        query: gate(raw.query),
        toggleSearch: gate(raw.toggleSearch),
        submit: gate(raw.submit),
        submitEntry: gate(raw.submitEntry),
        cancel: gate(raw.cancel),
        preview: gate(raw.preview),
        key: gate(raw.key),
        close: gate(raw.close),
      };
      active = Object.freeze({
        kind,
        scenario,
        epoch: dialogEpoch,
        controller: Object.freeze(controller),
      });
    } else if (kind === 'confirmation') {
      const fixture = confirmationFixtures[scenario];
      const raw = createConfirmationController(
        {
          ...fixture,
          ...(fixture.buttons === undefined
            ? {}
            : { buttons: [...fixture.buttons] }),
        },
        (action, params) =>
          record({ kind, epoch: dialogEpoch, action, params }),
        close,
        validateModelBoundary,
      );
      source = raw;
      const controller: ConfirmationController = {
        getSnapshot: raw.getSnapshot,
        subscribe,
        deliver: gate(raw.deliver),
        close: gate(raw.close),
        focus: gate(raw.focus),
        choose: gate(raw.choose),
        keyDown: gate(raw.keyDown),
      };
      active = Object.freeze({
        kind,
        scenario,
        epoch: dialogEpoch,
        controller: Object.freeze(controller),
      });
    } else {
      const raw = createValueController(
        kind,
        valueData(kind, scenario as ValueScenario),
        (action, params) =>
          record({ kind, epoch: dialogEpoch, action, params }),
        close,
        validateModelBoundary,
      );
      source = raw;
      const controller: ValueController = {
        snapshot: raw.snapshot,
        subscribe,
        deliver: gate(raw.deliver),
        setValue: gate(raw.setValue),
        validate: gate(raw.validate),
        adjust: gate(raw.adjust),
        min: gate(raw.min),
        max: gate(raw.max),
        reset: gate(raw.reset),
        submit: gate(raw.submit),
        cancel: gate(raw.cancel),
        key: gate(raw.key),
        close: gate(raw.close),
      };
      active = Object.freeze({
        kind,
        scenario,
        epoch: dialogEpoch,
        controller: Object.freeze(controller),
      });
    }
    result = {
      active,
      retire() {
        if (!alive) return;
        alive = false;
        for (const cleanup of [...subscriptions]) attempt(cleanup);
        cleaning = true;
        try {
          attempt(source.close);
        } finally {
          cleaning = false;
        }
      },
    };
    return result;
  }

  function open(
    kind: DialogKind,
    scenario = dialogSamples[kind]?.[0],
    unpublishedLease = false,
  ) {
    if (!scenario || !dialogSamples[kind]?.includes(scenario)) {
      throw new Error(`Unknown local ${kind} dialog sample: ${scenario}`);
    }
    const transition = ++revision;
    const previous = owned;
    owned = null;
    previous?.retire();
    if (transition !== revision || retired) return;
    closeReason = previous ? 'replaced' : null;
    const next = createOwned(kind, scenario);
    // Validation can synchronously retire this owner or request a newer prompt.
    // An unpublished candidate never supersedes that newer intent.
    if (
      transition !== revision ||
      retired ||
      (!unpublishedLease && !current())
    ) {
      next.retire();
      if (transition === revision && !retired) retire('retired');
      return;
    }
    owned = next;
    publish();
  }
  updateSnapshot();
  // Session construction precedes lease publication, so this optional initial
  // fixture is constructed directly rather than through an active-view gate.
  if (initial) open(initial.kind, initial.scenario, true);
  return Object.freeze({
    snapshot: () => snapshot,
    subscribe(notify: () => void) {
      if (!current()) return () => {};
      let subscribed = true;
      const listener = (terminal = false) => {
        if (
          subscribed &&
          (current() || (terminal && context.lease.isCurrent()))
        ) {
          notify();
        }
      };
      listeners.add(listener);
      return () => {
        subscribed = false;
        listeners.delete(listener);
      };
    },
    open(kind: DialogKind, scenario?: string) {
      const transition = revision;
      if (!boundaryCurrent() || transition !== revision) return;
      try {
        open(kind, scenario);
      } catch (error) {
        if (!retired) throw error;
      }
    },
    acknowledge() {
      const transition = revision;
      if (boundaryCurrent() && transition === revision) finish('acknowledged');
    },
    dismiss() {
      const transition = revision;
      if (boundaryCurrent() && transition === revision) finish('dismissed');
    },
    deliverTimeout(value: number) {
      const transition = revision;
      if (!boundaryCurrent() || transition !== revision) return;
      const active = owned?.active;
      if (!active) return;
      if (active.kind === 'confirmation') {
        active.controller.deliver({
          ...active.controller.getSnapshot().data,
          timeout: value,
        });
      } else {
        active.controller.deliver({ timeout: value });
      }
    },
    retire: () => retire('retired'),
  });
}
