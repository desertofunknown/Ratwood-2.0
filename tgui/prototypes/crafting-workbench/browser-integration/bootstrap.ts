import { createEndpoint, installEndpoint } from './endpoint';

// This module MUST evaluate before imports of the real backend/drag modules.
export const endpoint = createEndpoint();
installEndpoint(globalThis, endpoint);
// The eager debug barrel references Rspack story discovery, unused by Window.
// A fixture-only replacement fails loudly if development stories are requested.
Reflect.set(globalThis, '__disconnectedWebpackContext', () => {
  const excluded = () => {
    throw new Error('Development stories are excluded.');
  };
  return Object.assign(excluded, { keys: excluded });
});
