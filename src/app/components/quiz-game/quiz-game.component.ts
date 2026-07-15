import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { trigger, state, style, animate, transition, stagger, query, keyframes } from '@angular/animations';
import { GameStateService, QuizService } from '../../services/game-state.service';
import { LocalStorageService } from '../../services/local-storage.service';
import { SoundService } from '../../services/sound.service';
import { AppToastService } from '../../services/app-toast.service';
import { Web3Service } from '../../services/web3';
import { GameContractService } from '../../services/game-contract.service';
import { SIWEAuthService } from '../../services/siwe-auth.service';
import { environment } from '../../../environments/environment';
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
  private http = inject(HttpClient);
  private toast = inject(AppToastService);
  public w3s = inject(Web3Service);
  private gameContract = inject(GameContractService);
  private siweAuth = inject(SIWEAuthService);

  category = signal<QuizCategory | null>(null);
  loadError = signal('');
  countdownValue = signal(3);
  scorePopCoords = signal<{ x: number; y: number } | null>(null);
  scorePopAmount = signal(0);
  coinPopVisible = signal(false);

  // Claimable rewards state
  tokensEarned = signal<number>(0);
  tokenSignature = signal<string>('');
  nftSignature = signal<string>('');
  claimingTokens = signal<boolean>(false);
  claimingNft = signal<boolean>(false);
  tokenClaimed = signal<boolean>(false);
  nftClaimed = signal<boolean>(false);

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

  sessionEarnedTokens = computed(() => {
    const sess = this.session();
    if (!sess) return 0;
    const qAnswered = sess.correctCount + sess.wrongCount;
    return parseFloat((qAnswered * 0.1).toFixed(1));
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

      // Submit session to backend database and generate signatures
      void this.submitSessionToBackend();
      
      // Check NFT eligibility and notify user of any unminted eligible NFTs
      void this.checkAndNotifyNFTEligibility();
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

  async submitSessionToBackend(): Promise<void> {
    const sess = this.gs.session();
    if (!sess) return;

    this.tokensEarned.set(0);
    this.tokenSignature.set('');
    this.nftSignature.set('');
    this.tokenClaimed.set(false);
    this.nftClaimed.set(false);

    const payload = {
      category: sess.category,
      score: sess.score,
      correctCount: sess.correctCount,
      wrongCount: sess.wrongCount,
      totalQuestions: sess.questions.length,
      timeTaken: Math.round((Date.now() - sess.startedAt) / 1000),
      streakReached: sess.bestStreak,
      gameItemsUsed: sess.gameItemsUsed.map(item => ({
        itemId: item.itemId,
        itemName: item.itemName,
        usedAtQuestion: item.usedAtQuestion
      }))
    };

    try {
      const res = await this.http.post<any>(`${environment.apiUrl}/game/sessions`, payload, { withCredentials: true }).toPromise();
      if (res && res.success) {
        this.tokensEarned.set(res.tokenReward || 0);
        this.tokenSignature.set(res.tokenSignature || '');
        this.nftSignature.set(res.nftSignature || '');
      }
    } catch (err) {
      console.error('Error submitting session to backend:', err);
    }
  }

  async checkAndNotifyNFTEligibility(): Promise<void> {
    // Don't check if wallet not connected
    if (!this.w3s.account$()) return;

    try {
      // 1. Get OG cutoff date from backend
      const cutoffRes = await this.http.get<any>(`${environment.apiUrl}/game/nft-rewards/og-cutoff-date`).toPromise();
      if (!cutoffRes || !cutoffRes.success) {
        console.warn('Failed to get OG cutoff date');
        return;
      }

      const ogCutoffDate = new Date(cutoffRes.ogCutoffDate);
      
      // 2. Check ownership from blockchain
      const [ogOwned, firstPlayOwned] = await Promise.all([
        this.gameContract.checkNFTOwnership(1), // OG NFT token ID
        this.gameContract.checkNFTOwnership(2)  // First Play NFT token ID
      ]);

      // 3. Check OG eligibility - user must be created before cutoff date
      const session = this.siweAuth.authService.session();
      const userCreatedAt = session?.user?.createdAt ? new Date(session.user.createdAt) : null;
      const ogEligible = userCreatedAt && userCreatedAt < ogCutoffDate;

      // 4. First Play eligibility - user just finished a game, so they're eligible
      const firstPlayEligible = true;
      const firstPlayCompletedBefore = this.ls.hasPlayedFirstGame();

      // If they already own the NFT but local storage isn't set, sync it
      if (firstPlayOwned && !firstPlayCompletedBefore) {
        this.ls.markFirstGamePlayed();
      }

      // 5. Show celebratory notifications for unminted eligible NFTs
      if (ogEligible && !ogOwned) {
        setTimeout(() => {
          this.toast.show(
            '🏆 OG Badge Available!', 
            'You\'re eligible for the exclusive OG NFT badge! Visit the Rewards page to claim it.', 
            8000, 
            'bg-warning text-dark'
          );
        }, 2000); // Delay to not overlap with game completion toasts
      }

      if (firstPlayEligible && !firstPlayOwned && !firstPlayCompletedBefore) {
        setTimeout(() => {
          this.toast.show(
            '🎮 First Play Badge Available!', 
            'Congratulations on completing your first game! Claim your First Play NFT badge on the Rewards page.', 
            8000, 
            'bg-info text-light'
          );
        }, ogEligible && !ogOwned ? 4000 : 2000); // Stagger if both notifications needed
        
        this.ls.markFirstGamePlayed();
      }
    } catch (err) {
      console.error('Error checking NFT eligibility:', err);
      // Silently fail - don't interrupt the user's game experience
    }
  }

  async claimSessionTokens(): Promise<void> {
    // Check if token claims are enabled in frontend
    if (!environment.tokenClaimsEnabled) {
      this.toast.show('Coming Soon', 'Token claims are temporarily disabled. Stay tuned!', undefined, 'bg-info text-light');
      return;
    }

    if (!this.w3s.account$()) {
      this.toast.error('Wallet Disconnected', 'Please connect your wallet first.');
      return;
    }
    
    this.claimingTokens.set(true);
    try {
      // 1. Fetch EIP-712 signature from backend for all unclaimed game rewards
      const claimRes = await this.http.post<any>(`${environment.apiUrl}/game/rewards/claim`, {}, { withCredentials: true }).toPromise();
      
      // Check if claims are temporarily disabled (backend-side check)
      if (claimRes?.comingSoon) {
        this.toast.show('Coming Soon', claimRes.message || 'Token claims are temporarily disabled. Stay tuned!', undefined, 'bg-info text-light');
        this.claimingTokens.set(false);
        return;
      }
      
      if (!claimRes || !claimRes.success || !claimRes.signature || claimRes.signature === '0x') {
        throw new Error(claimRes?.error || 'Failed to acquire signature from game vault.');
      }
      
      const claimAmount = parseFloat(claimRes.amount);
      const signature = claimRes.signature;
      
      // 2. Call contract using BigInt scaling or parseEther
      const amountInWei = BigInt(Math.round(claimAmount * 10000)) * (10n ** 14n);
      await this.gameContract.claimTokenReward(amountInWei, signature);

      // 3. Confirm claim on the backend database
      try {
        await this.http.post<any>(`${environment.apiUrl}/game/rewards/confirm-claim`, { signature }, { withCredentials: true }).toPromise();
      } catch (confirmErr) {
        console.warn('Backend confirmation failed (retrying should show as claimed once resolved):', confirmErr);
      }
      
      this.toast.show('Claim Successful!', `${claimAmount} BRAINBOOK claimed to wallet!`, undefined, 'bg-success text-light');
      this.tokenClaimed.set(true);
      this.tokensEarned.set(0); // reset
    } catch (err: any) {
      console.error('Token claim failed:', err);
      this.toast.error('Claim Failed', err?.message || 'Transaction rejected.');
    } finally {
      this.claimingTokens.set(false);
    }
  }

  async claimSessionNft(): Promise<void> {
    const cat = this.category();
    if (!cat || !cat.completionNft) return;
    if (!this.w3s.account$()) {
      this.toast.error('Wallet Disconnected', 'Please connect your wallet first.');
      return;
    }

    this.claimingNft.set(true);
    try {
      await this.gameContract.claimAchievement(cat.completionNft.tokenId, 1, this.nftSignature());
      this.toast.show('Claim Successful!', `${cat.completionNft.name} badge minted to wallet!`, undefined, 'bg-success text-light');
      this.nftClaimed.set(true);
    } catch (err: any) {
      console.error('NFT claim failed:', err);
      this.toast.error('Claim Failed', err?.message || 'Transaction rejected.');
    } finally {
      this.claimingNft.set(false);
    }
  }
}
