import { Injectable, signal } from '@angular/core';

import {
  watchAccount, getEnsAddress, getEnsName, createConfig, injected, getChainId,
  watchChainId, getBalance, getBlockNumber, getPublicClient, getWalletClient,
  reconnect, connect,
  getConnection,
  writeContract
} from '@wagmi/core';

import { AppKitNetwork, celo, celoSepolia, hardhat, mainnet } from '@reown/appkit/networks';

import { getAccount, readContract, multicall } from '@wagmi/core';

import { environment } from '../../environments/environment';
import { BehaviorSubject } from 'rxjs';
// import ROUTER_ABI from '../../assets/abis/router.json';
import { Address, createPublicClient, erc20Abi, FallbackTransport, getContract, http, formatUnits } from 'viem';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { AppKit, createAppKit } from '@reown/appkit';
import { coreDao, coreTestnet2 } from '@wagmi/core/chains';
// import { QueryClient } from '@tanstack/react-query';

// const queryClient = new QueryClient()


export const ALL_CHAINS: AppKitNetwork[] = [hardhat, celo, celoSepolia, coreDao, coreTestnet2];

const projectId = environment.walletConnectProjectId;

const metadata = {
  name: 'save-up',
  description: 'Save Up',
  url: 'https://saveup.app', // url must match your domain & subdomain
  icons: ['https://avatars.githubusercontent.com/u/37784886']
}

const supportedChains: [AppKitNetwork, ...AppKitNetwork[]] = (environment.production === true ? [celo, celoSepolia] : [celoSepolia, hardhat])

export const wagmiAdapter = new WagmiAdapter({
  networks: supportedChains,
  projectId,
  // transports: {
  //   [coreDao.id]: http(),
  //   [coreTestnet2.id]: http(),
  //   [hardhat.id]: http()

  // }

  // ssr: true
})

export const wagmiConfig = wagmiAdapter.wagmiConfig

export const chains: Record<number, AppKitNetwork> = {
  42220: celo,
  11142220: celoSepolia,
  // 1116: coreDao,
  // 1114: coreTestnet2,
  31337: hardhat
}

export const useNativeChainCoinList = [

]

export function getMultiCallAddress(chainId: number) {
  let multicall = chains[chainId].contracts?.multicall3?.address;
  if (chainId === 31337) {
    multicall = "0x4C0eCEa6778C911A0F6806492Fca37C98c3a43Bd";
  }
  if (!multicall) {
    throw new Error("Multicall address not found for chainId: " + chainId);
  }
  return multicall;
}

export interface MiniPayWriteOptions {
  feeCurrency?: Address;
}

const FEE_CURRENCY_STORAGE_KEY = 'saveup.feeCurrency.address';


@Injectable({
  providedIn: 'root'
})
export class Web3Service {

  chains: AppKitNetwork[] = supportedChains;
  // 1. Define constants
  projectId = environment.walletConnectProjectId;


  // Chain ID signal
  public chainId$ = signal<number | undefined>(undefined);

  public get chainId(): number | undefined {
    return this.chainId$();
  }


  unwatchNetwork: any;

  public account$ = signal<Address | undefined>(undefined);
  private readonly isMiniPay$ = signal<boolean>(false);
  private readonly selectedFeeCurrency$ = signal<Address | undefined>(undefined);
  private hasAttemptedMiniPayConnect = false;

  public get account() {

    return this.account$();
  }

  public get hideConnectWalletForMiniPay(): boolean {
    return this.isMiniPay$();
  }

  public get isMiniPay(): boolean {
    return this.isMiniPay$();
  }

  public get selectedFeeCurrency(): Address | undefined {
    return this.selectedFeeCurrency$();
  }

  public get usesNativeFeeCurrency(): boolean {
    return !this.selectedFeeCurrency$();
  }

  unwatchAccount: any;


  appKit!: AppKit;

  private isMiniPayEnvironment(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const provider = (window as Window & { ethereum?: { isMiniPay?: boolean } }).ethereum;
    return Boolean(provider && provider.isMiniPay);
  }

  private syncConnectedStateFromConfig() {
    const chainId = getChainId(wagmiAdapter.wagmiConfig);
    if (chainId) {
      this.chainId$.set(chainId);
    }

    const account = getConnection(wagmiAdapter.wagmiConfig);
    if (account && account.isConnected) {
      this.account$.set(account.address);
    }
  }

  private readStoredFeeCurrencyPreference(): Address | undefined {
    if (typeof localStorage === 'undefined') {
      return undefined;
    }

    const stored = localStorage.getItem(FEE_CURRENCY_STORAGE_KEY);
    if (!stored) {
      return undefined;
    }

    return stored as Address;
  }

  private persistFeeCurrencyPreference(value?: Address) {
    if (typeof localStorage === 'undefined') {
      return;
    }

    if (!value) {
      localStorage.removeItem(FEE_CURRENCY_STORAGE_KEY);
      return;
    }

    localStorage.setItem(FEE_CURRENCY_STORAGE_KEY, value);
  }

