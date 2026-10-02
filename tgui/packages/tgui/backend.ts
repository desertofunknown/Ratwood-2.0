/**
 * This file provides a clear separation layer between backend updates
 * and what state our React app sees.
 *
 * Sometimes backend can response without a "data" field, but our final
 * state will still contain previous "data" because we are merging
 * the response with already existing state.
 *
 * @file
 * @copyright 2020 Aleksej Komarov
 * @license MIT
 */

import { createAction, type Store } from 'common/redux';
import type { SetStateAction } from 'react';
import type { BooleanLike } from 'tgui-core/react';

import { setupDrag } from './drag';
import { focusMap } from './focus';
import { createLogger } from './logging';
import { resumeRenderer, suspendRenderer } from './renderer';

const logger = createLogger('backend');

export let globalStore: Store;

export const setGlobalStore = (store: Store) => {
  globalStore = store;
};

export const backendUpdate = createAction('backend/update');
export const backendSetSharedState = createAction('backend/setSharedState');
export const backendSuspendStart = createAction('backend/suspendStart');
export const backendCreatePayloadQueue = createAction(
  'backend/createPayloadQueue',
);
export const backendDequeuePayloadQueue = createAction(
  'backend/dequeuePayloadQueue',
);
export const backendRemovePayloadQueue = createAction(
  'backend/removePayloadQueue',
);
export const nextPayloadChunk = createAction('nextPayloadChunk');

export const backendSuspendSuccess = () => ({
  type: 'backend/suspendSuccess',
  payload: {
    timestamp: Date.now(),
  },
});

type PayloadQueue = { chunks: string[]; nextIndex: number };

const initialState = {
  config: {},
  data: {},
  shared: {},
  outgoingPayloadQueues: {} as Record<string, PayloadQueue>,
  // Start as suspended
  suspended: Date.now() as number | false,
  suspending: false,
};

export const backendReducer = (state = initialState, action) => {
  const { type, payload } = action;

  if (type === 'backend/update') {
    // Merge config
    const config = payload.config
      ? { ...state.config, ...payload.config }
      : state.config;
    // Merge data
    const data = payload.static_data || payload.data
      ? { ...state.data, ...payload.static_data, ...payload.data }
      : state.data;
    // Merge shared states
    const shared = payload.shared ? { ...state.shared } : state.shared;
    if (payload.shared) {
      for (const key of Object.keys(payload.shared)) {
        const value = payload.shared[key];
        if (value === '') {
          shared[key] = undefined;
        } else {
          shared[key] = JSON.parse(value);
        }
      }
    }
    // Return new state
    return {
      ...state,
      config,
      data,
      shared,
      suspended: false,
    };
  }

  if (type === 'backend/setSharedState') {
    const { key, nextState } = payload;
    if (Object.is(state.shared[key], nextState) && key in state.shared) {
      return state;
    }
    return {
      ...state,
      shared: {
        ...state.shared,
        [key]: nextState,
      },
    };
  }

  if (type === 'backend/suspendStart') {
    return {
      ...state,
      suspending: true,
    };
  }

  if (type === 'backend/suspendSuccess') {
    const { timestamp } = payload;
    return {
      ...state,
      data: {},
      shared: {},
      outgoingPayloadQueues: {},
      config: {
        ...state.config,
        title: '',
        status: 1,
      },
      suspending: false,
      suspended: timestamp,
    };
  }

  if (type === 'backend/createPayloadQueue') {
    const { id, chunks } = payload;
    const { outgoingPayloadQueues } = state;
    return {
      ...state,
      outgoingPayloadQueues: {
        ...outgoingPayloadQueues,
        [id]: { chunks, nextIndex: 0 },
      },
    };
  }

  if (type === 'backend/dequeuePayloadQueue') {
    const { id } = payload;
    const { outgoingPayloadQueues } = state;
    if (!Object.hasOwn(outgoingPayloadQueues, id)) {
      return state;
    }
    const { [id]: targetQueue, ...otherQueues } = outgoingPayloadQueues;
    const nextIndex = targetQueue.nextIndex + 1;
    return {
      ...state,
      outgoingPayloadQueues: nextIndex < targetQueue.chunks.length
        ? {
            ...otherQueues,
            [id]: { ...targetQueue, nextIndex },
          }
        : otherQueues,
    };
  }

  if (type === 'backend/removePayloadQueue') {
    const { id } = payload;
    const { outgoingPayloadQueues } = state;
    if (!Object.hasOwn(outgoingPayloadQueues, id)) {
      return state;
    }
    const { [id]: _, ...otherQueues } = outgoingPayloadQueues;
    return {
      ...state,
      outgoingPayloadQueues: otherQueues,
    };
  }

  return state;
};

