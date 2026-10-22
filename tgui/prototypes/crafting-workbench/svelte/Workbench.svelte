<script lang="ts">
  import { untrack } from 'svelte';

  import {
    filterRecipeEntries,
    getRecipeEntries,
    PAGE_SIZE,
    type RecipeEntry,
    type WorkbenchData,
  } from '../model';
  import type { WorkbenchAction } from '../Workbench';

  let { data, onAction }: { data: WorkbenchData; onAction: WorkbenchAction } =
    $props();
  const instanceId = $props.id();
  const folioId = `${instanceId}-folio`;
  const headingId = `${instanceId}-recipe`;
  let query = $state('');
  let category = $state<string | null>(null);
  let limit = $state(PAGE_SIZE);
  let selectedIdentity = $state<string | null>(null);
  let searchRef = $state<HTMLInputElement>();
  let listRef = $state<HTMLDivElement>();
  let folioRef = $state<HTMLElement>();
  let headingRef = $state<HTMLHeadingElement>();
  const rowRefs = new Map<string, HTMLButtonElement>();
  let returnFocus: string | null = null;
  let revealFocus: string | null = null;
  let listScroll = 0;
  // The standalone delivery adapter supplies a fresh top-level snapshot on every
  // delivery, including when backend records were mutated in place.
  const entries = $derived(getRecipeEntries(data));
  const categories = $derived(
    Object.keys(data.crafting_recipes).sort((a, b) => a.localeCompare(b)),
  );
  const activeCategory = $derived(
    category !== null && categories.includes(category) ? category : null,
  );
  const onlyMaterialMatches = $derived(!!data.showonlycraftable);
  const filtered = $derived(
    filterRecipeEntries(entries, query, activeCategory, onlyMaterialMatches),
  );
  const visible = $derived(filtered.slice(0, limit));
  const selected = $derived(
    filtered.find((entry) => entry.identity === selectedIdentity),
  );
  const selectedKey = $derived(selected?.identity);

  $effect(() => {
    if (category !== activeCategory) category = activeCategory;
  });
  $effect(() => {
    query;
    activeCategory;
    onlyMaterialMatches;
    limit = PAGE_SIZE;
  });
  $effect(() => {
    if (selectedIdentity !== null && !selected) {
      selectedIdentity = null;
      if (document.activeElement === document.body) searchRef?.focus();
    }
  });
  $effect(() => {
    const identity = selectedKey;
    untrack(() => {
      if (identity) {
        headingRef?.focus({ preventScroll: true });
        if (folioRef) folioRef.scrollTop = 0;
      } else if (returnFocus) {
        (rowRefs.get(returnFocus) ?? searchRef)?.focus({ preventScroll: true });
        if (listRef) listRef.scrollTop = listScroll;
        returnFocus = null;
      }
    });
  });
  $effect(() => {
    limit;
    untrack(() => {
      if (revealFocus) {
        rowRefs.get(revealFocus)?.focus();
        revealFocus = null;
      }
    });
  });

  function registerRow(element: HTMLButtonElement, identity: string) {
    rowRefs.set(identity, element);
    return { destroy: () => rowRefs.delete(identity) };
  }
  function handleOpen(entry: RecipeEntry) {
    listScroll = listRef?.scrollTop ?? 0;
    selectedIdentity = entry.identity;
  }
  function handleBack() {
    const selectedIndex = filtered.findIndex(
      (entry) => entry.identity === selectedIdentity,
    );
    if (selectedIndex >= limit)
      limit = Math.ceil((selectedIndex + 1) / PAGE_SIZE) * PAGE_SIZE;
    returnFocus = selectedIdentity;
    selectedIdentity = null;
  }
  function handleClear() {
    query = '';
    searchRef?.focus();
  }
  function handleReset() {
    query = '';
    category = null;
    limit = PAGE_SIZE;
    if (onlyMaterialMatches)
      onAction('checkboxonlycraftable', { state: false });
    searchRef?.focus();
  }
  function handleCraft(options: { amount?: 2 | 3 | 5; auto?: true } = {}) {
    if (!selected) return;
    onAction('craft', { item: selected.recipe.path, ...options });
  }
  function handleCraftKeyDown(event: KeyboardEvent) {
    if (event.repeat && (event.key === 'Enter' || event.key === ' '))
      event.preventDefault();
  }
</script>

<section
  class="Workbench"
  aria-label="Crafting workbench"
  data-open={!!selected}
