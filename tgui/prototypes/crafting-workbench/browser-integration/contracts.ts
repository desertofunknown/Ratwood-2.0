import type { ComponentType } from 'react';

import type { WorkbenchData } from '../model';
import type { WorkbenchAction } from '../Workbench';

export type Lifecycle = {
  mounted: (action: WorkbenchAction) => void;
  unmounted: () => void;
  pending: (disposal: Promise<unknown>) => void;
  error: (error: unknown) => void;
};
export type ArmProps = {
  snapshot: WorkbenchData;
  active: boolean;
  epoch: number;
  isCurrent: (epoch: number) => boolean;
  lifecycle: Lifecycle;
  onAction: WorkbenchAction;
};
export type Arm = ComponentType<ArmProps>;
