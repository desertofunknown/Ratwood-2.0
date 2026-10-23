import type { createEndpoint } from '../crafting-workbench/browser-integration/endpoint';

type SampleEndpoint = ReturnType<typeof createEndpoint>['api'];

/**
 * Self-contained on purpose: its JavaScript source is the sample build banner.
 * No production module is modified and no helper is installed on globalThis.
 */
export function createValidatedEndpointBinding() {
  let endpoint: SampleEndpoint | undefined;
  let validate: (() => void) | undefined;
  const read = (): SampleEndpoint => {
    if (!endpoint || !validate) {
      throw new Error('The sample endpoint binding has not been installed.');
    }
    validate();
    return endpoint;
  };
  const facade: SampleEndpoint = Object.freeze({
    get windowId() {
      return read().windowId;
    },
    winset(...args: Parameters<SampleEndpoint['winset']>) {
      return read().winset(...args);
    },
    winget(...args: Parameters<SampleEndpoint['winget']>) {
      return read().winget(...args);
    },
    sendMessage(...args: Parameters<SampleEndpoint['sendMessage']>) {
      return read().sendMessage(...args);
    },
    subscribe(...args: Parameters<SampleEndpoint['subscribe']>) {
      return read().subscribe(...args);
    },
  });
  return Object.freeze({
    facade,
    read,
    install(api: SampleEndpoint, validator: () => void) {
      if (endpoint || validate) {
        throw new Error(
          'The sample endpoint binding can only be installed once.',
        );
      }
      if (
        !api ||
        typeof api !== 'object' ||
        !Object.isFrozen(api) ||
        typeof validator !== 'function'
      ) {
        throw new Error(
          'The sample endpoint binding requires its frozen fixture API and validator.',
        );
      }
      validator();
      endpoint = api;
      validate = validator;
    },
  });
}

/** Bun define accepts this lexical identifier, NOT a function-call expression. */
export const endpointBanner =
  `const __sampleEndpointBinding = (${createValidatedEndpointBinding.toString()})();\n` +
  'const __sampleEndpointFacade = __sampleEndpointBinding.facade;';
export type ValidatedEndpointBinding = ReturnType<
  typeof createValidatedEndpointBinding
>;
