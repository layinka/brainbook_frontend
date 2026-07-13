import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Web3Service } from '../../services/web3';
import { GameContractService } from '../../services/game-contract.service';
import { AppToastService } from '../../services/app-toast.service';
import { SIWEAuthService } from '../../services/siwe-auth.service';
import { environment } from '../../../environments/environment';
import { W3MCoreButtonComponentWrapperComponent } from '../../w3-mcore-button-component-wrapper/w3-mcore-button-component-wrapper.component';

interface AchievementBadge {
  tokenId: number;
  name: string;
  icon: string;
  description: string;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, W3MCoreButtonComponentWrapperComponent],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit {
  w3s = inject(Web3Service);
  private gameContract = inject(GameContractService);
  private toast = inject(AppToastService);
  private http = inject(HttpClient);
  private authService = inject(SIWEAuthService);

  readonly achievementBadges: AchievementBadge[] = [
    {
      tokenId: 1,
      name: 'Africa Scholar',
      icon: '🌍',
      description: 'Awarded for completing the Africa quiz category.'
    },
    {
      tokenId: 9,
      name: 'GK Master',
      icon: '🧠',
      description: 'Awarded for completing the General Knowledge category.'
    },
    {
      tokenId: 101,
      name: 'GK Halfway Hero',
      icon: '🎖️',
      description: 'Milestone achievement: reached question 50 in General Knowledge.'
    },
    {
      tokenId: 201,
      name: 'Weekly Warrior',
      icon: '🛡️',
      description: 'Streak achievement: logged in consecutive days to claim Day 7 reward.'
    },
    {
      tokenId: 301,
      name: 'Elite Brain',
      icon: '👑',
      description: 'Leaderboard achievement: reached top 10 rankings on weekly calculations.'
    }
  ];

  // Signals
  profile = signal<any | null>(null);
  accuracy = signal<number>(0);
  editingName = signal<boolean>(false);
  newName = '';

  // Inventory & Badges owned
  ownedItems = signal<Record<number, number>>({ 1000: 0, 1001: 0, 1002: 0 });
  ownedBadges = signal<Record<number, number>>({});

  constructor() {
    // Reactively refresh blockchain balances and profile stats when connected wallet/SIWE changes
    effect(async () => {
      const account = this.w3s.account$();
      const isLoggedIn = this.authService.authService.isLoggedIn();
      
      if (account && isLoggedIn) {
        await this.fetchBlockchainBalances(account);
        await this.fetchProfileData();
      } else {
        this.ownedItems.set({ 1000: 0, 1001: 0, 1002: 0 });
        this.ownedBadges.set({});
        this.profile.set(null);
        this.accuracy.set(0);
        this.newName = '';
      }
    });
  }

  ngOnInit(): void {
  }

  async fetchProfileData(): Promise<void> {
    try {
      const res = await this.http.get<any>(`${environment.apiUrl}/game/profile`, { withCredentials: true }).toPromise();
      if (res) {
        this.profile.set(res);
        this.newName = res.displayName || '';

        // Calculate accuracy
        const total = (res.correctAnswers || 0) + (res.wrongAnswers || 0);
        if (total > 0) {
          const acc = Math.round((res.correctAnswers / total) * 100);
          this.accuracy.set(acc);
        } else {
          this.accuracy.set(0);
        }
      }
    } catch (err) {
      console.error('Error fetching game profile statistics:', err);
    }
  }

  async fetchBlockchainBalances(account: string): Promise<void> {
    try {
      // 1. Fetch Item Consumables [1000, 1001, 1002]
      const items = [1000, 1001, 1002];
      const itemBalances = await this.gameContract.getItemBalancesBatch(items, account);
      const itemsMap: Record<number, number> = {};
      items.forEach((id, idx) => {
        itemsMap[id] = itemBalances[idx] || 0;
      });
      this.ownedItems.set(itemsMap);

      // 2. Fetch Achievement Badges [1, 9, 101, 201, 301]
      const badgeIds = this.achievementBadges.map(b => b.tokenId);
      const badgeBalances = await this.gameContract.getItemBalancesBatch(badgeIds, account);
      const badgesMap: Record<number, number> = {};
      badgeIds.forEach((id, idx) => {
        badgesMap[id] = badgeBalances[idx] || 0;
      });
      this.ownedBadges.set(badgesMap);
    } catch (err) {
      console.error('Error loading profile blockchain balances:', err);
    }
  }

  startEditing(): void {
    this.newName = this.profile()?.displayName || '';
    this.editingName.set(true);
  }

  async saveDisplayName(): Promise<void> {
    const name = this.newName.trim();
    if (!name) return;

    try {
      const res = await this.http.patch<any>(`${environment.apiUrl}/game/profile`, { displayName: name }, { withCredentials: true }).toPromise();
      if (res) {
        this.toast.show('Success', 'Profile display name updated!', undefined, 'bg-success text-light');
        this.profile.set({
          ...this.profile(),
          displayName: name
        });
        this.editingName.set(false);
      }
    } catch (err) {
      console.error('Failed to update display name:', err);
      this.toast.error('Error', 'Failed to update display name.');
    }
  }
}
