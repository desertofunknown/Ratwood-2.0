import type { ComponentType } from 'react';

import type { WorkbenchData } from '../crafting-workbench/model';
import type { WorkbenchAction } from '../crafting-workbench/Workbench';

export type Route =
  | 'workbench'
  | 'treasury'
  | 'market'
  | 'readability'
  | 'archive'
  | 'dialogs';
export const routes: readonly Route[] = [
  'workbench',
  'treasury',
  'market',
  'readability',
  'archive',
  'dialogs',
];
export const routeLabels: Record<Route, string> = {
  workbench: 'Crafting workbench',
  treasury: 'Treasury ledger',
  market: 'Market quotes',
  readability: 'Display & readability',
  archive: 'Changes / archive',
  dialogs: 'Prompts & decisions',
};

/** A synchronously revoked capability, independent of React commit timing. */
export type ScreenLease = {
  readonly route: Route;
  readonly hostEpoch: number;
  readonly screenEpoch: number;
  isCurrent(): boolean;
  /** Called after the controller retires, before replacement view creation. */
  onRetire(cleanup: () => void): () => void;
};
export type ScreenLifecycle = {
  mounted(action?: WorkbenchAction): void;
  unmounted(): void;
  pending(disposal: Promise<unknown>): void;
  error(error: unknown): void;
};
export type ScreenSession = {
  readonly route: Route;
  readonly lease: ScreenLease;
  /** Synchronously retire controllers; do not wait for view disposal here. */
  retire(): void;
};
export type SessionContext = {
  lease: ScreenLease;
  onWorkbenchAction: WorkbenchAction;
  validateBoundary(): void;
  lifecycle: ScreenLifecycle;
};
export type ScreenFactory = (
  route: Route,
  context: SessionContext,
) => ScreenSession;
export type ScreenProps = {
  session: ScreenSession;
  snapshot: WorkbenchData;
  lifecycle: ScreenLifecycle;
};
export type ScreenRenderer = ComponentType<ScreenProps>;
