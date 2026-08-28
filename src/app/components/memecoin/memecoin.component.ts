import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Web3Service } from '../../services/web3';
import { GameContractService, AggregatedPrice } from '../../services/game-contract.service';
import { SoundService } from '../../services/sound.service';
import { AppToastService } from '../../services/app-toast.service';
import confetti from 'canvas-confetti';

interface IqDiagnosis {
  tier: string;
  title: string;
  emoji: string;
  badgeClass: string;
  description: string;
  dailyRewardEst: number;
  monthlyRewardEst: number;
  recommendedCategory: string;
  advice: string;
}

@Component({
  selector: 'app-memecoin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './memecoin.component.html',
  styleUrl: './memecoin.component.scss'
})
export class MemecoinComponent implements OnInit {
  web3 = inject(Web3Service);
  private gameContract = inject(GameContractService);
  private sound = inject(SoundService);
  private toast = inject(AppToastService);
  private router = inject(Router);

  // pools.trade launchpad configuration
  readonly poolsTradeUrl = 'https://pools.trade';
  readonly ubeswapUrl = 'https://ubeswap.org/#/swap';
  readonly dexscreenerUrl = 'https://dexscreener.com';

  // Dynamic Contract Address placeholder for new pools.trade launch
  contractAddress = signal<string>('0x8ba290bc8a5cb99d3be646ba303ece1f58a89a92');

  // Bonding Curve Metrics on pools.trade
  bondingCurveProgress = signal<number>(82); // 82% filled towards graduation
  graduationTargetMcap = signal<string>('$50,000');
  currentMcap = signal<string>('$41,000');
  kingOfTheHillHolder = signal<string>('0x71C...8e92');
  totalCurveHolders = signal<number>(418);

  // Live Stats
  tokenPrice = signal<string>('0.0012');
  walletBalance = signal<string>('0.0');
  copiedContract = signal<boolean>(false);

  // IQ Calculator State
  userIq = signal<number>(140);

  // Quick Swap Widget State
  swapDirection: 'buy' | 'sell' = 'buy';
  swapAmount: number | null = 10;
  swapSlippage: number = 1.0;
  swapLoading = signal<boolean>(false);

  // FAQs
  activeFaqIndex = signal<number | null>(0);

  // Raid Copypastas
  activeRaidTab = signal<number>(0);
  raidCopied = signal<boolean>(false);

  readonly raidTemplates = [
    {
      title: 'pools.trade Moon Raid',
      category: 'pools.trade & Robinhood',
      text: `🌊 $BRAINBOOK BONDING CURVE IS PUMPING ON POOLS.TRADE! 🧠⚡\n\nBonding Curve: 82% Filled! 🟢\nGraduation Target: $50,000 ➔ Auto-Burned DEX Liquidity!\n\nSmooth brains buy dogs at the top. Gigabrains earn $BRAINBOOK playing 24/7 on-chain trivia inside Robinhood & MiniPay.\n\n👉 Buy on pools.trade: https://brainbook.roxsolid.co/memecoin\n#BrainBook #PoolsTrade #Robinhood #Gigabrain #Celo #Base`
    },
    {
      title: 'Left vs Right Curve Meme',
      category: 'X / Twitter',
      text: `IQ 60: Buy $BRAINBOOK on pools.trade\nIQ 100: "Nooo you must calculate the macro game theory and bonding curve slip before allocating capital!"\nIQ 200: Buy $BRAINBOOK on pools.trade\n\nThe smartest memecoin in Web3 is here. 🧠⚡\n0% Tax | 5-Second MiniPay & Robinhood Play | Real GameFi Trivia Yield\n\n👉 https://brainbook.roxsolid.co/memecoin\n#BrainBook #Gigabrain #Celo #Base #Memecoin`
    },
    {
      title: 'Smooth Brain Calling',
      category: 'Telegram / Discord',
      text: `Are you tired of buying dog and cat coins that rug in 12 minutes? 🐶💀\n\nUpgrade your room-temperature IQ. $BRAINBOOK is the world's first Proof-of-Gigabrain fair-launch memecoin where you earn crypto answering trivia questions on @Celo and @Base.\n\n🧠 Free-to-play in browser\n⚡ Instant stablecoin & token payouts\n🔥 0% Tax / 100% Rug-Proof on pools.trade\n\nProve your IQ: https://brainbook.roxsolid.co/memecoin`
    }
  ];

