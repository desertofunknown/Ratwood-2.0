// Resolve through the exact production React and pinned Svelte build plugins.
// Identity is observed only; this does not mount a view or claim timing data.
export { useState as reactUseState } from 'react';
export { tick as svelteTick } from 'svelte';
