<script lang="ts">
  import { onMount, untrack } from '../crafting-workbench/svelte/node_modules/svelte/src/index-client.js';
  import { type Controller, project } from './model';
  import credits from './credits.html' with { type: 'text' };

  let { controller }: { controller: Controller } = $props();
  let state = $state(untrack(() => controller.snapshot()));
  let view = $derived(project(state));
  let search: HTMLInputElement, entries: HTMLDivElement;

  onMount(() => {
    const stop = controller.subscribe(() => state = controller.snapshot());
    controller.mount();
    return () => {
      stop();
      controller.unmount();
    };
  });

  function select(index: number) {
    if (entries) entries.scrollTop = 0;
    controller.select(index);
  }
</script>

<main class="TithewoodSurface ChangesArchive">
  <header>
    <p class="ChangesArchive__eyebrow">Tithewood / archive study</p>
    <h1>Changelog</h1>
    <nav aria-label="Changelog month">
      {#if controller.dates.length > 0}
        <button
          type="button"
          class="TithewoodControl"
          aria-label="Newer month"
          title="Newer month"
          disabled={state.selectedIndex === 0}
          onclick={() => select(state.selectedIndex - 1)}
        >‹</button>
        <select
          class="TithewoodControl"
          aria-label="Archive month"
          value={state.selectedIndex}
          onchange={e => select(Number(e.currentTarget.value))}
        >
          {#each controller.labels as label, i}
            <option value={i}>{label}</option>
          {/each}
        </select>
        <button
          type="button"
          class="TithewoodControl"
          aria-label="Older month"
          title="Older month"
          disabled={state.selectedIndex === controller.dates.length - 1}
          onclick={() => select(state.selectedIndex + 1)}
        >›</button>
      {/if}
    </nav>
    <div class="ChangesArchive__search">
      <input
        class="TithewoodControl"
        bind:this={search}
        aria-label="Search this month"
        placeholder="Search author, description, or category..."
        value={state.query}
        oninput={e => controller.query(e.currentTarget.value)}
        onkeydown={e => {
          if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
        }}
      />
      <button
        type="button"
        class="TithewoodControl"
        aria-label="Clear search"
        disabled={!state.query}
        onclick={() => {
          controller.query('');
          search?.focus();
        }}
      >Clear</button>
    </div>
    {#if view.summary !== null}
      <p role="status">{view.summary}</p>
    {/if}
  </header>

  <div class="ChangesArchive__entries" bind:this={entries}>
    <aside aria-label="Historical upstream credits">
      <p class="ChangesArchive__creditNote">Historical upstream credits and license notices; not Tithewood support links.</p>
      <div>{@html credits}</div>
    </aside>
    {#each view.days as day (day.date)}
      <section class="ChangesArchive__day">
        <h2>{day.label}</h2>
        {#each day.authors as author (author.name)}
          <div>
            <h3>{author.name}</h3>
            <div role="table">
              {#each author.rows as row (row.index)}
                <div role="row">
                  <div role="cell" class="ChangesArchive__category">{row.category || 'unknown'}</div>
                  <div role="cell" class="ChangesArchive__description">{row.text}</div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </section>
    {/each}
    {#if view.status !== null}
      <p class="ChangesArchive__status">{view.status}</p>
    {/if}
    {#if view.status === 'Failed to load data after 6 attempts'}
      <button
        type="button"
        class="TithewoodControl"
        onclick={() => select(state.selectedIndex)}
      >Retry this month</button>
    {/if}
  </div>
</main>
