import { lauxlib, lua, lualib, to_luastring } from 'fengari';
import * as interop from 'fengari-interop';

import {
  filterRecipeEntries,
  getRecipeEntries,
  PAGE_SIZE,
  type WorkbenchData,
} from '../model';
import type { WorkbenchAction } from '../Workbench';
import source from './workbench.lua' with { type: 'text' };

let nextInstance = 0;

/** VM lifecycle and data interoperability only. UI state/rendering live in Lua. */
export function mountWorkbench(
  target: HTMLElement,
  data: WorkbenchData,
  onAction: WorkbenchAction,
) {
  let state: object | null = lauxlib.luaL_newstate();
  let component: interop.LuaValue | undefined;
  let closed = false;
  let calls = 0;
  const enterLua = <T>(callback: () => T): T => {
    calls++;
    try {
      return callback();
    } finally {
      calls--;
      // A consumer may synchronously unmount from its action callback. Never
      // close a Lua state whose event/update stack still has to unwind.
      if (closed && calls === 0 && state) {
        lua.lua_close(state);
        state = null;
      }
    }
  };
  try {
    lualib.luaL_openlibs(state);
    lauxlib.luaL_requiref(state, to_luastring('js'), interop.luaopen_js, 1);
    lua.lua_pop(state, 1);
    const status = lauxlib.luaL_loadbuffer(
      state,
      to_luastring(source),
      null,
      to_luastring('@workbench.lua'),
    );
    if (status !== lua.LUA_OK || lua.lua_pcall(state, 0, 1, 0) !== lua.LUA_OK) {
      throw new Error(lua.lua_tojsstring(state, -1));
    }
    const mount = interop.tojs(state, -1) as interop.LuaValue;
    lua.lua_pop(state, 1);
    component = enterLua(() =>
      mount({
        target,
        data,
        action: onAction,
        id: `lua-workbench-${++nextInstance}`,
        pageSize: PAGE_SIZE,
        getRecipeEntries,
        filterRecipeEntries,
        categories: (next: WorkbenchData) =>
          Object.keys(next.crafting_recipes).sort((a, b) => a.localeCompare(b)),
        // Interop creates a fresh JS proxy on every Lua-function conversion.
        // Keep the registration/removal pair entirely on this side of the bridge.
        listen: (node: HTMLElement, kind: string, callback: EventListener) => {
          let current: EventListener | null = callback;
          const listener = (event: Event) => {
            if (!closed && node.isConnected && current) {
              const handler = current;
              enterLua(() => handler.call(node, event));
            }
          };
          node.addEventListener(kind, listener);
          return () => {
            node.removeEventListener(kind, listener);
            current = null;
          };
        },
      }),
    ) as interop.LuaValue;
  } catch (error) {
    lua.lua_close(state);
    state = null;
    throw error;
  }
  return {
    update(next: WorkbenchData) {
      if (closed || !state || !component)
        throw new Error('Workbench was unmounted.');
      const current = component;
      enterLua(() => current.get('update')(next));
    },
    unmount() {
      if (closed || !state || !component) return;
      closed = true;
      const current = component;
      component = undefined;
      enterLua(() => current.get('unmount')());
    },
  };
}