>
  <header class="Workbench__header">
    <p class="Workbench__eyebrow">Workshop ledger</p>
    <h1>The workbench</h1>
    <p class="Workbench__intro">Choose a recipe. Review its requirements.</p>
  </header>
  <div class="Workbench__filters">
    <label class="Workbench__label" for={`${instanceId}-search`}
      >Find a recipe</label
    >
    <div class="Workbench__search">
      <input
        id={`${instanceId}-search`}
        bind:this={searchRef}
        type="search"
        aria-label="Search recipes by name or ingredients"
        placeholder="Name or ingredients…"
        value={query}
        oninput={(event) => (query = event.currentTarget.value)}
      />
      <button type="button" onclick={handleClear} disabled={!query}
        >Clear</button
      >
    </div>
    <div class="Workbench__filter-row">
      <label class="Workbench__category">
        <span class="Workbench__label">Category</span>
        <select
          value={activeCategory === null ? '' : `category:${activeCategory}`}
          onchange={(event) =>
            (category =
              event.currentTarget.value === ''
                ? null
                : event.currentTarget.value.slice(9))}
        >
          <option value="">All categories</option>
          {#each categories as name (name)}
            <option value={`category:${name}`}>{name}</option>
          {/each}
        </select>
      </label>
      <label class="Workbench__check">
        <input
          type="checkbox"
          checked={onlyMaterialMatches}
          onchange={(event) => {
            // Native input toggling must not invent a server acknowledgement.
            event.currentTarget.checked = onlyMaterialMatches;
            onAction('checkboxonlycraftable', {
              state: !data.showonlycraftable,
            });
          }}
        />
        <span>Material matches only</span>
      </label>
    </div>
  </div>
  <div class="Workbench__content">
    <div
      class="Workbench__list"
      bind:this={listRef}
      aria-label="Recipe catalog"
    >
      <div class="Workbench__list-heading" role="status" aria-live="polite">
        <span
          >{`${filtered.length} ${filtered.length === 1 ? 'recipe' : 'recipes'} matched`}</span
        >
        <span>{visible.length} shown</span>
      </div>
      {#if visible.length === 0}
        <div class="Workbench__empty">
          <h2>No recipes found</h2>
          <p>Try another name or ingredient, or reset the filters.</p>
          <button type="button" onclick={handleReset}>Reset filters</button>
        </div>
      {:else}
        <ol class="Workbench__recipes">
          {#each visible as entry, index (entry.identity)}
            <li>
              {#if index === 0 || visible[index - 1].category !== entry.category}
                <h2 class="Workbench__category-heading">{entry.category}</h2>
              {/if}
              <button
                type="button"
                class="Workbench__recipe"
                use:registerRow={entry.identity}
                aria-expanded={entry.identity === selectedIdentity &&
                  !!selected}
                aria-controls={folioId}
                onclick={() => handleOpen(entry)}
              >
                <span class="Workbench__recipe-name">{entry.recipe.name}</span>
                <span class="Workbench__recipe-ingredients"
                  >{entry.recipe.req_text || 'Ingredients not listed'}</span
                >
                <span
                  class={`Workbench__match ${entry.materialMatch ? 'Workbench__match--yes' : ''}`}
                >
                  Material match: {entry.materialMatch
                    ? 'reported'
                    : 'not reported'}
                </span>
              </button>
            </li>
          {/each}
        </ol>
      {/if}
      {#if visible.length < filtered.length}
        <button
          type="button"
          class="Workbench__more"
          onclick={() => {
            revealFocus = filtered[limit]?.identity ?? null;
            limit += PAGE_SIZE;
          }}
          >Show {Math.min(PAGE_SIZE, filtered.length - visible.length)} more recipes</button
        >
      {/if}
    </div>
    <section
      id={folioId}
      bind:this={folioRef}
      class="Workbench__folio"
      aria-label={selected ? undefined : 'Recipe details'}
      aria-labelledby={selected ? headingId : undefined}
    >
      {#if selected}
        <button type="button" class="Workbench__back" onclick={handleBack}
          >← Back to recipes</button
        >
        <p class="Workbench__eyebrow">{selected.category}</p>
        <h2
          id={headingId}
          bind:this={headingRef}
          tabindex="-1"
          class="Workbench__folio-title"
        >
          {selected.recipe.name}
        </h2>
        <p
          class={`Workbench__folio-match ${selected.materialMatch ? 'Workbench__match--yes' : ''}`}
        >
          Material match: {selected.materialMatch ? 'reported' : 'not reported'}
        </p>
        <dl class="Workbench__requirements">
          <div>
            <dt>Ingredients</dt>
            <dd>{selected.recipe.req_text || 'Not listed'}</dd>
          </div>
          {#if selected.recipe.tool_text}
            <div>
              <dt>Tool</dt>
              <dd>{selected.recipe.tool_text}</dd>
            </div>
          {/if}
          {#if selected.recipe.catalyst_text}
            <div>
              <dt>Catalyst</dt>
              <dd>{selected.recipe.catalyst_text}</dd>
            </div>
          {/if}
          <div>
            <dt>Difficulty</dt>
            <dd>{selected.recipe.craftingdifficulty ?? 'Not listed'}</dd>
          </div>
          <div>
            <dt>Sell price</dt>
            <dd>{selected.recipe.sellprice ?? 'Not listed'}</dd>
          </div>
        </dl>
        <p class="Workbench__advisory">
          Material match is advisory, not readiness. Same-name recipes share
          this check; variants may differ. Crafting still checks the recipe’s
          requirements.
        </p>
        <div class="Workbench__actions" aria-label="Craft selected recipe">
          <button
            type="button"
            class="Workbench__craft-primary"
            onkeydown={handleCraftKeyDown}
            onclick={() => handleCraft()}>Craft 1</button
          >
          {#each [2, 3, 5] as amount (amount)}
            <button
              type="button"
              onkeydown={handleCraftKeyDown}
              onclick={() => handleCraft({ amount: amount as 2 | 3 | 5 })}
              >Craft {amount}</button
            >
          {/each}
          <button
            type="button"
            class="Workbench__repeat"
            onkeydown={handleCraftKeyDown}
            onclick={() => handleCraft({ auto: true })}>Repeat</button
          >
        </div>
      {:else}
        <div class="Workbench__folio-placeholder">
          <span class="Workbench__ornament" aria-hidden="true">◇</span>
          <h2>A recipe awaits</h2>
          <p>
            Choose a recipe from the ledger to read its requirements and craft.
          </p>
        </div>
      {/if}
    </section>
  </div>
</section>
