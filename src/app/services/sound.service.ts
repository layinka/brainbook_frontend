import { Injectable } from '@angular/core';
import { Howl, Howler } from 'howler';

export type SoundKey =
  | 'click'
  | 'beforestart'
  | 'answerpicked'
  | 'correct'
  | 'wrong'
  | 'wrongMain'
  | 'timer'
  | 'streak'
  | 'coindrop'
  | 'victory'
  | 'gameEnd'
  | 'magic'
  | 'giftbox'
  | 'winnerParty'
  | 'gameplay'
  | 'search'
  | 'puffs'
  | 'blue'
  | 'orange';

const SOUND_MAP: Record<SoundKey, string> = {
  click:       '/media/click_sound.ogg',
  beforestart: '/media/beforestart.ogg',
  answerpicked:'/media/answerpicked.ogg',
  correct:     '/media/right_answer_sound.ogg',
  wrong:       '/media/wrong_answer.ogg',
  wrongMain:   '/media/wrong_answer_main.ogg',
  timer:       '/media/timer.ogg',
  streak:      '/media/coin1.ogg',
  coindrop:    '/media/coindrop2.ogg',
  victory:     '/media/victory.ogg',
  gameEnd:     '/media/game_end.ogg',
  magic:       '/media/magic.ogg',
  giftbox:     '/media/giftboxblow.ogg',
  winnerParty: '/media/winner_party.ogg',
  gameplay:    '/media/gameplay.ogg',
  search:      '/media/search_sound.ogg',
  puffs:       '/media/puffs.ogg',
  blue:        '/media/blue.ogg',
  orange:      '/media/orange.ogg',
};

@Injectable({ providedIn: 'root' })
export class SoundService {
  private sounds: Partial<Record<SoundKey, Howl>> = {};
  private bgMusic: Howl | null = null;
  private _muted = false;
  private _volume = 0.7;

  /** Preload gameplay-critical sounds. Call once on game start. */
  preloadGameSounds(): void {
    const criticals: SoundKey[] = [
      'click', 'beforestart', 'answerpicked', 'correct', 'wrong',
      'wrongMain', 'timer', 'streak', 'coindrop', 'victory', 'gameEnd',
    ];
    for (const key of criticals) {
      if (!this.sounds[key]) {
        this.sounds[key] = new Howl({ src: [SOUND_MAP[key]], preload: true, volume: this._volume });
      }
    }
  }

  /** Preload all sounds (call on app init — lighter sounds only) */
  preloadUiSounds(): void {
    const ui: SoundKey[] = ['click', 'giftbox', 'search', 'magic', 'puffs'];
    for (const key of ui) {
      if (!this.sounds[key]) {
        this.sounds[key] = new Howl({ src: [SOUND_MAP[key]], preload: true, volume: this._volume });
      }
    }
  }

  play(key: SoundKey): void {
    if (this._muted) return;
    if (!this.sounds[key]) {
      this.sounds[key] = new Howl({ src: [SOUND_MAP[key]], volume: this._volume });
    }
    this.sounds[key]!.play();
  }

  startBackgroundMusic(): void {
    if (this._muted) return;
    if (!this.bgMusic) {
      this.bgMusic = new Howl({
        src: [SOUND_MAP['gameplay']],
        loop: true,
        volume: 0.25,
      });
    }
    if (!this.bgMusic.playing()) {
      this.bgMusic.play();
    }
  }

  stopBackgroundMusic(): void {
    this.bgMusic?.stop();
  }

  pauseBackgroundMusic(): void {
    this.bgMusic?.pause();
  }

  resumeBackgroundMusic(): void {
    if (!this._muted) {
      this.bgMusic?.play();
    }
  }

  get muted(): boolean { return this._muted; }

  toggleMute(): void {
    this._muted = !this._muted;
    Howler.mute(this._muted);
  }

  setVolume(vol: number): void {
    this._volume = Math.max(0, Math.min(1, vol));
    Howler.volume(this._volume);
  }

  stopAll(): void {
    Howler.stop();
  }
}
