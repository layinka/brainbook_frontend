import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { SoundService } from '../../services/sound.service';
import { LocalStorageService } from '../../services/local-storage.service';
import { Web3Service } from '../../services/web3';
import { GameContractService } from '../../services/game-contract.service';
import { QuizService } from '../../services/game-state.service';
import { AppToastService } from '../../services/app-toast.service';
import { environment } from '../../../environments/environment';
import { formatUnits, parseUnits, erc20Abi, createPublicClient, http } from 'viem';
import { celoSepolia, celo } from 'viem/chains';

// ── Test Token Config for Celo Sepolia ──
const TEST_TOKENS: Record<string, { address: `0x${string}`; symbol: string; decimals: number }> = {
  USDm: { address: '0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b', symbol: 'USDm', decimals: 18 },
  USDC: { address: '0x01C5C0122039549AD1493B8220cABEdD739BC44E', symbol: 'USDC', decimals: 6 },
};
const TEST_TRANSFER_RECIPIENT = '0xa745Be411aE9c429f68852302a0EED677981924F' as `0x${string}`;
const TEST_TRANSFER_AMOUNT = '5';

const CATEGORY_EMOJIS: Record<string, string> = {
  generalknowledge: '🧠',
  soccer: '⚽',
  gameofthrones: '⚔️',
  basicmath: '🔢',
  africa: '🌍',
  riddles: '🤔',
  bible: '📖',
  cars: '🚗',
  coffee: '☕',
  countriesineurope: '🇪🇺',
  finishthemovietitle: '🎬',
  generalmath: '📐',
  grammar: '📝',
  historytrivia: '📜',
  howimetyourmother: '🍺',
  internetculture: '🌐',
  namethecountry: '🗺️',
  namethesoccerplayer: '🏃',
  simpsons: '🍩',
  thefamilyguy: '📺',
  thewalkingdead: '🧟',
  worddefinition: '🔤'
};

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  private router = inject(Router);
  private sound = inject(SoundService);
  private ls = inject(LocalStorageService);
  private gameContract = inject(GameContractService);
  private quizService = inject(QuizService);
  private http = inject(HttpClient);
  private toast = inject(AppToastService);
  web3 = inject(Web3Service);

  loginStreak = signal(0);
  totalScore = signal(0);
  completedCount = signal(0);
  tokenBalance = signal('0.0');

  categoriesPreview = signal<any[]>([]);

  // Test button loading states
  testUsdmLoading = signal(false);
  testUsdcLoading = signal(false);

  constructor() {
    // Reactively fetch token balance and profile stats when wallet account changes
    effect(async () => {
      const account = this.web3.account$();
      if (account) {
        // Fetch wallet token balance
        try {
          const bal = await this.gameContract.getTokenBalance(account);
          const num = parseFloat(bal);
          this.tokenBalance.set(isNaN(num) ? '0.0' : num.toFixed(1));
        } catch {
          this.tokenBalance.set('0.0');
        }

        // Fetch live profile stats
        try {
          const res = await this.http.get<any>(`${environment.apiUrl}/game/profile`, { withCredentials: true }).toPromise();
          if (res && res.profile) {
            this.loginStreak.set(res.profile.currentDailyStreak || 0);
            this.totalScore.set(res.profile.totalScore || 0);
          }
        } catch (err) {
          console.warn('Could not sync home page stats with profile backend:', err);
        }

        // Fetch live session history to rebuild local stats and high scores cache
        try {
          const res = await this.http.get<any>(`${environment.apiUrl}/game/sessions`, { withCredentials: true }).toPromise();
          if (res && res.sessions) {
            this.ls.clearAll(); // Clear any previous session remnants

            const completedCats = new Set<string>();
            for (const sess of res.sessions) {
              const completed = (sess.correctCount + sess.wrongCount) >= sess.totalQuestions;

              this.ls.saveHighScore({
                category: sess.category,
                score: sess.score,
                correctCount: sess.correctCount,
                totalQuestions: sess.totalQuestions,
                date: sess.completedAt || new Date().toISOString()
              });

              if (completed) {
                completedCats.add(sess.category);
                this.ls.markCategoryCompleted(sess.category);
              }
            }

            // Sync total score to local storage key
            localStorage.setItem('brainbook.totalscore', String(this.totalScore()));
            this.completedCount.set(completedCats.size);
          }
        } catch (err) {
          console.warn('Could not sync session history from backend:', err);
        }
      } else {
        // Clear all token and profile details on disconnect
        this.tokenBalance.set('0.0');
        this.loginStreak.set(0);
        this.totalScore.set(0);
        this.completedCount.set(0);
        this.ls.clearAll(); // Reset local storage fallbacks to prevent data leak
      }
    });
  }

  async ngOnInit() {
    const account = this.web3.account$();
    if (!account) {
      this.loginStreak.set(this.ls.getLoginStreak());
      this.totalScore.set(this.ls.getTotalLifetimeScore());
      this.completedCount.set(this.ls.getCompletedCategories().length);
    }

    try {
      const manifests = await this.quizService.loadAllCategoryManifests();
      let featured = manifests
        .filter(c => c.isFeatured)
        .map(c => ({
          key: c.category,
          name: c.displayName,
          emoji: CATEGORY_EMOJIS[c.category ?? ''] || '💡'
        }));

      if (featured.length === 0) {
        featured = manifests.slice(0, 6).map(c => ({
          key: c.category,
          name: c.displayName,
          emoji: CATEGORY_EMOJIS[c.category ?? ''] || '💡'
        }));
      }

      this.categoriesPreview.set(featured);
    } catch (err) {
      console.error('Failed to load featured categories on homepage:', err);
    }
  }

  play(categoryKey: string): void {
    this.sound.play('click');
    this.router.navigate(['/play', categoryKey]);
  }

  goCategories(): void {
    this.sound.play('click');
    this.router.navigate(['/categories']);
  }

  goDaily(): void {
    this.sound.play('click');
    this.router.navigate(['/daily-rewards']);
  }

  // ── Test Token Methods (removable after testing) ──────────────────────────

  async testTokenAction(tokenKey: 'USDm' | 'USDC'): Promise<void> {
    const loadingSignal = tokenKey === 'USDm' ? this.testUsdmLoading : this.testUsdcLoading;
    if (loadingSignal()) return;
    loadingSignal.set(true);

    const account = this.web3.account$();
    if (!account) {
      this.toast.error('Wallet', 'Please connect wallet first.', 10000);
      loadingSignal.set(false);
      return;
    }

    const token = TEST_TOKENS[tokenKey];
    const chainId = this.web3.chainId;
    const isMiniPay = this.web3.isMiniPay$();

    try {
      // Determine which chain to use for publicClient
      const chain = chainId === 42220 ? celo : celoSepolia;

      const publicClient = createPublicClient({
        chain,
        transport: http(),
      });

      // Step 1: Check balance
      this.toast.show(`🔍 ${tokenKey}`, `Checking balance at ${token.address}`, 10000, 'bg-info text-light');

      const balanceRaw = await publicClient.readContract({
        address: token.address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [account as `0x${string}`],
      });
      const balFormatted = formatUnits(balanceRaw as bigint, token.decimals);
      this.toast.show(`💰 ${tokenKey} Balance`, `${balFormatted} ${token.symbol} | Contract: ${token.address}`, 10000, 'bg-success text-light');

      // Step 2: Transfer 5 tokens
      const transferAmount = parseUnits(TEST_TRANSFER_AMOUNT, token.decimals);
      if ((balanceRaw as bigint) < transferAmount) {
        this.toast.error(`❌ ${tokenKey}`, `Insufficient: ${balFormatted} < ${TEST_TRANSFER_AMOUNT} | ${token.address}`, 10000);
        loadingSignal.set(false);
        return;
      }

      this.toast.show(`📤 ${tokenKey}`, `Sending ${TEST_TRANSFER_AMOUNT} ${tokenKey} to ${TEST_TRANSFER_RECIPIENT.slice(0, 10)}... | Contract: ${token.address}`, 10000, 'bg-info text-light');

      // Use Web3Service.writeContractWithMiniPay — identical to how NFT minting, store purchases, and all other app contract calls work!
      const hash = await this.web3.writeContractWithMiniPay({
        address: token.address,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [TEST_TRANSFER_RECIPIENT, transferAmount]
      });

      this.toast.show(`⏳ ${tokenKey}`, `Tx submitted: ${hash.slice(0, 16)}... Waiting... | Contract: ${token.address}`, 10000, 'bg-info text-light');

      const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` });

      if (receipt.status === 'success') {
        this.toast.show(`✅ ${tokenKey}`, `Transfer OK! Tx: ${hash.slice(0, 20)}... | Contract: ${token.address}`, 10000, 'bg-success text-light');
      } else {
        this.toast.error(`❌ ${tokenKey}`, `Reverted. Tx: ${hash.slice(0, 20)}... | Contract: ${token.address}`, 10000);
      }

      // Re-check balance after transfer
      const newBal = await publicClient.readContract({
        address: token.address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [account as `0x${string}`],
      });
      const newBalFormatted = formatUnits(newBal as bigint, token.decimals);
      this.toast.show(`💰 ${tokenKey} New Balance`, `${newBalFormatted} ${token.symbol} | ${token.address}`, 10000, 'bg-warning text-dark');

    } catch (err: any) {
      console.error(`${tokenKey} test action failed:`, err);
      this.toast.error(`❌ ${tokenKey} Failed`, `${err?.message?.slice(0, 150) || 'Unknown error'} | ${token.address}`, 10000);
    } finally {
      loadingSignal.set(false);
    }
  }
}
