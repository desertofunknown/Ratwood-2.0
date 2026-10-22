import { useLayoutEffect, useRef } from 'react';

import type { WorkbenchData } from '../model';
import type { WorkbenchAction } from '../Workbench';
import { mountWorkbench } from './adapter';

type Mounted = ReturnType<typeof mountWorkbench>;
export type WorkbenchMount = typeof mountWorkbench;
type Generation = {
  target: HTMLDivElement;
  instance: Mounted;
  epoch: number;
  action: WorkbenchAction;
};
export type ReactWorkbenchHostProps = {
  /** The complete merged backend data, not an incremental transport patch. */
  snapshot: Partial<WorkbenchData>;
  onAction: WorkbenchAction;
  active: boolean;
  epoch: number;
  isCurrent: (epoch: number) => boolean;
  onError: (error: unknown) => void;
  /** A fixture seam only; production Svelte is the default. */
  mount?: WorkbenchMount;
};

/** DISCONNECTED: React owns the container; each Svelte generation owns its subtree. */
export function ReactWorkbenchHost({
  snapshot,
  onAction,
  active,
  epoch,
  isCurrent,
  onError,
  mount = mountWorkbench,
}: ReactWorkbenchHostProps) {
  const container = useRef<HTMLDivElement>(null);
  const current = useRef<Generation | null>(null);
  const committed = useRef({ onAction, isCurrent, onError });

  const dispose = () => {
    const old = current.current;
    if (!old) return;
    // Fence BEFORE calling Promise-returning unmount. A replacement gets a
    // different detached subtree, never the old async cleanup's target.
    current.current = null;
    old.target.remove();
    try {
      void Promise.resolve(old.instance.unmount()).catch(
        committed.current.onError,
      );
    } catch (error) {
      committed.current.onError(error);
    }
  };

  // Intentionally no dependency array: every explicit committed delivery matters,
  // including same-envelope nested mutations and callback-only replacements.
  useLayoutEffect(() => {
    committed.current = { onAction, isCurrent, onError };
    if (!active || !isCurrent(epoch)) {
      dispose();
      return;
    }
    if (current.current && current.current.epoch !== epoch) dispose();
    const data: WorkbenchData = {
      ...snapshot,
      crafting_recipes: snapshot.crafting_recipes ?? {},
      craftability: snapshot.craftability ?? {},
      showonlycraftable: snapshot.showonlycraftable ?? false,
    };
    if (!current.current) {
      const target = document.createElement('div');
      container.current!.append(target);
      // Capture only this generation; callback identity stays stable until dispose.
      const generation = { target, epoch } as Generation;
      generation.action = (name, payload) => {
        if (
          current.current === generation &&
          committed.current.isCurrent(epoch)
        ) {
          committed.current.onAction(name, payload);
        }
      };
      current.current = generation;
      try {
        generation.instance = mount(target, data, generation.action);
      } catch (error) {
        current.current = null;
        target.remove();
        onError(error);
      }
      return; // mount already renders initial data; do not immediately update again.
    }
    const generation = current.current;
    const failed = (error: unknown) => {
      // A failed update leaves uncertain UI state. Fence only its own generation;
      // late errors must never tear down an already committed replacement.
      if (current.current === generation) dispose();
      onError(error);
    };
    try {
      void Promise.resolve(generation.instance.update(data)).catch(failed);
    } catch (error) {
      failed(error);
    }
  });
  useLayoutEffect(() => dispose, []);
  return <div ref={container} data-disconnected-workbench-host="" />;
}
