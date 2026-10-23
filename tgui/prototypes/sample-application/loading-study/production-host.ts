// Real production host dependencies, not stand-ins. Build-time chunk guards
// execute before each module body, including drag's eager windowId read.
import { storage } from '../../../packages/common/storage';
import * as backend from '../../../packages/tgui/backend';
import { setWindowPosition, setupDrag } from '../../../packages/tgui/drag';
import { Window } from '../../../packages/tgui/layouts/Window';
import { binding, facade } from './endpoint-binding.js';

export const hostIdentity = Object.freeze({ binding, facade });
export const productionWindow = Window;
export { backend, setWindowPosition, setupDrag, storage };
export { reactUseState, svelteTick } from './runtime-probe';
