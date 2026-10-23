/**
 * Explicit ownership for the disconnected sample shell only. The caller supplies
 * its in-memory fixture API, never a discovered or production native endpoint.
 * Standalone prototypes keep their existing refusal guards by default.
 */
export function createOwnedBoundary(
  endpointApi: object,
  scope: object = globalThis,
) {
  const fail = () => {
    throw Error('Disconnected sample shell refuses native or unowned globals.');
  };
  const windowAtCreation = (scope as { window?: unknown }).window;
  const targets = [scope];
  if (
    windowAtCreation !== scope &&
    windowAtCreation !== null &&
    (typeof windowAtCreation === 'object' ||
      typeof windowAtCreation === 'function')
  ) {
    targets.push(windowAtCreation);
  }
  const checkWindow = () => {
    if ((scope as { window?: unknown }).window !== windowAtCreation) fail();
  };
  const refuseExisting = () => {
    checkWindow();
    for (const target of targets) {
      // Do not read existing values, getters, flags or endpoint shapes.
      if ('Byond' in target || 'hubStorage' in target) fail();
    }
  };
  refuseExisting();
  if (
    endpointApi === null ||
    (typeof endpointApi !== 'object' && typeof endpointApi !== 'function')
  ) {
    throw Error('The sample shell requires its own fixture API object.');
  }
  Object.freeze(endpointApi);

  let state: 'ready' | 'installed' | 'disposed' = 'ready';
  const installed = new Set<object>();
  const ownsProperty = (target: object) => {
    const descriptor = Object.getOwnPropertyDescriptor(target, 'Byond');
    return (
      installed.has(target) &&
      descriptor?.value === endpointApi &&
      descriptor.writable === false &&
      descriptor.enumerable === false &&
      descriptor.configurable === true
    );
  };
  const validate = () => {
    if (state !== 'installed') fail();
    checkWindow();
    if (!Object.isFrozen(endpointApi)) fail();
    for (const target of targets) {
      if ('hubStorage' in target || !ownsProperty(target)) fail();
      // A newly introduced inherited host must not be hidden by our property.
      const prototype = Object.getPrototypeOf(target);
      if (prototype !== null && 'Byond' in prototype) fail();
    }
  };
  const dispose = () => {
    state = 'disposed';
    for (const target of installed) {
      // A replacement or altered descriptor belongs to somebody else. Never
      // read it, overwrite it or delete it, even during failure cleanup.
      if (ownsProperty(target)) Reflect.deleteProperty(target, 'Byond');
    }
    installed.clear();
  };
  const install = () => {
    if (state === 'installed') return validate();
    if (state === 'disposed') fail();
    refuseExisting();
    try {
      for (const target of targets) {
        Object.defineProperty(target, 'Byond', {
          value: endpointApi,
          configurable: true,
          enumerable: false,
          writable: false,
        });
        installed.add(target);
      }
      state = 'installed';
      validate();
    } catch (error) {
      dispose();
      throw error;
    }
  };
  return Object.freeze({ install, validate, dispose });
}

export type OwnedBoundary = ReturnType<typeof createOwnedBoundary>;
