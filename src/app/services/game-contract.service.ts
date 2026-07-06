import { Injectable, inject } from '@angular/core';
import { readContract, writeContract, waitForTransactionReceipt } from '@wagmi/core';
import { formatEther, parseEther } from 'viem';
import { environment } from '../../environments/environment';
import { Web3Service, wagmiConfig } from './web3';
import {
  BRAIN_BOOK_TOKEN_ABI,
  BRAIN_BOOK_NFT_ABI,
  BRAIN_BOOK_GAME_MANAGER_ABI,
  BRAIN_BOOK_STAKING_ABI,
  ERC20_ABI
} from '../abis';

@Injectable({
  providedIn: 'root'
})
export class GameContractService {
  private w3s = inject(Web3Service);

  // Helper getters for contract addresses on current chain
  get tokenAddress(): `0x${string}` {
    const chainId = this.w3s.chainId || environment.defaultChainId;
    return environment.contracts[chainId]?.brainbookToken as `0x${string}`;
  }

  get nftAddress(): `0x${string}` {
    const chainId = this.w3s.chainId || environment.defaultChainId;
    return environment.contracts[chainId]?.brainbookNFT as `0x${string}`;
  }

  get managerAddress(): `0x${string}` {
    const chainId = this.w3s.chainId || environment.defaultChainId;
    return environment.contracts[chainId]?.brainbookGameManager as `0x${string}`;
  }

