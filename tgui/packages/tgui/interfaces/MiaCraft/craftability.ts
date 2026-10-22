/** Prefer exact-path overrides; preserve the legacy enumerable, strict-1 lookup. */
export function isRecipeCraftable(
  craftability: Record<string, unknown>,
  name: unknown,
  path?: unknown,
  craftabilityByPath?: unknown,
): boolean {
  if (
    typeof path === 'string' &&
    path.length > 0 &&
    typeof craftabilityByPath === 'object' &&
    craftabilityByPath !== null &&
    !Array.isArray(craftabilityByPath) &&
    Object.prototype.propertyIsEnumerable.call(craftabilityByPath, path)
  ) {
    // Presence, not truthiness: an explicit zero must override a shared name's one.
    return (craftabilityByPath as Record<string, unknown>)[path] === 1;
  }
  return (
    typeof name === 'string' &&
    Object.prototype.propertyIsEnumerable.call(craftability, name) &&
    craftability[name] === 1
  );
}
