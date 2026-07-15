import { Component, effect, inject, signal } from '@angular/core';
import { combineLatest, Subscription } from 'rxjs';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgbCollapse, NgbDropdown, NgbDropdownToggle, NgbDropdownMenu } from '@ng-bootstrap/ng-bootstrap';
import { environment } from '../../environments/environment';
import { chains, Web3Service } from '../services/web3';
import { W3MCoreButtonComponentWrapperComponent } from '../w3-mcore-button-component-wrapper/w3-mcore-button-component-wrapper.component';
import { AutoUnsubscribe } from '../auto-unsubscribe.decorator';
import { SIWEAuthService } from '../services/siwe-auth.service';
import { GameContractService } from '../services/game-contract.service';
import { Chain } from 'viem';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
  imports: [RouterLink, RouterLinkActive, NgbCollapse, NgbDropdown, NgbDropdownToggle, NgbDropdownMenu, W3MCoreButtonComponentWrapperComponent]
})
@AutoUnsubscribe
export class NavbarComponent {

  isDevelopment = environment.production == false

  isMenuCollapsed = true;

  chainName = ''

  tokenBalance = signal('0.0');

  availableChains: Chain[] = [];
  isNetworkSwitching = signal(false);

  private chainSubscription: Subscription | undefined = undefined;

  public authService = inject(SIWEAuthService);
  private gameContract = inject(GameContractService);

  constructor(public w3s: Web3Service) {

    // Get available chains from Web3Service
    this.availableChains = this.w3s.chains;

    effect(() => {
      const chainId = this.w3s.chainId$();
      if (chainId) {
        this.chainName = chains[chainId]?.name || 'Unsupported Network';
      } else {
        this.chainName = '';
      }
    });

    // Reactively fetch token balance when wallet account or chain changes
    effect(async () => {
      const account = this.w3s.account$();
      const chainId = this.w3s.chainId$();
      if (account) {
        try {
          const bal = await this.gameContract.getTokenBalance(account);
          // Format balance to 1 decimal place for neatness in navbar (e.g. "120.5")
          const num = parseFloat(bal);
          this.tokenBalance.set(isNaN(num) ? '0.0' : num.toFixed(1));
        } catch {
          this.tokenBalance.set('0.0');
        }
      } else {
        this.tokenBalance.set('0.0');
      }
    });
  }

  toggleTheme() {
    let bodyTheme = document.body
    bodyTheme.classList.toggle('light-theme')
  }

  ngOnInit() {


  }

  async switchNetwork(chainId: number, dropdown?: NgbDropdown) {
    console.log('Attempting to switch')
    if (this.isNetworkSwitching()) return;

    this.isNetworkSwitching.set(true);
    try {
      const success = await this.w3s.switchChain(chainId);
      if (!success) {
        console.warn('Failed to switch network');
      } else {
        console.info('Network switched');
        if (dropdown) {
          dropdown.close();
        }
      }
    } catch (error) {
      console.error('Error switching network:', error);
    } finally {
      this.isNetworkSwitching.set(false);
    }
  }

  getChainIcon(chainId: number): string {
    switch (chainId) {
      case 42220: // Celo
        return '🌿';
      case 11142220: // Celo Sepolia
        return '🧪';
      case 1116: // Core DAO
        return '⚡';
      case 31337: // Hardhat
        return '🔨';
      default:
        return '⛓️';
    }
  }

}
