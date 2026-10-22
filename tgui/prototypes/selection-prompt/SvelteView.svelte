<script lang="ts">
  import {onMount, untrack} from '../crafting-workbench/svelte/node_modules/svelte/src/index-client.js';
  import {type Controller, label, targetKind, controlKey} from './model';
  let {controller}:{controller:Controller} = $props();
  let s = $state(untrack(() => controller.snapshot()));
  let search = $state<HTMLInputElement>(), body = $state<HTMLDivElement>();
  onMount(() => controller.subscribe(() => s = controller.snapshot()));
  let previousVisible: boolean | undefined, previousFocus = -1;
  $effect(() => {
    const visible=s.searchBarVisible, focus=s.searchFocus;
    if (visible !== previousVisible || focus !== previousFocus) {
      previousVisible=visible; previousFocus=focus;
      untrack(() => {if (visible) search?.focus(); else body?.focus();});
    }
  });
  $effect(() => { const selected=s.selected, query=s.searchQuery; untrack(() => body?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView?.({block:'nearest'})); });
</script>
{#if !s.closed}
<section class="TithewoodSurface SelectionPrompt" aria-label="Selection prompt">
  <header class="SelectionPrompt__titlebar"><div><p class="SelectionPrompt__eyebrow">Tithewood / selection study</p><h1>{s.data.title ?? 'Select'}</h1></div><button type="button" class="TithewoodControl" data-testid="close" aria-label="Close sample window" onclick={controller.close}>×</button></header>
  {#if s.data.timeout}<progress data-testid="timeout" class="SelectionPrompt__timeout" aria-label="Delivered time remaining" max="1" value={Math.min(1,Math.max(0,s.data.timeout))}></progress>{/if}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions (Container handles bubbled selection keys; row and footer controls retain their roles.) -->
  <div bind:this={body} data-testid="content" class="SelectionPrompt__body" role="group" tabindex="-1" onkeydown={e => controller.key(e,targetKind(e.target))}>
    <div class="SelectionPrompt__prompt"><p data-testid="prompt">{s.data.message ?? ''}</p><button type="button" data-control data-testid="search-toggle" class="TithewoodControl" aria-pressed={s.searchBarVisible} title={s.searchBarVisible ? 'Hide search; use letters to jump to choices' : 'Search choices'} onkeydown={e => controlKey(e, controller.toggleSearch, false)} onclick={controller.toggleSearch}>Search</button></div>
    {#if s.searchBarVisible}<label class="SelectionPrompt__search">Search choices{#key s.searchFocus}<input bind:this={search} class="TithewoodControl" data-testid="search" placeholder="Search choices..." value={s.searchQuery} onkeydown={e => {if (e.key === "Enter" || e.key === "Escape" || e.key === "Esc") {e.preventDefault(); e.currentTarget.blur();}}} oninput={e => controller.query(e.currentTarget.value)}/>{/key}</label>{/if}
    <div class="SelectionPrompt__choices" aria-label="Choices">
      {#each s.filteredItems as item,index (index)}
        <div role="button" tabindex="0" data-testid="option" data-entry={item} data-index={index} class="SelectionPrompt__option" aria-pressed={index===s.selected} onfocus={() => controller.select(item)} onclick={() => controller.select(item)} onkeydown={() => {}} ondblclick={e => {e.preventDefault(); controller.submitEntry(item);}}><span aria-hidden="true">{index===s.selected?'✓':'◇'}</span><span>{label(item)}</span></div>
      {:else}<p class="SelectionPrompt__empty">No choices match your search.</p>{/each}
    </div>
    <p class="SelectionPrompt__hint">{s.filteredItems.length} {s.filteredItems.length===1?'choice':'choices'} · ↑ ↓ to navigate · Enter to confirm</p>
    <footer data-control class={`SelectionPrompt__footer${s.data.large_buttons?' SelectionPrompt__footer--large':''}`}>
      {#if s.data.enable_preview}<button type="button" data-testid="preview" class="TithewoodControl" disabled={!s.data.previewing && s.selectedItem===undefined} onkeydown={e => controlKey(e, controller.preview, !s.data.previewing && s.selectedItem === undefined)} onclick={controller.preview}>{s.data.previewing?'Stop':'Listen'}</button>{/if}
      <div class={`SelectionPrompt__buttons${s.data.swapped_buttons?' SelectionPrompt__buttons--swapped':''}`}><button type="button" data-testid="confirm" class="TithewoodControl" disabled={s.selectedItem===undefined} onkeydown={e => controlKey(e, controller.submit, s.selectedItem === undefined)} onclick={controller.submit}>Confirm</button><button type="button" data-testid="cancel" class="TithewoodControl" onkeydown={e => controlKey(e, controller.cancel, false)} onclick={controller.cancel}>Cancel</button></div>
    </footer>
  </div>
</section>
{/if}