  constructor() {
    effect(async () => {
      const account = this.web3.account$();
      if (account) {
        try {
          const bal = await this.gameContract.getTokenBalance(account);
          this.walletBalance.set(parseFloat(bal).toFixed(1));
        } catch {
          this.walletBalance.set('0.0');
        }
      } else {
        this.walletBalance.set('0.0');
      }
    });
  }

  ngOnInit(): void {
    this.fetchLivePrices();
    this.sound.preloadUiSounds();
  }

  async fetchLivePrices(): Promise<void> {
    try {
      const priceData: AggregatedPrice = await this.gameContract.getAggregatedTokenPrice();
      if (priceData && priceData.averagePrice) {
        this.tokenPrice.set(parseFloat(priceData.averagePrice).toFixed(4));
      }
    } catch {
      // Fallback price is preset
    }
  }

  // ─── IQ Diagnosis Logic ───────────────────────────────────────────────────

  get currentDiagnosis(): IqDiagnosis {
    const iq = this.userIq();
    if (iq < 85) {
      return {
        tier: 'Smooth Brain Ape',
        title: 'Potato Brain Degen 🥔',
        emoji: '🥔',
        badgeClass: 'badge-smooth',
        description: 'Buys animal coins at all-time highs. Sells before the pools.trade curve graduates. Can barely count to 10.',
        dailyRewardEst: 8,
        monthlyRewardEst: 240,
        recommendedCategory: 'Basic Math & Riddles',
        advice: 'Start playing 1st Grade Trivia immediately before your remaining brain cells evaporate!'
      };
    } else if (iq < 120) {
      return {
        tier: 'Midcurve Specialist',
        title: 'Overthinking Analyst 📊',
        emoji: '🧐',
        badgeClass: 'badge-mid',
        description: 'Writes 40-tweet threads analyzing bonding curve math while missing the 100x pools.trade graduation right in front of them.',
        dailyRewardEst: 35,
        monthlyRewardEst: 1050,
        recommendedCategory: 'General Knowledge & Science',
        advice: 'Stop overanalyzing and ape the pools.trade curve before it hits 100%!'
      };
    } else if (iq < 160) {
      return {
        tier: 'Gigabrain Chad',
        title: 'Trivia Warlord ⚡',
        emoji: '🧠',
        badgeClass: 'badge-giga',
        description: 'Answers 20 questions in 30 seconds. Pushes the pools.trade curve to graduation with in-game store rakes. Dominates the leaderboard.',
        dailyRewardEst: 120,
        monthlyRewardEst: 3600,
        recommendedCategory: 'Crypto History & Pop Culture',
        advice: 'Stack tokens on pools.trade and stake for 30% of all in-game power-up sales!'
      };
    } else {
      return {
        tier: 'Galaxy Brain Ascendant',
        title: 'Intergalactic 200 IQ Cosmic Deity 🌌',
        emoji: '🌌',
        badgeClass: 'badge-galaxy',
        description: 'Has achieved total cerebral enlightenment. Solves quantum trivia while sleeping. Commands the pools.trade curve to instant DEX graduation.',
        dailyRewardEst: 450,
        monthlyRewardEst: 13500,
        recommendedCategory: 'All Categories Mastered',
        advice: 'Mint the Grand Ambassador Soulbound NFT and lead the $BRAINBOOK army to King of the Hill on pools.trade!'
      };
    }
  }

  onIqChange(event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    this.userIq.set(val);
  }

  // ─── Quick Swap Calculation ───────────────────────────────────────────────

  get estimatedSwapOutput(): string {
    const amt = this.swapAmount || 0;
    const price = parseFloat(this.tokenPrice()) || 0.0012;
    if (this.swapDirection === 'buy') {
      const tokens = amt / price;
      return tokens.toLocaleString(undefined, { maximumFractionDigits: 0 });
    } else {
      const cusd = amt * price;
      return cusd.toFixed(2);
    }
  }

