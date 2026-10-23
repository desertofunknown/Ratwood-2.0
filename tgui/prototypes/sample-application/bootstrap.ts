import { createEndpoint } from '../crafting-workbench/browser-integration/endpoint';
import { createOwnedBoundary } from './boundary';
import type { ValidatedEndpointBinding } from './endpoint-binding';

// Supplied lexically by this fixture's build banner, never a window property.
declare const __sampleEndpointBinding: ValidatedEndpointBinding;

// This module MUST evaluate before production backend, storage and drag imports.
// Reuse only the existing, narrow in-memory crafting endpoint. No transport.
export const endpoint = createEndpoint();
export const boundary = createOwnedBoundary(endpoint.api);
boundary.install();
export const validateBoundary = boundary.validate;
try {
  __sampleEndpointBinding.install(endpoint.api, validateBoundary);
} catch (error) {
  boundary.dispose();
  throw error;
}

// The eagerly imported production debug barrel references story discovery.
// This isolated build excludes stories rather than loading production routing.
Reflect.set(globalThis, '__disconnectedWebpackContext', () => {
  const excluded = () => {
    throw new Error(
      'Development stories are excluded from the sample application.',
    );
  };
  return Object.assign(excluded, { keys: excluded });
});
