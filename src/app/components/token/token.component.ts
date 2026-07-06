import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Web3Service } from '../../services/web3';
import { GameContractService } from '../../services/game-contract.service';

import { parseEther } from 'viem';
import { W3MCoreButtonComponentWrapperComponent } from '../../w3-mcore-button-component-wrapper/w3-mcore-button-component-wrapper.component';

@Component({
  selector: 'app-token',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, W3MCoreButtonComponentWrapperComponent],
  templateUrl: './token.component.html',
  styleUrl: './token.component.scss'
})
export class TokenComponent implements OnInit {
  w3s = inject(Web3Service);
  private gameContract = inject(GameContractService);

  // Staking details signals
  tokenBalance = signal<string>('0.0');
  stakedBalance = signal<string>('0.0');
  totalStaked = signal<string>('0.0');
  earnedRewards = signal<string>('0.0');
  allowance = signal<bigint>(0n);
  tokenPrice = signal<string>('0.10'); // Launch target price on Uniswap V4

  // Staking interaction UI state
  activeTab: 'stake' | 'unstake' = 'stake';
  stakeAmount: number | null = null;
  unstakeAmount: number | null = null;

  // Loader flags
  loadingApprove = signal<boolean>(false);
  loadingStake = signal<boolean>(false);
  loadingUnstake = signal<boolean>(false);
  loadingClaim = signal<boolean>(false);
  loadingExit = signal<boolean>(false);

  constructor() {
    // Re-fetch stats when the account changes
    effect(() => {
      const account = this.w3s.account$();
      if (account) {
        this.fetchStats();
      }
    });
  }

  ngOnInit() {
    if (this.w3s.account$()) {
      this.fetchStats();
    }
  }

  async fetchStats() {
    const address = this.w3s.account$();
    if (!address) return;

    try {
      const [bal, staked, total, earned, allow] = await Promise.all([
        this.gameContract.getTokenBalance(address),
        this.gameContract.getStakedBalance(address),
        this.gameContract.getTotalStaked(),
        this.gameContract.getEarnedRewards(address),
        this.gameContract.getStakingAllowance(address)
      ]);

      this.tokenBalance.set(parseFloat(bal).toFixed(2));
      this.stakedBalance.set(parseFloat(staked).toFixed(2));
      this.totalStaked.set(parseFloat(total).toFixed(2));
      this.earnedRewards.set(parseFloat(earned).toFixed(2));
      this.allowance.set(allow);
    } catch (err) {
      console.error('Failed to load staking stats:', err);
    }
  }

  needApprove(): boolean {
    if (!this.stakeAmount || this.stakeAmount <= 0) return false;
    try {
      const amountWei = parseEther(this.stakeAmount.toString());
      return amountWei > this.allowance();
    } catch (err) {
      return false;
    }
  }

  setStakeMax() {
    this.stakeAmount = parseFloat(this.tokenBalance());
  }

  setUnstakeMax() {
    this.unstakeAmount = parseFloat(this.stakedBalance());
  }

  async approveTokens() {
    if (!this.stakeAmount || this.stakeAmount <= 0) return;
    this.loadingApprove.set(true);
    try {
      await this.gameContract.approveStaking(this.stakeAmount.toString());
      await this.fetchStats();
    } catch (err) {
      console.error('Approval failed:', err);
    } finally {
      this.loadingApprove.set(false);
    }
  }

  async stakeTokens() {
    if (!this.stakeAmount || this.stakeAmount <= 0) return;
    this.loadingStake.set(true);
    try {
      await this.gameContract.stake(this.stakeAmount.toString());
      this.stakeAmount = null;
      await this.fetchStats();
    } catch (err) {
      console.error('Staking failed:', err);
    } finally {
      this.loadingStake.set(false);
    }
  }

  async withdrawTokens() {
    if (!this.unstakeAmount || this.unstakeAmount <= 0) return;
    this.loadingUnstake.set(true);
    try {
      await this.gameContract.withdrawStaking(this.unstakeAmount.toString());
      this.unstakeAmount = null;
      await this.fetchStats();
    } catch (err) {
      console.error('Withdrawal failed:', err);
    } finally {
      this.loadingUnstake.set(false);
    }
  }

  async claimRewards() {
    this.loadingClaim.set(true);
    try {
      await this.gameContract.getStakingReward();
      await this.fetchStats();
    } catch (err) {
      console.error('Claiming rewards failed:', err);
    } finally {
      this.loadingClaim.set(false);
    }
  }

  async exitStaking() {
    if (!confirm('Are you sure you want to withdraw all staked tokens and claim your yield?')) return;
    this.loadingExit.set(true);
    try {
      await this.gameContract.exitStaking();
      await this.fetchStats();
    } catch (err) {
      console.error('Exit failed:', err);
    } finally {
      this.loadingExit.set(false);
    }
  }
}
