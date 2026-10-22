import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  createController,
  type Controller,
  type Data,
  type Act,
} from './model';
import { assertDisconnected } from './network-guard';
import { ReactView } from './ReactView';
export function mountReact(target: HTMLElement, controller: Controller) {
  assertDisconnected();
  const root = createRoot(target);
  root.render(<ReactView controller={controller} />);
  return () => root.unmount();
}
export function createReactSelectionPrompt(
  host: HTMLElement,
  initialData: Data,
  onAction: Act,
  onClose?: () => void,
) {
  const controller = createController(initialData, onAction, onClose);
  const unmount = mountReact(host, controller);
  return {
    controller,
    update: controller.deliver,
    destroy: () => {
      controller.close();
      unmount();
    },
  };
}
