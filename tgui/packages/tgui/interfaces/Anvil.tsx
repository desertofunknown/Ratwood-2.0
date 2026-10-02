import { useMemo, useState } from 'react';
import { DmIcon, Icon } from 'tgui-core/components';
import { UI_INTERACTIVE } from 'tgui-core/constants';

import { useBackend } from '../backend';
import { Window } from '../layouts';

type Recipe = {
  name: string;
  category: string | null;
  ref: string;
  icon: string;
};

type Data = {
  hingot_type?: string | null;
  workpiece_name?: string | null;
  recipe_workpiece_type?: string | null;
  recipes: Recipe[];
};

export const Anvil = () => {
  const { act, config, data } = useBackend<Data>();
  const {
    hingot_type,
    workpiece_name,
    recipe_workpiece_type,
    recipes = [],
  } = data;
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  // Static updates may arrive after the live workpiece changes.
  const catalogueReady = !!hingot_type && recipe_workpiece_type === hingot_type;
  const visibleRecipes = useMemo(() => {
    if (!catalogueReady) {
      return [];
    }
    return recipes.filter((recipe) =>
      !query || `${recipe.name} ${recipe.category || ''}`.toLowerCase().includes(query),
    ).sort((a, b) =>
      (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name),
    );
  }, [recipes, query, catalogueReady]);
  const groups = useMemo(() => {
    const categories = new Map<string, Recipe[]>();
    for (const recipe of visibleRecipes) {
      const category = recipe.category || 'Other patterns';
      const entries = categories.get(category);
      if (entries) {
        entries.push(recipe);
      } else {
        categories.set(category, [recipe]);
      }
    }
    return Array.from(categories);
  }, [visibleRecipes]);

  return (
    <Window title="Anvil" width={640} height={600}>
      <Window.Content>
        <div className="Anvil">
          <header className="Anvil__header">
            <div className="Anvil__anvil" aria-hidden="true">
              <DmIcon icon="icons/roguetown/misc/forge.dmi" icon_state="anvil"
                width={48} height={48} />
            </div>
            <div>
              <div className="Anvil__eyebrow">The smith's craft</div>
              <h1>Smithing patterns</h1>
              <p>{hingot_type
                ? <>On the anvil: <strong>{workpiece_name}</strong></>
                : 'The anvil sits idle.'}</p>
            </div>
          </header>
          <div className="Anvil__tools">
            <div className="Anvil__search">
              <Icon name="search" />
              <input aria-label="Search smithing patterns" value={search}
                placeholder="Search patterns or categories…"
                disabled={!catalogueReady}
                onChange={(event) => setSearch(event.currentTarget.value)} />
              {search && (
                <button type="button" onClick={() => setSearch('')}>Clear</button>
              )}
            </div>
            <div className="Anvil__count" role="status">
              {!hingot_type ? 'No workpiece'
                : !catalogueReady ? 'Reading patterns…'
                  : query ? `${visibleRecipes.length} of ${recipes.length} patterns`
                    : `${recipes.length} patterns available`}
            </div>
          </div>
          <div className="Anvil__catalogue">
            {!hingot_type ? (
              <div className="Anvil__empty">
                <Icon name="hammer" size={2} />
                <h2>A workpiece is needed</h2>
                <p>Place an ingot or blade on the anvil to see its available patterns.</p>
              </div>
            ) : !catalogueReady ? (
              <div className="Anvil__empty">
                <Icon name="hourglass-half" size={2} />
                <h2>Reading the available patterns</h2>
                <p>The workpiece has changed. Its patterns will appear shortly.</p>
              </div>
            ) : visibleRecipes.length === 0 ? (
              <div className="Anvil__empty">
                <Icon name="search" size={2} />
                <h2>{recipes.length ? 'No matching patterns' : 'No available patterns'}</h2>
                <p>{recipes.length
                  ? 'Try another name or category.'
                  : 'There are no patterns available to you for this workpiece.'}</p>
                {search && <button type="button" onClick={() => setSearch('')}>Clear search</button>}
              </div>
            ) : groups.map(([category, entries]) => (
              <section className="Anvil__group" key={category}>
                <h2>{category}<span>{entries.length}</span></h2>
                {entries.map((recipe) => (
                  <button className="Anvil__recipe" type="button" key={recipe.ref}
                    disabled={config.status !== UI_INTERACTIVE}
                    onClick={() => act('choose_recipe', { ref: recipe.ref })}>
                    <span className="Anvil__recipeIcon" aria-hidden="true">
                      <span className={recipe.icon} />
                    </span>
                    <span className="Anvil__recipeName">{recipe.name}</span>
                    <Icon name="chevron-right" />
                  </button>
                ))}
              </section>
            ))}
          </div>
          <footer className="Anvil__footer">
            Choose a pattern to begin. Keep a hammer in hand to start working immediately.
          </footer>
        </div>
      </Window.Content>
    </Window>
  );
};
