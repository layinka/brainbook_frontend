import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Web3Service } from '../../services/web3';
import { GameContractService } from '../../services/game-contract.service';
import { AppToastService } from '../../services/app-toast.service';
import { SoundService } from '../../services/sound.service';
import { environment } from '../../../environments/environment';
import { parseEther } from 'viem';
import confetti from 'canvas-confetti';

interface ReferredUser {
  id: string;
  name: string | null;
  displayName: string | null;
  walletAddress: string | null;
  createdAt: string;
}

interface LeaderboardEntry {
  displayName: string;
  avatarUrl: string | null;
  referralCount: number;
}

@Component({
  selector: 'app-referrals',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './referrals.component.html',
  styleUrl: './referrals.component.scss'
})
export class ReferralsComponent implements OnInit {
  w3s = inject(Web3Service);
  private gameContract = inject(GameContractService);
  private toast = inject(AppToastService);
  private sound = inject(SoundService);
  private http = inject(HttpClient);

  // Stats signals
  referralCode = signal<string | null>(null);
  totalReferrals = signal<number>(0);
  lastReferralDate = signal<string | null>(null);
  unclaimedTokens = signal<number>(0);
  totalTokensEarned = signal<number>(0);

  // List & Leaderboard signals
  referredUsers = signal<ReferredUser[]>([]);
  leaderboard = signal<LeaderboardEntry[]>([]);

  // Loading / processing states
  loadingStats = signal<boolean>(true);
  loadingUsers = signal<boolean>(true);
  loadingLeaderboard = signal<boolean>(true);
  claiming = signal<boolean>(false);

  // Copy and sharing feedback signals
  codeCopied = signal<boolean>(false);
  linkCopied = signal<boolean>(false);
  isShareApiSupported = signal<boolean>(false);

  ngOnInit(): void {
    this.refreshAll();
    if (typeof navigator !== 'undefined' && !!navigator.share) {
      this.isShareApiSupported.set(true);
    }
  }

  refreshAll(): void {
    void this.fetchReferralStats();
    void this.fetchReferralsList();
    void this.fetchLeaderboard();
  }

  async fetchReferralStats(): Promise<void> {
    this.loadingStats.set(true);
    try {
      const res = await this.http.get<any>(`${environment.apiUrl}/referrals/stats`, { withCredentials: true }).toPromise();
      if (res?.success && res.data) {
        this.referralCode.set(res.data.referralCode);
        this.totalReferrals.set(res.data.totalReferrals);
        this.lastReferralDate.set(res.data.lastReferralDate);
        this.unclaimedTokens.set(res.data.unclaimedTokens);
        this.totalTokensEarned.set(res.data.totalTokensEarned);
      }
    } catch (err) {
      console.error('Error fetching referral stats:', err);
    } finally {
      this.loadingStats.set(false);
    }
  }

  async fetchReferralsList(): Promise<void> {
    this.loadingUsers.set(true);
    try {
      const res = await this.http.get<any>(`${environment.apiUrl}/referrals/list?limit=15`, { withCredentials: true }).toPromise();
      if (res?.success && res.data?.referrals) {
        this.referredUsers.set(res.data.referrals);
      }
    } catch (err) {
      console.error('Error fetching referrals list:', err);
    } finally {
      this.loadingUsers.set(false);
    }
  }

  async fetchLeaderboard(): Promise<void> {
    this.loadingLeaderboard.set(true);
    try {
      const res = await this.http.get<any>(`${environment.apiUrl}/referrals/leaderboard`, { withCredentials: true }).toPromise();
      if (res?.success && res.data) {
        this.leaderboard.set(res.data);
      }
    } catch (err) {
      console.error('Error fetching referrals leaderboard:', err);
    } finally {
      this.loadingLeaderboard.set(false);
    }
  }

  getAvatarStyle(name: string): { background: string; iconColor: string } {
    if (!name) {
      return {
        background: 'linear-gradient(135deg, #1e1b4b 0%, #111827 100%)',
        iconColor: '#c084fc'
      };
    }
    
    // 1. Try to find the first character after "0x"
    let char = '';
    const lowerName = name.toLowerCase();
    const oxIndex = lowerName.indexOf('0x');
    if (oxIndex !== -1 && oxIndex + 2 < lowerName.length) {
      char = lowerName.charAt(oxIndex + 2);
    } else {
      char = lowerName.charAt(0);
    }

    // 2. Derive index from character code
    const charCode = char.charCodeAt(0) || 0;
    const index = charCode % 8;

    // 3. Define 8 premium neon gradients
    const gradients = [
      'linear-gradient(135deg, #4c1d95 0%, #1e1b4b 100%)', // Purple/Deep Blue
      'linear-gradient(135deg, #065f46 0%, #022c22 100%)', // Emerald/Deep Green
      'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)', // Blue/Dark Navy
      'linear-gradient(135deg, #831843 0%, #500724 100%)', // Pink/Maroon
      'linear-gradient(135deg, #7c2d12 0%, #431407 100%)', // Orange/Rust
      'linear-gradient(135deg, #115e59 0%, #134e4a 100%)', // Teal/Dark Teal
      'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', // Slate/Steel
      'linear-gradient(135deg, #581c87 0%, #3b0764 100%)'  // Violet/Plum
    ];

    // Define 8 corresponding SVG user silhouette colors (bright neon/pastel fills)
    const iconColors = [
      '#c084fc', // Light Purple
      '#34d399', // Emerald Green
      '#60a5fa', // Blue
      '#f472b6', // Pink
      '#fb923c', // Orange
      '#2dd4bf', // Teal
      '#cbd5e1', // Slate
      '#e879f9'  // Violet
    ];

    return {
      background: gradients[index],
      iconColor: iconColors[index]
    };
  }

