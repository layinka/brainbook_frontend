import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Web3Service } from '../../services/web3';
import { QuizService } from '../../services/game-state.service';
import { environment } from '../../../environments/environment';

interface LeaderboardEntry {
  userId: string;
  displayName: string;
  score: number;
  rank: number;
}

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './leaderboard.component.html',
  styleUrl: './leaderboard.component.scss'
})
export class LeaderboardComponent implements OnInit {
  w3s = inject(Web3Service);
  private quizService = inject(QuizService);
  private http = inject(HttpClient);

  // States
  leaderboardEntries = signal<LeaderboardEntry[]>([]);
  userRankEntry = signal<LeaderboardEntry | null>(null);
  categories = signal<any[]>([]);
  activePeriod = signal<string>('weekly');
  activeCategory = signal<string>('');
  currentUserId = signal<string>('');
  loading = signal<boolean>(true);

  ngOnInit(): void {
    void this.loadCategoriesAndRankings();
  }

  async loadCategoriesAndRankings(): Promise<void> {
    this.loading.set(true);
    try {
      // 1. Fetch category manifests for dropdown filter
      const manifests = await this.quizService.loadAllCategoryManifests();
      this.categories.set(manifests);

      // 2. Fetch initial rankings
      await this.fetchRankings();
    } catch (err) {
      console.error('Error loading leaderboard assets:', err);
    } finally {
      this.loading.set(false);
    }
  }

  async fetchRankings(): Promise<void> {
    this.loading.set(true);
    const period = this.activePeriod();
    const cat = this.activeCategory();

    let queryUrl = `${environment.apiUrl}/game/leaderboard?period=${period}`;
    if (cat) {
      queryUrl += `&category=${cat}`;
    }

    try {
      const res = await this.http.get<any>(queryUrl, { withCredentials: true }).toPromise();
      
      if (res && res.leaderboard) {
        const myId = res.currentUserId || '';
        this.currentUserId.set(myId);

        const mapped: LeaderboardEntry[] = res.leaderboard.map((entry: any, index: number) => ({
          userId: entry.userId,
          displayName: entry.displayName || 'Anonymous Player',
          score: entry.score || 0,
          rank: entry.rank || (index + 1)
        }));

        this.leaderboardEntries.set(mapped);

        const myEntry = mapped.find(entry => entry.userId === myId);
        if (myEntry) {
          this.userRankEntry.set(myEntry);
        } else if (myId) {
          // Fetch user profile stats for bottom highlight row if not in the top leaderboard list
          try {
            const pRes = await this.http.get<any>(`${environment.apiUrl}/game/profile`, { withCredentials: true }).toPromise();
            if (pRes && pRes.profile) {
              this.userRankEntry.set({
                userId: myId,
                displayName: pRes.profile.displayName || 'You',
                score: pRes.profile.totalScore || 0,
                rank: 99 // Default placement indicator
              });
            }
          } catch {
            this.userRankEntry.set(null);
          }
        } else {
          this.userRankEntry.set(null);
        }
      }
    } catch (err) {
      console.error('Error querying rankings:', err);
    } finally {
      this.loading.set(false);
    }
  }

  setPeriod(period: string): void {
    if (this.activePeriod() === period) return;
    this.activePeriod.set(period);
    void this.fetchRankings();
  }

  onCategoryChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.activeCategory.set(value);
    void this.fetchRankings();
  }

  isUserInVisibleList(): boolean {
    const myId = this.currentUserId();
    if (!myId) return false;
    return this.leaderboardEntries().some(entry => entry.userId === myId);
  }
}
