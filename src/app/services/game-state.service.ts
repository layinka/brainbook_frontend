import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  QuizCategory, QuizQuestion, GameSession, GamePhase,
  MilestoneNft, GameItemUsage
} from '../models/game.models';
import { environment } from '../../environments/environment';

const QUESTIONS_PER_ROUND = 20; // Number of questions per game session
const MAX_LIVES = 3;

@Injectable({ providedIn: 'root' })
export class QuizService {
  private http = inject(HttpClient);
  private cache = new Map<string, QuizCategory>();

  constructor() {}

  /** Load a category's quiz data (fetch from backend) */
  async loadCategory(categoryKey: string): Promise<QuizCategory> {
    if (this.cache.has(categoryKey)) {
      return this.cache.get(categoryKey)!;
    }
    
    const res = await this.http.get<any>(`${environment.apiUrl}/game/quiz/category/${categoryKey}`, { withCredentials: true }).toPromise();
    if (!res || !res.success) {
      throw new Error(`Failed to load category: ${categoryKey}`);
    }

    const categoryData: QuizCategory = {
      category: res.category.category,
      displayName: res.category.displayName,
      icon: res.category.icon,
      description: res.category.description,
      totalQuestions: res.category.totalQuestions,
      completionNft: res.category.completionNft,
      questions: res.questions || []
    };

    this.cache.set(categoryKey, categoryData);
    return categoryData;
  }

  /** Load all category manifests from backend database */
  async loadAllCategoryManifests(): Promise<Partial<QuizCategory>[]> {
    try {
      const res = await this.http.get<any>(`${environment.apiUrl}/game/quiz/categories`, { withCredentials: true }).toPromise();
      if (res && res.success && res.categories) {
        return res.categories.map((cat: any) => ({
          category: cat.category,
          displayName: cat.displayName,
          icon: cat.icon,
          description: cat.description,
          totalQuestions: cat.totalQuestions,
          completionNft: cat.completionNft
        }));
      }
    } catch (err) {
      console.error('Error fetching all categories manifests:', err);
    }
    return [];
  }

  /** Pick all questions in a topic shuffled */
  prepareRound(category: QuizCategory): QuizQuestion[] {
    return [...category.questions].sort(() => Math.random() - 0.5);
  }

  /** Calculate streak multiplier: 1x base, 2x at 5, 3x at 10 */
  getStreakMultiplier(streak: number): number {
    if (streak >= 10) return 3;
    if (streak >= 5) return 2;
    return 1;
  }

  /** Calculate final points for a question: base * streak multiplier */
  calculatePoints(question: QuizQuestion, streak: number, timeRemaining: number, timeLimit: number): number {
    const multiplier = this.getStreakMultiplier(streak);
    // Speed bonus: up to 50% extra if answered in first half of time
    const speedBonus = timeRemaining > timeLimit / 2 ? Math.floor(question.points * 0.5) : 0;
    return (question.points + speedBonus) * multiplier;
  }
}

