import { Injectable, inject } from '@angular/core';
import { readContract, writeContract as wagmiWriteContract, waitForTransactionReceipt, signMessage } from '@web3-onboard/wagmi';
import { formatEther, parseEther, encodeAbiParameters, parseAbiParameters, Address } from 'viem';
import { toDataSuffix } from '@celo/attribution-tags';
import { environment, DEX_REGISTRY, DexEntry } from '../../environments/environment';
import { Web3Service } from './web3';
import {
  BRAIN_BOOK_TOKEN_ABI,
  BRAIN_BOOK_NFT_ABI,
  BRAIN_BOOK_PRESALE_ABI,
  BRAIN_BOOK_GAME_MANAGER_ABI,
  BRAIN_BOOK_STAKING_ABI,
  BRAIN_BOOK_LIQUIDITY_MINING_ABI,
  ERC20_ABI,
  UNISWAP_V3_ROUTER_ABI,
  UNISWAP_V4_POOL_MANAGER_ABI,
  UNISWAP_V4_UNIVERSAL_ROUTER_ABI
} from '../abis';

export interface PriceSource {
  dex: string;
  chain: string;
  protocol: string;
  price: string;
  status: 'ok' | 'error' | 'pending' | 'no-pool';
}

export interface AggregatedPrice {
  averagePrice: string;
  sources: PriceSource[];
  lastUpdated: Date;
}

export interface SwapQuote {
  amountIn: string;
  estimatedAmountOut: string;
  priceImpact: string; // as percentage string, e.g. "0.12"
  minAmountOut: string; // after slippage
  dex: DexEntry;
}

export interface SwapParams {
  dex: DexEntry;
  tokenIn: string;   // address — BRAINBOOK or stablecoin
  tokenOut: string;  // address — the other token
  amountIn: string;  // in ether units (e.g. "10.5")
  slippageBps: number; // e.g. 100 = 1%
  recipient: string;
}