export const backendMiddleware = (store) => {
  let fancyState;
  let suspendInterval;
  const payloadTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  const clearPayloadTimeout = (id: string) => {
    clearTimeout(payloadTimeouts.get(id));
    payloadTimeouts.delete(id);
  };
  const resetPayloadTimeout = (id: string) => {
    clearPayloadTimeout(id);
    payloadTimeouts.set(
      id,
      setTimeout(() => {
        store.dispatch(backendRemovePayloadQueue({ id }));
      }, 10000),
    );
  };

  return (next) => (action) => {
    const { suspended, outgoingPayloadQueues } = selectBackend(
      store.getState(),
    );
    const { type, payload } = action;

    if (type === 'update') {
      store.dispatch(backendUpdate(payload));
      return;
    }

    if (type === 'suspend') {
      store.dispatch(backendSuspendSuccess());
      return;
    }

    if (type === 'ping') {
      Byond.sendMessage('ping/reply');
      return;
    }

    if (type === 'backend/suspendStart' && !suspendInterval) {
      logger.log(`suspending (${Byond.windowId})`);
      // Keep sending suspend messages until it succeeds.
      // It may fail multiple times due to topic rate limiting.
      const suspendFn = () => Byond.sendMessage('suspend');
      suspendFn();
      suspendInterval = setInterval(suspendFn, 2000);
    }

    if (type === 'backend/suspendSuccess') {
      const hadFocus = document.hasFocus();
      suspendRenderer();
      clearInterval(suspendInterval);
      suspendInterval = undefined;
      for (const id of payloadTimeouts.keys()) {
        clearPayloadTimeout(id);
      }
      Byond.winset(Byond.windowId, {
        'is-visible': false,
      });
      // Background windows may close while the player is typing in another UI.
      if (hadFocus) {
        setTimeout(() => focusMap());
      }
    }

    if (
      type === 'backend/update' &&
      payload.config?.window?.fancy !== undefined
    ) {
      const fancy = payload.config?.window?.fancy;
      // Initialize fancy state
      if (fancyState === undefined) {
        fancyState = fancy;
      }
      // React to changes in fancy
      else if (fancyState !== fancy) {
        logger.log('changing fancy mode to', fancy);
        fancyState = fancy;
        Byond.winset(Byond.windowId, {
          titlebar: !fancy,
          'can-resize': !fancy,
        });
      }
    }

    // Resume on incoming update
    if (type === 'backend/update' && suspended) {
      // Show the payload
      logger.log('backend/update', payload);
      // Signal renderer that we have resumed
      resumeRenderer();
      // Setup drag
      setupDrag();
    }

    if (type === 'backend/createPayloadQueue') {
      resetPayloadTimeout(payload.id);
    }
    if (type === 'backend/removePayloadQueue') {
      clearPayloadTimeout(payload.id);
    }

    if (type === 'oversizePayloadResponse') {
      const { allow } = payload;
      if (allow) {
        store.dispatch(nextPayloadChunk(payload));
      } else {
        store.dispatch(backendRemovePayloadQueue(payload));
      }
    }

    if (type === 'acknowlegePayloadChunk') {
      store.dispatch(backendDequeuePayloadQueue(payload));
      store.dispatch(nextPayloadChunk(payload));
    }

    if (type === 'nextPayloadChunk') {
      const { id } = payload;
      if (!Object.hasOwn(outgoingPayloadQueues, id)) {
        clearPayloadTimeout(id);
        return;
      }
      const queue = outgoingPayloadQueues[id];
      const chunk = queue.chunks[queue.nextIndex];
      resetPayloadTimeout(id);
      Byond.sendMessage('payloadChunk', {
        id,
        chunk,
      });
    }

    return next(action);
  };
};

const splitPayload = (text: string): string[] => {
  const chunks: string[] = [];
  let start = 0;
  let offset = 0;
  let encodedLength = 0;
  // Walk code points so a chunk never splits a surrogate pair.
  for (const character of text) {
    const length = encodeURIComponent(character).length;
    if (encodedLength + length > 1024) {
      chunks.push(text.slice(start, offset));
      start = offset;
      encodedLength = 0;
    }
    encodedLength += length;
    offset += character.length;
  }
  if (offset > start) {
    chunks.push(text.slice(start));
  }
  return chunks;
};

let nextPayloadId = 0;

/**
 * Sends an action to `ui_act` on `src_object` that this tgui window
 * is associated with.
 */
export type ActFunctionType = (action: string, payload?: object) => void;
export type RoutedActFunctionType = (action: string, payload?: object, routeId?: string | null) => void;