// ─── Game State Service ───────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class GameStateService {
  // Reactive state signals
  readonly phase = signal<GamePhase>('idle');
  readonly session = signal<GameSession | null>(null);
  readonly timeRemaining = signal<number>(0);
  readonly showHint = signal<boolean>(false);
  readonly eliminatedOptionIndex = signal<number | null>(null);
  readonly lastAnswerCorrect = signal<boolean | null>(null);
  readonly selectedOptionIndex = signal<number | null>(null);

  // Computed derived values
  readonly currentQuestion = computed(() => {
    const s = this.session();
    if (!s) return null;
    return s.questions[s.currentIndex] ?? null;
  });

  readonly progress = computed(() => {
    const s = this.session();
    if (!s || !s.questions.length) return 0;
    return Math.round((s.currentIndex / s.questions.length) * 100);
  });

  readonly isLastQuestion = computed(() => {
    const s = this.session();
    if (!s) return false;
    return s.currentIndex >= s.questions.length - 1;
  });

  readonly streakMultiplier = computed(() => {
    const s = this.session();
    if (!s) return 1;
    if (s.currentStreak >= 10) return 3;
    if (s.currentStreak >= 5) return 2;
    return 1;
  });

  private timerInterval: ReturnType<typeof setInterval> | null = null;
  onTimerExpired?: () => void;
  onQuestionEnd?: (correct: boolean) => void;

  startSession(category: QuizCategory, questions: QuizQuestion[]): void {
    this.session.set({
      category: category.category,
      displayName: category.displayName,
      questions,
      currentIndex: 0,
      score: 0,
      correctCount: 0,
      wrongCount: 0,
      currentStreak: 0,
      bestStreak: 0,
      streakMultiplier: 1,
      lives: MAX_LIVES,
      startedAt: Date.now(),
      gameItemsUsed: [],
      milestoneNftsEarned: [],
      completionNftEarned: false,
    });
    this.phase.set('countdown');
    this.showHint.set(false);
    this.eliminatedOptionIndex.set(null);
  }

  startQuestion(): void {
    const q = this.currentQuestion();
    if (!q) return;
    this.timeRemaining.set(q.timeLimit);
    this.selectedOptionIndex.set(null);
    this.lastAnswerCorrect.set(null);
    this.showHint.set(false);
    this.eliminatedOptionIndex.set(null);
    this.phase.set('playing');
    this._startTimer();
  }

  selectAnswer(optionIndex: number, quizService: QuizService): void {
    if (this.phase() !== 'playing') return;
    this._stopTimer();
    this.phase.set('answering');

    const s = this.session();
    const q = this.currentQuestion();
    if (!s || !q) return;

    const isCorrect = q.options[optionIndex]?.isCorrect ?? false;
    this.selectedOptionIndex.set(optionIndex);
    this.lastAnswerCorrect.set(isCorrect);

    const timeLeft = this.timeRemaining();

    if (isCorrect) {
      const points = quizService.calculatePoints(q, s.currentStreak, timeLeft, q.timeLimit);
      const newStreak = s.currentStreak + 1;
      const earned = q.milestoneNft;

      this.session.update(sess => ({
        ...sess!,
        score: sess!.score + points,
        correctCount: sess!.correctCount + 1,
        currentStreak: newStreak,
        bestStreak: Math.max(sess!.bestStreak, newStreak),
        streakMultiplier: quizService.getStreakMultiplier(newStreak),
        milestoneNftsEarned: earned
          ? [...sess!.milestoneNftsEarned, earned]
          : sess!.milestoneNftsEarned,
      }));
    } else {
      const newLives = s.lives - 1;
      this.session.update(sess => ({
        ...sess!,
        wrongCount: sess!.wrongCount + 1,
        currentStreak: 0,
        streakMultiplier: 1,
        lives: newLives,
      }));
    }

    this.onQuestionEnd?.(isCorrect);
  }

  /** Called when timer runs out */
  timeUp(): void {
    this._stopTimer();
    const s = this.session();
    if (!s) return;

    const newLives = s.lives - 1;
    this.session.update(sess => ({
      ...sess!,
      wrongCount: sess!.wrongCount + 1,
      currentStreak: 0,
      lives: newLives,
    }));
    this.lastAnswerCorrect.set(false);
    this.phase.set('answering');
    this.onQuestionEnd?.(false);
  }

  nextQuestion(): void {
    const s = this.session();
    if (!s) return;

    // Check if out of lives
    if (s.lives <= 0) {
      this.endGame(false);
      return;
    }

    const nextIndex = s.currentIndex + 1;

    // Check if we've finished all questions
    if (nextIndex >= s.questions.length) {
      // Mark completion NFT
      this.session.update(sess => ({ ...sess!, completionNftEarned: true }));
      this.endGame(true);
      return;
    }

    this.session.update(sess => ({ ...sess!, currentIndex: nextIndex }));
    this.startQuestion();
  }

  endGame(won: boolean): void {
    this._stopTimer();
    this.session.update(sess => ({ ...sess!, endedAt: Date.now() }));
    this.phase.set('gameover');
  }

  pauseGame(): void {
    if (this.phase() !== 'playing') return;
    this._stopTimer();
    this.phase.set('paused');
  }

  resumeGame(): void {
    if (this.phase() !== 'paused') return;
    this.phase.set('playing');
    this._startTimer();
  }

  // ── Game Items ─────────────────────────────────────────────────────────────
  useTimeFreeze(extraSeconds = 5): void {
    const q = this.currentQuestion();
    if (!q || this.phase() !== 'playing') return;
    this.timeRemaining.update(t => t + extraSeconds);
    this._recordItemUse(1000, 'Time Freeze');
  }

  revealHint(): void {
    this.showHint.set(true);
    this._recordItemUse(1001, 'Hint Reveal');
  }

  eliminateWrongOption(): void {
    const q = this.currentQuestion();
    if (!q) return;
    // Find first wrong answer index that isn't already eliminated
    const wrongIdx = q.options.findIndex(
      (o, i) => !o.isCorrect && i !== this.eliminatedOptionIndex()
    );
    if (wrongIdx !== -1) {
      this.eliminatedOptionIndex.set(wrongIdx);
      this._recordItemUse(1002, 'Eliminate Option');
    }
  }

  applyDoublePoints(): void {
    this._recordItemUse(1005, 'Double Points');
    // Double points flag is tracked at the question level — handled in selectAnswer
  }

  private _recordItemUse(itemId: number, itemName: string): void {
    const s = this.session();
    if (!s) return;
    this.session.update(sess => ({
      ...sess!,
      gameItemsUsed: [
        ...sess!.gameItemsUsed,
        { itemId, itemName, usedAtQuestion: sess!.currentIndex }
      ],
    }));
  }

  private _startTimer(): void {
    this._stopTimer();
    this.timerInterval = setInterval(() => {
      const current = this.timeRemaining();
      if (current <= 1) {
        this.timeRemaining.set(0);
        this.timeUp();
      } else {
        this.timeRemaining.update(t => t - 1);
      }
    }, 1000);
  }

  private _stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  reset(): void {
    this._stopTimer();
    this.session.set(null);
    this.phase.set('idle');
    this.timeRemaining.set(0);
    this.showHint.set(false);
    this.eliminatedOptionIndex.set(null);
    this.lastAnswerCorrect.set(null);
    this.selectedOptionIndex.set(null);
  }
}
