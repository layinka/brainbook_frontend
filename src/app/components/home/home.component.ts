import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { SoundService } from '../../services/sound.service';
import { LocalStorageService } from '../../services/local-storage.service';
import { Web3Service } from '../../services/web3';
import { GameContractService } from '../../services/game-contract.service';
import { QuizService } from '../../services/game-state.service';
import { environment } from '../../../environments/environment';

const CATEGORY_EMOJIS: Record<string, string> = {
  generalknowledge: '🧠',
  soccer: '⚽',
  gameofthrones: '⚔️',
  basicmath: '🔢',
  africa: '🌍',
  riddles: '🤔',
  bible: '📖',
  cars: '🚗',
  coffee: '☕',
  countriesineurope: '🇪🇺',
  finishthemovietitle: '🎬',
  generalmath: '📐',
  grammar: '📝',
  historytrivia: '📜',
  howimetyourmother: '🍺',
  internetculture: '🌐',
  namethecountry: '🗺️',
  namethesoccerplayer: '🏃',
  simpsons: '🍩',
  thefamilyguy: '📺',
  thewalkingdead: '🧟',
  worddefinition: '🔤'
};

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
  private quizService = inject(QuizService);
  private http = inject(HttpClient);
  web3 = inject(Web3Service);

  loginStreak = signal(0);
  totalScore = signal(0);
  completedCount = signal(0);
  tokenBalance = signal('0.0');

  categoriesPreview = signal<any[]>([]);

  constructor() {
    // Reactively fetch token balance and profile stats when wallet account changes
    effect(async () => {
      const account = this.web3.account$();
      if (account) {
        // Fetch wallet token balance
        try {
          const bal = await this.gameContract.getTokenBalance(account);
          const num = parseFloat(bal);
          this.tokenBalance.set(isNaN(num) ? '0.0' : num.toFixed(1));
        } catch {
          this.tokenBalance.set('0.0');
        }

        // Fetch live profile stats
        try {
          const res = await this.http.get<any>(`${environment.apiUrl}/game/profile`, { withCredentials: true }).toPromise();
          if (res && res.profile) {
            this.loginStreak.set(res.profile.currentDailyStreak || 0);
            this.totalScore.set(res.profile.totalScore || 0);
          }
        } catch (err) {
          console.warn('Could not sync home page stats with profile backend:', err);
        }

        // Fetch live session history to rebuild local stats and high scores cache
        try {
          const res = await this.http.get<any>(`${environment.apiUrl}/game/sessions`, { withCredentials: true }).toPromise();
          if (res && res.sessions) {
            this.ls.clearAll(); // Clear any previous session remnants

            const completedCats = new Set<string>();
            for (const sess of res.sessions) {
              const completed = (sess.correctCount + sess.wrongCount) >= sess.totalQuestions;

              this.ls.saveHighScore({
                category: sess.category,
                score: sess.score,
                correctCount: sess.correctCount,
                totalQuestions: sess.totalQuestions,
                date: sess.completedAt || new Date().toISOString()
              });

              if (completed) {
                completedCats.add(sess.category);
                this.ls.markCategoryCompleted(sess.category);
              }
            }

            // Sync total score to local storage key
            localStorage.setItem('brainbook.totalscore', String(this.totalScore()));
            this.completedCount.set(completedCats.size);
          }
        } catch (err) {
          console.warn('Could not sync session history from backend:', err);
        }
      } else {
        // Clear all token and profile details on disconnect
        this.tokenBalance.set('0.0');
        this.loginStreak.set(0);
        this.totalScore.set(0);
        this.completedCount.set(0);
        this.ls.clearAll(); // Reset local storage fallbacks to prevent data leak
      }
    });
  }

  async ngOnInit() {
    const account = this.web3.account$();
    if (!account) {
      this.loginStreak.set(this.ls.getLoginStreak());
      this.totalScore.set(this.ls.getTotalLifetimeScore());
      this.completedCount.set(this.ls.getCompletedCategories().length);
    }

    try {
      const manifests = await this.quizService.loadAllCategoryManifests();
      let featured = manifests
        .filter(c => c.isFeatured)
        .map(c => ({
          key: c.category,
          name: c.displayName,
          emoji: CATEGORY_EMOJIS[c.category ?? ''] || '💡'
        }));

      if (featured.length === 0) {
        featured = manifests.slice(0, 6).map(c => ({
          key: c.category,
          name: c.displayName,
          emoji: CATEGORY_EMOJIS[c.category ?? ''] || '💡'
        }));
      }

      this.categoriesPreview.set(featured);
    } catch (err) {
      console.error('Failed to load featured categories on homepage:', err);
    }
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
