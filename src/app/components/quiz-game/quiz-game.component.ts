import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { trigger, state, style, animate, transition, stagger, query, keyframes } from '@angular/animations';
import { GameStateService, QuizService } from '../../services/game-state.service';
import { LocalStorageService } from '../../services/local-storage.service';
import { SoundService } from '../../services/sound.service';
import { QuizCategory, QuizQuestion } from '../../models/game.models';
import confetti from 'canvas-confetti';

@Component({
  selector: 'app-quiz-game',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './quiz-game.component.html',
  styleUrl: './quiz-game.component.scss',
  animations: [
    trigger('questionAnim', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(60px)' }),
        animate('400ms cubic-bezier(0.34,1.56,0.64,1)',
          style({ opacity: 1, transform: 'translateX(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in',
          style({ opacity: 0, transform: 'translateX(-60px)' }))
      ]),
    ]),
    trigger('optionsAnim', [
      transition(':enter', [
        query('.bb-option', [
          style({ opacity: 0, transform: 'translateY(20px)' }),
          stagger(80, [
            animate('300ms cubic-bezier(0.34,1.56,0.64,1)',
              style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ]),
    trigger('countdownAnim', [
      transition(':enter', [
        animate('600ms cubic-bezier(0.34,1.56,0.64,1)', keyframes([
          style({ transform: 'scale(2)', opacity: 0, offset: 0 }),
          style({ transform: 'scale(1)', opacity: 1, offset: 0.4 }),
          style({ transform: 'scale(1)', opacity: 1, offset: 0.7 }),
          style({ transform: 'scale(0.5)', opacity: 0, offset: 1 }),
        ]))
      ])
    ]),
    trigger('resultBanner', [
      transition(':enter', [
        animate('400ms cubic-bezier(0.34,1.56,0.64,1)', keyframes([
          style({ transform: 'scale(0)', opacity: 0, offset: 0 }),
          style({ transform: 'scale(1.1)', opacity: 1, offset: 0.7 }),
          style({ transform: 'scale(1)', opacity: 1, offset: 1 }),
        ]))
      ])
    ]),
  ]
})
export class QuizGameComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  public  gs = inject(GameStateService);
  private quizService = inject(QuizService);
  private ls = inject(LocalStorageService);
  private sound = inject(SoundService);

  category = signal<QuizCategory | null>(null);
  loadError = signal('');
  countdownValue = signal(3);
  scorePopCoords = signal<{ x: number; y: number } | null>(null);
  scorePopAmount = signal(0);
  coinPopVisible = signal(false);

  readonly OPTION_LETTERS = ['A', 'B', 'C'];
  readonly MAX_LIVES = 3;

  // Derived from game state
  get phase() { return this.gs.phase; }
  get session() { return this.gs.session; }
  get currentQ() { return this.gs.currentQuestion; }
  get timeRem() { return this.gs.timeRemaining; }
  get showHint() { return this.gs.showHint; }
  get elimIdx() { return this.gs.eliminatedOptionIndex; }
  get lastCorrect() { return this.gs.lastAnswerCorrect; }
  get selectedIdx() { return this.gs.selectedOptionIndex; }
  get progress() { return this.gs.progress; }
  get multiplier() { return this.gs.streakMultiplier; }

  timerPercent = computed(() => {
    const q = this.gs.currentQuestion();
    if (!q) return 100;
    return Math.round((this.gs.timeRemaining() / q.timeLimit) * 100);
  });

  timerClass = computed(() => {
    const pct = this.timerPercent();
    if (pct <= 20) return 'bb-timer__fill--danger';
    if (pct <= 50) return 'bb-timer__fill--warning';
    return '';
  });

  livesArray = computed(() => {
    const sess = this.gs.session();
    const lives = sess?.lives ?? 0;
    return Array.from({ length: this.MAX_LIVES }, (_, i) => i < lives);
  });

  async ngOnInit() {
    const categoryKey = this.route.snapshot.paramMap.get('category') ?? '';

    try {
      const cat = await this.quizService.loadCategory(categoryKey);
      this.category.set(cat);
      this.sound.preloadGameSounds();
      this._startCountdown(cat);
    } catch {
      this.loadError.set(`Could not load category: ${categoryKey}`);
    }

    // Wire up callbacks
    this.gs.onQuestionEnd = (correct) => this._onQuestionEnd(correct);
  }

  ngOnDestroy() {
    this.gs.reset();
    this.sound.stopBackgroundMusic();
  }

  private _startCountdown(cat: QuizCategory): void {
    const questions = this.quizService.prepareRound(cat);
    this.gs.startSession(cat, questions);
    this.sound.play('beforestart');

    let count = 3;
    this.countdownValue.set(count);

    const interval = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(interval);
        this.gs.startQuestion();
        this.sound.startBackgroundMusic();
      } else {
        this.countdownValue.set(count);
        this.sound.play('click');
      }
    }, 900);
  }

  selectAnswer(index: number, event: MouseEvent): void {
    if (this.phase() !== 'playing') return;
    this.sound.play('answerpicked');
    this.gs.selectAnswer(index, this.quizService);
  }

  private _onQuestionEnd(correct: boolean): void {
    if (correct) {
      this.sound.play('correct');
      const streak = this.gs.session()?.currentStreak ?? 0;
      if (streak >= 5) this.sound.play('streak');
      this._showCoinPop();
    } else {
      this.sound.play('wrong');
      const lives = this.gs.session()?.lives ?? 0;
      if (lives === 0) {
        setTimeout(() => this._endGame(false), 800);
        return;
      }
    }

    // Wait for result anim, then advance
    const delay = correct ? 1400 : 1600;
    setTimeout(() => {
      const sess = this.gs.session();
      if ((sess?.lives ?? 0) <= 0) {
        this._endGame(false);
      } else {
        this.gs.nextQuestion();
        // play timer sound on last 5s — handled via timerClass watcher
      }
    }, delay);
  }

  private _endGame(won: boolean): void {
    this.sound.stopBackgroundMusic();
    if (won) {
      this.sound.play('victory');
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.65 }
      });
    } else {
      this.sound.play('gameEnd');
    }
    this.gs.endGame(won);

    // Save high score
    const sess = this.gs.session();
    if (sess) {
      this.ls.saveHighScore({
        category: sess.category,
        score: sess.score,
        correctCount: sess.correctCount,
        totalQuestions: sess.questions.length,
        date: new Date().toISOString(),
      });
      this.ls.addToTotalScore(sess.score);

      if (won) {
        this.ls.markCategoryCompleted(sess.category);
      }
    }
  }

  private _showCoinPop(): void {
    this.coinPopVisible.set(true);
    setTimeout(() => this.coinPopVisible.set(false), 900);
  }

  useTimeFreeze(): void {
    if (!this.ls.consumeItem('timeFreeze')) {
      alert('No Time Freeze items left! Buy more in the store.'); return;
    }
    this.gs.useTimeFreeze();
    this.sound.play('blue');
  }

  useHint(): void {
    if (!this.ls.consumeItem('hintReveal')) {
      alert('No Hint items left! Buy more in the store.'); return;
    }
    this.gs.revealHint();
    this.sound.play('magic');
  }

  useEliminate(): void {
    if (!this.ls.consumeItem('eliminateOption')) {
      alert('No Eliminate items left! Buy more in the store.'); return;
    }
    this.gs.eliminateWrongOption();
    this.sound.play('puffs');
  }

  pauseGame(): void {
    this.gs.pauseGame();
    this.sound.pauseBackgroundMusic();
    this.sound.play('click');
  }

  resumeGame(): void {
    this.gs.resumeGame();
    this.sound.resumeBackgroundMusic();
    this.sound.play('click');
  }

  quitGame(): void {
    this.sound.play('click');
    this.gs.reset();
    this.sound.stopBackgroundMusic();
    this.router.navigate(['/categories']);
  }

  playAgain(): void {
    this.sound.play('click');
    const cat = this.category();
    if (cat) {
      this.gs.reset();
      this._startCountdown(cat);
    }
  }

  goHome(): void {
    this.sound.play('click');
    this.router.navigate(['/']);
  }

  goCategories(): void {
    this.sound.play('click');
    this.router.navigate(['/categories']);
  }

  getOptionClass(index: number): string {
    const phase = this.phase();
    if (phase !== 'answering' && phase !== 'result') return '';
    const q = this.gs.currentQuestion();
    if (!q) return '';

    const isSelected = this.gs.selectedOptionIndex() === index;
    const isCorrect = q.options[index]?.isCorrect;

    if (isCorrect) return 'bb-option--correct';
    if (isSelected && !isCorrect) return 'bb-option--wrong';
    return '';
  }

  isOptionDisabled(index: number): boolean {
    const phase = this.phase();
    return phase === 'answering' || phase === 'paused' || index === (this.gs.eliminatedOptionIndex() ?? -1);
  }

  isOptionEliminated(index: number): boolean {
    return index === (this.gs.eliminatedOptionIndex() ?? -1);
  }

  getInventory() { return this.ls.getInventory(); }
}
