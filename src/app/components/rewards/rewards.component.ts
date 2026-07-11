import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Web3Service } from '../../services/web3';
import { GameContractService } from '../../services/game-contract.service';
import { AppToastService } from '../../services/app-toast.service';
import { environment } from '../../../environments/environment';
import { W3MCoreButtonComponentWrapperComponent } from '../../w3-mcore-button-component-wrapper/w3-mcore-button-component-wrapper.component';

@Component({
  selector: 'app-rewards',
  standalone: true,
  imports: [CommonModule, RouterLink, W3MCoreButtonComponentWrapperComponent],
  templateUrl: './rewards.component.html',
  styleUrl: './rewards.component.scss'
})
export class RewardsComponent implements OnInit {
  private http = inject(HttpClient);
  w3s = inject(Web3Service);
  private gameContract = inject(GameContractService);
  private toast = inject(AppToastService);

  rewardsConfig = environment.rewards;

  // States
  totalEarned = signal<number>(0);
  unclaimedTokens = signal<number>(0);
  loadingStats = signal<boolean>(false);
  claiming = signal<boolean>(false);

  // NFT Achievement states
  ogEligible = signal<boolean>(false);
  firstPlayEligible = signal<boolean>(false);
  ogAlreadyMinted = signal<boolean>(false);
  firstPlayAlreadyMinted = signal<boolean>(false);
  mintingOG = signal<boolean>(false);
  mintingFirstPlay = signal<boolean>(false);
  ogCutoffDate = signal<string>('');

  // NFT Token IDs
  readonly OG_NFT_ID = 1;
  readonly FIRST_PLAY_NFT_ID = 2;

  constructor() {
    // Re-fetch stats when the account changes
    effect(() => {
      const acct = this.w3s.account$();
      if (acct) {
        this.fetchRewardStats();
        void this.checkNFTEligibility();
        void this.checkNFTOwnership();
      } else {
        this.totalEarned.set(0);
        this.unclaimedTokens.set(0);
        this.ogEligible.set(false);
        this.firstPlayEligible.set(false);
        this.ogAlreadyMinted.set(false);
        this.firstPlayAlreadyMinted.set(false);
      }
    });
  }

  ngOnInit(): void {}

  async fetchRewardStats(): Promise<void> {
    this.loadingStats.set(true);
    try {
      const res = await this.http.get<any>(`${environment.apiUrl}/game/rewards/stats`, { withCredentials: true }).toPromise();
      if (res && res.success && res.data) {
        this.totalEarned.set(res.data.totalTokensEarned || 0);
        this.unclaimedTokens.set(res.data.unclaimedTokens || 0);
      }
    } catch (err) {
      console.error('Error fetching game rewards stats:', err);
    } finally {
      this.loadingStats.set(false);
    }
  }

  async claimRewards(): Promise<void> {
    // Check if token claims are enabled
    if (!environment.tokenClaimsEnabled) {
      this.toast.show('Coming Soon', 'Token claims are temporarily disabled. Stay tuned!', undefined, 'bg-info text-light');
      return;
    }

    if (this.unclaimedTokens() <= 0 || this.claiming()) return;

    if (!this.w3s.account$()) {
      this.toast.error('Wallet Disconnected', 'Please connect your Web3 wallet first.');
      return;
    }

    this.claiming.set(true);
    this.toast.show('Initiating Claim', 'Requesting verification signature from the game vault...', 4000, 'bg-info text-light');

    try {
      // 1. Post claim request to backend to obtain EIP-712 signature
      const claimRes = await this.http.post<any>(`${environment.apiUrl}/game/rewards/claim`, {}, { withCredentials: true }).toPromise();

      // Check if claims are temporarily disabled (backend-side check)
      if (claimRes?.comingSoon) {
        this.toast.show('Coming Soon', claimRes.message || 'Token claims are temporarily disabled. Stay tuned!', undefined, 'bg-info text-light');
        this.claiming.set(false);
        return;
      }

      if (!claimRes || !claimRes.success || !claimRes.signature || claimRes.signature === '0x') {
        throw new Error(claimRes?.error || 'Failed to acquire verification signature.');
      }

      const claimAmount = parseFloat(claimRes.amount);
      const signature = claimRes.signature;

      this.toast.show('Wallet Prompt', `Confirm transaction to claim ${claimAmount} BRAINBOOK...`, 4000, 'bg-info text-light');

      // 2. Call contract using BigInt scaling
      const amountWei = BigInt(Math.round(claimAmount * 10000)) * (10n ** 14n);
      const txHash = await this.gameContract.claimTokenReward(amountWei, signature);

      // 3. Confirm claim on the backend database
      try {
        await this.http.post<any>(`${environment.apiUrl}/game/rewards/confirm-claim`, { signature }, { withCredentials: true }).toPromise();
      } catch (confirmErr) {
        console.warn('Backend confirmation failed:', confirmErr);
      }

      this.toast.show('Claim Confirmed', `${claimAmount} BRAINBOOK has been minted to your wallet!`, 5000, 'bg-success text-light');

      // 4. Clear unclaimed amount and refresh balances
      this.unclaimedTokens.set(0);
      this.fetchRewardStats();
    } catch (err: any) {
      console.error('Claiming rewards failed:', err);
      this.toast.error('Claim Failed', err?.message || 'Transaction could not be completed.');
    } finally {
      this.claiming.set(false);
    }
  }

