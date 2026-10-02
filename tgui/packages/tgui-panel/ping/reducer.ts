/**
 * @file
 * @copyright 2020 Aleksej Komarov
 * @license MIT
 */

import type { AnyAction } from 'common/redux';
import { clamp01, scale } from 'tgui-core/math';

import { pingFail, pingSuccess } from './actions';
import {
  PING_MAX_FAILS,
  PING_ROUNDTRIP_BEST,
  PING_ROUNDTRIP_WORST,
} from './constants';

type PingState = {
  roundtrip: number | undefined;
  roundtripAvg: number | undefined;
  failCount: number;
  networkQuality: number;
};

const initialState: PingState = {
  roundtrip: undefined,
  roundtripAvg: undefined,
  failCount: 0,
  networkQuality: 0,
};

export const pingReducer = (
  state: PingState = initialState,
  action: AnyAction,
): PingState => {
  const { type, payload } = action;

  if (type === pingSuccess.type) {
    const { roundtrip }: { roundtrip: number } = payload;
    const prevRoundtrip = state.roundtripAvg ?? roundtrip;
    const roundtripAvg = Math.round(prevRoundtrip * 0.4 + roundtrip * 0.6);
    const networkQuality = clamp01(
      1 - scale(roundtripAvg, PING_ROUNDTRIP_BEST, PING_ROUNDTRIP_WORST),
    );
    return {
      roundtrip,
      roundtripAvg,
      failCount: 0,
      networkQuality,
    };
  }

  if (type === pingFail.type) {
    const failCount = Math.min(state.failCount + 1, PING_MAX_FAILS);
    const networkQuality = clamp01(state.networkQuality - 1 / PING_MAX_FAILS);
    const nextState: PingState = {
      ...state,
      failCount,
      networkQuality,
    };
    if (failCount >= PING_MAX_FAILS) {
      nextState.roundtrip = undefined;
      nextState.roundtripAvg = undefined;
    }
    return nextState;
  }

  return state;
};
