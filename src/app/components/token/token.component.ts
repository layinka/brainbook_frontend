import { Component, OnInit, OnDestroy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Web3Service } from '../../services/web3';
import { GameContractService, AggregatedPrice, PriceSource, SwapParams } from '../../services/game-contract.service';
import { DEX_REGISTRY, DexEntry } from '../../../environments/environment';
import { parseEther } from 'viem';
import { W3MCoreButtonComponentWrapperComponent } from '../../w3-mcore-button-component-wrapper/w3-mcore-button-component-wrapper.component';
import { AadsDesktopAdaptiveAdComponent } from '../adverts/aads/aads-desktop-adaptive-ad/aads-desktop-adaptive-ad.component';

@Component({
  selector: 'app-token',
  standalone: true,
  imports: [CommonModule, FormsModule, W3MCoreButtonComponentWrapperComponent, AadsDesktopAdaptiveAdComponent],
  templateUrl: './token.component.html',
  styleUrl: './token.component.scss'
})
export class TokenComponent implements OnInit, OnDestroy {
  w3s = inject(Web3Service);
  private gameContract = inject(GameContractService);

  // ─── Page section navigation ───────────────────────────────────────────────
  /** Active top-level section: 'trade' | 'stake' | 'tokenomics' */
  activeSection: 'trade' | 'stake' | 'tokenomics' = 'trade';

  // ─── Price Ticker ──────────────────────────────────────────────────────────
  aggregatedPrice = signal<AggregatedPrice | null>(null);
  priceLoading = signal<boolean>(true);
  private priceRefreshInterval: ReturnType<typeof setInterval> | null = null;

  // ─── DEX Directory ─────────────────────────────────────────────────────────
  dexRegistry = DEX_REGISTRY;
  dexPage = 0;
  readonly dexPageSize = 3;
  get pagedDexes(): DexEntry[] {
    const start = this.dexPage * this.dexPageSize;
    return this.dexRegistry.slice(start, start + this.dexPageSize);
  }
  get totalDexPages(): number {
    return Math.ceil(this.dexRegistry.length / this.dexPageSize);
  }
  prevDexPage() { if (this.dexPage > 0) this.dexPage--; }
  nextDexPage() { if (this.dexPage < this.totalDexPages - 1) this.dexPage++; }

  // ─── Swap Widget ───────────────────────────────────────────────────────────
  /** Direction: 'buy' = stablecoin → BRAINBOOK, 'sell' = BRAINBOOK → stablecoin */
  swapDirection: 'buy' | 'sell' = 'buy';
  swapAmount: string = '';
  swapSlippage: number = 1; // percent, default 1%
  swapEstimatedOut = signal<string>('');
  swapEstimatedOutUsd = signal<string>('');
  swapAllowanceSufficient = signal<boolean>(false);
  swapLoading = signal<boolean>(false);
  swapApproveLoading = signal<boolean>(false);
  swapTxHash = signal<string>('');
  swapError = signal<string>('');
  showSlippageConfig = false;

  /** Currently selected DEX for the swap widget — defaults to first enabled on current chain */
  selectedSwapDex = signal<DexEntry | null>(null);

  get enabledDexesForCurrentChain(): DexEntry[] {
    const chainId = this.w3s.chainId || 44787;
    console.log('Current chain id', chainId);
    console.log('DEX_REGISTRY', DEX_REGISTRY);
    console.log("Enabled DEX", DEX_REGISTRY.filter((d: DexEntry) => d.enabled));
    return DEX_REGISTRY.filter((d: DexEntry) => d.enabled && d.chainId === chainId);
  }

  /** Template helper — parseFloat is not available in Angular template expressions */
  parseAmount(val: string): number { return parseFloat(val) || 0; }

  get swapTokenIn(): string {
    const dex = this.selectedSwapDex();
    if (!dex) return '';
    return this.swapDirection === 'sell'
      ? this.gameContract.tokenAddress  // BRAINBOOK
      : dex.stablecoinAddress;
  }

  get swapTokenOut(): string {
    const dex = this.selectedSwapDex();
    if (!dex) return '';
    return this.swapDirection === 'sell'
      ? dex.stablecoinAddress
      : this.gameContract.tokenAddress;
  }

  get swapTokenInSymbol(): string {
    const dex = this.selectedSwapDex();
    if (!dex) return '';
    return this.swapDirection === 'sell' ? 'BRAINBOOK' : dex.stablecoinSymbol;
  }

  get swapTokenOutSymbol(): string {
    const dex = this.selectedSwapDex();
    if (!dex) return '';
    return this.swapDirection === 'sell' ? dex.stablecoinSymbol : 'BRAINBOOK';
  }

