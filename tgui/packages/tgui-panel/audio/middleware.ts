/**
 * @file
 * @copyright 2020 Aleksej Komarov
 * @license MIT
 */

import type { AnyAction, Dispatch, Store } from 'common/redux';

import { selectSettings } from '../settings/selectors';
import { type AudioOptions, AudioPlayer } from './player';

type PlayMusicPayload = AudioOptions & { url: string };

export const audioMiddleware = (store: Pick<Store, 'dispatch' | 'getState'>) => {
  const player = new AudioPlayer();
  const updateVolume = () => {
    const volume: unknown = selectSettings(store.getState()).adminMusicVolume;
    if (typeof volume === 'number') {
      player.setVolume(volume);
    }
  };

  player.onPlay(() => {
    store.dispatch({ type: 'audio/playing' });
  });
  player.onStop(() => {
    store.dispatch({ type: 'audio/stopped' });
  });
  return (next: Dispatch) => (action: AnyAction) => {
    const { type, payload } = action;
    if (type === 'audio/playMusic') {
      const { url, ...options }: PlayMusicPayload = payload;
      next(action);
      updateVolume();
      player.play(url, options);
      return;
    }
    if (type === 'audio/stopMusic') {
      player.stop();
      return next(action);
    }
    if (
      type === 'settings/update' ||
      type === 'settings/load' ||
      type === 'settings/import'
    ) {
      next(action);
      updateVolume();
      return;
    }
    return next(action);
  };
};
