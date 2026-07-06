import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Web3Service } from '../../services/web3';
import { GameContractService } from '../../services/game-contract.service';
import { AdService } from '../../services/ad.service';
import { AppToastService } from '../../services/app-toast.service';
import { LocalStorageService, ItemInventory } from '../../services/local-storage.service';
import { W3MCoreButtonComponentWrapperComponent } from '../../w3-mcore-button-component-wrapper/w3-mcore-button-component-wrapper.component';

interface StoreItem {
  id: number;
  name: string;
  price: number;
  icon: string;
  description: string;
}

@Component({
  selector: 'app-store',
  standalone: true,
  imports: [CommonModule, RouterLink, W3MCoreButtonComponentWrapperComponent],
  templateUrl: './store.component.html',
  styleUrl: './store.component.scss'
})
export class StoreComponent implements OnInit {
  w3s = inject(Web3Service);
  private gameContract = inject(GameContractService);
  adService = inject(AdService);
  private toast = inject(AppToastService);
  private localStorage = inject(LocalStorageService);

  // Mapping from ERC1155 token IDs to local storage inventory keys
  private itemMappings: Record<number, keyof ItemInventory> = {
    1000: 'timeFreeze',
    1001: 'hintReveal',
    1002: 'eliminateOption'
  };

  readonly storeItems: StoreItem[] = [
    {
      id: 1000,
      name: 'Time Freeze',
      price: 5,
      icon: '⏳',
      description: 'Freezes the question timer for 5 seconds to give you more thinking time.'
    },
    {
      id: 1001,
      name: 'Hint Reveal',
      price: 3,
      icon: '💡',
      description: 'Reveals the hidden text clue for the current question.'
    },
    {
      id: 1002,
      name: 'Eliminate Option',
      price: 4,
      icon: '❌',
      description: 'Deletes one wrong answer option from the three choices.'
    }
  ];

  // Selected purchase quantities per item ID
  quantities = signal<Record<number, number>>({
    1000: 1,
    1001: 1,
    1002: 1
  });

  // Current inventory owned counts
  ownedCounts = signal<Record<number, number>>({
    1000: 0,
    1001: 0,
    1002: 0
  });

  tokenBalance = signal('0.0');
  purchasingItemId = signal<number | null>(null);

  constructor() {
    // Reactively refresh store inventory and token balances when wallet account/chain changes
    effect(async () => {
      const account = this.w3s.account$();
      const chainId = this.w3s.chainId$();
      if (account) {
        await this.refreshBalances(account);
      } else {
        this.tokenBalance.set('0.0');
        this.ownedCounts.set({ 1000: 0, 1001: 0, 1002: 0 });
      }
    });
  }

  ngOnInit(): void {
    // Initial fetch if account exists
    const account = this.w3s.account$();
    if (account) {
      void this.refreshBalances(account);
    }
  }

  async refreshBalances(account: string): Promise<void> {
    try {
      // 1. Fetch ERC20 Token balance
      const balance = await this.gameContract.getTokenBalance(account);
      const val = parseFloat(balance);
      this.tokenBalance.set(isNaN(val) ? '0.0' : val.toFixed(1));

      // 2. Fetch ERC1155 Item balances batch
      const itemIds = this.storeItems.map(i => i.id);
      const balances = await this.gameContract.getItemBalancesBatch(itemIds, account);
      
      const counts: Record<number, number> = {};
      const currentLocal = this.localStorage.getInventory();

      this.storeItems.forEach((item, index) => {
        const itemBal = balances[index] || 0;
        counts[item.id] = itemBal;

        // Sync blockchain balance to local storage mirror
        const key = this.itemMappings[item.id];
        if (key) {
          currentLocal[key] = itemBal;
        }
      });

      this.localStorage.updateInventory(currentLocal);
      this.ownedCounts.set(counts);
    } catch (err) {
      console.error('Error refreshing store balances:', err);
    }
  }

  adjustQuantity(itemId: number, delta: number): void {
    const current = this.quantities();
    const updatedQty = Math.max(1, (current[itemId] || 1) + delta);
    this.quantities.set({
      ...current,
      [itemId]: updatedQty
    });
  }

  async buyItem(itemId: number): Promise<void> {
    const account = this.w3s.account$();
    if (!account) {
      this.toast.error('Wallet Disconnected', 'Please connect your wallet first.');
      return;
    }

    const qty = this.quantities()[itemId] || 1;
    const item = this.storeItems.find(i => i.id === itemId);
    if (!item) return;

    const totalPrice = item.price * qty;
    const currentBal = parseFloat(this.tokenBalance());
    if (currentBal < totalPrice) {
      this.toast.error('Insufficient Balance', `You need ${totalPrice} BRAINBOOK, but only have ${currentBal}.`);
      return;
    }

    this.purchasingItemId.set(itemId);
    this.toast.show('Transaction Sent', `Confirm purchase of ${qty}x ${item.name} in your wallet...`, undefined, 'bg-info text-light');

    try {
      await this.gameContract.purchaseGameItem(itemId, qty);
      
      // Update local storage mirror
      const key = this.itemMappings[itemId];
      if (key) {
        this.localStorage.addItem(key, qty);
      }

      this.toast.show('Purchase Successful!', `Acquired ${qty}x ${item.name}!`, undefined, 'bg-success text-light');
      
      // Reset selected quantity to 1
      this.quantities.set({
        ...this.quantities(),
        [itemId]: 1
      });

      // Refresh balances
      await this.refreshBalances(account);
    } catch (err: any) {
      console.error('Purchase transaction failed:', err);
      this.toast.error('Purchase Failed', err?.message || 'Transaction rejected or failed.');
    } finally {
      this.purchasingItemId.set(null);
    }
  }

  claimFreeWithAd(itemId: number): void {
    const item = this.storeItems.find(i => i.id === itemId);
    if (!item) return;

    this.adService.showRewardedAd(() => {
      // Award item in local storage mirror
      const key = this.itemMappings[itemId];
      if (key) {
        this.localStorage.addItem(key, 1);
      }

      // Update UI state count
      const currentCounts = this.ownedCounts();
      const updatedCount = (currentCounts[itemId] || 0) + 1;
      this.ownedCounts.set({
        ...currentCounts,
        [itemId]: updatedCount
      });
      this.toast.show('Item Added', `1x Free ${item.name} added to your inventory!`, undefined, 'bg-success text-light');
    });
  }
}
