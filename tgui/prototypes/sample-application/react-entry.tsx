import './bootstrap';

import { startPage } from './page';
import { ReactScreen } from './screens/react';
import { createScreenSession } from './screens/session';

void startPage(ReactScreen, createScreenSession, 'react');