  flipSwapDirection(): void {
    this.sound.play('click');
    this.swapDirection = this.swapDirection === 'buy' ? 'sell' : 'buy';
    if (this.swapDirection === 'buy') {
      this.swapAmount = 10;
    } else {
      this.swapAmount = 10000;
    }
  }

  // ─── Soundboard & Confetti Triggers ───────────────────────────────────────

  triggerHypeSound(soundType: 'ascend' | 'kaching' | 'victory' | 'ape'): void {
    switch (soundType) {
      case 'ascend':
        this.sound.play('magic');
        this.fireConfetti(['#a855f7', '#ec4899', '#3b82f6']);
        this.toast.show('🧠 200 IQ ASCENSION', 'Galaxy brain frequencies engaged! Curve power multiplying!', 3000, 'bg-primary text-light');
        break;
      case 'kaching':
        this.sound.play('coindrop');
        this.fireConfetti(['#f59e0b', '#fcd34d', '#10b981']);
        this.toast.show('💰 POOLS.TRADE BUY', 'Buy orders rolling in on pools.trade! Pushing towards 100% graduation!', 3000, 'bg-warning text-dark');
        break;
      case 'victory':
        this.sound.play('victory');
        this.fireConfetti(['#10b981', '#34d399', '#f59e0b', '#7c3aed']);
        this.toast.show('👑 KING OF THE HILL', 'BrainBook dominates the pools.trade leaderboard!', 3000, 'bg-success text-light');
        break;
      case 'ape':
        this.sound.play('winnerParty');
        this.fireConfettiCannon();
        this.toast.show('🚀 GRADUATION PUMP!', 'Bonding curve graduating to Ubeswap V3 with 100% burned liquidity!', 4000, 'bg-info text-light');
        break;
    }
  }

  private fireConfetti(colors: string[]): void {
    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.7 },
      colors
    });
  }

  private fireConfettiCannon(): void {
    const end = Date.now() + 1500;
    const interval: any = setInterval(() => {
      if (Date.now() > end) {
        return clearInterval(interval);
      }
      confetti({
        startVelocity: 30,
        spread: 360,
        ticks: 60,
        origin: { x: Math.random(), y: Math.random() - 0.2 },
        colors: ['#7c3aed', '#ec4899', '#f59e0b', '#06b6d4', '#10b981']
      });
    }, 200);
  }

  // ─── 1-Click Copy Helpers ─────────────────────────────────────────────────

  copyContract(): void {
    navigator.clipboard.writeText(this.contractAddress()).then(() => {
      this.copiedContract.set(true);
      this.sound.play('streak');
      this.toast.show('📋 Contract Copied!', `${this.contractAddress().slice(0, 8)}...${this.contractAddress().slice(-6)} copied to clipboard.`, 3000, 'bg-success text-light');
      setTimeout(() => this.copiedContract.set(false), 3000);
    });
  }

  copyRaid(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.raidCopied.set(true);
      this.sound.play('click');
      this.toast.show('⚔️ Raid Template Copied!', 'Go paste on Twitter/Telegram to boost the pools.trade curve!', 3000, 'bg-primary text-light');
      setTimeout(() => this.raidCopied.set(false), 3000);
    });
  }

  // ─── FAQ Accordion ────────────────────────────────────────────────────────

  toggleFaq(index: number): void {
    this.sound.play('click');
    if (this.activeFaqIndex() === index) {
      this.activeFaqIndex.set(null);
    } else {
      this.activeFaqIndex.set(index);
    }
  }

  // ─── Routing ──────────────────────────────────────────────────────────────

  navigateToPlay(): void {
    this.sound.play('click');
    this.router.navigate(['/categories']);
  }

  navigateToDaily(): void {
    this.sound.play('click');
    this.router.navigate(['/daily-rewards']);
  }

  navigateToStaking(): void {
    this.sound.play('click');
    this.router.navigate(['/token']);
  }
}
