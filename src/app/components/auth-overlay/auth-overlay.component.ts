import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SIWEAuthService } from '../../services/siwe-auth.service';
import { AppToastService } from '../../services/app-toast.service';
import { NgxSpinnerService, NgxSpinnerModule } from 'ngx-spinner';

@Component({
  selector: 'app-auth-overlay',
  templateUrl: './auth-overlay.component.html',
  styleUrls: ['./auth-overlay.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, NgxSpinnerModule]
})
export class AuthOverlayComponent {
  public authService = inject(SIWEAuthService);
  private toastService = inject(AppToastService);
  private spinner = inject(NgxSpinnerService);

  // Email and Referral form state
  emailInput = '';
  otpInput = '';
  referralInput = '';
  otpSent = signal<boolean>(false);
  isLoading = signal<boolean>(false);

  private hasAttemptedAutoSignIn = false;

  private getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      return decodeURIComponent(parts.pop()?.split(';').shift() || '');
    }
    return null;
  }

  constructor() {
    // Load pre-existing referral code from local storage or cookies
    try {
      this.referralInput = localStorage.getItem('brainbook_referrer_code') || this.getCookie('brainbook_referrer_code') || '';
    } catch (e) {
      console.warn('Could not read referral code from storage/cookies:', e);
    }

    // If in MiniPay environment, automatically trigger SIWE when wallet connects
    effect(() => {
      const isConnected = this.walletConnected;
      const isLoggedIn = this.isLoggedIn;
      const isMiniPay = this.authService.web3Service.isMiniPay;

      if (!isConnected) {
        this.hasAttemptedAutoSignIn = false;
      }

      if (isMiniPay && isConnected && !isLoggedIn && !this.isLoading() && !this.hasAttemptedAutoSignIn) {
        this.hasAttemptedAutoSignIn = true;
        this.toastService.show('SIWE Needed', 'MiniPay wallet connected. Opening SIWE prompt...', 5000, 'bg-warning text-dark');
        console.log('[MiniPay] Wallet auto-connected. Triggering automatic SIWE signature...');
        setTimeout(() => {
          if (!this.isLoggedIn && !this.isLoading()) {
            this.onSignIn();
          }
        }, 1000);
      }
    });

    // Scroll window/page back to top when the auth overlay closes
    // (e.g. after successful authentication/verification, or cancellation).
    // This resolves layout shifting or scroll displacement from mobile keyboard/inputs.
    let previousShowOverlay = this.showOverlay;
    effect(() => {
      const currentShow = this.showOverlay;
      if (previousShowOverlay && !currentShow) {
        console.log('[AuthOverlay] Overlay closed. Resetting scroll position to top...');
        this.scrollToTop();
      }
      previousShowOverlay = currentShow;
    });
  }

  private scrollToTop() {
    if (typeof window !== 'undefined') {
      // Scroll window/body
      window.scrollTo({ top: 0, behavior: 'smooth' });
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;

      // Scroll the main content shell as well in case it holds the scroll container
      const mainShell = document.querySelector('.bb-main');
      if (mainShell) {
        mainShell.scrollTop = 0;
      }
    }
  }

  // Helper getters
  get walletConnected(): boolean {
    return !!this.authService.web3Service.account$();
  }

  get isLoggedIn(): boolean {
    return this.authService.authService.isLoggedIn();
  }

  get emailVerified(): boolean {
    const session = this.authService.authService.session();
    return !!(session?.user?.emailVerified);
  }

  // Determine if overlay needs to be displayed
  get showOverlay(): boolean {
    // Do not display the auth overlay while user is actively picking/connecting a wallet in the modal
    if (this.authService.web3Service.isConnecting$()) {
      return false;
    }
    // Show overlay if wallet is connected BUT either:
    // 1. User is not signed in via SIWE
    // 2. User is signed in but email is not verified
    return this.walletConnected && (!this.isLoggedIn || !this.emailVerified);
  }

  async onSignIn() {
    this.isLoading.set(true);
    this.toastService.show('SIWE Signature', 'Requesting signature from MiniPay...', 4000, 'bg-info text-light');
    await this.spinner.show('siwe-spinner');
    try {
      if (this.referralInput && this.referralInput.trim()) {
        localStorage.setItem('brainbook_referrer_code', this.referralInput.trim());
      }
      await this.authService.signInWithEthereum();
      this.toastService.show('Success', 'Authenticated successfully! 🚀', 4000, 'bg-success text-light');
    } catch (error: any) {
      console.error(error);
      this.toastService.error('Authentication Failed', error.message || 'Signature request rejected or invalid.');
    } finally {
      this.isLoading.set(false);
      await this.spinner.hide('siwe-spinner');
    }
  }

  async onRequestOtp() {
    if (!this.emailInput || !this.emailInput.includes('@')) {
      this.toastService.error('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    this.isLoading.set(true);
    await this.spinner.show('otp-spinner');
    try {
      await this.authService.sendEmailOtp(this.emailInput);
      this.otpSent.set(true);
      this.toastService.show('OTP Sent', `A 6-digit code has been queued for ${this.emailInput}`, 4000, 'bg-info text-light');
    } catch (error: any) {
      console.error(error);
      this.toastService.error('OTP Request Failed', error.message || 'Failed to send OTP code.');
    } finally {
      this.isLoading.set(false);
      await this.spinner.hide('otp-spinner');
    }
  }

  async onVerifyOtp() {
    if (!this.otpInput || this.otpInput.length !== 6) {
      this.toastService.error('Invalid Code', 'Please enter the 6-digit OTP code.');
      return;
    }

    this.isLoading.set(true);
    await this.spinner.show('otp-spinner');
    try {
      await this.authService.verifyEmailOtp(this.emailInput, this.otpInput);
      this.toastService.show('Success', 'Email verified successfully! Profile activated. 🎉', 5000, 'bg-success text-light');
      // Reset form
      this.emailInput = '';
      this.otpInput = '';
      this.otpSent.set(false);
    } catch (error: any) {
      console.error(error);
      this.toastService.error('Verification Failed', error.message || 'Incorrect or expired OTP.');
    } finally {
      this.isLoading.set(false);
      await this.spinner.hide('otp-spinner');
    }
  }

  async onCancel() {
    // If they cancel or disconnect, we disconnect their wallet and sign out session so the overlay hides
    await this.authService.web3Service.disconnectWallet();
    try {
      await this.authService.signOut();
    } catch (e) {
      console.warn('Sign out on cancel error:', e);
    }
  }
}
