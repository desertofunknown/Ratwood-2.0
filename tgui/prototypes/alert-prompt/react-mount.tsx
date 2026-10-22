import React from 'react';
import { createRoot } from 'react-dom/client';
import { assertDisconnected } from '../selection-prompt/network-guard';
import {
  createController,
  type Act,
  type Controller,
  type Data,
} from './model';
import { ReactView } from './ReactView';

export function mountReact(host: HTMLElement, controller: Controller) {
  assertDisconnected();
  const root = createRoot(host);
  root.render(<ReactView controller={controller} />);
  return () => root.unmount();
}
export const mount = mountReact;
export function createReactAlertPrompt(
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
