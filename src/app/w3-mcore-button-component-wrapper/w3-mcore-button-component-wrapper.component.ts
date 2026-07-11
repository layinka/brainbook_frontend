import { Component, inject } from '@angular/core';
import { Web3Service } from '../services/web3';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-w3m-core-button-wrapper',
    templateUrl: './w3-mcore-button-component-wrapper.component.html',
    styleUrls: ['./w3-mcore-button-component-wrapper.component.scss'],
    standalone: true,
    imports: [CommonModule]
})
export class W3MCoreButtonComponentWrapperComponent {
  public web3Service = inject(Web3Service);
  
  async connectWallet() {
    await this.web3Service.connectWallet();
  }

  async disconnectWallet() {
    await this.web3Service.disconnectWallet();
  }

  get isConnected(): boolean {
    return !!this.web3Service.account;
  }

  get address(): string {
    const addr = this.web3Service.account;
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  get chainName(): string {
    const chainId = this.web3Service.chainId;
    if (!chainId) return '';
    const chain = this.web3Service.chains.find(c => c.id === chainId);
    return chain?.name || '';
  }
}