  private isMiniPaySupportedChain(chainId?: number): boolean {
    return chainId === 42220 || chainId === 11142220;
  }

  private isFeeCurrencySupportedChain(chainId?: number): boolean {
    if (!chainId) {
      return false;
    }

    return (environment.feeCurrenciesByChain[chainId]?.length ?? 0) > 0;
  }

  public getAvailableFeeCurrencies(chainId?: number) {
    const id = chainId ?? this.chainId;
    if (!id) {
      return [];
    }

    return environment.feeCurrenciesByChain[id] ?? [];
  }

  private isAllowedFeeCurrency(chainId: number, feeCurrency: Address): boolean {
    return this.getAvailableFeeCurrencies(chainId)
      .some((currency) => currency.address.toLowerCase() === feeCurrency.toLowerCase());
  }

  private resolveFeeCurrencyForRequest(chainId?: number, override?: Address): Address | undefined {
    const targetChainId = chainId ?? this.chainId;
    const candidate = override ?? this.selectedFeeCurrency$();

    if (!targetChainId || !candidate || !this.isFeeCurrencySupportedChain(targetChainId)) {
      return undefined;
    }

    if (!this.isAllowedFeeCurrency(targetChainId, candidate)) {
      return undefined;
    }

    return candidate;
  }

  public setPreferredFeeCurrency(feeCurrency?: Address, chainId?: number): boolean {
    if (!feeCurrency) {
      this.selectedFeeCurrency$.set(undefined);
      this.persistFeeCurrencyPreference(undefined);
      return true;
    }

    const targetChainId = chainId ?? this.chainId;

    if (targetChainId && this.isAllowedFeeCurrency(targetChainId, feeCurrency)) {
      this.selectedFeeCurrency$.set(feeCurrency);
      this.persistFeeCurrencyPreference(feeCurrency);
      return true;
    }

    const isKnownInAnyConfiguredChain = Object.entries(environment.feeCurrenciesByChain)
      .some(([configuredChainId]) => this.isAllowedFeeCurrency(Number(configuredChainId), feeCurrency));

    if (!isKnownInAnyConfiguredChain) {
      return false;
    }

    this.selectedFeeCurrency$.set(feeCurrency);
    this.persistFeeCurrencyPreference(feeCurrency);
    return true;
  }

  private async applyMiniPayTransactionOverrides(
    request: Parameters<typeof writeContract>[1],
    options?: MiniPayWriteOptions
  ): Promise<Parameters<typeof writeContract>[1]> {
    const next = { ...request } as Record<string, unknown>;
    const chainId = (next['chainId'] as number | undefined) ?? this.chainId;

    const feeCurrency = this.resolveFeeCurrencyForRequest(chainId, options?.feeCurrency);
    if (feeCurrency && this.isMiniPaySupportedChain(chainId)) {
      next['feeCurrency'] = feeCurrency;
    }

    if (!this.isMiniPay$()) {
      return next as Parameters<typeof writeContract>[1];
    }

    // MiniPay currently processes legacy-style transaction fields.
    delete next['maxFeePerGas'];
    delete next['maxPriorityFeePerGas'];

    if (!next['gasPrice'] && chainId) {
      try {
        const publicClient = getPublicClient(wagmiAdapter.wagmiConfig, { chainId });
        if (publicClient) {
          next['gasPrice'] = await publicClient.getGasPrice();
        }
      } catch (error) {
        console.warn('MiniPay gasPrice fallback failed:', error);
      }
    }

    return next as Parameters<typeof writeContract>[1];
  }

  public async writeContractWithMiniPay(
    request: Parameters<typeof writeContract>[1],
    options?: MiniPayWriteOptions
  ) {
    const normalizedRequest = await this.applyMiniPayTransactionOverrides(request, options);
    return writeContract(wagmiAdapter.wagmiConfig, normalizedRequest);
  }

  private async initializeConnectionState() {
    await reconnect(wagmiAdapter.wagmiConfig);
    this.syncConnectedStateFromConfig();

    const account = getConnection(wagmiAdapter.wagmiConfig);
    if (
      this.isMiniPay$() &&
      !account.isConnected &&
      !this.hasAttemptedMiniPayConnect
    ) {
      this.hasAttemptedMiniPayConnect = true;

      try {
        await connect(wagmiAdapter.wagmiConfig, {
          connector: injected(),
        });
      } catch (error) {
        console.warn('MiniPay auto-connect fallback failed:', error);
      }

      this.syncConnectedStateFromConfig();
    }
  }

