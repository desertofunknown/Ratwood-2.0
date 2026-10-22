declare module '*.lua' {
  const source: string;
  export default source;
}

// Minimal declarations for the exact Fengari APIs used by this isolated demo.
declare module 'fengari' {
  export const to_luastring: (value: string) => Uint8Array;
  export const lauxlib: {
    luaL_newstate(): object;
    luaL_requiref(
      state: object,
      name: Uint8Array,
      open: (state: object) => number,
      global: number,
    ): void;
    luaL_loadbuffer(
      state: object,
      source: Uint8Array,
      length: number | null,
      name: Uint8Array,
    ): number;
  };
  export const lualib: { luaL_openlibs(state: object): void };
  export const lua: {
    LUA_OK: number;
    lua_pop(state: object, count: number): void;
    lua_pcall(
      state: object,
      args: number,
      results: number,
      error: number,
    ): number;
    lua_tojsstring(state: object, index: number): string;
    lua_close(state: object): void;
  };
}

declare module 'fengari-interop' {
  export interface LuaValue {
    (...args: unknown[]): unknown;
    get(key: string): LuaValue;
  }
  export function luaopen_js(state: object): number;
  export function tojs(state: object, index: number): unknown;
}
