import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SoundService } from '../../services/sound.service';
import { LocalStorageService } from '../../services/local-storage.service';
import { Web3Service } from '../../services/web3';
import { GameContractService } from '../../services/game-contract.service';

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
  web3 = inject(Web3Service);

  loginStreak = signal(0);
  totalScore = signal(0);
  completedCount = signal(0);
  tokenBalance = signal('0.0');

  readonly CATEGORIES_PREVIEW = [
    { key: 'generalknowledge', name: 'General Knowledge', icon: 'generaknowledge-sheet0.png', emoji: '🧠' },
    { key: 'soccer',           name: 'Soccer',            icon: 'soccericon-sheet0.png',      emoji: '⚽' },
    { key: 'gameofthrones',    name: 'Game of Thrones',   icon: 'gameofthrones-sheet0.png',   emoji: '⚔️' },
    { key: 'basicmath',        name: 'Basic Math',        icon: 'basicmath-sheet0.png',       emoji: '🔢' },
    { key: 'africa',           name: 'Africa',            icon: 'africaicon-sheet0.png',      emoji: '🌍' },
    { key: 'riddles',          name: 'Riddles',           icon: 'generaknowledge-sheet0.png', emoji: '🤔' },
  ];

  constructor() {
    // Reactively fetch token balance when wallet account changes
    effect(async () => {
      const account = this.web3.account$();
      if (account) {
        try {
          const bal = await this.gameContract.getTokenBalance(account);
          const num = parseFloat(bal);
          this.tokenBalance.set(isNaN(num) ? '0.0' : num.toFixed(1));
        } catch {
          this.tokenBalance.set('0.0');
        }
      } else {
        this.tokenBalance.set('0.0');
      }
    });
  }

  ngOnInit() {
    this.loginStreak.set(this.ls.getLoginStreak());
    this.totalScore.set(this.ls.getTotalLifetimeScore());
    this.completedCount.set(this.ls.getCompletedCategories().length);
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
}
