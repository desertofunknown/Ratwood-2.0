<script lang="ts">
  import { onMount, untrack } from '../../crafting-workbench/svelte/node_modules/svelte/src/index-client.js';
  import { fixtures as confirmationFixtures } from '../../alert-prompt/fixtures';
  import ConfirmationView from '../../alert-prompt/SvelteView.svelte';
  import SelectionView from '../../selection-prompt/SvelteView.svelte';
  import ValueView from '../../value-prompts/SvelteView.svelte';
  import type { ScreenLease } from '../contracts';
  import { type DialogController, type DialogKind, dialogKinds, dialogSamples } from './controller';

  let { controller, lease }: { controller: DialogController; lease: ScreenLease } = $props();
  let state = $state.raw(untrack(() => controller.snapshot()));
  let container = $state<HTMLElement>();
  let origin: { epoch: number; element: HTMLButtonElement } | undefined;
  const active = $derived(state.active);
  const lastCommand = $derived(state.actions.at(-1));
  const pending = $derived(active ? state.actions.some((command) => command.epoch === active.epoch) : false);

  const families: Record<DialogKind, { label: string; samples: Record<string, string> }> = {
    selection: { label: 'Selection', samples: { small: 'Exact names', search: 'Search list', empty: 'No choices' } },
    text: { label: 'Text', samples: { default: 'Short text', multiline: 'Multiline text' } },
    number: { label: 'Number', samples: { default: 'Whole number', fractional: 'Fractional number' } },
    confirmation: { label: 'Confirmation', samples: { default: 'Three choices', exact: 'Exact choices', verbose: 'Long choices', timeout: 'Delivered timeout' } },
  };
  const fractions = [0.75, 0.25, 0] as const;
  const choiceDeliveries = ['default', 'verbose', 'exact'] as const;

  onMount(() => {
    const unsubscribe = controller.subscribe(() => {
      state = controller.snapshot();
    });
    state = controller.snapshot();
    return () => {
      origin = undefined;
      unsubscribe();
    };
  });

  // Focus restoration belongs to dismissal, never component disposal. A fresh
  // launcher replaces the saved origin before the next prompt's effects run.
  $effect(() => {
    const current = active;
    const reason = state.closeReason;
    untrack(() => {
      if (current) {
        if (origin?.epoch !== current.epoch) origin = undefined;
        return;
      }
      const launcher = origin;
      origin = undefined;
      if (
        launcher &&
        (reason === 'titlebar' || reason === 'acknowledged') &&
        lease.isCurrent() &&
        container?.isConnected &&
        launcher.element.isConnected
      ) {
        launcher.element.focus();
      }
    });
  });

  function launch(kind: DialogKind, scenario: string, element: HTMLButtonElement) {
    controller.open(kind, scenario);
    const next = controller.snapshot().active;
    origin = next?.kind === kind && next.scenario === scenario
      ? { epoch: next.epoch, element }
      : undefined;
  }

  function deliverChoices(scenario: 'default' | 'verbose' | 'exact') {
    const current = controller.snapshot().active;
    if (current?.kind !== 'confirmation') return;
    const fixture = confirmationFixtures[scenario];
    current.controller.deliver({ ...fixture, buttons: [...(fixture.buttons ?? [])] });
  }
</script>

<section bind:this={container} class="TithewoodSurface SampleDialogs" aria-label="Disconnected prompt samples" data-dialog-screen>
  <p class="SampleDialogs__disclosure">
    Authored samples only. One prompt is open at a time; opening another replaces it.
    Commands are recorded locally, never sent to the game or saved. Confirm and Cancel
    keep the prompt open until acknowledgement. Titlebar Close dismisses without recording Cancel.
  </p>

  <div class="SampleDialogs__launchers">
    {#each dialogKinds as kind (kind)}
      <fieldset class="SampleDialogs__family">
        <legend>{families[kind].label}</legend>
        {#each dialogSamples[kind].filter((scenario) => families[kind].samples[scenario]) as scenario (scenario)}
          <button type="button" class="TithewoodControl" data-sample-id={`${kind}-${scenario}`} data-active-sample={active?.kind === kind && active.scenario === scenario} aria-label={`Open ${families[kind].label.toLowerCase()}: ${families[kind].samples[scenario]}`} onclick={(event) => launch(kind, scenario, event.currentTarget)}>{families[kind].samples[scenario]}</button>
        {/each}
      </fieldset>
    {/each}
  </div>

  <div class="SampleDialogs__delivery">
    <div class="SampleDialogs__deliveryActions">
      <span>Delivered time remaining</span>
      {#each fractions as fraction (fraction)}
        <button type="button" class="TithewoodControl" data-dialog-timeout={fraction} disabled={!active} onclick={() => controller.deliverTimeout(fraction)}>{fraction * 100}%</button>
      {/each}
      <button type="button" class="TithewoodControl" data-dialog-acknowledge disabled={!active} onclick={controller.acknowledge}>Acknowledge and dispose</button>
    </div>
    <p class="SampleDialogs__hint">These values are delivered manually, not a running countdown. Zero hides the indicator; it does not close the prompt.</p>
    {#if active?.kind === 'confirmation'}
      <div class="SampleDialogs__deliveryActions">
        <span>Deliver choices to this prompt</span>
        {#each choiceDeliveries as scenario (scenario)}
          <button type="button" class="TithewoodControl" data-dialog-choices={scenario} onclick={() => deliverChoices(scenario)}>{scenario === 'default' ? 'Compact' : scenario === 'verbose' ? 'Long labels' : 'Exact labels'}</button>
        {/each}
      </div>
    {/if}
  </div>

  <p class="SampleDialogs__status" role="status" data-dialog-status>{active ? `${families[active.kind].label} · ${active.scenario}. ${pending ? 'Local command recorded; awaiting explicit acknowledgement.' : 'No command recorded for this prompt.'}` : 'No prompt open. Choose a sample above.'}</p>
  <div class="SampleDialogs__stage" data-dialog-stage>
    {#if active}
      {#key active.epoch}
        {#if active.kind === 'selection'}
          <SelectionView controller={active.controller} />
        {:else if active.kind === 'confirmation'}
          <ConfirmationView controller={active.controller} />
        {:else}
          <ValueView controller={active.controller} />
        {/if}
      {/key}
    {:else}
      <p class="SampleDialogs__empty">Selection, text, number and confirmation prompts share this space. Their existing keyboard behavior is unchanged.</p>
    {/if}
  </div>

  <div class="SampleDialogs__record">
    <p>Local commands recorded: <strong data-dialog-command-count>{state.actionCount}</strong></p>
    <p class="SampleDialogs__hint">Last local command (JSON display):</p>
    <pre data-dialog-last-command>{lastCommand ? JSON.stringify(lastCommand, null, 2) : 'No local commands recorded.'}</pre>
  </div>
</section>
