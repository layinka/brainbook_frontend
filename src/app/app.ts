import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from "./navbar/navbar.component";
import { FooterComponent } from "./components/footer/footer.component";
import { Web3Service } from './services/web3';
import { ToastsComponent } from './toasts/toasts.component';
import { AuthOverlayComponent } from './components/auth-overlay/auth-overlay.component';
import { SoundService } from './services/sound.service';
import { LocalStorageService } from './services/local-storage.service';
import { MinipayNavComponent } from './components/minipay-nav/minipay-nav.component';
import { QuizService } from './services/game-state.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavbarComponent, FooterComponent, ToastsComponent, AuthOverlayComponent, MinipayNavComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('BrainBook');
  web3Service = inject(Web3Service);
  private soundService = inject(SoundService);
  private localStorageService = inject(LocalStorageService);
  private quizService = inject(QuizService);

  constructor() {
    // Sync P2E rewards configuration from backend
    void this.quizService.loadRewardsConfig();

    // Preload UI sounds on app start (lightweight)
    this.soundService.preloadUiSounds();

    // Restore sound preferences
    if (this.localStorageService.isMuted()) {
      this.soundService.toggleMute();
    }
    this.soundService.setVolume(this.localStorageService.getVolume());

    // Record daily login and compute streak
    this.localStorageService.recordLoginAndGetStreak();

    // Apply MiniPay CSS class to body — enables MiniPay-only styles (padding, layout)
    // without touching any non-MiniPay UI. Class is set once on boot and never changes.
    if (this.web3Service.isMiniPay) {
      document.body.classList.add('minipay-mode');
    }
  }
}