  constructor() {

    this.isMiniPay$.set(this.isMiniPayEnvironment());

    const storedFeeCurrency = this.readStoredFeeCurrencyPreference();
    if (storedFeeCurrency) {
      this.setPreferredFeeCurrency(storedFeeCurrency);
    }


    this.appKit = createAppKit({
      adapters: [wagmiAdapter],
      networks: supportedChains,
      // defaultNetwork: celo,
      metadata: metadata,
      projectId,
      themeMode: 'dark',
      themeVariables: {
        '--w3m-accent': '#8725ac',
      },
      // enableInjected: true,
      features: {
        analytics: true,
        swaps: false,
        email: true,
        // socials: true,
        onramp: true
        // emailShowWallets: true
      }
    })

    void this.initializeConnectionState();

    // setTimeout(() => {
    //   const chainId = getChainId(wagmiAdapter.wagmiConfig);
    //   if(chainId){
    //     console.log("W 1 ChainId: ", chainId);
    //     this.chainId$.set(chainId);
    //   }
    // }, 300);



    //Update chainId on change
    this.unwatchNetwork = watchChainId(wagmiAdapter.wagmiConfig,
      {
        onChange: async (chainId) => {

          console.log("ChainId changed to: ", chainId);

          if (chainId) {

            this.chainId$.set(chainId);

          } else {
            this.chainId$.set(undefined);
          }
        },
      }
    )

    this.unwatchAccount = watchAccount(wagmiAdapter.wagmiConfig, {
      onChange: (account) => {

        if (account && account.isConnected) {
          this.account$.set(account.address);
        } else {
          this.account$.set(undefined);
        }

      }
    })

  }


  async getAccountInfo() {
    return getAccount(wagmiConfig);
  }

  async getBalanceNativeCurrency(account: Address) {
    return await getBalance(wagmiConfig, {
      address: account,
    });
  }


  async getBalanceERC20(tokenAddress: `0x${string}`, account: `0x${string}`) {
    const chainId = this.chainId || 31337;
    const results = await multicall(wagmiConfig, {
      contracts: [
        {
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'decimals',
        },
        {
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'symbol',
        },
        {
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [account],
        },
      ],
      chainId,
      multicallAddress: getMultiCallAddress(chainId),
    });

    const decimals = results[0].result as number;
    const symbol = results[1].result as string;
    const value = results[2].result as bigint;

    return {
      decimals,
      symbol,
      value,
      formatted: formatUnits(value, decimals),
    };
  }

  async getTokenInfo(tokenAddress: `0x${string}`, chainId?: number | undefined, formatUnitsArg: any | undefined = undefined) {
    const activeChainId = chainId ?? this.chainId ?? 31337;
    const results = await multicall(wagmiConfig, {
      contracts: [
        {
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'name',
        },
        {
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'symbol',
        },
        {
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'decimals',
        },
        {
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'totalSupply',
        },
      ],
      chainId: activeChainId,
      multicallAddress: getMultiCallAddress(activeChainId),
    });

    const name = results[0].result as string;
    const symbol = results[1].result as string;
    const decimals = results[2].result as number;
    const totalSupply = results[3].result as bigint;

    const decimalsNum = Number(decimals);

    return {
      address: tokenAddress,
      decimals: decimalsNum,
      name,
      symbol,
      totalSupply: {
        formatted: formatUnits(totalSupply, formatUnitsArg ?? decimalsNum),
        value: totalSupply,
      },
    };
  }




  async fetchBlockNumber() {
    const blockNumber = await getBlockNumber(
      wagmiConfig,
      {
        chainId: this.chainId
      }
    )
    return blockNumber
  }


  async getERC20Allowance(tokenAddress: `0x${string}`, contractToApprove: `0x${string}`, account: `0x${string}`, chainId?: number) {

    const allowance = await readContract(wagmiConfig, {
      address: tokenAddress,
      abi: erc20Abi,
      chainId,
      functionName: 'allowance',
      args: [account, contractToApprove]
    })

    return allowance;
  }

  async fetchTotalSupply(tokenAddress: string) {
    const t = await this.getTokenInfo(tokenAddress as `0x${string}`)
    if (t) {
      return t.totalSupply.value
    }

    return undefined
  }


  async checkTokenApproval(
    tokenAddress: `0x${string}`,
    owner: `0x${string}`,
    spender: `0x${string}`,
    amount: bigint
  ): Promise<boolean> {
    try {
      const approvedAmount = await readContract(wagmiConfig, {
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner, spender]
      });

      return approvedAmount >= amount;
    } catch (error) {
      console.error('Error checking token approval:', error);

    }
    return false;
  }

  /**
   * Returns the explorer URL for a transaction hash on the current or specified chain.
   * @param txHash The transaction hash (with or without 0x prefix)
   * @param chainId Optional chain ID; defaults to the current chain
   * @returns The full explorer URL for the transaction, or empty string if not available
   */
  public getExplorerTxUrl(txHash: string, chainId?: number): string {
    const id = chainId ?? this.chainId;
    if (!id || !txHash) return '';
    const chain = this.chains.find(c => c.id === id);
    const explorerUrl: string | undefined = chain?.blockExplorers?.default?.url;
    if (!explorerUrl) return '';
    return `${explorerUrl.replace(/\/$/, '')}/tx/${txHash}`;
  }

}