  async checkNFTEligibility(): Promise<void> {
    try {
      const res = await this.http.get<any>(`${environment.apiUrl}/game/nft-rewards/eligibility`, { withCredentials: true }).toPromise();
      if (res && res.success) {
        this.ogEligible.set(res.ogEligible);
        this.firstPlayEligible.set(res.firstPlayEligible);
        this.ogCutoffDate.set(res.ogCutoffDate);
      }
    } catch (err) {
      console.error('Error checking NFT eligibility:', err);
    }
  }

  async checkNFTOwnership(): Promise<void> {
    try {
      const ogOwned = await this.gameContract.checkNFTOwnership(this.OG_NFT_ID);
      const firstPlayOwned = await this.gameContract.checkNFTOwnership(this.FIRST_PLAY_NFT_ID);
      
      this.ogAlreadyMinted.set(ogOwned);
      this.firstPlayAlreadyMinted.set(firstPlayOwned);
    } catch (err) {
      console.error('Error checking NFT ownership:', err);
    }
  }

  async mintOGNFT(): Promise<void> {
    if (!this.w3s.account$()) {
      this.toast.error('Wallet Disconnected', 'Please connect your Web3 wallet first.');
      return;
    }

    if (this.mintingOG()) return;

    this.mintingOG.set(true);
    this.toast.show('Initiating Mint', 'Requesting OG NFT signature...', 4000, 'bg-info text-light');

    try {
      // Get signature from backend
      const mintRes = await this.http.post<any>(`${environment.apiUrl}/game/nft-rewards/mint-og`, {}, { withCredentials: true }).toPromise();

      if (!mintRes || !mintRes.success || !mintRes.signature) {
        throw new Error(mintRes?.error || 'Failed to get mint signature');
      }

      this.toast.show('Wallet Prompt', 'Confirm transaction to mint your OG NFT...', 4000, 'bg-info text-light');

      // Call contract to mint
      const txHash = await this.gameContract.mintAchievementNFT(this.OG_NFT_ID, mintRes.signature);

      this.toast.show('Mint Successful!', 'Your OG NFT has been minted!', 5000, 'bg-success text-light');
      
      // Update ownership status
      this.ogAlreadyMinted.set(true);
    } catch (err: any) {
      console.error('OG NFT mint failed:', err);
      this.toast.error('Mint Failed', err?.message || 'Transaction could not be completed.');
    } finally {
      this.mintingOG.set(false);
    }
  }

  async mintFirstPlayNFT(): Promise<void> {
    if (!this.w3s.account$()) {
      this.toast.error('Wallet Disconnected', 'Please connect your Web3 wallet first.');
      return;
    }

    if (this.mintingFirstPlay()) return;

    this.mintingFirstPlay.set(true);
    this.toast.show('Initiating Mint', 'Requesting First Play NFT signature...', 4000, 'bg-info text-light');

    try {
      // Get signature from backend
      const mintRes = await this.http.post<any>(`${environment.apiUrl}/game/nft-rewards/mint-first-play`, {}, { withCredentials: true }).toPromise();

      if (!mintRes || !mintRes.success || !mintRes.signature) {
        throw new Error(mintRes?.error || 'Failed to get mint signature');
      }

      this.toast.show('Wallet Prompt', 'Confirm transaction to mint your First Play NFT...', 4000, 'bg-info text-light');

      // Call contract to mint
      const txHash = await this.gameContract.mintAchievementNFT(this.FIRST_PLAY_NFT_ID, mintRes.signature);

      this.toast.show('Mint Successful!', 'Your First Play NFT has been minted!', 5000, 'bg-success text-light');
      
      // Update ownership status
      this.firstPlayAlreadyMinted.set(true);
    } catch (err: any) {
      console.error('First Play NFT mint failed:', err);
      this.toast.error('Mint Failed', err?.message || 'Transaction could not be completed.');
    } finally {
      this.mintingFirstPlay.set(false);
    }
  }
}