  getInviteLink(): string {
    const code = this.referralCode();
    if (!code) return '';
    return `${window.location.origin}?ref=${code}`;
  }

  async copyReferralLink(): Promise<void> {
    const link = this.getInviteLink();
    if (!link) return;

    try {
      await navigator.clipboard.writeText(link);
      this.sound.play('click');
      this.toast.show('Copied!', 'Referral link copied to clipboard! 🚀', 3000, 'bg-success text-light');
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 2000);
    } catch (err) {
      this.toast.error('Copy Failed', 'Please select and copy manually.');
    }
  }

  async copyCode(): Promise<void> {
    const code = this.referralCode();
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      this.sound.play('click');
      this.toast.show('Copied!', 'Referral code copied! 🤝', 3000, 'bg-success text-light');
      this.codeCopied.set(true);
      setTimeout(() => this.codeCopied.set(false), 2000);
    } catch (err) {
      this.toast.error('Copy Failed', 'Failed to copy referral code.');
    }
  }

  shareOn(platform: 'twitter' | 'telegram' | 'whatsapp'): void {
    const link = this.getInviteLink();
    const code = this.referralCode();
    if (!link || !code) return;

    const text = `Join me on BrainBook to solve quizzes, test your knowledge, and earn crypto! Use my referral code: ${code}`;
    const url = encodeURIComponent(link);
    const encodedText = encodeURIComponent(text);

    let shareUrl = '';
    if (platform === 'twitter') {
      shareUrl = `https://twitter.com/intent/tweet?text=${encodedText}&url=${url}`;
    } else if (platform === 'telegram') {
      shareUrl = `https://t.me/share/url?url=${url}&text=${encodedText}`;
    } else if (platform === 'whatsapp') {
      const whatsappText = encodeURIComponent(`${text} ${link}`);
      shareUrl = `https://api.whatsapp.com/send?text=${whatsappText}`;
    }

    if (shareUrl) {
      this.sound.play('click');
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
    }
  }

  async shareNative(): Promise<void> {
    const link = this.getInviteLink();
    const code = this.referralCode();
    if (!link || !code) return;

    try {
      this.sound.play('click');
      await navigator.share({
        title: 'BrainBook Trivia',
        text: `Join me on BrainBook to solve quizzes and earn rewards! My code is: ${code}`,
        url: link
      });
      this.toast.show('Shared!', 'Thank you for sharing BrainBook! ❤️', 3000, 'bg-success text-light');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error sharing natively:', err);
      }
    }
  }

  async claimRewards(): Promise<void> {
    this.toast.show('Coming Soon', 'Token claims are temporarily disabled. Stay tuned!', undefined, 'bg-info text-light');
    return;

    /*
    if (this.unclaimedTokens() <= 0 || this.claiming()) return;

    this.sound.play('click');
    this.claiming.set(true);
    this.toast.show('Initiating Claim', 'Requesting verification signature from the game vault...', 4000, 'bg-info text-light');

    try {
      // 1. Post claim request to backend to obtain EIP-712 signature
      const claimRes = await this.http.post<any>(`${environment.apiUrl}/referrals/claim`, { chainId: this.w3s.chainId }, { withCredentials: true }).toPromise();
      
      if (!claimRes?.success || !claimRes?.signature) {
        throw new Error(claimRes?.error || 'Failed to acquire verification signature.');
      }

      const claimAmount = claimRes.amount;
      const signature = claimRes.signature;

      this.toast.show('Confirm Wallet Transaction', 'Please approve the minting transaction in your connected wallet...', 5000, 'bg-warning text-dark');

      // 2. Submit transaction to local wallet calling GameManager on-chain
      const amountWei = parseEther(claimAmount);
      const txHash = await this.gameContract.claimTokenReward(amountWei, signature);
      console.log('Claim tx confirmed, hash:', txHash);

      // Play victory audio and confetti
      this.sound.play('victory');
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 }
      });

      this.toast.show('Success!', `Claimed ${claimAmount} BRAINBOOK to your wallet! 🎉`, 5000, 'bg-success text-light');
      
      // 3. Refresh statistics
      this.refreshAll();
    } catch (err: any) {
      console.error('Claim rewards failed:', err);
      this.toast.error('Claim Failed', err.message || 'Transaction rejected or signature mismatch.');
    } finally {
      this.claiming.set(false);
    }
    */
  }
}