// ─── Minimal Uniswap V3 / Ubeswap V3 Pool ABI ──────────────────────────────
// Used to read slot0 (spot price) and observe() (TWAP) from the BRAINBOOK/cUSD pool.
const UNISWAP_V3_POOL_ABI = [
  {
    // Returns the current slot0 data including sqrtPriceX96 for spot price
    inputs: [],
    name: 'slot0',
    outputs: [
      { internalType: 'uint160', name: 'sqrtPriceX96', type: 'uint160' },
      { internalType: 'int24', name: 'tick', type: 'int24' },
      { internalType: 'uint16', name: 'observationIndex', type: 'uint16' },
      { internalType: 'uint16', name: 'observationCardinality', type: 'uint16' },
      { internalType: 'uint16', name: 'observationCardinalityNext', type: 'uint16' },
      { internalType: 'uint8', name: 'feeProtocol', type: 'uint8' },
      { internalType: 'bool', name: 'unlocked', type: 'bool' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    // Returns the time-weighted tick (TWAP) over the given seconds array
    inputs: [{ internalType: 'uint32[]', name: 'secondsAgos', type: 'uint32[]' }],
    name: 'observe',
    outputs: [
      { internalType: 'int56[]', name: 'tickCumulatives', type: 'int56[]' },
      { internalType: 'uint160[]', name: 'secondsPerLiquidityCumulativeX128s', type: 'uint160[]' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    // token0 address — tells us whether BRAINBOOK is currency0 or currency1
    inputs: [],
    name: 'token0',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

/** Fallback price shown when no pool is configured or the TWAP call fails (pre-launch) */
const FALLBACK_PRICE_USD = '0.001';

let activeWeb3Service: any = null;

/**
 * Custom writeContract wrapper to automatically append Celo Attribution Tag
 * for Proof of Ship qualification and support MiniPay overrides/fees.
 */
async function writeContract(config: any, args: any): Promise<`0x${string}`> {
  if (activeWeb3Service) {
    try {
      return await activeWeb3Service.writeContractWithMiniPay(args);
    } catch (err) {
      console.warn('[GameContractService] writeContract delegation failed, falling back:', err);
    }
  }

  const code = environment.celoAttributionCode;
  let suffix: `0x${string}` | undefined;
  if (code) {
    try {
      suffix = toDataSuffix(code);
    } catch (err) {
      console.warn('[Attribution] Failed to generate data suffix:', err);
    }
  }

  return wagmiWriteContract(config, {
    ...args,
    ...(suffix && { dataSuffix: suffix })
  } as any);
}

@Injectable({
  providedIn: 'root'
})
export class GameContractService {
  private w3s = inject(Web3Service);

  constructor() {
    activeWeb3Service = this.w3s;
  }

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

  get ubeswapPoolAddress(): `0x${string}` {
    const chainId = this.w3s.chainId || environment.defaultChainId;
    return environment.contracts[chainId]?.ubeswapPool as `0x${string}`;
  }

  /**
   * Helper to get wagmi config with error handling
   * Returns as 'any' to work around type incompatibility between
   * @wagmi/core v2 (used by web3-onboard) and v3 (in dependencies)
   */
  private getWagmi(): any {
    const config = this.w3s.getWagmiConfig();
    if (!config) {
      throw new Error('Wagmi config not available. Please connect your wallet first.');
    }
    return config;
  }

  // ─── Ubeswap V3 TWAP Price Oracle ─────────────────────────────────────────
  /**
   * Fetches the live BRAINBOOK/cUSD price from the Ubeswap V3 pool.
   *
   * Strategy (most to least reliable):
   *   1. 30-minute TWAP via `observe([1800, 0])` — manipulation-resistant.
   *   2. Spot price via `slot0()` — used if pool has < 30 min of history.
   *   3. FALLBACK_PRICE_USD — used before the pool is deployed / address is set.
   *
   * The sqrtPriceX96 → USD conversion formula:
   *   price = (sqrtPriceX96 / 2^96)^2
   * This gives the ratio of token1 per token0. If BRAINBOOK is token0, this
   * gives cUSD-per-BRAINBOOK directly. If BRAINBOOK is token1, we invert.
   *
   * @returns USD price string, e.g. "0.0051"
   */
  async getTokenPriceUsd(): Promise<string> {
    const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
    const poolAddr = this.ubeswapPoolAddress;

    // Guard: pool not yet deployed or not configured for this chain
    if (!poolAddr || poolAddr === ZERO_ADDR) {
      return FALLBACK_PRICE_USD;
    }

    const wagmiConfig = this.w3s.getWagmiConfig();
    if (!wagmiConfig) {
      console.warn('[PriceOracle] Wagmi config not available');
      return FALLBACK_PRICE_USD;
    }

    try {
      // Determine token ordering in the pool (BRAINBOOK may be token0 or token1)
      const token0 = await readContract(this.getWagmi(), {
        address: poolAddr,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'token0'
      }) as string;

      const brainbookIsToken0 = token0.toLowerCase() === this.tokenAddress.toLowerCase();

      // ── Attempt 1: 30-minute TWAP ─────────────────────────────────────────
      try {
        const TWAP_SECONDS = 1800; // 30 minutes
        const observations = await readContract(this.getWagmi(), {
          address: poolAddr,
          abi: UNISWAP_V3_POOL_ABI,
          functionName: 'observe',
          args: [[TWAP_SECONDS, 0]]
        }) as [bigint[], bigint[]];

        const tickCumulatives = observations[0];
        const tickDelta = Number(tickCumulatives[1] - tickCumulatives[0]);
        const avgTick = tickDelta / TWAP_SECONDS;

        // Uniswap V3 tick → price: price = 1.0001^tick
        const rawPrice = Math.pow(1.0001, avgTick);
        // If BRAINBOOK is token1, rawPrice = BRAINBOOK-per-cUSD → we need cUSD-per-BRAINBOOK
        const priceUsd = brainbookIsToken0 ? rawPrice : 1 / rawPrice;

        return priceUsd.toFixed(6);
      } catch {
        // Pool may have less than 30 min of price history — fall through to spot price
        console.warn('[TWAP] Pool history < 30 min, falling back to slot0 spot price');
      }

      // ── Attempt 2: Spot price from slot0 ──────────────────────────────────
      const slot0Result = await readContract(this.getWagmi(), {
        address: poolAddr,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'slot0'
      }) as readonly [bigint, number, number, number, number, number, boolean];

      const sqrtPriceX96 = slot0Result[0];
      // price = (sqrtPriceX96 / 2^96)^2
      const Q96 = 2n ** 96n;
      // Use Number for the ratio (safe at these magnitudes for price display)
      const ratio = Number(sqrtPriceX96) / Number(Q96);
      const rawSpotPrice = ratio * ratio;
      const spotPriceUsd = brainbookIsToken0 ? rawSpotPrice : 1 / rawSpotPrice;

      return spotPriceUsd.toFixed(6);

    } catch (err) {
      console.warn('[PriceOracle] Could not fetch price from pool, using fallback:', err);
      return FALLBACK_PRICE_USD;
    }
  }



  /**
   * Get BRAINBOOK token balance for a user
   */
  async getTokenBalance(accountAddress?: string): Promise<string> {
    const address = accountAddress || this.w3s.account$();
    if (!address) return '0.0';

    const wagmiConfig = this.w3s.getWagmiConfig();
    if (!wagmiConfig) return '0.0';

    try {
      const balance = await readContract(this.getWagmi(), {
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
      const balance = await readContract(this.getWagmi(), {
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

      const balances = await readContract(this.getWagmi(), {
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
      const price = await readContract(this.getWagmi(), {
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
    const allowance = await readContract(this.getWagmi(), {
      address: this.tokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [userAddress as `0x${string}`, this.managerAddress]
    });

    // 2. Approve if allowance is insufficient
    if (allowance < totalPrice) {
      console.log(`Approving GameManager to spend ${formatEther(totalPrice)} BRAINBOOK...`);

      const approveHash = await writeContract(this.getWagmi(), {
        address: this.tokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [this.managerAddress, totalPrice]
      });

      await waitForTransactionReceipt(this.getWagmi(), { hash: approveHash });
      console.log('Approve transaction confirmed!');
    }

    // 3. Purchase the item
    console.log(`Purchasing item ${itemId} x ${quantity}...`);
    const purchaseHash = await writeContract(this.getWagmi(), {
      address: this.managerAddress,
      abi: BRAIN_BOOK_GAME_MANAGER_ABI,
      functionName: 'purchaseGameItem',
      args: [BigInt(itemId), BigInt(quantity)]
    });

    await waitForTransactionReceipt(this.getWagmi(), { hash: purchaseHash });
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
    const hash = await writeContract(this.getWagmi(), {
      address: this.managerAddress,
      abi: BRAIN_BOOK_GAME_MANAGER_ABI,
      functionName: 'claimAchievement',
      args: [BigInt(tokenId), BigInt(amount), signature as `0x${string}`]
    });

    await waitForTransactionReceipt(this.getWagmi(), { hash });
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
    const hash = await writeContract(this.getWagmi(), {
      address: this.managerAddress,
      abi: BRAIN_BOOK_GAME_MANAGER_ABI,
      functionName: 'claimTokenReward',
      args: [amountInWei, signature as `0x${string}`]
    });

    await waitForTransactionReceipt(this.getWagmi(), { hash });
    console.log('Token reward claim confirmed!');
    return hash;
  }

  /**
   * Check if user owns a specific NFT achievement
   */
  async checkNFTOwnership(tokenId: number, userAddress?: Address): Promise<boolean> {
    const address = userAddress || this.w3s.account$();
    if (!address) {
      throw new Error('No wallet connected');
    }

    try {
      const balance = await readContract(this.getWagmi(), {
        address: this.nftAddress,
        abi: BRAIN_BOOK_NFT_ABI,
        functionName: 'balanceOf',
        args: [address, BigInt(tokenId)]
      });

      return Number(balance) > 0;
    } catch (error) {
      console.error('Error checking NFT ownership:', error);
      return false;
    }
  }

  /**
   * Mint an achievement NFT using backend signature
   */
  async mintAchievementNFT(tokenId: number, signature: string): Promise<string> {
    if (!this.w3s.account$()) {
      throw new Error('No wallet connected');
    }

    try {
      console.log(`Minting achievement NFT ${tokenId} via GameManager...`);
      // Call the GameManager contract, not the NFT contract directly
      // The GameManager validates the signature and then mints the NFT
      const hash = await this.w3s.writeContractWithMiniPay({
        address: this.managerAddress,
        abi: BRAIN_BOOK_GAME_MANAGER_ABI,
        functionName: 'claimAchievement',
        args: [BigInt(tokenId), BigInt(1), signature as `0x${string}`]
      });

      console.log('Achievement NFT mint transaction submitted:', hash);
      return hash;
    } catch (error: any) {
      console.error('Error minting achievement NFT:', error);
      throw new Error(error?.message || 'Failed to mint NFT');
    }
  }

  get stakingAddress(): `0x${string}` {
    const chainId = this.w3s.chainId || environment.defaultChainId;
    return environment.contracts[chainId]?.brainbookStaking as `0x${string}`;
  }

  async getStakedBalance(accountAddress?: string): Promise<string> {
    const address = accountAddress || this.w3s.account$();
    if (!address || !this.stakingAddress || this.stakingAddress === '0x0000000000000000000000000000000000000000') return '0.0';
    try {
      const balance = await readContract(this.getWagmi(), {
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
      const total = await readContract(this.getWagmi(), {
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
      const earned = await readContract(this.getWagmi(), {
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
      const allowance = await readContract(this.getWagmi(), {
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
    const hash = await writeContract(this.getWagmi(), {
      address: this.tokenAddress,
      abi: BRAIN_BOOK_TOKEN_ABI,
      functionName: 'approve',
      args: [this.stakingAddress, parseEther(amountEth)]
    });
    await waitForTransactionReceipt(this.getWagmi(), { hash });
    return hash;
  }

  async stake(amountEth: string): Promise<string> {
    const hash = await writeContract(this.getWagmi(), {
      address: this.stakingAddress,
      abi: BRAIN_BOOK_STAKING_ABI,
      functionName: 'stake',
      args: [parseEther(amountEth)]
    });
    await waitForTransactionReceipt(this.getWagmi(), { hash });
    return hash;
  }

  async withdrawStaking(amountEth: string): Promise<string> {
    const hash = await writeContract(this.getWagmi(), {
      address: this.stakingAddress,
      abi: BRAIN_BOOK_STAKING_ABI,
      functionName: 'withdraw',
      args: [parseEther(amountEth)]
    });
    await waitForTransactionReceipt(this.getWagmi(), { hash });
    return hash;
  }

  async getStakingReward(): Promise<string> {
    const hash = await writeContract(this.getWagmi(), {
      address: this.stakingAddress,
      abi: BRAIN_BOOK_STAKING_ABI,
      functionName: 'getReward'
    });
    await waitForTransactionReceipt(this.getWagmi(), { hash });
    return hash;
  }

  async exitStaking(): Promise<string> {
    const hash = await writeContract(this.getWagmi(), {
      address: this.stakingAddress,
      abi: BRAIN_BOOK_STAKING_ABI,
      functionName: 'exit'
    });
    await waitForTransactionReceipt(this.getWagmi(), { hash });
    return hash;
  }

  // ─── LP Staking (Liquidity Mining) Methods ───────────────────────────────

  get liquidityMiningAddress(): `0x${string}` {
    const chainId = this.w3s.chainId || environment.defaultChainId;
    return environment.contracts[chainId]?.brainbookLiquidityMining as `0x${string}`;
  }

  async getLpStakedBalance(accountAddress?: string): Promise<string> {
    const address = accountAddress || this.w3s.account$();
    if (!address || !this.liquidityMiningAddress || this.liquidityMiningAddress === '0x0000000000000000000000000000000000000000') return '0.0';
    try {
      const balance = await readContract(this.getWagmi(), {
        address: this.liquidityMiningAddress,
        abi: BRAIN_BOOK_LIQUIDITY_MINING_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`]
      });
      return formatEther(balance as bigint);
    } catch (err) {
      console.error('Error fetching LP staked balance:', err);
      return '0.0';
    }
  }

  async getLpTotalStaked(): Promise<string> {
    if (!this.liquidityMiningAddress || this.liquidityMiningAddress === '0x0000000000000000000000000000000000000000') return '0.0';
    try {
      const total = await readContract(this.getWagmi(), {
        address: this.liquidityMiningAddress,
        abi: BRAIN_BOOK_LIQUIDITY_MINING_ABI,
        functionName: 'totalSupply'
      });
      return formatEther(total as bigint);
    } catch (err) {
      console.error('Error fetching total LP staked:', err);
      return '0.0';
    }
  }

  async getLpEarnedRewards(accountAddress?: string): Promise<string> {
    const address = accountAddress || this.w3s.account$();
    if (!address || !this.liquidityMiningAddress || this.liquidityMiningAddress === '0x0000000000000000000000000000000000000000') return '0.0';
    try {
      const earned = await readContract(this.getWagmi(), {
        address: this.liquidityMiningAddress,
        abi: BRAIN_BOOK_LIQUIDITY_MINING_ABI,
        functionName: 'earned',
        args: [address as `0x${string}`]
      });
      return formatEther(earned as bigint);
    } catch (err) {
      console.error('Error fetching earned LP rewards:', err);
      return '0.0';
    }
  }

  async getLpStakingTokenAddress(): Promise<`0x${string}`> {
    if (!this.liquidityMiningAddress || this.liquidityMiningAddress === '0x0000000000000000000000000000000000000000') {
      return '0x0000000000000000000000000000000000000000';
    }
    try {
      const token = await readContract(this.getWagmi(), {
        address: this.liquidityMiningAddress,
        abi: BRAIN_BOOK_LIQUIDITY_MINING_ABI,
        functionName: 'stakingToken'
      });
      return token as `0x${string}`;
    } catch (err) {
      console.error('Error fetching LP staking token address:', err);
      return '0x0000000000000000000000000000000000000000';
    }
  }

  async getLpTokenSymbol(tokenAddress: string): Promise<string> {
    const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
    if (!tokenAddress || tokenAddress === ZERO_ADDR) return 'LP-Token';
    
    // If local/mocking using $BRAINBOOK itself
    if (tokenAddress.toLowerCase() === this.tokenAddress.toLowerCase()) {
      return 'BRAINBOOK';
    }

    try {
      const symbol = await readContract(this.getWagmi(), {
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'symbol'
      });
      return symbol as string;
    } catch (err) {
      console.warn('Could not read symbol for token:', tokenAddress, err);
      return 'cUSD-LP';
    }
  }

  async getLpTokenBalance(tokenAddress: string, accountAddress?: string): Promise<string> {
    const address = accountAddress || this.w3s.account$();
    const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
    if (!address || !tokenAddress || tokenAddress === ZERO_ADDR) return '0.0';
    try {
      const balance = await readContract(this.getWagmi(), {
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`]
      });
      return formatEther(balance as bigint);
    } catch (err) {
      console.error('Error fetching LP token balance:', err);
      return '0.0';
    }
  }

  async getLpStakingAllowance(tokenAddress: string, accountAddress: string): Promise<bigint> {
    const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
    if (!this.liquidityMiningAddress || this.liquidityMiningAddress === ZERO_ADDR || !tokenAddress || tokenAddress === ZERO_ADDR) return 0n;
    try {
      const allowance = await readContract(this.getWagmi(), {
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [accountAddress as `0x${string}`, this.liquidityMiningAddress]
      });
      return allowance as bigint;
    } catch (err) {
      console.error('Error fetching LP staking allowance:', err);
      return 0n;
    }
  }

  async approveLpStaking(tokenAddress: string, amountEth: string): Promise<string> {
    const hash = await writeContract(this.getWagmi(), {
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [this.liquidityMiningAddress, parseEther(amountEth)]
    });
    await waitForTransactionReceipt(this.getWagmi(), { hash });
    return hash;
  }

  async stakeLp(amountEth: string): Promise<string> {
    const hash = await writeContract(this.getWagmi(), {
      address: this.liquidityMiningAddress,
      abi: BRAIN_BOOK_LIQUIDITY_MINING_ABI,
      functionName: 'stake',
      args: [parseEther(amountEth)]
    });
    await waitForTransactionReceipt(this.getWagmi(), { hash });
    return hash;
  }

  async withdrawLp(amountEth: string): Promise<string> {
    const hash = await writeContract(this.getWagmi(), {
      address: this.liquidityMiningAddress,
      abi: BRAIN_BOOK_LIQUIDITY_MINING_ABI,
      functionName: 'withdraw',
      args: [parseEther(amountEth)]
    });
    await waitForTransactionReceipt(this.getWagmi(), { hash });
    return hash;
  }

  async getLpReward(): Promise<string> {
    const hash = await writeContract(this.getWagmi(), {
      address: this.liquidityMiningAddress,
      abi: BRAIN_BOOK_LIQUIDITY_MINING_ABI,
      functionName: 'getReward'
    });
    await waitForTransactionReceipt(this.getWagmi(), { hash });
    return hash;
  }

  async exitLpStaking(): Promise<string> {
    const hash = await writeContract(this.getWagmi(), {
      address: this.liquidityMiningAddress,
      abi: BRAIN_BOOK_LIQUIDITY_MINING_ABI,
      functionName: 'exit'
    });
    await waitForTransactionReceipt(this.getWagmi(), { hash });
    return hash;
  }

  // ─── Price Aggregation Across DEXes ──────────────────────────────────────────────

  /**
   * Reads price from a single V4 pool via PoolManager.getSlot0(poolId).
   * Returns null if pool not configured or call fails.
   */
  private async getPriceFromV4Pool(dex: DexEntry): Promise<number | null> {
    const ZERO = '0x0000000000000000000000000000000000000000';
    const ZERO32 = '0x0000000000000000000000000000000000000000000000000000000000000000';
    if (!dex.poolManagerAddress || dex.poolManagerAddress === ZERO) return null;
    if (!dex.poolId || dex.poolId === ZERO32 || dex.poolId === ZERO) return null;

    try {
      const result = await readContract(this.getWagmi(), {
        address: dex.poolManagerAddress as `0x${string}`,
        abi: UNISWAP_V4_POOL_MANAGER_ABI,
        functionName: 'getSlot0',
        args: [dex.poolId as `0x${string}`]
      }) as readonly [bigint, number, number, number];

      const sqrtPriceX96 = result[0];
      if (sqrtPriceX96 === 0n) return null;

      // Determine token ordering: lower address = currency0
      // For price, if BRAINBOOK is currency0: price = ratio^2 gives stablecoin-per-BRAINBOOK
      const tokenAddr = this.tokenAddress.toLowerCase();
      const stableAddr = dex.stablecoinAddress.toLowerCase();
      const brainbookIsCurrency0 = tokenAddr < stableAddr;

      const Q96 = 2n ** 96n;
      const ratio = Number(sqrtPriceX96) / Number(Q96);
      const rawPrice = ratio * ratio;
      return brainbookIsCurrency0 ? rawPrice : 1 / rawPrice;
    } catch (err) {
      console.warn(`[V4 Price] Failed for ${dex.id}:`, err);
      return null;
    }
  }

  /**
   * Reads price from a single V3 pool. Extends existing getTokenPriceUsd logic
   * but accepts an arbitrary pool/dex config.
   */
  private async getPriceFromV3Pool(dex: DexEntry): Promise<number | null> {
    const ZERO = '0x0000000000000000000000000000000000000000';
    if (!dex.poolAddress || dex.poolAddress === ZERO) return null;

    // Use the same V3 pool ABI as existing code
    const V3_POOL_ABI = [
      {
        inputs: [],
        name: 'slot0',
        outputs: [
          { internalType: 'uint160', name: 'sqrtPriceX96', type: 'uint160' },
          { internalType: 'int24', name: 'tick', type: 'int24' },
          { internalType: 'uint16', name: 'observationIndex', type: 'uint16' },
          { internalType: 'uint16', name: 'observationCardinality', type: 'uint16' },
          { internalType: 'uint16', name: 'observationCardinalityNext', type: 'uint16' },
          { internalType: 'uint8', name: 'feeProtocol', type: 'uint8' },
          { internalType: 'bool', name: 'unlocked', type: 'bool' }
        ],
        stateMutability: 'view',
        type: 'function'
      },
      {
        inputs: [{ internalType: 'uint32[]', name: 'secondsAgos', type: 'uint32[]' }],
        name: 'observe',
        outputs: [
          { internalType: 'int56[]', name: 'tickCumulatives', type: 'int56[]' },
          { internalType: 'uint160[]', name: 'secondsPerLiquidityCumulativeX128s', type: 'uint160[]' }
        ],
        stateMutability: 'view',
        type: 'function'
      },
      {
        inputs: [],
        name: 'token0',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function'
      }
    ] as const;

    try {
      const token0 = await readContract(this.getWagmi(), {
        address: dex.poolAddress as `0x${string}`,
        abi: V3_POOL_ABI,
        functionName: 'token0'
      }) as string;
      const brainbookIsToken0 = token0.toLowerCase() === this.tokenAddress.toLowerCase();

      // Try TWAP first
      try {
        const obs = await readContract(this.getWagmi(), {
          address: dex.poolAddress as `0x${string}`,
          abi: V3_POOL_ABI,
          functionName: 'observe',
          args: [[1800, 0]]
        }) as [bigint[], bigint[]];
        const tickDelta = Number(obs[0][1] - obs[0][0]);
        const avgTick = tickDelta / 1800;
        const rawPrice = Math.pow(1.0001, avgTick);
        return brainbookIsToken0 ? rawPrice : 1 / rawPrice;
      } catch {
        // Fallback to slot0
      }

      const slot0 = await readContract(this.getWagmi(), {
        address: dex.poolAddress as `0x${string}`,
        abi: V3_POOL_ABI,
        functionName: 'slot0'
      }) as readonly [bigint, number, number, number, number, number, boolean];

      const Q96 = 2n ** 96n;
      const ratio = Number(slot0[0]) / Number(Q96);
      const rawPrice = ratio * ratio;
      return brainbookIsToken0 ? rawPrice : 1 / rawPrice;
    } catch (err) {
      console.warn(`[V3 Price] Failed for ${dex.id}:`, err);
      return null;
    }
  }

  /**
   * Aggregates BRAINBOOK/USD price across all enabled DEX_REGISTRY entries.
   * Returns the mean of all successful price reads plus per-source details.
   */
  async getAggregatedTokenPrice(): Promise<AggregatedPrice> {
    const sources: PriceSource[] = [];
    const enabledDexes = DEX_REGISTRY.filter((d: DexEntry) => d.enabled);

    await Promise.all(
      enabledDexes.map(async (dex: DexEntry) => {
        let price: number | null = null;
        let status: PriceSource['status'] = 'pending';

        const ZERO = '0x0000000000000000000000000000000000000000';
        const hasPool = dex.protocol === 'uniswap-v3'
          ? (dex.poolAddress && dex.poolAddress !== ZERO)
          : (dex.poolId && dex.poolId !== ZERO && dex.poolId !== '0x0000000000000000000000000000000000000000000000000000000000000000');

        if (!hasPool) {
          status = 'no-pool';
          sources.push({ dex: dex.name, chain: dex.chain, protocol: dex.protocol, price: 'N/A', status });
          return;
        }

        if (dex.protocol === 'uniswap-v3') {
          price = await this.getPriceFromV3Pool(dex);
        } else {
          price = await this.getPriceFromV4Pool(dex);
        }

        status = price !== null ? 'ok' : 'error';
        sources.push({
          dex: dex.name,
          chain: dex.chain,
          protocol: dex.protocol,
          price: price !== null ? price.toFixed(6) : 'Error',
          status
        });
      })
    );

    const validPrices = sources
      .filter(s => s.status === 'ok')
      .map(s => parseFloat(s.price));

    const avg = validPrices.length > 0
      ? (validPrices.reduce((a, b) => a + b, 0) / validPrices.length).toFixed(6)
      : '0.001'; // fallback

    return { averagePrice: avg, sources, lastUpdated: new Date() };
  }

  // ─── Token Approval for Swap ───────────────────────────────────────────────────────

  async getSwapAllowance(tokenAddress: string, spenderAddress: string, accountAddress: string): Promise<bigint> {
    try {
      return await readContract(this.getWagmi(), {
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [accountAddress as `0x${string}`, spenderAddress as `0x${string}`]
      }) as bigint;
    } catch {
      return 0n;
    }
  }

  async approveTokenForSwap(tokenAddress: string, spenderAddress: string, amountEth: string): Promise<string> {
    const hash = await writeContract(this.getWagmi(), {
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spenderAddress as `0x${string}`, parseEther(amountEth)]
    });
    await waitForTransactionReceipt(this.getWagmi(), { hash });
    return hash;
  }

  // ─── V3 Swap (Ubeswap / Uniswap V3 SwapRouter02) ──────────────────────────────────

  async swapV3(params: SwapParams): Promise<string> {
    const { dex, tokenIn, tokenOut, amountIn, slippageBps, recipient } = params;
    if (!dex.routerAddress) throw new Error('No router address configured for this DEX');

    const amountInWei = parseEther(amountIn);
    // Estimate output from price, apply slippage tolerance
    const feeFactor = 1 - (dex.feeTier / 1_000_000);
    const priceResult = await this.getPriceFromV3Pool(dex);
    const estimatedOut = priceResult !== null
      ? amountInWei * BigInt(Math.round(priceResult * 1e9)) / 1_000_000_000n * BigInt(feeFactor * 1000) / 1000n
      : 0n;
    const amountOutMinimum = estimatedOut * BigInt(10000 - slippageBps) / 10000n;

    const hash = await writeContract(this.getWagmi(), {
      address: dex.routerAddress as `0x${string}`,
      abi: UNISWAP_V3_ROUTER_ABI,
      functionName: 'exactInputSingle',
      args: [{
        tokenIn: tokenIn as `0x${string}`,
        tokenOut: tokenOut as `0x${string}`,
        fee: dex.feeTier,
        recipient: recipient as `0x${string}`,
        amountIn: amountInWei,
        amountOutMinimum,
        sqrtPriceLimitX96: 0n
      }]
    });
    await waitForTransactionReceipt(this.getWagmi(), { hash });
    return hash;
  }

  // ─── V4 Swap (Uniswap V4 UniversalRouter) ────────────────────────────────────────────

  /**
   * Encodes a V4 SWAP_EXACT_IN_SINGLE action payload for the UniversalRouter.
   * Command: 0x10 = V4_SWAP
   * Action:  0x06 = SWAP_EXACT_IN_SINGLE
   */
  private encodeV4SwapInput(params: {
    currency0: string; currency1: string;
    fee: number; tickSpacing: number; hooks: string;
    zeroForOne: boolean;
    amountIn: bigint; amountOutMinimum: bigint;
  }): `0x${string}` {
    // Action bytes: SWAP_EXACT_IN_SINGLE = 0x06
    const actionsByte = '0x06';

    // Encode ExactInputSingleParams
    const paramData = encodeAbiParameters(
      parseAbiParameters(
        '(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, bytes hookData'
      ),
      [{
        poolKey: {
          currency0: params.currency0 as `0x${string}`,
          currency1: params.currency1 as `0x${string}`,
          fee: params.fee,
          tickSpacing: params.tickSpacing,
          hooks: params.hooks as `0x${string}`
        },
        zeroForOne: params.zeroForOne,
        amountIn: BigInt(params.amountIn),
        amountOutMinimum: BigInt(params.amountOutMinimum),
        hookData: '0x'
      }] as any
    );

    // Outer encoding: actions bytes + params array
    return encodeAbiParameters(
      parseAbiParameters('bytes actions, bytes[] params'),
      [actionsByte as `0x${string}`, [paramData]] as any
    );
  }

  async swapV4(params: SwapParams): Promise<string> {
    const { dex, tokenIn, tokenOut, amountIn, slippageBps, recipient } = params;
    if (!dex.universalRouterAddress) throw new Error('No UniversalRouter address for this DEX');
    if (!dex.poolManagerAddress) throw new Error('No PoolManager address for this DEX');
    if (!dex.hooksAddress) throw new Error('No hooks address for this DEX');

    const amountInWei = parseEther(amountIn);
    const priceResult = await this.getPriceFromV4Pool(dex);
    const feeFactor = 1 - (dex.feeTier / 1_000_000);
    const estimatedOut = priceResult !== null
      ? BigInt(Math.round(parseFloat(amountIn) * priceResult * feeFactor * 1e18))
      : 0n;
    const amountOutMinimum = estimatedOut * BigInt(10000 - slippageBps) / 10000n;

    // Determine currency ordering (lower address = currency0 per Uniswap V4 convention)
    const brainbookAddr = tokenIn.toLowerCase();
    const stableAddr = tokenOut.toLowerCase();
    const brainbookIsCurrency0 = brainbookAddr < stableAddr;
    const [currency0, currency1] = brainbookIsCurrency0
      ? [tokenIn, tokenOut]
      : [tokenOut, tokenIn];

    // zeroForOne: selling token0 for token1
    // If BRAINBOOK is currency0 and we're selling BRAINBOOK → zeroForOne = true
    // If BRAINBOOK is currency1 and we're selling BRAINBOOK → zeroForOne = false
    const zeroForOne = brainbookIsCurrency0
      ? tokenIn.toLowerCase() === brainbookAddr  // selling BRAINBOOK (currency0)
      : tokenIn.toLowerCase() !== brainbookAddr; // selling stablecoin (currency0)

    const swapInput = this.encodeV4SwapInput({
      currency0,
      currency1,
      fee: dex.feeTier,
      tickSpacing: dex.tickSpacing,
      hooks: dex.hooksAddress,
      zeroForOne,
      amountIn: amountInWei,
      amountOutMinimum
    });

    // V4_SWAP command = 0x10
    const commands = '0x10' as `0x${string}`;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 min

    const hash = await writeContract(this.getWagmi(), {
      address: dex.universalRouterAddress as `0x${string}`,
      abi: UNISWAP_V4_UNIVERSAL_ROUTER_ABI,
      functionName: 'execute',
      args: [commands, [swapInput], deadline]
    });
    await waitForTransactionReceipt(this.getWagmi(), { hash });
    return hash;
  }

  get presaleAddress(): `0x${string}` {
    const chainId = this.w3s.chainId || environment.defaultChainId;
    return (environment.contracts[chainId]?.brainbookPresale || '0x0000000000000000000000000000000000000000') as `0x${string}`;
  }

  get cusdTokenAddress(): `0x${string}` {
    const chainId = this.w3s.chainId || environment.defaultChainId;
    return (environment.contracts[chainId]?.cusdToken || '0x0000000000000000000000000000000000000000') as `0x${string}`;
  }

  async getPresaleRaised(): Promise<string> {
    if (this.presaleAddress === '0x0000000000000000000000000000000000000000') return '0.0';
    try {
      const raised = await readContract(this.getWagmi(), {
        address: this.presaleAddress,
        abi: BRAIN_BOOK_PRESALE_ABI,
        functionName: 'totalCusdRaised'
      });
      return formatEther(raised as bigint);
    } catch (err) {
      console.error('Error reading totalCusdRaised:', err);
      return '0.0';
    }
  }

  async getPresaleSold(): Promise<string> {
    if (this.presaleAddress === '0x0000000000000000000000000000000000000000') return '0.0';
    try {
      const sold = await readContract(this.getWagmi(), {
        address: this.presaleAddress,
        abi: BRAIN_BOOK_PRESALE_ABI,
        functionName: 'totalTokensSold'
      });
      return formatEther(sold as bigint);
    } catch (err) {
      console.error('Error reading totalTokensSold:', err);
      return '0.0';
    }
  }

  async getPresalePrice(): Promise<string> {
    if (this.presaleAddress === '0x0000000000000000000000000000000000000000') return '0.01';
    try {
      const price = await readContract(this.getWagmi(), {
        address: this.presaleAddress,
        abi: BRAIN_BOOK_PRESALE_ABI,
        functionName: 'tokenPriceInCusd'
      });
      return formatEther(price as bigint);
    } catch (err) {
      console.error('Error reading tokenPriceInCusd:', err);
      return '0.01';
    }
  }

  async getPresaleHardcap(): Promise<string> {
    if (this.presaleAddress === '0x0000000000000000000000000000000000000000') return '500000';
    try {
      const cap = await readContract(this.getWagmi(), {
        address: this.presaleAddress,
        abi: BRAIN_BOOK_PRESALE_ABI,
        functionName: 'hardcap'
      });
      return formatEther(cap as bigint);
    } catch (err) {
      console.error('Error reading hardcap:', err);
      return '500000';
    }
  }

  async getPresalePaused(): Promise<boolean> {
    if (this.presaleAddress === '0x0000000000000000000000000000000000000000') return false;
    try {
      const paused = await readContract(this.getWagmi(), {
        address: this.presaleAddress,
        abi: BRAIN_BOOK_PRESALE_ABI,
        functionName: 'paused'
      });
      return paused as boolean;
    } catch (err) {
      console.error('Error reading paused:', err);
      return false;
    }
  }

  async getPresaleStartTime(): Promise<number> {
    if (this.presaleAddress === '0x0000000000000000000000000000000000000000') return 0;
    try {
      const time = await readContract(this.getWagmi(), {
        address: this.presaleAddress,
        abi: BRAIN_BOOK_PRESALE_ABI,
        functionName: 'startTime'
      });
      return Number(time);
    } catch (err) {
      console.error('Error reading startTime:', err);
      return 0;
    }
  }

  async getPresaleEndTime(): Promise<number> {
    if (this.presaleAddress === '0x0000000000000000000000000000000000000000') return 0;
    try {
      const time = await readContract(this.getWagmi(), {
        address: this.presaleAddress,
        abi: BRAIN_BOOK_PRESALE_ABI,
        functionName: 'endTime'
      });
      return Number(time);
    } catch (err) {
      console.error('Error reading endTime:', err);
      return 0;
    }
  }

  async getCusdBalance(accountAddress?: string): Promise<string> {
    const address = accountAddress || this.w3s.account$();
    if (!address || this.cusdTokenAddress === '0x0000000000000000000000000000000000000000') return '0.0';
    try {
      const balance = await readContract(this.getWagmi(), {
        address: this.cusdTokenAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`]
      });
      return formatEther(balance as bigint);
    } catch (err) {
      console.error('Error reading cUSD balance:', err);
      return '0.0';
    }
  }

  async getCusdAllowance(accountAddress: string): Promise<string> {
    if (this.cusdTokenAddress === '0x0000000000000000000000000000000000000000' || this.presaleAddress === '0x0000000000000000000000000000000000000000') return '0.0';
    try {
      const allowance = await readContract(this.getWagmi(), {
        address: this.cusdTokenAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [accountAddress as `0x${string}`, this.presaleAddress]
      });
      return formatEther(allowance as bigint);
    } catch (err) {
      console.error('Error reading cUSD allowance:', err);
      return '0.0';
    }
  }

  async approveCusdForPresale(amountEth: string): Promise<string> {
    if (this.cusdTokenAddress === '0x0000000000000000000000000000000000000000' || this.presaleAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Contract not configured');
    }
    const hash = await writeContract(this.getWagmi(), {
      address: this.cusdTokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [this.presaleAddress, parseEther(amountEth)]
    });
    await waitForTransactionReceipt(this.getWagmi(), { hash });
    return hash;
  }

  async buyPresaleTokens(amountEth: string): Promise<string> {
    if (this.presaleAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Contract not configured');
    }
    const hash = await writeContract(this.getWagmi(), {
      address: this.presaleAddress,
      abi: BRAIN_BOOK_PRESALE_ABI,
      functionName: 'buyTokens',
      args: [parseEther(amountEth)]
    });
    await waitForTransactionReceipt(this.getWagmi(), { hash });
    return hash;
  }
}

