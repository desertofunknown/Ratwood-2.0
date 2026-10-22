import { isRecipeCraftable } from '../../packages/tgui/interfaces/MiaCraft/craftability';
import { matchesRecipeSearch } from '../../packages/tgui/interfaces/MiaCraft/search';

export type WorkbenchRecipe = {
  name: string;
  path: string;
  req_text?: string | null;
  tool_text?: string | null;
  catalyst_text?: string | null;
  craftingdifficulty?: string | number | null;
  sellprice?: string | number | null;
};

export type WorkbenchData = {
  crafting_recipes: Record<
    string,
    WorkbenchRecipe[] | Record<string, WorkbenchRecipe>
  >;
  craftability: Record<string, unknown>;
  showonlycraftable: boolean | number;
};

export type RecipeEntry = {
  identity: string;
  category: string;
  recipe: WorkbenchRecipe;
  materialMatch: boolean;
};

export const PAGE_SIZE = 40;

/** Preserve production ordering, including stable same-name variants. */
export function getRecipeEntries(data: WorkbenchData): RecipeEntry[] {
  return Object.entries(data.crafting_recipes)
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .flatMap(([category, recipes]) =>
      Object.entries(recipes)
        .sort(([, a], [, b]) => String(a.name).localeCompare(String(b.name)))
        .map(([sourceKey, recipe]) => ({
          // Include the path: a reused source slot must never select a new recipe.
          identity: JSON.stringify([category, sourceKey, recipe.path]),
          category,
          recipe,
          materialMatch: isRecipeCraftable(data.craftability, recipe.name),
        })),
    );
}

export function filterRecipeEntries(
  entries: RecipeEntry[],
  query: string,
  category: string | null,
  onlyMaterialMatches: boolean,
): RecipeEntry[] {
  const normalizedQuery = query.toLowerCase();
  return entries.filter(
    (entry) =>
      (category === null || entry.category === category) &&
      (!onlyMaterialMatches || entry.materialMatch) &&
      matchesRecipeSearch(entry.recipe, normalizedQuery),
  );
}
