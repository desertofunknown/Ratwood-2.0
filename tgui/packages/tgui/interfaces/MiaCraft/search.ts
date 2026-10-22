type SearchableRecipe = {
  name?: unknown;
  req_text?: unknown;
};

/** Match only the recipe name and ingredient text shown to the player. */
export function matchesRecipeSearch(
  recipe: SearchableRecipe,
  normalizedQuery: string,
): boolean {
  return (
    normalizedQuery === '' ||
    (typeof recipe.name === 'string' &&
      recipe.name.toLowerCase().includes(normalizedQuery)) ||
    (typeof recipe.req_text === 'string' &&
      recipe.req_text.toLowerCase().includes(normalizedQuery))
  );
}
