import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { QuizService } from '../../services/game-state.service';
import { LocalStorageService } from '../../services/local-storage.service';
import { SoundService } from '../../services/sound.service';
import { SeoService } from '../../services/seo.service';
import { QuizCategory } from '../../models/game.models';

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './categories.component.html',
  styleUrl: './categories.component.scss',
})
export class CategoriesComponent implements OnInit {
  private router = inject(Router);
  private quizService = inject(QuizService);
  private ls = inject(LocalStorageService);
  private sound = inject(SoundService);
  private seoService = inject(SeoService);

  categories = signal<Partial<QuizCategory>[]>([]);
  loading = signal(true);
  completedCats = signal<string[]>([]);
  searchQuery = signal('');

  get filteredCategories() {
    const q = this.searchQuery().toLowerCase();
    return this.categories().filter(c =>
      !q || c.displayName?.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q)
    );
  }

  async ngOnInit() {
    this.completedCats.set(this.ls.getCompletedCategories());
    const manifests = await this.quizService.loadAllCategoryManifests();

    this.categories.set(manifests);
    this.loading.set(false);

    // Dynamic ItemList JSON-LD schema for all categories
    this.seoService.setPageSeo({
      title: 'Trivia Quiz Topics & Categories - Play & Earn Crypto | BrainBook',
      description: 'Explore all trivia topics on BrainBook including Africa, History, Science, Football, Pop Culture, Math, and Movies. Answer questions to earn Web3 crypto rewards!',
      keywords: 'trivia categories, play to earn topics, quiz categories, crypto quiz, brainbook P2E',
      canonicalUrl: 'https://brainbook.roxsolid.co/categories',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        'name': 'BrainBook Play-to-Earn Trivia Categories',
        'numberOfItems': manifests.length,
        'itemListElement': manifests.map((cat, index) => ({
          '@type': 'ListItem',
          'position': index + 1,
          'name': cat.displayName,
          'url': `https://brainbook.roxsolid.co/play/${cat.category}`,
          'description': cat.description
        }))
      }
    });
  }

  isCompleted(cat: Partial<QuizCategory>): boolean {
    return this.completedCats().includes(cat.category ?? '');
  }

  getBestScore(cat: Partial<QuizCategory>): number {
    const best = this.ls.getBestScoreForCategory(cat.category ?? '');
    return best?.score ?? 0;
  }

  selectCategory(cat: Partial<QuizCategory>): void {
    this.sound.play('click');
    this.router.navigate(['/play', cat.category]);
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }
}
