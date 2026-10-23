import { createEndpoint } from '../../crafting-workbench/browser-integration/endpoint';
import { createOwnedBoundary } from '../boundary';
import { eagerIdentity, retainedEagerSend } from './eager-probe';
import { binding } from './endpoint-binding.js';

/** Proof host only. No production dependency may enter this static closure. */
export function createOwnedModuleHost() {
  const endpoint = createEndpoint();
  const boundary = createOwnedBoundary(endpoint.api);
  boundary.install();
  try {
    binding.install(endpoint.api, boundary.validate);
  } catch (error) {
    boundary.dispose();
    throw error;
  }
  // Proof-host failure is terminal. This is not a route retry policy: a future
  // screen loader must use its own lease and must not retire this page boundary.
  async function guardedImport<T>(load: () => Promise<T>) {
    try {
      boundary.validate();
      const module = await load();
      boundary.validate();
      return module;
    } catch (error) {
      boundary.dispose();
      throw error;
    }
  }
  return Object.freeze({
    endpoint,
    boundary,
    eagerIdentity,
    retainedEagerSend,
    retire: boundary.dispose,
    async loadProductionHost() {
      return guardedImport(() => import('./production-host.js'));
    },
    async loadDeferredProbe() {
      return guardedImport(() => import('./deferred-probe.js'));
    },
  });
}

export { eagerIdentity, retainedEagerSend };
