/**
 * @file
 * @copyright 2020 Aleksej Komarov
 * @license MIT
 */

import { createLogger } from 'tgui/logging';

const logger = createLogger('AudioPlayer');

export type AudioOptions = {
  pitch?: number | null;
  start?: number | null;
  end?: number | null;
};

function isProtectedError(error: Event | string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isTrusted' in error &&
    error.isTrusted
  );
}

export class AudioPlayer {
  private element: HTMLAudioElement | null = null;
  private volume = 0.5;
  private onPlaySubscribers: (() => void)[] = [];
  private onStopSubscribers: (() => void)[] = [];

  play(url: string, options: AudioOptions = {}): void {
    this.stop();

    const audio = new Audio(url);
    this.element = audio;
    audio.volume = this.volume;
    const { pitch, start, end } = options;

    const fail = (error: unknown) => {
      if (this.element !== audio) {
        return;
      }
      logger.log('playback failed:', error);
      this.stop();
    };

    logger.log('playing', url, options);

    audio.onended = () => {
      if (this.element !== audio) {
        return;
      }
      logger.log('ended');
      this.stop();
    };

    audio.onerror = (error) => {
      if (this.element !== audio) {
        return;
      }
      if (isProtectedError(error)) {
        Byond.sendMessage('audio/protected');
      }
      fail(audio.error);
    };

    if (typeof start === 'number' && Number.isFinite(start) && start > 0) {
      audio.onloadedmetadata = () => {
        if (this.element !== audio) {
          return;
        }
        try {
          audio.currentTime = start;
        } catch (error) {
          fail(error);
        }
      };
    }

    if (typeof end === 'number' && Number.isFinite(end) && end > 0) {
      audio.ontimeupdate = () => {
        if (this.element === audio && audio.currentTime >= end) {
          this.stop();
        }
      };
    }

    try {
      audio.playbackRate =
        typeof pitch === 'number' && Number.isFinite(pitch) && pitch > 0
          ? pitch
          : 1;
      audio.play()?.catch(fail);
    } catch (error) {
      fail(error);
    }

    // Keep Stop available while the media is still loading.
    if (this.element === audio) {
      this.onPlaySubscribers.forEach((subscriber) => subscriber());
    }
  }

  stop(): void {
    const audio = this.element;
    if (!audio) return;

    logger.log('stopping');

    // Relinquish ownership before aborting playback and its pending promises.
    this.element = null;
    audio.onended = null;
    audio.onerror = null;
    audio.onloadedmetadata = null;
    audio.ontimeupdate = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();

    this.onStopSubscribers.forEach((subscriber) => subscriber());
  }

  setVolume(volume: number): void {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.min(1, Math.max(0, volume));

    if (!this.element) return;

    this.element.volume = this.volume;
  }

  onPlay(subscriber: () => void): void {
    this.onPlaySubscribers.push(subscriber);
  }

  onStop(subscriber: () => void): void {
    this.onStopSubscribers.push(subscriber);
  }
}
