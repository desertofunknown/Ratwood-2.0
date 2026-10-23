import { ReactScreen } from '../../screens/react';
import { createScreenSession } from '../../screens/session';
import { startMeasuredPage } from '../route-measurements';

export function start() {
  return startMeasuredPage(ReactScreen, createScreenSession, 'react', 'eager');
}
