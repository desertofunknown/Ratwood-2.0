<script lang="ts">
  import { onMount, tick, untrack } from '../crafting-workbench/svelte/node_modules/svelte/src/index-client.js';
  import { controlKey, isEscape, type Controller } from './model';

  let { controller }: { controller: Controller } = $props();
  let s = $state(untrack(() => controller.snapshot()));
  let editor = $state<HTMLInputElement | HTMLTextAreaElement>();
  let numberDraft = $state(untrack(() => (s.value as number | undefined) ?? s.minValue));
  let textDraft = $state(untrack(() => (s.value as string) ?? ''));
  let localValid = $state(true);
  const parentValue = $derived(s.value);
  onMount(() => {
    const unsubscribe = controller.subscribe(() => s = controller.snapshot());
    const timer = setTimeout(() => { editor?.focus(); editor?.select(); }, 1);
    return () => { clearTimeout(timer); unsubscribe(); };
  });
  // Like the installed controls, delivery alone does not refresh the buffer.
  // A changed parent primitive only synchronizes while the editor is unfocused.
  $effect(() => {
    const value = parentValue;
    untrack(() => {
      if (!editor || document.activeElement === editor) return;
      if (s.kind === 'number' && value !== numberDraft) numberDraft = (value as number | undefined) ?? s.minValue;
      if (s.kind === 'text' && value !== textDraft) textDraft = (value as string) ?? '';
    });
  });
  // Native bounds updates are deliberately not dependencies of this effect.
  $effect(() => {
    numberDraft;
    let current = true;
    // Parent synchronization can change this draft in another effect. Wait for
    // that value to reach the DOM before consulting the native validity flags.
    void tick().then(() => {
      if (!current || s.kind !== 'number' || !editor) return;
      const valid = editor.validity.valid;
      if (localValid !== valid) { localValid = valid; controller.validate(valid); }
    });
    return () => { current = false; };
  });
  function input(event: Event) {
    const target = event.currentTarget as HTMLInputElement | HTMLTextAreaElement;
    if (s.kind === 'number') {
      const next = Number(target.value);
      numberDraft = next;
      controller.setValue(next);
      // React restores a controlled number after an empty edit even if state
      // remains zero and therefore does not produce another state render.
      if (target.value === '') target.value = String(next);
    } else {
      textDraft = target.value;
      controller.setValue(textDraft);
    }
  }
  function editorKey(event: KeyboardEvent) {
    const target = event.currentTarget as HTMLInputElement | HTMLTextAreaElement;
    if (s.kind === 'number') {
      if (event.key === 'Enter' || isEscape(event.key)) {
        event.preventDefault(); target.blur(); return;
      }
      if (event.key === '-') {
        event.preventDefault(); numberDraft = -1 * numberDraft;
        controller.setValue(numberDraft);
      }
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); target.blur(); return;
    }
    if (isEscape(event.key)) { target.blur(); return; }
    const marks: Record<string, string> = { u: '_', i: '|', b: '+' };
    const mark = marks[event.key];
    if ((event.ctrlKey || event.metaKey) && mark) {
      event.preventDefault();
      const { value, selectionStart, selectionEnd } = target as HTMLTextAreaElement;
      const next = `${value.substring(0, selectionStart)}${mark}${value.substring(selectionStart, selectionEnd)}${mark}${value.substring(selectionEnd)}`;
      textDraft = next;
      target.selectionEnd = selectionEnd + 2 * mark.length;
      controller.setValue(next);
    }
  }
  function blockedTransfer(event: Event) {
    if (!s.data.disable_paste) return;
    event.stopPropagation(); event.preventDefault();
  }
  function routeKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    controller.key(event, target.closest('.ValuePrompt__footer') ? 'footer' : target.closest('button') ? 'button' : 'content');
  }
</script>

