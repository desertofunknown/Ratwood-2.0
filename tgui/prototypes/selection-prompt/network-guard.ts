/** This prototype must never mount in, or become a bridge to, a native host. */
export function assertDisconnected(scope: object = globalThis) {
  // Presence matters, including inherited properties and explicit undefined.
  if ('Byond' in scope || 'hubStorage' in scope) {
    throw Error(
      'Disconnected Selection prompt preview refuses native host globals.',
    );
  }
  // Also protect test environments where window and globalThis are distinct.
  const windowScope = (scope as { window?: unknown }).window;
  if (
    windowScope !== scope &&
    windowScope !== null &&
    (typeof windowScope === 'object' || typeof windowScope === 'function') &&
    ('Byond' in windowScope || 'hubStorage' in windowScope)
  ) {
    throw Error(
      'Disconnected Selection prompt preview refuses native host globals.',
    );
  }
}
