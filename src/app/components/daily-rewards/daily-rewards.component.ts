import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Web3Service } from '../../services/web3';
import { GameContractService } from '../../services/game-contract.service';
import { AppToastService } from '../../services/app-toast.service';
import { SoundService } from '../../services/sound.service';
import { environment } from '../../../environments/environment';
import confetti from 'canvas-confetti';

interface CalendarDay {
  dayNumber: number;
  rewardText: string;
  icon: string;
}

@Component({
  selector: 'app-daily-rewards',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './daily-rewards.component.html',
  styleUrl: './daily-rewards.component.scss'
})
export class DailyRewardsComponent implements OnInit, OnDestroy {
  w3s = inject(Web3Service);
  private gameContract = inject(GameContractService);
  private toast = inject(AppToastService);
  private sound = inject(SoundService);
  private http = inject(HttpClient);

  readonly calendarDays: CalendarDay[] = [
    { dayNumber: 1, rewardText: '10 Tokens', icon: '🪙' },
    { dayNumber: 2, rewardText: '20 Tokens', icon: '🪙' },
    { dayNumber: 3, rewardText: '30 Tokens', icon: '🪙' },
    { dayNumber: 4, rewardText: '40 Tokens', icon: '🪙' },
    { dayNumber: 5, rewardText: '50 Tokens', icon: '🪙' },
    { dayNumber: 6, rewardText: '100 Tokens', icon: '💰' },
    { dayNumber: 7, rewardText: 'Weekly Warrior NFT', icon: '🛡️' }
  ];

  // Component states
  loading = signal(true);
  canClaim = signal(false);
  currentDay = signal(1);
  currentStreak = signal(0);
  secondsUntilNextClaim = signal(0);
  formattedTimeRemaining = signal('00:00:00');

  // NFT Claim States
  pendingClaim = signal<boolean>(false);
  mintingClaim = signal<boolean>(false);
  pendingSignature = '';

  private countdownInterval: any;

  ngOnInit(): void {
    void this.fetchRewardsState();
  }

  ngOnDestroy(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }

  /**
   * Fetches daily reward calendar state from backend API
   */
  async fetchRewardsState(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.http.get<any>(`${environment.apiUrl}/game/daily-rewards`, { withCredentials: true }).toPromise();
      
      if (res) {
        this.canClaim.set(res.canClaim);
        this.currentDay.set(res.currentDay);
        this.currentStreak.set(res.currentStreak);
        this.secondsUntilNextClaim.set(res.secondsUntilNextClaim || 0);

        if (!res.canClaim && res.secondsUntilNextClaim > 0) {
          this.startCountdown();
        }
      }
    } catch (err) {
      console.error('Error fetching daily rewards:', err);
      this.toast.error('Error', 'Failed to retrieve daily calendar.');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Post daily reward claim
   */
  async claimReward(): Promise<void> {
    if (!this.canClaim()) return;

    this.loading.set(true);
    try {
      const res = await this.http.post<any>(`${environment.apiUrl}/game/daily-rewards/claim`, {}, { withCredentials: true }).toPromise();
      
      if (res && res.success) {
        this.sound.play('giftbox');
        this.triggerConfetti();

        this.toast.show(
          'Claimed!',
          `Successfully claimed Day ${this.currentDay()} reward: ${res.reward.rewardAmount} ${res.reward.rewardType}!`,
          undefined,
          'bg-success text-light'
        );

        // Day 7: Check for Web3 NFT reward signature
        if (res.reward.rewardType === 'nft' && res.signature) {
          this.pendingSignature = res.signature;
          this.pendingClaim.set(true);
        }

        // Re-sync states
        await this.fetchRewardsState();
      }
    } catch (err: any) {
      console.error('Error claiming daily reward:', err);
      this.toast.error('Claim Failed', err?.error?.message || 'Failed to claim reward.');
      this.loading.set(false);
    }
  }

  /**
   * Mints pending Day 7 achievement NFT on Celo blockchain
   */
  async mintPendingClaim(): Promise<void> {
    if (!this.w3s.account$()) {
      this.toast.error('Wallet Disconnected', 'Please connect your wallet to mint your NFT.');
      return;
    }

    this.mintingClaim.set(true);
    this.toast.show('Minter Executed', 'Mints Weekly Warrior badge NFT on Celo...', undefined, 'bg-info text-light');

    try {
      // Achievement NFT ID 201 (Weekly Warrior)
      await this.gameContract.claimAchievement(201, 1, this.pendingSignature);
      
      this.sound.play('winnerParty');
      this.toast.show('Minting Success!', 'Weekly Warrior soulbound badge minted to your wallet!', undefined, 'bg-success text-light');
      this.pendingClaim.set(false);
      this.pendingSignature = '';
    } catch (err: any) {
      console.error('Minting failed:', err);
      this.toast.error('Minting Failed', err?.message || 'Transaction rejected.');
    } finally {
      this.mintingClaim.set(false);
    }
  }

  cancelPendingClaim(): void {
    this.pendingClaim.set(false);
    this.pendingSignature = '';
    this.toast.show('Claim Deferred', 'You can claim this badge later in your Profile page.', undefined, 'bg-info text-light');
  }

  private startCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }

    this.updateFormattedTime();

    this.countdownInterval = setInterval(() => {
      const remaining = this.secondsUntilNextClaim();
      if (remaining <= 1) {
        this.secondsUntilNextClaim.set(0);
        this.canClaim.set(true);
        clearInterval(this.countdownInterval);
      } else {
        this.secondsUntilNextClaim.set(remaining - 1);
        this.updateFormattedTime();
      }
    }, 1000);
  }

  private updateFormattedTime(): void {
    const totalSecs = this.secondsUntilNextClaim();
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');
    this.formattedTimeRemaining.set(`${pad(hrs)}:${pad(mins)}:${pad(secs)}`);
  }

  private triggerConfetti(): void {
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.65 }
    });
  }
}
