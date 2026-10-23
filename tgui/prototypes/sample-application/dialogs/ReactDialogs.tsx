import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';

import { fixtures as confirmationFixtures } from '../../alert-prompt/fixtures';
import { ReactView as ConfirmationView } from '../../alert-prompt/ReactView';
import { ReactView as SelectionView } from '../../selection-prompt/ReactView';
import { ReactView as ValueView } from '../../value-prompts/ReactView';
import type { ScreenLease } from '../contracts';
import {
  type DialogController,
  type DialogKind,
  dialogKinds,
  dialogSamples,
} from './controller';

const families: Record<
  DialogKind,
  { label: string; samples: Record<string, string> }
> = {
  selection: {
    label: 'Selection',
    samples: {
      small: 'Exact names',
      search: 'Search list',
      empty: 'No choices',
    },
  },
  text: {
    label: 'Text',
    samples: { default: 'Short text', multiline: 'Multiline text' },
  },
  number: {
    label: 'Number',
    samples: { default: 'Whole number', fractional: 'Fractional number' },
  },
  confirmation: {
    label: 'Confirmation',
    samples: {
      default: 'Three choices',
      exact: 'Exact choices',
      verbose: 'Long choices',
      timeout: 'Delivered timeout',
    },
  },
};

/** Own only presentation and launcher focus; the source views stay unchanged. */
export function ReactDialogs({
  controller,
  lease,
}: {
  controller: DialogController;
  lease: ScreenLease;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const container = useRef<HTMLElement>(null);
  const origin = useRef<
    { epoch: number; element: HTMLButtonElement } | undefined
  >(undefined);
  const active = state.active;
  const lastCommand = state.actions.at(-1);
  const pending = active
    ? state.actions.some((command) => command.epoch === active.epoch)
    : false;

  useLayoutEffect(() => {
    if (active) {
      // A programmatic replacement has no initiating launcher to restore.
      if (origin.current?.epoch !== active.epoch) origin.current = undefined;
      return;
    }
    const launcher = origin.current;
    origin.current = undefined;
    if (
      launcher &&
      (state.closeReason === 'titlebar' ||
        state.closeReason === 'acknowledged') &&
      lease.isCurrent() &&
      container.current?.isConnected &&
      launcher.element.isConnected
    ) {
      launcher.element.focus();
    }
  }, [active, state.closeReason, lease]);

  function launch(
    kind: DialogKind,
    scenario: string,
    element: HTMLButtonElement,
  ) {
    controller.open(kind, scenario);
    const next = controller.snapshot().active;
    origin.current =
      next?.kind === kind && next.scenario === scenario
        ? { epoch: next.epoch, element }
        : undefined;
  }

  function deliverChoices(scenario: 'default' | 'verbose' | 'exact') {
    const current = controller.snapshot().active;
    if (current?.kind !== 'confirmation') return;
    const fixture = confirmationFixtures[scenario];
    current.controller.deliver({
      ...fixture,
      buttons: [...(fixture.buttons ?? [])],
    });
  }

  return (
    <section
      ref={container}
      className="TithewoodSurface SampleDialogs"
      aria-label="Disconnected prompt samples"
      data-dialog-screen
    >
      <p className="SampleDialogs__disclosure">
        Authored samples only. One prompt is open at a time; opening another
        replaces it. Commands are recorded locally, never sent to the game or
        saved. Confirm and Cancel keep the prompt open until acknowledgement.
        Titlebar Close dismisses without recording Cancel.
      </p>

      <div className="SampleDialogs__launchers">
        {dialogKinds.map((kind) => (
          <fieldset key={kind} className="SampleDialogs__family">
            <legend>{families[kind].label}</legend>
            {dialogSamples[kind]
              .filter((scenario) => families[kind].samples[scenario])
              .map((scenario) => (
                <button
                  key={scenario}
                  type="button"
                  className="TithewoodControl"
                  data-sample-id={`${kind}-${scenario}`}
                  data-active-sample={
                    active?.kind === kind && active.scenario === scenario
                  }
                  aria-label={`Open ${families[kind].label.toLowerCase()}: ${families[kind].samples[scenario]}`}
                  onClick={(event) =>
                    launch(kind, scenario, event.currentTarget)
                  }
                >
                  {families[kind].samples[scenario]}
                </button>
              ))}
          </fieldset>
        ))}
      </div>

      <div className="SampleDialogs__delivery">
        <div className="SampleDialogs__deliveryActions">
          <span>Delivered time remaining</span>
          {([0.75, 0.25, 0] as const).map((fraction) => (
            <button
              key={fraction}
              type="button"
              className="TithewoodControl"
              data-dialog-timeout={fraction}
              disabled={!active}
              onClick={() => controller.deliverTimeout(fraction)}
            >
              {fraction * 100}%
            </button>
          ))}
          <button
            type="button"
            className="TithewoodControl"
            data-dialog-acknowledge
            disabled={!active}
            onClick={controller.acknowledge}
          >
            Acknowledge and dispose
          </button>
        </div>
        <p className="SampleDialogs__hint">
          These values are delivered manually, not a running countdown. Zero
          hides the indicator; it does not close the prompt.
        </p>
        {active?.kind === 'confirmation' && (
          <div className="SampleDialogs__deliveryActions">
            <span>Deliver choices to this prompt</span>
            {(['default', 'verbose', 'exact'] as const).map((scenario) => (
              <button
                key={scenario}
                type="button"
                className="TithewoodControl"
                data-dialog-choices={scenario}
                onClick={() => deliverChoices(scenario)}
              >
                {scenario === 'default'
                  ? 'Compact'
                  : scenario === 'verbose'
                    ? 'Long labels'
                    : 'Exact labels'}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="SampleDialogs__status" role="status" data-dialog-status>
        {active
          ? `${families[active.kind].label} · ${active.scenario}. ${
              pending
                ? 'Local command recorded; awaiting explicit acknowledgement.'
                : 'No command recorded for this prompt.'
            }`
          : 'No prompt open. Choose a sample above.'}
      </p>
      <div className="SampleDialogs__stage" data-dialog-stage>
        {active ? (
          active.kind === 'selection' ? (
            <SelectionView key={active.epoch} controller={active.controller} />
          ) : active.kind === 'confirmation' ? (
            <ConfirmationView
              key={active.epoch}
              controller={active.controller}
            />
          ) : (
            <ValueView key={active.epoch} controller={active.controller} />
          )
        ) : (
          <p className="SampleDialogs__empty">
            Selection, text, number and confirmation prompts share this space.
            Their existing keyboard behavior is unchanged.
          </p>
        )}
      </div>

      <div className="SampleDialogs__record">
        <p>
          Local commands recorded:{' '}
          <strong data-dialog-command-count>{state.actionCount}</strong>
        </p>
        <p className="SampleDialogs__hint">
          Last local command (JSON display):
        </p>
        <pre data-dialog-last-command>
          {lastCommand
            ? JSON.stringify(lastCommand, null, 2)
            : 'No local commands recorded.'}
        </pre>
      </div>
    </section>
  );
}
