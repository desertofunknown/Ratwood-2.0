import { createScreenSession } from '../../screens/session';
import { SvelteScreen } from '../../screens/svelte';
import { startMeasuredPage } from '../route-measurements';

export function start() {
  return startMeasuredPage(
    SvelteScreen,
    createScreenSession,
    'svelte',
    'eager',
  );
}
