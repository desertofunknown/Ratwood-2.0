/**
 * @file
 * @copyright 2020 Aleksej Komarov
 * @license MIT
 */

import type { AnyAction, Dispatch, Store } from 'common/redux';

import {
  type PendingPing,
  pingFail,
  pingReply,
  pingSoft,
  pingSuccess,
} from './actions';
import { PING_QUEUE_SIZE, PING_TIMEOUT } from './constants';

type QueuedPing = PendingPing & { timeout: number };
type PingReplyPayload = { index: number };
type PingSoftPayload = { afk: boolean | number };

export const pingMiddleware = (store: Pick<Store, 'dispatch'>) => {
  let initialized = false;
  let index = 0;
  const pings = new Map<number, QueuedPing>();

  const sendPing = () => {
    if (pings.size >= PING_QUEUE_SIZE) {
      return;
    }
    // Never reuse a live request's identity for a delayed reply.
    const ping: QueuedPing = { index: index++, sentAt: Date.now(), timeout: 0 };
    ping.timeout = window.setTimeout(() => {
      if (pings.get(ping.index) !== ping) {
        return;
      }
      pings.delete(ping.index);
      store.dispatch(pingFail());
    }, PING_TIMEOUT);
    pings.set(ping.index, ping);
    Byond.sendMessage('ping', { index: ping.index });
  };

  return (next: Dispatch) => (action: AnyAction) => {
    const { type, payload } = action;

    if (!initialized) {
      initialized = true;
      if (type !== pingSoft.type) {
        sendPing();
      }
    }

    if (type === pingSoft.type) {
      const { afk }: PingSoftPayload = payload;
      // On each soft ping where client is not flagged as afk,
      // initiate a new ping.
      if (!afk) {
        sendPing();
      }
      return next(action);
    }

    if (type === pingReply.type) {
      const { index }: PingReplyPayload = payload;
      const ping = pings.get(index);
      // Replies to expired requests cannot complete a newer probe.
      if (!ping) {
        return;
      }
      pings.delete(index);
      window.clearTimeout(ping.timeout);
      if (Date.now() - ping.sentAt >= PING_TIMEOUT) {
        return next(pingFail());
      }
      return next(pingSuccess(ping));
    }

    return next(action);
  };
};
