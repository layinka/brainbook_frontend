import { Component, effect, inject, signal } from '@angular/core';
import { combineLatest, Subscription } from 'rxjs';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgbCollapse } from '@ng-bootstrap/ng-bootstrap';
import { environment } from '../../environments/environment';
import { ALL_CHAINS, Web3Service } from '../services/web3';
import { W3MCoreButtonComponentWrapperComponent } from '../w3-mcore-button-component-wrapper/w3-mcore-button-component-wrapper.component';
import { AutoUnsubscribe } from '../auto-unsubscribe.decorator';
import { SIWEAuthService } from '../services/siwe-auth.service';
import { GameContractService } from '../services/game-contract.service';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
  imports: [RouterLink, RouterLinkActive, NgbCollapse, W3MCoreButtonComponentWrapperComponent]
})
@AutoUnsubscribe
export class NavbarComponent {

  isDevelopment = environment.production == false

  isMenuCollapsed = true;

  chainName = ''

  tokenBalance = signal('0.0');

  private chainSubscription: Subscription | undefined = undefined;

  public authService = inject(SIWEAuthService);
  private gameContract = inject(GameContractService);

  constructor(public w3s: Web3Service) {

    effect(() => {
      if (this.w3s.chainId$()) {
        this.chainName = ALL_CHAINS[this.w3s.chainId$() ?? 31337]?.name
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

}