  /**
   * Get BRAINBOOK token balance for a user
   */
  async getTokenBalance(accountAddress?: string): Promise<string> {
    const address = accountAddress || this.w3s.account$();
    if (!address) return '0.0';

    try {
      const balance = await readContract(wagmiConfig, {
        address: this.tokenAddress,
        abi: BRAIN_BOOK_TOKEN_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`]
      });
      return formatEther(balance);
    } catch (err) {
      console.error('Error fetching token balance:', err);
      return '0.0';
    }
  }

  /**
   * Get balance of a specific ERC1155 token ID
   */
  async getItemBalance(tokenId: number, accountAddress?: string): Promise<number> {
    const address = accountAddress || this.w3s.account$();
    if (!address) return 0;

    try {
      const balance = await readContract(wagmiConfig, {
        address: this.nftAddress,
        abi: BRAIN_BOOK_NFT_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`, BigInt(tokenId)]
      });
      return Number(balance);
    } catch (err) {
      console.error(`Error fetching balance for item ${tokenId}:`, err);
      return 0;
    }
  }

  /**
   * Batch get balances of multiple ERC1155 token IDs
   */
  async getItemBalancesBatch(tokenIds: number[], accountAddress?: string): Promise<number[]> {
    const address = accountAddress || this.w3s.account$();
    if (!address || tokenIds.length === 0) return tokenIds.map(() => 0);

    try {
      const accounts = tokenIds.map(() => address as `0x${string}`);
      const ids = tokenIds.map(id => BigInt(id));

      const balances = await readContract(wagmiConfig, {
        address: this.nftAddress,
        abi: BRAIN_BOOK_NFT_ABI,
        functionName: 'balanceOfBatch',
        args: [accounts, ids]
      });

      return balances.map(b => Number(b));
    } catch (err) {
      console.error('Error fetching item balances batch:', err);
      return tokenIds.map(() => 0);
    }
  }

  /**
   * Get store price for an item
   */
  async getItemPrice(itemId: number): Promise<string> {
    try {
      const price = await readContract(wagmiConfig, {
        address: this.managerAddress,
        abi: BRAIN_BOOK_GAME_MANAGER_ABI,
        functionName: 'itemPrices',
        args: [BigInt(itemId)]
      });
      return formatEther(price);
    } catch (err) {
      console.error(`Error fetching price for item ${itemId}:`, err);
      return '0.0';
    }
  }

  /**
   * Purchase a game item (handles allowance check and approve if necessary)
   */
  async purchaseGameItem(itemId: number, quantity: number): Promise<string> {
    const userAddress = this.w3s.account$();
    if (!userAddress) throw new Error('Wallet not connected');

    const priceEth = await this.getItemPrice(itemId);
    const totalPrice = parseEther(priceEth) * BigInt(quantity);

    // 1. Check allowance
    const allowance = await readContract(wagmiConfig, {
      address: this.tokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [userAddress as `0x${string}`, this.managerAddress]
    });

    // 2. Approve if allowance is insufficient
    if (allowance < totalPrice) {
      console.log(`Approving GameManager to spend ${formatEther(totalPrice)} BRAINBOOK...`);
      
      const approveHash = await writeContract(wagmiConfig, {
        address: this.tokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [this.managerAddress, totalPrice]
      });

      await waitForTransactionReceipt(wagmiConfig, { hash: approveHash });
      console.log('Approve transaction confirmed!');
    }

    // 3. Purchase the item
    console.log(`Purchasing item ${itemId} x ${quantity}...`);
    const purchaseHash = await writeContract(wagmiConfig, {
      address: this.managerAddress,
      abi: BRAIN_BOOK_GAME_MANAGER_ABI,
      functionName: 'purchaseGameItem',
      args: [BigInt(itemId), BigInt(quantity)]
    });

    await waitForTransactionReceipt(wagmiConfig, { hash: purchaseHash });
    console.log('Purchase transaction confirmed!');
    return purchaseHash;
  }

  /**
   * Claim an achievement NFT earned in game with a backend signature
   */
  async claimAchievement(tokenId: number, amount: number, signature: string): Promise<string> {
    const userAddress = this.w3s.account$();
    if (!userAddress) throw new Error('Wallet not connected');

    console.log(`Claiming achievement badge NFT ${tokenId}...`);
    const hash = await writeContract(wagmiConfig, {
      address: this.managerAddress,
      abi: BRAIN_BOOK_GAME_MANAGER_ABI,
      functionName: 'claimAchievement',
      args: [BigInt(tokenId), BigInt(amount), signature as `0x${string}`]
    });

    await waitForTransactionReceipt(wagmiConfig, { hash });
    console.log('Achievement claim confirmed!');
    return hash;
  }

  /**
   * Claim token rewards earned in game with a backend signature
   */
  async claimTokenReward(amountInWei: bigint, signature: string): Promise<string> {
    const userAddress = this.w3s.account$();
    if (!userAddress) throw new Error('Wallet not connected');

    console.log(`Claiming token reward of ${formatEther(amountInWei)} BRAINBOOK...`);
    const hash = await writeContract(wagmiConfig, {
      address: this.managerAddress,
      abi: BRAIN_BOOK_GAME_MANAGER_ABI,
      functionName: 'claimTokenReward',
      args: [amountInWei, signature as `0x${string}`]
    });

    await waitForTransactionReceipt(wagmiConfig, { hash });
    console.log('Token reward claim confirmed!');
    return hash;
  }

  get stakingAddress(): `0x${string}` {
    const chainId = this.w3s.chainId || environment.defaultChainId;
    return environment.contracts[chainId]?.brainbookStaking as `0x${string}`;
  }

  async getStakedBalance(accountAddress?: string): Promise<string> {
    const address = accountAddress || this.w3s.account$();
    if (!address || !this.stakingAddress || this.stakingAddress === '0x0000000000000000000000000000000000000000') return '0.0';
    try {
      const balance = await readContract(wagmiConfig, {
        address: this.stakingAddress,
        abi: BRAIN_BOOK_STAKING_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`]
      });
      return formatEther(balance as bigint);
    } catch (err) {
      console.error('Error fetching staked balance:', err);
      return '0.0';
    }
  }

  async getTotalStaked(): Promise<string> {
    if (!this.stakingAddress || this.stakingAddress === '0x0000000000000000000000000000000000000000') return '0.0';
    try {
      const total = await readContract(wagmiConfig, {
        address: this.stakingAddress,
        abi: BRAIN_BOOK_STAKING_ABI,
        functionName: 'totalSupply'
      });
      return formatEther(total as bigint);
    } catch (err) {
      console.error('Error fetching total staked:', err);
      return '0.0';
    }
  }

  async getEarnedRewards(accountAddress?: string): Promise<string> {
    const address = accountAddress || this.w3s.account$();
    if (!address || !this.stakingAddress || this.stakingAddress === '0x0000000000000000000000000000000000000000') return '0.0';
    try {
      const earned = await readContract(wagmiConfig, {
        address: this.stakingAddress,
        abi: BRAIN_BOOK_STAKING_ABI,
        functionName: 'earned',
        args: [address as `0x${string}`]
      });
      return formatEther(earned as bigint);
    } catch (err) {
      console.error('Error fetching earned rewards:', err);
      return '0.0';
    }
  }

  async getStakingAllowance(accountAddress: string): Promise<bigint> {
    if (!this.stakingAddress || this.stakingAddress === '0x0000000000000000000000000000000000000000') return 0n;
    try {
      const allowance = await readContract(wagmiConfig, {
        address: this.tokenAddress,
        abi: BRAIN_BOOK_TOKEN_ABI,
        functionName: 'allowance',
        args: [accountAddress as `0x${string}`, this.stakingAddress]
      });
      return allowance as bigint;
    } catch (err) {
      console.error('Error fetching allowance:', err);
      return 0n;
    }
  }

  async approveStaking(amountEth: string): Promise<string> {
    const hash = await writeContract(wagmiConfig, {
      address: this.tokenAddress,
      abi: BRAIN_BOOK_TOKEN_ABI,
      functionName: 'approve',
      args: [this.stakingAddress, parseEther(amountEth)]
    });
    await waitForTransactionReceipt(wagmiConfig, { hash });
    return hash;
  }

  async stake(amountEth: string): Promise<string> {
    const hash = await writeContract(wagmiConfig, {
      address: this.stakingAddress,
      abi: BRAIN_BOOK_STAKING_ABI,
      functionName: 'stake',
      args: [parseEther(amountEth)]
    });
    await waitForTransactionReceipt(wagmiConfig, { hash });
    return hash;
  }

  async withdrawStaking(amountEth: string): Promise<string> {
    const hash = await writeContract(wagmiConfig, {
      address: this.stakingAddress,
      abi: BRAIN_BOOK_STAKING_ABI,
      functionName: 'withdraw',
      args: [parseEther(amountEth)]
    });
    await waitForTransactionReceipt(wagmiConfig, { hash });
    return hash;
  }

  async getStakingReward(): Promise<string> {
    const hash = await writeContract(wagmiConfig, {
      address: this.stakingAddress,
      abi: BRAIN_BOOK_STAKING_ABI,
      functionName: 'getReward'
    });
    await waitForTransactionReceipt(wagmiConfig, { hash });
    return hash;
  }

  async exitStaking(): Promise<string> {
    const hash = await writeContract(wagmiConfig, {
      address: this.stakingAddress,
      abi: BRAIN_BOOK_STAKING_ABI,
      functionName: 'exit'
    });
    await waitForTransactionReceipt(wagmiConfig, { hash });
    return hash;
  }
}
