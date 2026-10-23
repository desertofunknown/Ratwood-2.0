// Shared backend code forces a genuine emitted common production chunk.
import { sendAct } from '../../../packages/tgui/backend';
import { binding, facade } from './endpoint-binding.js';

export const deferredIdentity = Object.freeze({ binding, facade });
export const retainedDeferredSend = facade.sendMessage;
export const sendSampleFilter = (state: boolean) =>
  sendAct('checkboxonlycraftable', { state });
export { reactUseState, svelteTick } from './runtime-probe';