  get swapRouterAddress(): string {
    const dex = this.selectedSwapDex();
    if (!dex) return '';
    return dex.protocol === 'uniswap-v3'
      ? (dex.routerAddress || '')
      : (dex.universalRouterAddress || '');
  }

  // ─── Staking signals ───────────────────────────────────────────────────────
  tokenBalance = signal<string>('0.0');
  stakedBalance = signal<string>('0.0');
  totalStaked = signal<string>('0.0');
  earnedRewards = signal<string>('0.0');
  allowance = signal<bigint>(0n);
  tokenPrice = signal<string>('0.001');

  lpTokenBalance = signal<string>('0.0');
  lpStakedBalance = signal<string>('0.0');
  lpTotalStaked = signal<string>('0.0');
  lpEarnedRewards = signal<string>('0.0');
  lpAllowance = signal<bigint>(0n);
  lpTokenSymbol = signal<string>('cUSD-LP');
  lpStakingAddress = signal<string>('');
  lpTokenAddress = signal<string>('');

  // ─── Staking UI state ─────────────────────────────────────────────────────
  stakingMode: 'single' | 'lp' = 'single';
  activeTab: 'stake' | 'unstake' = 'stake';
  stakeAmount: number | null = null;
  unstakeAmount: number | null = null;
  activeLpTab: 'stake' | 'unstake' = 'stake';
  stakeLpAmount: number | null = null;
  unstakeLpAmount: number | null = null;

  // ─── Staking loader flags ──────────────────────────────────────────────────
  loadingApprove = signal<boolean>(false);
  loadingStake = signal<boolean>(false);
  loadingUnstake = signal<boolean>(false);
  loadingClaim = signal<boolean>(false);
  loadingExit = signal<boolean>(false);
  loadingLpApprove = signal<boolean>(false);
  loadingLpStake = signal<boolean>(false);
  loadingLpUnstake = signal<boolean>(false);
  loadingLpClaim = signal<boolean>(false);
  loadingLpExit = signal<boolean>(false);

  constructor() {
    effect(() => {
      const account = this.w3s.account$();
      const chainId = this.w3s.chainId$();
      this.refreshPrices();
      this.initSwapDex();
      if (account) {
        this.fetchStats();
      } else {
        // Clear all user balance and staking details on disconnect
        this.tokenBalance.set('0.0');
        this.stakedBalance.set('0.0');
        this.totalStaked.set('0.0');
        this.earnedRewards.set('0.0');
        this.allowance.set(0n);
        this.lpTokenBalance.set('0.0');
        this.lpStakedBalance.set('0.0');
        this.lpTotalStaked.set('0.0');
        this.lpEarnedRewards.set('0.0');
        this.lpAllowance.set(0n);
        this.lpTokenSymbol.set('cUSD-LP');
        this.lpTokenAddress.set('');
      }
    });
  }

  ngOnInit() {
    this.refreshPrices();
    this.initSwapDex();
    if (this.w3s.account$()) this.fetchStats();
    // Auto-refresh price every 60 seconds
    this.priceRefreshInterval = setInterval(() => this.refreshPrices(), 60_000);
  }

  ngOnDestroy() {
    if (this.priceRefreshInterval) clearInterval(this.priceRefreshInterval);
  }

  // ─── Price ticker ──────────────────────────────────────────────────────────

  async refreshPrices() {
    this.priceLoading.set(true);
    try {
      const result = await this.gameContract.getAggregatedTokenPrice();
      this.aggregatedPrice.set(result);
      this.tokenPrice.set(result.averagePrice);
    } catch (err) {
      console.error('Failed to fetch aggregated price:', err);
    } finally {
      this.priceLoading.set(false);
    }
  }

  priceSourceStatusIcon(status: PriceSource['status']): string {
    const icons: Record<PriceSource['status'], string> = {
      ok: '🟢', error: '🔴', pending: '🟡', 'no-pool': '⚪'
    };
    return icons[status];
  }

  // ─── Swap Widget ───────────────────────────────────────────────────────────

  initSwapDex() {
    const chainId = this.w3s.chainId || 44787;
    const first = DEX_REGISTRY.find((d: DexEntry) => d.enabled && d.chainId === chainId) || null;
    this.selectedSwapDex.set(first);
  }

  selectSwapDex(dex: DexEntry) {
    this.selectedSwapDex.set(dex);
    this.swapAmount = '';
    this.swapEstimatedOut.set('');
    this.swapAllowanceSufficient.set(false);
    this.swapError.set('');
    this.swapTxHash.set('');
  }

