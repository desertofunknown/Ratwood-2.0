import './bootstrap';

import { startPage } from './page';
import { createScreenSession } from './screens/session';
import { SvelteScreen } from './screens/svelte';

void startPage(SvelteScreen, createScreenSession, 'svelte');
