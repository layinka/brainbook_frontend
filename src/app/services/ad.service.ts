import { Injectable, inject, signal } from '@angular/core';
import { Web3Service } from './web3';
import { AppToastService } from './app-toast.service';

@Injectable({
  providedIn: 'root'
})
export class AdService {
  private w3s = inject(Web3Service);
  private toast = inject(AppToastService);

  readonly isAdPlaying = signal<boolean>(false);

  /**
   * Determine if rewarded ads are enabled.
   * Ads are disabled inside the Opera MiniPay browser to comply with platform guidelines.
   */
  isAdsEnabled(): boolean {
    return !this.w3s.isMiniPay;
  }

  /**
   * Triggers a mocked AppLovin rewarded video ad.
   * If inside MiniPay, triggers a fallback notification.
   * @param onCompleted Callback function triggered upon successful ad completion.
   */
  showRewardedAd(onCompleted: () => void): void {
    if (!this.isAdsEnabled()) {
      console.warn('[AD] Ads are disabled in MiniPay environments.');
      this.toast.show(
        'Ads Disabled',
        'Rewarded ads are not supported in MiniPay. Use $BRAINBOOK tokens to unlock items.',
        undefined,
        'bg-warning text-light'
      );
      return;
    }

    if (this.isAdPlaying()) return;

    this.isAdPlaying.set(true);
    this.toast.show('Ad Starting', 'Loading sponsored video...', undefined, 'bg-info text-light');

    // Simulate 3-second AppLovin video playback
    setTimeout(() => {
      this.toast.show('Ad Playing', 'Watching ad to claim your reward (50% complete)...', undefined, 'bg-info text-light');
    }, 1500);

    setTimeout(() => {
      this.isAdPlaying.set(false);
      this.toast.show('Ad Finished!', 'Reward claimed successfully.', undefined, 'bg-success text-light');
      onCompleted();
    }, 3000);
  }
}