  flipSwapDirection() {
    this.swapDirection = this.swapDirection === 'buy' ? 'sell' : 'buy';
    this.swapAmount = '';
    this.swapEstimatedOut.set('');
    this.swapAllowanceSufficient.set(false);
  }

  async onSwapAmountChange() {
    const dex = this.selectedSwapDex();
    const account = this.w3s.account$();
    if (!dex || !this.swapAmount || parseFloat(this.swapAmount) <= 0) {
      this.swapEstimatedOut.set('');
      return;
    }

    // Estimate output using current price
    const price = parseFloat(this.tokenPrice());
    const amountIn = parseFloat(this.swapAmount);
    const feeFactor = 1 - dex.feeTier / 1_000_000;
    let estOut: number;
    if (this.swapDirection === 'sell') {
      estOut = amountIn * price * feeFactor;
    } else {
      estOut = (amountIn / price) * feeFactor;
    }
    const afterSlippage = estOut * (1 - this.swapSlippage / 100);
    this.swapEstimatedOut.set(estOut.toFixed(6));
    this.swapEstimatedOutUsd.set(
      this.swapDirection === 'sell' ? estOut.toFixed(4) : (estOut * price).toFixed(4)
    );

    // Check allowance
    if (account && this.swapRouterAddress) {
      const allowanceBig = await this.gameContract.getSwapAllowance(
        this.swapTokenIn, this.swapRouterAddress, account
      );
      const amountInWei = parseEther(this.swapAmount);
      this.swapAllowanceSufficient.set(allowanceBig >= amountInWei);
    }
  }

  async approveSwap() {
    const dex = this.selectedSwapDex();
    if (!dex || !this.swapAmount || !this.swapRouterAddress) return;
    this.swapApproveLoading.set(true);
    this.swapError.set('');
    try {
      await this.gameContract.approveTokenForSwap(this.swapTokenIn, this.swapRouterAddress, this.swapAmount);
      this.swapAllowanceSufficient.set(true);
    } catch (err: any) {
      this.swapError.set(err?.shortMessage || err?.message || 'Approval failed');
    } finally {
      this.swapApproveLoading.set(false);
    }
  }

  async executeSwap() {
    const dex = this.selectedSwapDex();
    const account = this.w3s.account$();
    if (!dex || !account || !this.swapAmount || parseFloat(this.swapAmount) <= 0) return;
    this.swapLoading.set(true);
    this.swapError.set('');
    this.swapTxHash.set('');
    try {
      const params: SwapParams = {
        dex,
        tokenIn: this.swapTokenIn,
        tokenOut: this.swapTokenOut,
        amountIn: this.swapAmount,
        slippageBps: Math.round(this.swapSlippage * 100),
        recipient: account
      };
      const hash = dex.protocol === 'uniswap-v3'
        ? await this.gameContract.swapV3(params)
        : await this.gameContract.swapV4(params);
      this.swapTxHash.set(hash);
      this.swapAmount = '';
      this.swapEstimatedOut.set('');
      if (this.w3s.account$()) this.fetchStats();
    } catch (err: any) {
      this.swapError.set(err?.shortMessage || err?.message || 'Swap failed');
    } finally {
      this.swapLoading.set(false);
    }
  }

  // ─── Staking ───────────────────────────────────────────────────────────────

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

