import { inject, Injectable, effect } from '@angular/core';
import { Web3Service } from './web3';
import { AuthService, SiweService, EmailOtpService } from 'ngx-better-auth';
import { firstValueFrom } from 'rxjs';
import { signMessage } from '@web3-onboard/wagmi';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SIWEAuthService {
  public readonly web3Service = inject(Web3Service);
  public readonly authService = inject(AuthService);
  public readonly siweService = inject(SiweService);
  public readonly emailOtpService = inject(EmailOtpService);
  private readonly http = inject(HttpClient);

  constructor() {
    // Session sync effect:
    // If the wallet is disconnected or changed, synchronize or terminate the Better-Auth session
    effect(() => {
      const currentWallet = this.web3Service.account$();
      const currentChainId = this.web3Service.chainId$();
      const currentSession = this.authService.session();

      // If the user is logged in (already signed up), clear any pre-existing stored referral codes
      if (currentSession && currentSession.user) {
        try {
          if (localStorage.getItem('brainbook_referrer_code') || document.cookie.includes('brainbook_referrer_code=')) {
            // console.log('[SIWE] User is logged in (already signed up). Clearing stored referral code.');
            localStorage.removeItem('brainbook_referrer_code');
            document.cookie = "brainbook_referrer_code=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax; Secure";
          }
        } catch (e) { }
      }

      // Prevent signing out during initialization / reconnection
      const wagmiConfig = this.web3Service.getWagmiConfig();
      const status = wagmiConfig?.state?.status;
      if (status === 'connecting' || status === 'reconnecting') {
        return;
      }

      if (currentSession && currentSession.user) {
        // The walletAddress is stored in session.user.walletAddress (or similar custom field)
        const sessionWallet = currentSession.user.walletAddress;

        if (sessionWallet && currentWallet) {
          if (sessionWallet.toLowerCase() !== currentWallet.toLowerCase()) {
            // console.log('Wallet address mismatch. Signing out session.');
            void this.signOut();
          } else if (currentChainId) {
            // Check if chain ID has changed since SIWE login
            const loggedInChainId = localStorage.getItem('brainbook_siwe_chain_id');
            if (loggedInChainId && String(currentChainId) !== loggedInChainId) {
              // console.log(`Chain ID mismatch (current: ${currentChainId}, loggedIn: ${loggedInChainId}). Signing out session.`);
              void this.signOut();
            }
          }
        } else if (!currentWallet && status === 'disconnected') {
          // If wallet explicitly disconnected, clear Better-Auth session
          // console.log('Wallet disconnected. Signing out session.');
          void this.signOut();
        }
      }
    });
  }

  private getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      return decodeURIComponent(parts.pop()?.split(';').shift() || '');
    }
    return null;
  }

  /**
   * Run SIWE Sign In Flow:
   * 1. Request Nonce from Backend.
   * 2. Construct EIP-4361 SIWE message.
   * 3. Prompt user's wallet to sign SIWE message via wagmi.
   * 4. Verify message and signature on the backend to log in and set session cookies.
   */
  async signInWithEthereum(): Promise<any> {
    // console.log('[SIWE] Starting sign-in flow...');
    const walletAddress = this.web3Service.account;
    const chainId = this.web3Service.chainId;
    // console.log('[SIWE] Current wallet details:', { walletAddress, chainId });

    if (!walletAddress || !chainId) {
      console.warn('[SIWE] Wallet address or chainId is missing!');
      throw new Error('Wallet not connected');
    }

    try {
      // 1. Fetch Nonce from backend
      // console.log('[SIWE] 1. Requesting nonce from backend...');
      const nonceResult = await firstValueFrom(
        this.siweService.getNonce({ walletAddress, chainId })
      );
      // console.log('[SIWE] Nonce response received:', nonceResult);
      const nonce = nonceResult?.nonce;

      if (!nonce) {
        throw new Error('Failed to retrieve a valid nonce from backend.');
      }

      // 2. Construct standard EIP-4361 SIWE message
      // console.log('[SIWE] 2. Constructing EIP-4361 SIWE message...');
      const domain = window.location.host;
      const origin = window.location.origin;
      const statement = 'Sign in with Ethereum to BrainBook.';
      const issuedAt = new Date().toISOString();

      const message = `${domain} wants you to sign in with your Ethereum account:
${walletAddress}

${statement}

URI: ${origin}
Version: 1
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${issuedAt}`;
      console.log('[SIWE] SIWE Message:\n', message);

      // 3. Request signature from wallet via direct provider or wagmi config
      // console.log('[SIWE] 3. Prompting wallet signature...');
      let signature: string | undefined;

      // Method A: In MiniPay or when window.ethereum is available, try direct provider personal_sign
      if (typeof window !== 'undefined' && (window as any).ethereum && (window as any).ethereum.request) {
        try {
          // console.log('[SIWE] Attempting direct personal_sign via window.ethereum...');
          const provider = (window as any).ethereum;
          
          try {
            // Standard EIP-1193 personal_sign: params [message, walletAddress]
            signature = await provider.request({
              method: 'personal_sign',
              params: [message, walletAddress]
            });
          } catch (err1) {
            // Alternative EIP-1193 params order or hex encoding
            const hexMsg = `0x${Array.from(new TextEncoder().encode(message)).map(b => b.toString(16).padStart(2, '0')).join('')}`;
            try {
              signature = await provider.request({
                method: 'personal_sign',
                params: [hexMsg, walletAddress]
              });
            } catch (err2) {
              // Try reversed params [walletAddress, message]
              signature = await provider.request({
                method: 'personal_sign',
                params: [walletAddress, message]
              });
            }
          }
          // console.log('[SIWE] Direct personal_sign succeeded:', signature);
        } catch (e: any) {
          console.warn('[SIWE] Direct personal_sign failed, falling back to Wagmi signMessage:', e);
        }
      }

      // Method B: Fallback to Wagmi signMessage if direct personal_sign did not return a signature
      if (!signature) {
        // console.log('[SIWE] Attempting Wagmi signMessage fallback...');
        const wagmiConfig = this.web3Service.getWagmiConfig();
        if (!wagmiConfig) {
          throw new Error('Wagmi config not available. Please reconnect your wallet.');
        }
        signature = await signMessage(wagmiConfig, { message });
      }

      if (!signature) {
        throw new Error('Failed to obtain signature from wallet.');
      }
      // console.log('[SIWE] Signature successfully received:', signature);

      // 4. Verify the message and signature with better-auth server
      // console.log('[SIWE] 4. Submitting message and signature to backend...');
      // WORKAROUND: Using direct HttpClient call instead of this.siweService.verifyMessage().
      // The ngx-better-auth SiweService wrapper internally waits for the Angular session signal
      // to emit an updated value after verification. If Better Auth's session atom listener
      // doesn't fire (e.g. due to missing route in the library's default atomListeners for the
      // SIWE verify path), the Observable never completes and the UI hangs indefinitely.
      // TODO: Remove this workaround once ngx-better-auth properly handles SIWE session updates,
      // or when the siweClient() plugin is added to provideBetterAuth() plugins in app.config.ts.
      let referrerCode = null;
      try {
        referrerCode = localStorage.getItem('brainbook_referrer_code') || this.getCookie('brainbook_referrer_code');
      } catch (e) {
        console.warn('Could not read referral code from storage/cookies:', e);
      }

      const verifyResult: any = await firstValueFrom(
        this.http.post<{ success: boolean; user: any; isAlreadySignedUp?: boolean }>(
          `${environment.apiUrl.replace('/api/v1', '')}/api/auth/siwe/verify`,
          { message, signature, walletAddress, chainId, referrerCode },
          { withCredentials: true }
        )
      );

      if (!verifyResult?.user) {
        console.error('[SIWE] Verification failed — no user in response');
        throw new Error('Verification failed');
      }

      // Success - clear stored referral code if user was already signed up, OR if a referral code was successfully used
      const isAlreadySignedUp = !!verifyResult.isAlreadySignedUp;
      if (isAlreadySignedUp || referrerCode) {
        // console.log(`[SIWE] Clearing referral code. alreadySignedUp=${isAlreadySignedUp}, usedCode=${!!referrerCode}`);
        try {
          localStorage.removeItem('brainbook_referrer_code');
        } catch (e) { }
        // Clear cookie as well
        document.cookie = "brainbook_referrer_code=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax; Secure";
      }

      // console.log('[SIWE] Backend verification result data:', verifyResult.user);

      // Save the signed-in chain ID so we can reactively log out if they switch networks
      localStorage.setItem('brainbook_siwe_chain_id', String(chainId));

      // Force session refetch after SIWE verification to update ngx-better-auth session signal
      // console.log('[SIWE] 5. Requesting session refetch...');
      await this.refreshSession();

      return verifyResult.user;
    } catch (error) {
      console.error('[SIWE] SIWE sign-in flow failed:', error);
      throw error;
    }
  }


  /**
   * Request email OTP code (initiating email change/link flow)
   */
  async sendEmailOtp(email: string): Promise<any> {
    // console.log('[SIWE] User has a regular email. Initiating change-email OTP request for:', email);
    return firstValueFrom(
      this.http.post(`${environment.apiUrl.replace('/api/v1', '')}/api/auth/email-otp/request-email-change`, {
        newEmail: email
      }, { withCredentials: true })
    );
  }

  /**
   * Verify email OTP code (verifying and completing email change/link)
   */
  async verifyEmailOtp(email: string, otp: string): Promise<any> {
    console.log('[SIWE] User has a regular email. Initiating change-email OTP verification...');
    const res = await firstValueFrom(
      this.http.post(`${environment.apiUrl.replace('/api/v1', '')}/api/auth/email-otp/change-email`, {
        newEmail: email,
        otp
      }, { withCredentials: true })
    );

    // Refresh the session state so that the updated email and verification status propagate
    await this.refreshSession();

    return res;
  }

  /**
   * Fetch current session data directly from the server to refresh the AuthService session signal
   */
  async refreshSession(): Promise<any> {
    // console.log('[SIWE] Fetching updated session from server...');
    try {
      const sessionData = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl.replace('/api/v1', '')}/api/auth/get-session`, {
          withCredentials: true
        })
      );
      // console.log('[SIWE] Updated session data received:', sessionData);
      this.authService.session.set(sessionData);
      return sessionData;
    } catch (error) {
      console.error('[SIWE] Failed to refresh session:', error);
      throw error;
    }
  }

  /**
   * Sign out from Better-Auth session
   */
  async signOut(): Promise<void> {
    try {
      localStorage.removeItem('brainbook_siwe_chain_id');
      await firstValueFrom(this.authService.signOut());
    } catch (error) {
      console.error('Better Auth sign out failed:', error);
    }
  }
}
