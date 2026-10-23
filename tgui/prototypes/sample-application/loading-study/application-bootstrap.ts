import { createEndpoint } from '../../crafting-workbench/browser-integration/endpoint';
import { createOwnedBoundary } from '../boundary';
import { binding } from './endpoint-binding.js';

// The runtime's original bootstrap import resolves to this exact emitted URL.
// It must finish installation before the separate production graph evaluates.
export const endpoint = createEndpoint();
export const boundary = createOwnedBoundary(endpoint.api);
boundary.install();
export const validateBoundary = boundary.validate;
try {
  binding.install(endpoint.api, validateBoundary);
} catch (error) {
  boundary.dispose();
  throw error;
}

let startup: Promise<unknown> | undefined;
export function startApplication(): Promise<unknown> {
  validateBoundary();
  if (startup) return startup;
  startup = import('./app.js')
    .then((application) => {
      validateBoundary();
      return application.start();
    })
    .catch((error) => {
      boundary.dispose();
      throw error;
    });
  return startup;
}