      const lpStakingAddr = this.gameContract.liquidityMiningAddress;
      this.lpStakingAddress.set(lpStakingAddr);
      const ZERO = '0x0000000000000000000000000000000000000000';
      if (lpStakingAddr && lpStakingAddr !== ZERO) {
        const lpTokenAddr = await this.gameContract.getLpStakingTokenAddress();
        this.lpTokenAddress.set(lpTokenAddr);
        if (lpTokenAddr && lpTokenAddr !== ZERO) {
          const [lpBal, lpStaked, lpTotal, lpEarned, lpAllow, lpSymbol] = await Promise.all([
            this.gameContract.getLpTokenBalance(lpTokenAddr, address),
            this.gameContract.getLpStakedBalance(address),
            this.gameContract.getLpTotalStaked(),
            this.gameContract.getLpEarnedRewards(address),
            this.gameContract.getLpStakingAllowance(lpTokenAddr, address),
            this.gameContract.getLpTokenSymbol(lpTokenAddr)
          ]);
          this.lpTokenBalance.set(parseFloat(lpBal).toFixed(4));
          this.lpStakedBalance.set(parseFloat(lpStaked).toFixed(4));
          this.lpTotalStaked.set(parseFloat(lpTotal).toFixed(4));
          this.lpEarnedRewards.set(parseFloat(lpEarned).toFixed(4));
          this.lpAllowance.set(lpAllow);
          this.lpTokenSymbol.set(lpSymbol);
        }
      }
    } catch (err) {
      console.error('Failed to load staking stats:', err);
    }
  }

  needApprove(): boolean {
    if (!this.stakeAmount || this.stakeAmount <= 0) return false;
    try { return parseEther(this.stakeAmount.toString()) > this.allowance(); } catch { return false; }
  }

  needLpApprove(): boolean {
    if (!this.stakeLpAmount || this.stakeLpAmount <= 0) return false;
    try { return parseEther(this.stakeLpAmount.toString()) > this.lpAllowance(); } catch { return false; }
  }

  setStakeMax() { this.stakeAmount = parseFloat(this.tokenBalance()); }
  setUnstakeMax() { this.unstakeAmount = parseFloat(this.stakedBalance()); }
  setStakeLpMax() { this.stakeLpAmount = parseFloat(this.lpTokenBalance()); }
  setUnstakeLpMax() { this.unstakeLpAmount = parseFloat(this.lpStakedBalance()); }

  async approveTokens() {
    if (!this.stakeAmount || this.stakeAmount <= 0) return;
    this.loadingApprove.set(true);
    try { await this.gameContract.approveStaking(this.stakeAmount.toString()); await this.fetchStats(); }
    catch (err) { console.error('Approval failed:', err); }
    finally { this.loadingApprove.set(false); }
  }

  async stakeTokens() {
    if (!this.stakeAmount || this.stakeAmount <= 0) return;
    this.loadingStake.set(true);
    try { await this.gameContract.stake(this.stakeAmount.toString()); this.stakeAmount = null; await this.fetchStats(); }
    catch (err) { console.error('Staking failed:', err); }
    finally { this.loadingStake.set(false); }
  }

  async withdrawTokens() {
    if (!this.unstakeAmount || this.unstakeAmount <= 0) return;
    this.loadingUnstake.set(true);
    try { await this.gameContract.withdrawStaking(this.unstakeAmount.toString()); this.unstakeAmount = null; await this.fetchStats(); }
    catch (err) { console.error('Withdrawal failed:', err); }
    finally { this.loadingUnstake.set(false); }
  }

  async claimRewards() {
    this.loadingClaim.set(true);
    try { await this.gameContract.getStakingReward(); await this.fetchStats(); }
    catch (err) { console.error('Claiming rewards failed:', err); }
    finally { this.loadingClaim.set(false); }
  }

  async exitStaking() {
    if (!confirm('Withdraw all staked tokens and claim your yield?')) return;
    this.loadingExit.set(true);
    try { await this.gameContract.exitStaking(); await this.fetchStats(); }
    catch (err) { console.error('Exit failed:', err); }
    finally { this.loadingExit.set(false); }
  }

  async approveLpTokens() {
    if (!this.stakeLpAmount || this.stakeLpAmount <= 0 || !this.lpTokenAddress()) return;
    this.loadingLpApprove.set(true);
    try { await this.gameContract.approveLpStaking(this.lpTokenAddress(), this.stakeLpAmount.toString()); await this.fetchStats(); }
    catch (err) { console.error('LP Approval failed:', err); }
    finally { this.loadingLpApprove.set(false); }
  }

  async stakeLpTokens() {
    if (!this.stakeLpAmount || this.stakeLpAmount <= 0) return;
    this.loadingLpStake.set(true);
    try { await this.gameContract.stakeLp(this.stakeLpAmount.toString()); this.stakeLpAmount = null; await this.fetchStats(); }
    catch (err) { console.error('LP Staking failed:', err); }
    finally { this.loadingLpStake.set(false); }
  }

  async withdrawLpTokens() {
    if (!this.unstakeLpAmount || this.unstakeLpAmount <= 0) return;
    this.loadingLpUnstake.set(true);
    try { await this.gameContract.withdrawLp(this.unstakeLpAmount.toString()); this.unstakeLpAmount = null; await this.fetchStats(); }
    catch (err) { console.error('LP Withdrawal failed:', err); }
    finally { this.loadingLpUnstake.set(false); }
  }

  async claimLpRewards() {
    this.loadingLpClaim.set(true);
    try { await this.gameContract.getLpReward(); await this.fetchStats(); }
    catch (err) { console.error('Claiming LP rewards failed:', err); }
    finally { this.loadingLpClaim.set(false); }
  }

  async exitLpStaking() {
    if (!confirm('Withdraw all staked LP tokens and claim your yield?')) return;
    this.loadingLpExit.set(true);
    try { await this.gameContract.exitLpStaking(); await this.fetchStats(); }
    catch (err) { console.error('LP Exit failed:', err); }
    finally { this.loadingLpExit.set(false); }
  }
}
