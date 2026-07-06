import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/home/home.component').then(m => m.HomeComponent),
    pathMatch: 'full'
  },
  {
    path: 'categories',
    loadComponent: () => import('./components/categories/categories.component').then(m => m.CategoriesComponent),
  },
  {
    path: 'play/:category',
    loadComponent: () => import('./components/quiz-game/quiz-game.component').then(m => m.QuizGameComponent),
  },
  {
    path: 'leaderboard',
    loadComponent: () => import('./components/leaderboard/leaderboard.component').then(m => m.LeaderboardComponent),
  },
  {
    path: 'store',
    loadComponent: () => import('./components/store/store.component').then(m => m.StoreComponent),
  },
  {
    path: 'profile',
    loadComponent: () => import('./components/profile/profile.component').then(m => m.ProfileComponent),
  },
  {
    path: 'daily-rewards',
    loadComponent: () => import('./components/daily-rewards/daily-rewards.component').then(m => m.DailyRewardsComponent),
  },
  {
    path: 'how-to-play',
    loadComponent: () => import('./components/how-to-play/how-to-play.component').then(m => m.HowToPlayComponent),
  },
  {
    path: 'token',
    loadComponent: () => import('./components/token/token.component').then(m => m.TokenComponent),
  },
  {
    path: 'rewards',
    loadComponent: () => import('./components/rewards/rewards.component').then(m => m.RewardsComponent),
  },
  {
    path: 'referrals',
    loadComponent: () => import('./components/referrals/referrals.component').then(m => m.ReferralsComponent),
  },
  {
    path: '**',
    redirectTo: ''
  }
];
