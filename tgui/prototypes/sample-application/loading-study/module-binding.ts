import { createValidatedEndpointBinding } from '../endpoint-binding';

// This module is built ONCE and kept external to every other proof build.
// ESM URL identity, not a global property, owns this once-only installation.
export const binding = createValidatedEndpointBinding();
export const facade = binding.facade;

// The production debug barrel asks for story discovery. No global stub or
// native marker is needed; this fixture deliberately excludes those stories.
export function excludedStories() {
  const excluded = () => {
    throw new Error('Stories are excluded from the module loading proof.');
  };
  return Object.assign(excluded, { keys: excluded });
}
