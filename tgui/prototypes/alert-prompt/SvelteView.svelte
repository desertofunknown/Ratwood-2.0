<script lang="ts">
  import { onMount, untrack } from '../crafting-workbench/svelte/node_modules/svelte/src/index-client.js';
  import type { Controller } from './model';

  let { controller }: { controller: Controller } = $props();
  let s = $state(untrack(() => controller.getSnapshot()));
  let autofocusTarget = $state<HTMLDivElement>();
  const autofocusEnabled = $derived(!!s.data.autofocus);
  const closed = $derived(s.closed);
  onMount(() => {
    const unsubscribe = controller.subscribe(() => s = controller.getSnapshot());
    s = controller.getSnapshot();
    return unsubscribe;
  });
  // Autofocus mounts only on a false-to-true flag transition. A selection or
  // delivery must not refocus it, and selection never moves native focus.
  $effect(() => {
    if (!autofocusEnabled || closed) return;
    const timer = setTimeout(() => autofocusTarget?.focus(), 1);
    return () => clearTimeout(timer);
  });
</script>

{#if !s.closed}
  <section class="AlertPrompt TithewoodSurface" aria-label="Alert prompt" style:max-width={`${s.windowWidth}px`} data-window-height={s.windowHeight}>
    <header class="AlertPrompt__header">
      <div><p class="AlertPrompt__eyebrow">Tithewood / alert study</p><h1>{s.data.title ?? ''}</h1></div>
      <button type="button" class="TithewoodControl" data-alert-close aria-label="Close sample window" onclick={controller.close}>×</button>
    </header>
    {#if s.timeoutVisible}
      <!-- Only the delivered fraction is rendered. There is no local countdown. -->
      <div class="AlertPrompt__timeout"><div class="AlertPrompt__timeout-progress" data-alert-timeout role="progressbar" aria-label="Delivered time remaining" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.min(1, Math.max(0, s.data.timeout!)) * 100} style:width={`${Math.min(1, Math.max(0, s.data.timeout!)) * 100}%`}></div></div>
    {/if}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions (This group routes bubbled choice and autofocus keys.) -->
    <div class="AlertPrompt__content" data-alert-content role="group" tabindex="-1" onkeydown={controller.keyDown}>
      <p class="AlertPrompt__message" data-alert-message>{s.message}</p>
      <footer class="AlertPrompt__footer" data-verbose={s.verbose} data-reversed={!s.data.swapped_buttons} data-large-buttons={!!s.data.large_buttons} data-large={!!s.data.large_buttons}>
        {#if autofocusEnabled}<div class="AlertPrompt__autofocus" data-alert-autofocus bind:this={autofocusTarget} tabindex="-1"></div>{/if}
        {#key s.verbose}
        {#each s.buttons as label, index (index)}
          <button type="button" class="AlertPrompt__choice TithewoodControl" data-alert-choice={index} aria-label={label.trim().length === 0 ? `Empty choice ${index + 1}` : undefined} aria-pressed={s.selected === index} onfocus={() => controller.focus(index)} onclick={() => controller.choose(index)}>{label}</button>
        {/each}
        {/key}
      </footer>
    </div>
  </section>
{/if}
