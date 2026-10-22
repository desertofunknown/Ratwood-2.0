import {
  type KeyboardEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import {
  filterRecipeEntries,
  getRecipeEntries,
  PAGE_SIZE,
  type RecipeEntry,
  type WorkbenchData,
} from './model';

export type { WorkbenchData, WorkbenchRecipe } from './model';

export type WorkbenchPayload =
  | { item: string; amount?: 2 | 3 | 5; auto?: true; state?: never }
  | { state: boolean; item?: never; amount?: never; auto?: never };

export type WorkbenchAction = (
  action: 'craft' | 'checkboxonlycraftable',
  payload: WorkbenchPayload,
) => void;

export type CraftingWorkbenchProps = {
  data: WorkbenchData;
  onAction: WorkbenchAction;
};

/** Standalone exploration only: deliberately has no backend or window imports. */
export function CraftingWorkbench({ data, onAction }: CraftingWorkbenchProps) {
  const instanceId = useId();
  const folioId = `${instanceId}-folio`;
  const headingId = `${instanceId}-recipe`;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const folioRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocus = useRef<string | null>(null);
  const revealFocus = useRef<string | null>(null);
  const listScroll = useRef(0);
  // Recompute from each delivered render, including in-place backend record updates.
  const entries = getRecipeEntries(data);
  const categories = Object.keys(data.crafting_recipes).sort((a, b) =>
    a.localeCompare(b),
  );
  // A disappearing server category must not leave the select and filter at odds.
  const activeCategory =
    category !== null && categories.includes(category) ? category : null;
  const onlyMaterialMatches = !!data.showonlycraftable;
  const filtered = filterRecipeEntries(
    entries,
    query,
    activeCategory,
    onlyMaterialMatches,
  );
  const visible = filtered.slice(0, limit);
  // Derive from the current filtered catalog, never a snapshot of a recipe.
  const selected = filtered.find(
    (entry) => entry.identity === selectedIdentity,
  );

  useLayoutEffect(() => {
    if (category !== activeCategory) setCategory(activeCategory);
  }, [category, activeCategory]);

  useLayoutEffect(() => {
    setLimit(PAGE_SIZE);
  }, [query, activeCategory, onlyMaterialMatches]);

  useLayoutEffect(() => {
    if (selectedIdentity !== null && !selected) {
      setSelectedIdentity(null);
      // Do not steal focus from a search or filter the user is editing.
      if (document.activeElement === document.body) searchRef.current?.focus();
    }
  }, [selectedIdentity, selected]);

  useLayoutEffect(() => {
    if (selected) {
      headingRef.current?.focus({ preventScroll: true });
      if (folioRef.current) folioRef.current.scrollTop = 0;
    } else if (returnFocus.current) {
      const target =
        rowRefs.current.get(returnFocus.current) ?? searchRef.current;
      target?.focus({ preventScroll: true });
      if (listRef.current) listRef.current.scrollTop = listScroll.current;
      // Preserve the inner position where possible, but reveal focus in outer scrollers too.
      target?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'instant',
      });
      returnFocus.current = null;
    }
  }, [selected?.identity]);

  useLayoutEffect(() => {
    if (revealFocus.current) {
      rowRefs.current.get(revealFocus.current)?.focus();
      revealFocus.current = null;
    }
  }, [limit]);

  const handleOpen = (entry: RecipeEntry) => {
    listScroll.current = listRef.current?.scrollTop ?? 0;
    setSelectedIdentity(entry.identity);
  };
  const handleBack = () => {
    const selectedIndex = filtered.findIndex(
      (entry) => entry.identity === selectedIdentity,
    );
    if (selectedIndex >= limit) {
      setLimit(Math.ceil((selectedIndex + 1) / PAGE_SIZE) * PAGE_SIZE);
    }
    returnFocus.current = selectedIdentity;
    setSelectedIdentity(null);
  };
  const handleClear = () => {
    setQuery('');
    searchRef.current?.focus();
  };
  const handleReset = () => {
    setQuery('');
    setCategory(null);
    setLimit(PAGE_SIZE);
    if (onlyMaterialMatches) {
      onAction('checkboxonlycraftable', { state: false });
    }
    searchRef.current?.focus();
  };
  const handleCraft = (options: { amount?: 2 | 3 | 5; auto?: true } = {}) => {
    if (!selected) return;
    onAction('craft', { item: selected.recipe.path, ...options });
  };
  const handleCraftKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    // Keep native activation, but a held Enter must not send repeated requests.
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
    }
  };

  return (
    <section
      className="Workbench"
      aria-label="Crafting workbench"
      data-open={!!selected}
    >
      <header className="Workbench__header">
        <p className="Workbench__eyebrow">Workshop ledger</p>
        <h1>The workbench</h1>
        <p className="Workbench__intro">
          Choose a recipe. Review its requirements.
        </p>
      </header>
      <div className="Workbench__filters">
        <label className="Workbench__label" htmlFor={`${instanceId}-search`}>
          Find a recipe
        </label>
        <div className="Workbench__search">
          <input
            id={`${instanceId}-search`}
            ref={searchRef}
            type="search"
            aria-label="Search recipes by name or ingredients"
            placeholder="Name or ingredients…"
            value={query}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
          <button type="button" onClick={handleClear} disabled={!query}>
            Clear
          </button>
        </div>
        <div className="Workbench__filter-row">
          <label className="Workbench__category">
            <span className="Workbench__label">Category</span>
            <select
              value={
                activeCategory === null ? '' : `category:${activeCategory}`
              }
              onChange={(event) =>
                setCategory(
                  event.currentTarget.value === ''
                    ? null
                    : event.currentTarget.value.slice(9),
                )
              }
            >
              <option value="">All categories</option>
              {categories.map((name) => (
                <option key={name} value={`category:${name}`}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="Workbench__check">
            <input
              type="checkbox"
              checked={onlyMaterialMatches}
              onChange={() =>
                onAction('checkboxonlycraftable', {
                  state: !data.showonlycraftable,
                })
              }
            />
            <span>Material matches only</span>
          </label>
        </div>
      </div>
      <div className="Workbench__content">
        <div
          className="Workbench__list"
          ref={listRef}
          aria-label="Recipe catalog"
        >
          <div
            className="Workbench__list-heading"
            role="status"
            aria-live="polite"
          >
            <span>
              {filtered.length} {filtered.length === 1 ? 'recipe' : 'recipes'}{' '}
              matched
            </span>
            <span>{visible.length} shown</span>
          </div>
          {visible.length === 0 ? (
            <div className="Workbench__empty">
              <h2>No recipes found</h2>
              <p>Try another name or ingredient, or reset the filters.</p>
              <button type="button" onClick={handleReset}>
                Reset filters
              </button>
            </div>
          ) : (
            <ol className="Workbench__recipes">
              {visible.map((entry, index) => (
                <li key={entry.identity}>
                  {(index === 0 ||
                    visible[index - 1].category !== entry.category) && (
                    <h2 className="Workbench__category-heading">
                      {entry.category}
                    </h2>
                  )}
                  <button
                    type="button"
                    className="Workbench__recipe"
                    ref={(element) => {
                      if (element) rowRefs.current.set(entry.identity, element);
                      else rowRefs.current.delete(entry.identity);
                    }}
                    aria-expanded={
                      entry.identity === selectedIdentity && !!selected
                    }
                    aria-controls={folioId}
                    onClick={() => handleOpen(entry)}
                  >
                    <span className="Workbench__recipe-name">
                      {entry.recipe.name}
                    </span>
                    <span className="Workbench__recipe-ingredients">
                      {entry.recipe.req_text || 'Ingredients not listed'}
                    </span>
                    <span
                      className={`Workbench__match ${entry.materialMatch ? 'Workbench__match--yes' : ''}`}
                    >
                      Material match:{' '}
                      {entry.materialMatch ? 'reported' : 'not reported'}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          {visible.length < filtered.length && (
            <button
              type="button"
              className="Workbench__more"
              onClick={() => {
                revealFocus.current = filtered[limit]?.identity ?? null;
                setLimit((count) => count + PAGE_SIZE);
              }}
            >
              Show {Math.min(PAGE_SIZE, filtered.length - visible.length)} more
              recipes
            </button>
          )}
        </div>
        <section
          id={folioId}
          ref={folioRef}
          className="Workbench__folio"
          aria-label={selected ? undefined : 'Recipe details'}
          aria-labelledby={selected ? headingId : undefined}
        >
          {selected ? (
            <>
              <button
                type="button"
                className="Workbench__back"
                onClick={handleBack}
              >
                ← Back to recipes
              </button>
              <p className="Workbench__eyebrow">{selected.category}</p>
              <h2
                id={headingId}
                ref={headingRef}
                tabIndex={-1}
                className="Workbench__folio-title"
              >
                {selected.recipe.name}
              </h2>
              <p
                className={`Workbench__folio-match ${selected.materialMatch ? 'Workbench__match--yes' : ''}`}
              >
                Material match:{' '}
                {selected.materialMatch ? 'reported' : 'not reported'}
              </p>
              <dl className="Workbench__requirements">
                <div>
                  <dt>Ingredients</dt>
                  <dd>{selected.recipe.req_text || 'Not listed'}</dd>
                </div>
                {selected.recipe.tool_text && (
                  <div>
                    <dt>Tool</dt>
                    <dd>{selected.recipe.tool_text}</dd>
                  </div>
                )}
                {selected.recipe.catalyst_text && (
                  <div>
                    <dt>Catalyst</dt>
                    <dd>{selected.recipe.catalyst_text}</dd>
                  </div>
                )}
                <div>
                  <dt>Difficulty</dt>
                  <dd>{selected.recipe.craftingdifficulty ?? 'Not listed'}</dd>
                </div>
                <div>
                  <dt>Sell price</dt>
                  <dd>{selected.recipe.sellprice ?? 'Not listed'}</dd>
                </div>
              </dl>
              <p className="Workbench__advisory">
                Material match is advisory, not readiness. Same-name recipes
                share this check; variants may differ. Crafting still checks the
                recipe’s requirements.
              </p>
              <div
                className="Workbench__actions"
                aria-label="Craft selected recipe"
              >
                <button
                  type="button"
                  className="Workbench__craft-primary"
                  onKeyDown={handleCraftKeyDown}
                  onClick={() => handleCraft()}
                >
                  Craft 1
                </button>
                {([2, 3, 5] as const).map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onKeyDown={handleCraftKeyDown}
                    onClick={() => handleCraft({ amount })}
                  >
                    Craft {amount}
                  </button>
                ))}
                <button
                  type="button"
                  className="Workbench__repeat"
                  onKeyDown={handleCraftKeyDown}
                  onClick={() => handleCraft({ auto: true })}
                >
                  Repeat
                </button>
              </div>
            </>
          ) : (
            <div className="Workbench__folio-placeholder">
              <span className="Workbench__ornament" aria-hidden="true">
                ◇
              </span>
              <h2>A recipe awaits</h2>
              <p>
                Choose a recipe from the ledger to read its requirements and
                craft.
              </p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
