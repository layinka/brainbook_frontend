import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GameContractService } from '../../services/game-contract.service';
import { Web3Service } from '../../services/web3';
import { AppToastService } from '../../services/app-toast.service';
import confetti from 'canvas-confetti';

@Component({
  selector: 'app-presale',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './presale.component.html',
  styleUrl: './presale.component.scss'
})
export class PresaleComponent implements OnInit {
  public gameContract = inject(GameContractService);
  public w3s = inject(Web3Service);
  private toast = inject(AppToastService);

  // Input states
  buyAmountCusd = signal<number>(10); // default buy amount

  // UI state
  loading = signal<boolean>(true);
  buying = signal<boolean>(false);
  approving = signal<boolean>(false);

  // Contract states (loaded from contract)
  totalCusdRaised = signal<string>('0');
  totalTokensSold = signal<string>('0');
  tokenPriceInCusd = signal<string>('0.01'); // default fallback shown during load
  hardcap = signal<string>('500000');
  isPaused = signal<boolean>(false);
  presaleStarted = signal<boolean>(true);
  presaleEnded = signal<boolean>(false);

  // User balance states
  userCusdBalance = signal<string>('0');
  cusdAllowance = signal<string>('0');

  // Computed estimations
  estimatedTokens = computed(() => {
    const input = this.buyAmountCusd() || 0;
    const priceStr = this.tokenPriceInCusd();
    const price = parseFloat(priceStr) || 0.01;
    if (price === 0) return 0;
    return Math.round(input / price);
  });

  percentageRaised = computed(() => {
    const raised = parseFloat(this.totalCusdRaised()) || 0;
    const cap = parseFloat(this.hardcap()) || 500000;
    if (cap === 0) return 0;
    const percentage = (raised / cap) * 100;
    return Math.min(percentage, 100);
  });

  isAllowanceSufficient = computed(() => {
    const input = this.buyAmountCusd() || 0;
    const allowance = parseFloat(this.cusdAllowance()) || 0;
    return allowance >= input;
  });

  constructor() {
    // Reload stats when account/network state changes
    effect(() => {
      if (this.w3s.account$()) {
        void this.loadPresaleStats();
      }
    });
  }

  ngOnInit(): void {
    void this.loadPresaleStats();
  }

  parseFloat(val: string): number {
    return parseFloat(val);
  }

  async loadPresaleStats(): Promise<void> {
    this.loading.set(true);
    try {
      // 1. Fetch presale configuration values
      const raised = await this.gameContract.getPresaleRaised();
      const sold = await this.gameContract.getPresaleSold();
      const price = await this.gameContract.getPresalePrice();
      const cap = await this.gameContract.getPresaleHardcap();
      const paused = await this.gameContract.getPresalePaused();
      const startTime = await this.gameContract.getPresaleStartTime();
      const endTime = await this.gameContract.getPresaleEndTime();

      this.totalCusdRaised.set(raised);
      this.totalTokensSold.set(sold);
      this.tokenPriceInCusd.set(price);
      this.hardcap.set(cap);
      this.isPaused.set(paused);

      const now = Math.floor(Date.now() / 1000);
      this.presaleStarted.set(now >= startTime);
      this.presaleEnded.set(now >= endTime || parseFloat(raised) >= parseFloat(cap));

      // 2. Fetch user specific stats
      const account = this.w3s.account$();
      if (account) {
        const bal = await this.gameContract.getCusdBalance(account);
        const allowance = await this.gameContract.getCusdAllowance(account);
        this.userCusdBalance.set(bal);
        this.cusdAllowance.set(allowance);
      }
    } catch (err) {
      console.error('Failed to load presale stats:', err);
    } finally {
      this.loading.set(false);
    }
  }

  async approveCusd(): Promise<void> {
    const account = this.w3s.account$();
    if (!account) {
      this.toast.show('Wallet Disconnected', 'Please connect your wallet first.', undefined, 'bg-warning text-light');
      return;
    }

    const amount = this.buyAmountCusd();
    if (amount <= 0) {
      this.toast.error('Invalid Amount', 'Please specify a positive cUSD amount.');
      return;
    }

    this.approving.set(true);
    try {
      const hash = await this.gameContract.approveCusdForPresale(amount.toString());
      this.toast.show('Approval Succeeded', 'cUSD spend allowance updated.', undefined, 'bg-success text-light');
      
      // Reload allowance
      const allowance = await this.gameContract.getCusdAllowance(account);
      this.cusdAllowance.set(allowance);
    } catch (err: any) {
      console.error('Approval failed:', err);
      this.toast.error('Approval Failed', err.message || 'Transaction was rejected.');
    } finally {
      this.approving.set(false);
    }
  }

  async buyPresaleTokens(): Promise<void> {
    const account = this.w3s.account$();
    if (!account) {
      this.toast.show('Wallet Disconnected', 'Please connect your wallet first.', undefined, 'bg-warning text-light');
      return;
    }

    const amount = this.buyAmountCusd();
    const balance = parseFloat(this.userCusdBalance());
    
    if (amount <= 0) {
      this.toast.error('Invalid Amount', 'Please specify a positive cUSD amount.');
      return;
    }

    if (amount > balance) {
      this.toast.error('Insufficient Funds', 'You do not have enough cUSD balance.');
      return;
    }

    this.buying.set(true);
    try {
      const hash = await this.gameContract.buyPresaleTokens(amount.toString());
      this.toast.show('Tokens Purchased!', `Successfully bought ${this.estimatedTokens().toLocaleString()} $BRAINBOOK!`, undefined, 'bg-success text-light');
      
      // Trigger confetti celebration
      this.triggerConfetti();

      // Reload balances and presale details
      void this.loadPresaleStats();
    } catch (err: any) {
      console.error('Purchase failed:', err);
      this.toast.error('Purchase Failed', err.message || 'Transaction was rejected.');
    } finally {
      this.buying.set(false);
    }
  }

  private triggerConfetti(): void {
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 }
    });
  }
}
