import { Injectable } from '@angular/core';
import { LocalHighScore } from '../models/game.models';

const KEYS = {
  highScores:     'brainbook.highscores',
  soundMuted:     'brainbook.sound.muted',
  soundVolume:    'brainbook.sound.volume',
  lastLogin:      'brainbook.lastlogin',
  loginStreak:    'brainbook.loginstreak',
  itemInventory:  'brainbook.items',
  completedCats:  'brainbook.completed',
  totalScore:     'brainbook.totalscore',
} as const;

export interface ItemInventory {
  timeFreeze: number;       // ID 1000
  hintReveal: number;       // ID 1001
  eliminateOption: number;  // ID 1002
  secondChance: number;     // ID 1003
  checkpoint: number;       // ID 1004
  doublePoints: number;     // ID 1005
}

@Injectable({ providedIn: 'root' })
export class LocalStorageService {

  // ── High Scores ────────────────────────────────────────────────────────────
  getHighScores(): LocalHighScore[] {
    return this.get<LocalHighScore[]>(KEYS.highScores) ?? [];
  }

  getBestScoreForCategory(category: string): LocalHighScore | null {
    const all = this.getHighScores();
    const forCat = all.filter(s => s.category === category);
    if (!forCat.length) return null;
    return forCat.reduce((best, s) => s.score > best.score ? s : best);
  }

  saveHighScore(score: LocalHighScore): void {
    const all = this.getHighScores();
    all.push(score);
    // Keep max 200 entries, sorted by score desc
    all.sort((a, b) => b.score - a.score);
    this.set(KEYS.highScores, all.slice(0, 200));
  }

  // ── Sound Preferences ──────────────────────────────────────────────────────
  isMuted(): boolean {
    return this.get<boolean>(KEYS.soundMuted) ?? false;
  }

  setMuted(val: boolean): void {
    this.set(KEYS.soundMuted, val);
  }

  getVolume(): number {
    return this.get<number>(KEYS.soundVolume) ?? 0.7;
  }

  setVolume(val: number): void {
    this.set(KEYS.soundVolume, val);
  }

  // ── Daily Login Streak ─────────────────────────────────────────────────────
  recordLoginAndGetStreak(): number {
    const today = new Date().toDateString();
    const lastLogin = this.get<string>(KEYS.lastLogin);
    let streak = this.get<number>(KEYS.loginStreak) ?? 0;

    if (!lastLogin) {
      // First ever login
      streak = 1;
    } else {
      const last = new Date(lastLogin);
      const todayDate = new Date(today);
      const diffMs = todayDate.getTime() - last.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        // Already logged in today — no change
        return streak;
      } else if (diffDays === 1) {
        // Consecutive day
        streak += 1;
      } else {
        // Streak broken
        streak = 1;
      }
    }

    this.set(KEYS.lastLogin, today);
    this.set(KEYS.loginStreak, streak);
    return streak;
  }

  getLoginStreak(): number {
    return this.get<number>(KEYS.loginStreak) ?? 0;
  }

  getLastLoginDate(): string | null {
    return this.get<string>(KEYS.lastLogin);
  }

  // ── Item Inventory (Local Mirror) ──────────────────────────────────────────
  getInventory(): ItemInventory {
    return this.get<ItemInventory>(KEYS.itemInventory) ?? {
      timeFreeze: 0,
      hintReveal: 0,
      eliminateOption: 0,
      secondChance: 0,
      checkpoint: 0,
      doublePoints: 0,
    };
  }

  updateInventory(inv: ItemInventory): void {
    this.set(KEYS.itemInventory, inv);
  }

  addItem(key: keyof ItemInventory, qty = 1): void {
    const inv = this.getInventory();
    inv[key] = (inv[key] ?? 0) + qty;
    this.updateInventory(inv);
  }

  consumeItem(key: keyof ItemInventory, qty = 1): boolean {
    const inv = this.getInventory();
    if ((inv[key] ?? 0) < qty) return false;
    inv[key] -= qty;
    this.updateInventory(inv);
    return true;
  }

  // ── Completed Categories ───────────────────────────────────────────────────
  getCompletedCategories(): string[] {
    return this.get<string[]>(KEYS.completedCats) ?? [];
  }

  markCategoryCompleted(category: string): void {
    const completed = new Set(this.getCompletedCategories());
    completed.add(category);
    this.set(KEYS.completedCats, Array.from(completed));
  }

  isCategoryCompleted(category: string): boolean {
    return this.getCompletedCategories().includes(category);
  }

  // ── Total Score ────────────────────────────────────────────────────────────
  getTotalLifetimeScore(): number {
    return this.get<number>(KEYS.totalScore) ?? 0;
  }

  addToTotalScore(points: number): void {
    const current = this.getTotalLifetimeScore();
    this.set(KEYS.totalScore, current + points);
  }

  // ── Internal helpers ───────────────────────────────────────────────────────
  private get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) as T : null;
    } catch {
      return null;
    }
  }

  private set(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      console.warn('LocalStorage write failed for key:', key);
    }
  }

  clearAll(): void {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  }
}
