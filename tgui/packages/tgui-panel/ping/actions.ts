/**
 * @file
 * @copyright 2020 Aleksej Komarov
 * @license MIT
 */

import { createAction } from 'common/redux';

export type PendingPing = {
  index: number;
  sentAt: number;
};

export const pingReply = createAction('ping/reply');

/**
 * Soft ping from the server.
 * It's intended to send periodic server-side metadata about the client,
 * e.g. its AFK status.
 */
export const pingSoft = createAction('ping/soft');

export const pingSuccess = createAction('ping/success', (ping: PendingPing) => ({
  payload: {
    lastId: ping.index,
    roundtrip: (Date.now() - ping.sentAt) * 0.5,
  },
}));

export const pingFail = createAction('ping/fail');
