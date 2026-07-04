import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SaveUpAuthService } from '../../services/saveup-auth.service';
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
  public saveUpAuth = inject(SaveUpAuthService);
  private toastService = inject(AppToastService);
  private spinner = inject(NgxSpinnerService);

  // Email form state
  emailInput = '';
  otpInput = '';
  otpSent = signal<boolean>(false);
  isLoading = signal<boolean>(false);

  private hasAttemptedAutoSignIn = false;

  constructor() {
    // If in MiniPay environment, automatically trigger SIWE when wallet connects
    effect(() => {
      const isConnected = this.walletConnected;
      const isLoggedIn = this.isLoggedIn;
      const isMiniPay = this.saveUpAuth.web3Service.isMiniPay;

      if (!isConnected) {
        this.hasAttemptedAutoSignIn = false;
      }

      if (isMiniPay && isConnected && !isLoggedIn && !this.isLoading() && !this.hasAttemptedAutoSignIn) {
        this.hasAttemptedAutoSignIn = true;
        console.log('[MiniPay] Wallet auto-connected. Triggering automatic SIWE signature...');
        setTimeout(() => {
          if (!this.isLoggedIn && !this.isLoading()) {
            this.onSignIn();
          }
        }, 1000);
      }
    });
  }

  // Helper getters
  get walletConnected(): boolean {
    return !!this.saveUpAuth.web3Service.account$();
  }

  get isLoggedIn(): boolean {
    return this.saveUpAuth.authService.isLoggedIn();
  }

  get emailVerified(): boolean {
    const session = this.saveUpAuth.authService.session();
    return !!(session?.user?.emailVerified);
  }

  // Determine if overlay needs to be displayed
  get showOverlay(): boolean {
    // Show overlay if wallet is connected BUT either:
    // 1. User is not signed in via SIWE
    // 2. User is signed in but email is not verified
    return this.walletConnected && (!this.isLoggedIn || !this.emailVerified);
  }

  async onSignIn() {
    this.isLoading.set(true);
    await this.spinner.show('siwe-spinner');
    try {
      await this.saveUpAuth.signInWithEthereum();
      this.toastService.show('Success', 'Authenticated successfully via SIWE! 🚀', 4000, 'bg-success text-light');
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
      await this.saveUpAuth.sendEmailOtp(this.emailInput);
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
      await this.saveUpAuth.verifyEmailOtp(this.emailInput, this.otpInput);
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

  onCancel() {
    // If they cancel or disconnect, we disconnect their wallet so the overlay hides
    this.saveUpAuth.web3Service.appKit.disconnect();
  }
}