{#if !s.closed}
  <section class={`TithewoodSurface ValuePrompt ValuePrompt--${s.kind}`} aria-label={s.kind === 'text' ? 'Text prompt' : 'Number prompt'} style:max-width={`${s.windowWidth}px`}>
    <header class="ValuePrompt__titlebar">
      <div><p class="ValuePrompt__eyebrow">Tithewood / value study</p><h1>{s.data.title ?? (s.kind === 'text' ? 'Enter text' : 'Enter number')}</h1></div>
      <button type="button" class="TithewoodControl" data-testid="close" aria-label="Close sample window" onclick={controller.close}>×</button>
    </header>
    {#if s.timeoutVisible}
      <div class="ValuePrompt__timeout"><div class="ValuePrompt__timeout-progress" data-testid="timeout" role="progressbar" aria-label="Delivered time remaining" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.min(1, Math.max(0, s.data.timeout!)) * 100} style:width={`${Math.min(1, Math.max(0, s.data.timeout!)) * 100}%`}></div></div>
    {/if}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions (This group routes bubbled editor and button keys.) -->
    <div class="ValuePrompt__body" role="group" onkeydown={routeKey}>
      <p class="ValuePrompt__prompt" data-testid="prompt">{s.data.message ?? ''}</p>
      {#if s.kind === 'number'}
        <div class="ValuePrompt__editor ValuePrompt__number">
          <button type="button" class="TithewoodControl" data-testid="min" aria-label="Minimum" title="Minimum" aria-disabled={s.minDisabled} tabindex={s.minDisabled ? -1 : 0} onkeydown={e => controlKey(e, controller.min, s.minDisabled)} onclick={() => { if (!s.minDisabled) controller.min(); }}>≪</button>
          <button type="button" class="TithewoodControl" data-testid="decrease" aria-label={`Decrease by ${s.step}`} title={`Decrease by ${s.step}`} aria-disabled={s.decreaseDisabled} tabindex={s.decreaseDisabled ? -1 : 0} onkeydown={e => controlKey(e, () => controller.adjust(-1), s.decreaseDisabled)} onclick={() => { if (!s.decreaseDisabled) controller.adjust(-1); }}>−</button>
          <input bind:this={editor} class={`Input RestrictedInput Input--fluid TithewoodControl${!localValid ? ' RestrictedInput--invalid' : ''}`} data-testid="input" aria-label="Number" type="number" autocomplete="off" spellcheck={false} min={s.minValue} max={s.maxValue} step={s.data.round_value ? '1' : 'any'} value={numberDraft} oninput={input} onkeydown={editorKey} />
          <button type="button" class="TithewoodControl" data-testid="increase" aria-label={`Increase by ${s.step}`} title={`Increase by ${s.step}`} aria-disabled={s.increaseDisabled} tabindex={s.increaseDisabled ? -1 : 0} onkeydown={e => controlKey(e, () => controller.adjust(1), s.increaseDisabled)} onclick={() => { if (!s.increaseDisabled) controller.adjust(1); }}>+</button>
          <button type="button" class="TithewoodControl" data-testid="max" aria-label="Maximum" title="Maximum" aria-disabled={s.maxDisabled} tabindex={s.maxDisabled ? -1 : 0} onkeydown={e => controlKey(e, controller.max, s.maxDisabled)} onclick={() => { if (!s.maxDisabled) controller.max(); }}>≫</button>
          <button type="button" class="TithewoodControl" data-testid="reset" aria-label="Reset to initial value" title="Reset to initial value" aria-disabled={s.resetDisabled} tabindex={s.resetDisabled ? -1 : 0} onkeydown={e => controlKey(e, controller.reset, s.resetDisabled)} onclick={() => { if (!s.resetDisabled) controller.reset(); }}>↺</button>
        </div>
      {:else}
        <!-- svelte-ignore a11y_no_static_element_interactions (Paste and drop suppression belongs to the editor wrapper.) -->
        <div class="ValuePrompt__editor ValuePrompt__text" style:height={s.data.bigmodal ? '300px' : s.data.multiline ? '225px' : s.visualMultiline ? '100px' : undefined} onpaste={blockedTransfer} ondrop={blockedTransfer}>
          <textarea bind:this={editor} class="Input TextArea Input--fluid TithewoodControl" data-testid="input" aria-label="Text" autocomplete="off" spellcheck={false} maxlength={s.data.max_length} placeholder="Type something..." style:height={s.visualMultiline ? '100%' : '2.8rem'} value={textDraft} oninput={input} onkeydown={editorKey}></textarea>
        </div>
        {#if s.preview !== null}<p class="ValuePrompt__hint" data-testid="preview">{s.preview}</p>{/if}
      {/if}
      <footer class={`ValuePrompt__footer${s.data.large_buttons ? ' ValuePrompt__footer--large' : ''}`} data-large-buttons={!!s.data.large_buttons} data-swapped-buttons={!!s.data.swapped_buttons} style:flex-direction={s.data.swapped_buttons ? 'row-reverse' : 'row'}>
        <button type="button" class="TithewoodControl" data-testid="confirm" aria-disabled={s.submitDisabled} tabindex={s.submitDisabled ? -1 : 0} title={s.kind === 'text' && s.data.large_buttons ? s.count : undefined} onkeydown={e => controlKey(e, controller.submit, s.submitDisabled)} onclick={() => { if (!s.submitDisabled) controller.submit(); }}>Confirm</button>
        {#if s.kind === 'text' && !s.data.large_buttons}<p class="ValuePrompt__hint" data-testid="count">{s.count}</p>{/if}
        <button type="button" class="TithewoodControl" data-testid="cancel" onkeydown={e => controlKey(e, controller.cancel)} onclick={controller.cancel}>Cancel</button>
      </footer>
    </div>
  </section>
{/if}