export const sendAct = (action: string, payload: object = {}) => {
  // Validate that payload is an object
  // prettier-ignore
  const isObject = typeof payload === 'object'
    && payload !== null
    && !Array.isArray(payload);
  if (!isObject) {
    logger.error(`Payload for act() must be an object, got this:`, payload);
    return;
  }

  const stringifiedPayload = JSON.stringify(payload);
  const urlSize = Object.entries({
    type: `act/${action}`,
    payload: stringifiedPayload,
    tgui: 1,
    windowId: Byond.windowId,
  }).reduce(
    (url, [key, value], i) =>
      url +
      `${i > 0 ? '&' : '?'}${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    '',
  ).length;
  if (urlSize > 2048) {
    const chunks = splitPayload(stringifiedPayload);
    const id = `${Date.now()}-${nextPayloadId++}`;
    globalStore?.dispatch(backendCreatePayloadQueue({ id, chunks }));
    Byond.sendMessage('oversizedPayloadRequest', {
      type: `act/${action}`,
      id,
      chunkCount: chunks.length,
    });
    return;
  }

  Byond.sendMessage(`act/${action}`, payload);
};

type BackendState<TData> = {
  config: {
    title: string;
    status: number;
    interface: {
      name: string;
      layout: string;
    };
    refreshing: BooleanLike;
    window: {
      key: string;
      size: [number, number];
      fancy: BooleanLike;
      locked: BooleanLike;
      theme: string;
      scale: BooleanLike;
    };
    client: {
      ckey: string;
      address: string;
      computer_id: string;
    };
    user: {
      name: string;
      observer: number;
    };
  };
  data: TData;
  shared: Record<string, any>;
  outgoingPayloadQueues: Record<string, PayloadQueue>;
  suspending: boolean;
  suspended: number | false;
};

/**
 * Selects a backend-related slice of Redux state
 */
export const selectBackend = <TData>(state: any): BackendState<TData> =>
  state.backend || {};

/**
 * Get data from tgui backend.
 *
 * Includes the `act` function for performing DM actions.
 */
export const useBackend = <TData>() => {
  const state: BackendState<TData> = globalStore?.getState()?.backend;

  return {
    ...state,
    act: sendAct,
  };
};

/**
 * A tuple that contains the state and a setter function for it.
 */
type StateWithSetter<T> = [T, (nextState: SetStateAction<T>) => void];

/**
 * Allocates state on Redux store without sharing it with other clients.
 *
 * Use it when you want to have a stateful variable in your component
 * that persists between renders, but will be forgotten after you close
 * the UI.
 *
 * It is a lot more performant than `setSharedState`.
 *
 * @param context React context.
 * @param key Key which uniquely identifies this state in Redux store.
 * @param initialState Initializes your global variable with this value.
 * @deprecated Use useState and useEffect when you can. Pass the state as a prop.
 */
export const useLocalState = <T>(
  key: string,
  initialState: T,
): StateWithSetter<T> => {
  const state = globalStore?.getState()?.backend;
  const sharedStates = state?.shared ?? {};
  const sharedState = key in sharedStates ? sharedStates[key] : initialState;
  return [
    sharedState,
    (nextState) => {
      const current = globalStore.getState().backend.shared;
      const previous = key in current ? current[key] : initialState;
      globalStore.dispatch(
        backendSetSharedState({
          key,
          nextState:
            typeof nextState === 'function'
              ? (nextState as (value: T) => T)(previous)
              : nextState,
        }),
      );
    },
  ];
};

/**
 * Allocates state on Redux store, and **shares** it with other clients
 * in the game.
 *
 * Use it when you want to have a stateful variable in your component
 * that persists not only between renders, but also gets pushed to other
 * clients that observe this UI.
 *
 * This makes creation of observable s
 *
 * @param context React context.
 * @param key Key which uniquely identifies this state in Redux store.
 * @param initialState Initializes your global variable with this value.
 */
export const useSharedState = <T>(
  key: string,
  initialState: T,
): StateWithSetter<T> => {
  const state = globalStore?.getState()?.backend;
  const sharedStates = state?.shared ?? {};
  const sharedState = key in sharedStates ? sharedStates[key] : initialState;
  return [
    sharedState,
    (nextState) => {
      const current = globalStore.getState().backend.shared;
      const previous = key in current ? current[key] : initialState;
      Byond.sendMessage({
        type: 'setSharedState',
        key,
        value:
          JSON.stringify(
            typeof nextState === 'function'
              ? (nextState as (value: T) => T)(previous)
              : nextState,
          ) || '',
      });
    },
  ];
};

export const useDispatch = () => {
  return globalStore.dispatch;
};

export const useSelector = (selector: (state: any) => any) => {
  return selector(globalStore?.getState());
};
