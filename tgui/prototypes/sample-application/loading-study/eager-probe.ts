import { binding, facade } from './endpoint-binding.js';

export const eagerIdentity = Object.freeze({ binding, facade });
export const retainedEagerSend = facade.sendMessage;
