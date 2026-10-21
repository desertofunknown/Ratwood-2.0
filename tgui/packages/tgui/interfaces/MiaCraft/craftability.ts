/** Match Object.entries(...).some's string-key, enumerable, strict-1 contract. */
export function isRecipeCraftable(
  craftability: Record<string, unknown>,
  name: unknown,
): boolean {
  return (
    typeof name === 'string' &&
    Object.prototype.propertyIsEnumerable.call(craftability, name) &&
    craftability[name] === 1
  );
}
