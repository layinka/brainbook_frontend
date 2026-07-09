import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from "./navbar/navbar.component";
import { FooterComponent } from "./components/footer/footer.component";
import { Web3Service } from './services/web3';
import { ToastsComponent } from './toasts/toasts.component';
import { AuthOverlayComponent } from './components/auth-overlay/auth-overlay.component';
import { SoundService } from './services/sound.service';
import { LocalStorageService } from './services/local-storage.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavbarComponent, FooterComponent, ToastsComponent, AuthOverlayComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('BrainBook');
  web3Service = inject(Web3Service);
  private soundService = inject(SoundService);
  private localStorageService = inject(LocalStorageService);

  constructor() {
    // Preload UI sounds on app start (lightweight)
    this.soundService.preloadUiSounds();

    // Restore sound preferences
    if (this.localStorageService.isMuted()) {
      this.soundService.toggleMute();
    }
    this.soundService.setVolume(this.localStorageService.getVolume());

    // Record daily login and compute streak
    this.localStorageService.recordLoginAndGetStreak();
  }
}
