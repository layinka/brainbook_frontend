import { Injectable, signal } from '@angular/core';

import {
  sendTransaction as wagmiSendTransaction,
  switchChain,
  disconnect,
  getConnectors,
  writeContract,
  readContract,
  multicall,
  getAccount,
  getBalance,
  getBlockNumber,
  reconnect,
  watchAccount,
  watchChainId,
  getChainId,
  getPublicClient,
  getConnections
} from '@web3-onboard/wagmi'

import { environment } from '../../environments/environment';
import { toDataSuffix } from '@celo/attribution-tags';
import { Address, erc20Abi, formatUnits, Chain, isHex, fromHex } from 'viem';
import { celo, celoSepolia, coreDao } from 'viem/chains';
import Onboard, { OnboardAPI } from '@web3-onboard/core';
import injectedModule from '@web3-onboard/injected-wallets';
import walletConnectModule from '@web3-onboard/walletconnect';
import coinbaseWalletModule from '@web3-onboard/coinbase';
import wagmi from '@web3-onboard/wagmi'

// Custom chain type for hardhat - viem's hardhat doesn't export properly
const hardhatChain: Chain = {
  id: 31337,
  name: 'Hardhat',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
  },
  contracts: {
    multicall3: {
      address: '0x4C0eCEa6778C911A0F6806492Fca37C98c3a43Bd',
    },
  },
};

export const ALL_CHAINS: Chain[] = [hardhatChain, celo, celoSepolia, coreDao];

const supportedChains: Chain[] = (environment.production === true ? [celo, celoSepolia] : [celo, celoSepolia, hardhatChain]);

export const chains: Record<number, Chain> = {
  42220: celo,
  11142220: celoSepolia,
  1116: coreDao,
  31337: hardhatChain,
};

export const useNativeChainCoinList: any[] = [];

export function getMultiCallAddress(chainId: number) {
  const chain = chains[chainId];
  const multicall = chain?.contracts?.multicall3?.address;
  if (!multicall) {
    throw new Error("Multicall address not found for chainId: " + chainId);
  }
  return multicall as Address;
}

export interface MiniPayWriteOptions {
  feeCurrency?: Address;
}

const FEE_CURRENCY_STORAGE_KEY = 'brainbook.feeCurrency.address';


@Injectable({
  providedIn: 'root'
})
export class Web3Service {

  chains: Chain[] = supportedChains;

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

  onboard!: OnboardAPI;

  // Getter for wagmi config from onboard state
  private get wagmiConfig() {
    const config = this.onboard?.state?.get()?.wagmiConfig;
    if (!config) {
      console.warn('Wagmi config not yet available from onboard state');
    }
    return config;
  }

  constructor() {

    const isMiniPay = this.isMiniPayEnvironment();
    this.isMiniPay$.set(isMiniPay);

    const storedFeeCurrency = this.readStoredFeeCurrencyPreference();
    if (storedFeeCurrency) {
      this.setPreferredFeeCurrency(storedFeeCurrency);
    }

    // Define custom MiniPay wallet for silent auto-connection
    const miniPayWallet = {
      label: 'Opera MiniPay',
      injectedNamespace: 'ethereum',
      checkProviderIdentity: ({ provider }: any) => !!provider && !!provider.isMiniPay,
      getIcon: async () => `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="#C837AB"/>
        </svg>
      `,
      getInterface: async () => ({
        provider: (window as any).ethereum
      }),
      platforms: ['mobile']
    };

    // Initialize Web3-Onboard wallets
    const injected = injectedModule({
      custom: [miniPayWallet as any]
    });
    const walletConnect = walletConnectModule({
      projectId: environment.walletConnectProjectId,
      requiredChains: supportedChains.map(c => c.id),
      dappUrl: 'https://brain-book.app'
    });
    const coinbaseWallet = coinbaseWalletModule({ darkMode: true });

    // Initialize Web3-Onboard
    this.onboard = Onboard({
      wagmi,
      wallets: [injected, walletConnect, coinbaseWallet],
      chains: supportedChains.map(chain => ({
        id: `0x${chain.id.toString(16)}`,
        token: chain.nativeCurrency.symbol,
        label: chain.name,
        rpcUrl: chain.rpcUrls.default.http[0]
      })),
      appMetadata: {
        name: 'Brain Book',
        icon: '<svg><!-- icon --></svg>',
        description: 'Brain Book - Web3 Gaming Platform',
        recommendedInjectedWallets: [
          { name: 'MetaMask', url: 'https://metamask.io' },
          { name: 'Coinbase', url: 'https://wallet.coinbase.com/' }
        ]
      },
      connect: {
        autoConnectLastWallet: true, // Auto-connect to last connected wallet on page reload
        autoConnectAllPreviousWallet: false
      },
      accountCenter: {
        desktop: {
          enabled: !isMiniPay,
          minimal: false
        },
        mobile: {
          enabled: !isMiniPay,
          minimal: false
        }
      },
      theme: {
        '--w3o-background-color': '#1a1a2e',
        '--w3o-foreground-color': '#16213e',
        '--w3o-text-color': '#ffffff',
        '--w3o-border-color': '#8725ac',
        '--w3o-action-color': '#8725ac'
      }
    });

    // Watch for wagmiConfig becoming available to set up watchers exactly when config is ready
    this.onboard.state.select('wagmiConfig').subscribe(async (config) => {
      if (config) {
        console.log('[Web3Service] Wagmi config available. Setting up watchers.');
        await this.setupWagmiWatchers();
        this.syncConnectedStateFromConfig();
      }
    });

    // void this.initializeConnectionState();
    // this.onboard.state.select('chains').subscribe(async (chains) => {
    //   if (chains) {
    //     console.log('[Web3Service] Chains available. Setting up watchers.');
    //     await this.setupWagmiWatchers();
    //     this.syncConnectedStateFromConfig();
    //   }
    // })

    // // Watch for wallet state changes from onboard
    // this.onboard.state.select('wallets').subscribe(async (wallets) => {
    //   const wallet = wallets[0];
    //   if (wallet?.accounts?.[0]) {
    //     // Let the Wagmi configuration/watchers handle account and chain state updates
    //     await this.setupWagmiWatchers();
    //     this.syncConnectedStateFromConfig();
    //   } else {
    //     // Wallet disconnected
    //     this.account$.set(undefined);
    //     this.chainId$.set(undefined);

    //     // Cleanup watchers
    //     if (this.unwatchAccount) {
    //       this.unwatchAccount();
    //       this.unwatchAccount = undefined;
    //     }
    //     if (this.unwatchNetwork) {
    //       this.unwatchNetwork();
    //       this.unwatchNetwork = undefined;
    //     }
    //   }
    // });
  }

  // Public method to get wagmi config for use in other services
  // Returns as 'any' to work around type incompatibility between wagmi versions
  public getWagmiConfig(): any {
    return this.wagmiConfig;
  }

  private isMiniPayEnvironment(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const provider = (window as Window & { ethereum?: { isMiniPay?: boolean } }).ethereum;
    return Boolean(provider && provider.isMiniPay);
  }

  private syncConnectedStateFromConfig() {
    const config = this.wagmiConfig;
    if (!config) return;

    try {
      const chainId = getChainId(config);
      if (chainId) {
        this.chainId$.set(chainId);
      }

      const connections = getConnections(config);
      const connection = connections?.[0];
      if (connection?.accounts?.[0]) {
        this.account$.set(connection.accounts[0] as Address);
      }
    } catch (error) {
      console.warn('Error syncing connected state:', error);
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
    let candidate = override ?? this.selectedFeeCurrency$();

    // If no candidate is selected, but we are inside MiniPay and target is Celo, default to the first available fee currency (e.g., cUSD)
    if (!candidate && this.isMiniPay$() && targetChainId && this.isMiniPaySupportedChain(targetChainId)) {
      const defaultToken = this.getAvailableFeeCurrencies(targetChainId)[0];
      if (defaultToken) {
        candidate = defaultToken.address as Address;
      }
    }

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
        const config = this.wagmiConfig;
        if (config) {
          const publicClient = getPublicClient(config, { chainId });
          if (publicClient) {
            if (feeCurrency) {
              // Celo's eth_gasPrice RPC accepts the feeCurrency address as parameter to estimate correct gas price in that stablecoin
              const hexGasPrice = await publicClient.request({
                method: 'eth_gasPrice',
                params: [feeCurrency as `0x${string}`]
              } as any);
              next['gasPrice'] = BigInt(hexGasPrice as string);
            } else {
              next['gasPrice'] = await publicClient.getGasPrice();
            }
          }
        }
      } catch (error) {
        console.warn('MiniPay gasPrice fallback failed:', error);
      }
    }

    // Add explicit gas estimation if not provided to prevent "gas too low" issues in MiniPay
    if (!next['gas'] && chainId) {
      try {
        const config = this.wagmiConfig;
        if (config) {
          const publicClient = getPublicClient(config, { chainId });
          if (publicClient) {
            const estimateParams = {
              address: next['address'] as Address,
              abi: next['abi'] as any,
              functionName: next['functionName'] as string,
              args: next['args'] as any,
              account: (next['account'] ?? this.account) as Address,
              value: next['value'] as bigint | undefined,
              feeCurrency: feeCurrency as Address | undefined,
            };
            const estimatedGas = await publicClient.estimateContractGas(estimateParams as any);
            // Add a safety buffer: 20% + 100,000 gas if paying in custom feeCurrency, or 10% if native
            if (feeCurrency) {
              next['gas'] = (estimatedGas * 120n / 100n) + 100000n;
            } else {
              next['gas'] = (estimatedGas * 110n / 100n);
            }
            console.log(`[Web3Service] Estimated gas for MiniPay transaction: ${next['gas']?.toString()} (base: ${estimatedGas.toString()})`);
          }
        }
      } catch (error) {
        console.warn('MiniPay gas estimation fallback failed:', error);
      }
    }

    return next as Parameters<typeof writeContract>[1];
  }

  public async writeContractWithMiniPay(
    request: Parameters<typeof writeContract>[1],
    options?: MiniPayWriteOptions
  ) {
    const config = this.wagmiConfig;
    if (!config) {
      throw new Error('Wagmi config not available. Please connect wallet first.');
    }

    const normalizedRequest = await this.applyMiniPayTransactionOverrides(request, options);

    // Ensure chain is set
    if (!normalizedRequest.chainId && this.chainId) {
      (normalizedRequest as any).chainId = this.chainId;
    }

    // Append Celo Attribution Tag
    const code = environment.celoAttributionCode;
    if (code) {
      try {
        const suffix = toDataSuffix(code);
        if (suffix) {
          (normalizedRequest as any).dataSuffix = suffix;
        }
      } catch (err) {
        console.warn('[Attribution] Failed to generate data suffix in web3.ts:', err);
      }
    }

    return writeContract(config, normalizedRequest as any);
  }

  private async initializeConnectionState() {
    // Web3-Onboard will automatically reconnect to the last wallet via autoConnectLastWallet: true
    // We just need to setup watchers after auto-reconnection
    setTimeout(async () => {
      const wallets = this.onboard.state.get().wallets;
      if (wallets.length > 0) {


      }

      // MiniPay auto-connect (only if not already connected)
      if (this.isMiniPay$() && !this.account$() && !this.hasAttemptedMiniPayConnect) {
        this.hasAttemptedMiniPayConnect = true;

        try {
          await this.connectWallet();
        } catch (error) {
          console.warn('MiniPay auto-connect fallback failed:', error);
        }
      }

      await this.setupWagmiWatchers();
      this.syncConnectedStateFromConfig();
    }, 200); // Small delay to let Web3-Onboard complete its auto-reconnection
  }

  // Setup wagmi watchers after wallet connection
  private async setupWagmiWatchers() {
    const config = this.wagmiConfig;
    if (!config) {
      console.warn('Cannot setup wagmi watchers - config not available');
      return;
    }

    console.log('Now setting up wagmi watchers - config now available');

    // Unwatch previous watchers if they exist
    if (this.unwatchAccount) {
      this.unwatchAccount();
    }
    if (this.unwatchNetwork) {
      this.unwatchNetwork();
    }

    // Setup account watcher
    this.unwatchAccount = watchAccount(config, {
      onChange: (account) => {
        console.log('Account changed to:', account);
        if (account?.address) {
          this.account$.set(account.address);
        } else {
          this.account$.set(undefined);
        }
      }
    });

    // Setup chain watcher
    this.unwatchNetwork = watchChainId(config, {
      onChange: (chainId) => {
        console.log('ChainId changed to:', chainId);
        if (chainId) {
          this.chainId$.set(chainId);
        } else {
          this.chainId$.set(undefined);
        }
      }
    });
  }

  // Method to connect wallet
  public async connectWallet() {
    try {
      let wallets;
      if (this.isMiniPay$()) {
        wallets = await this.onboard.connectWallet({
          autoSelect: {
            label: 'Opera MiniPay',
            disableModals: true
          }
        });
      } else {
        wallets = await this.onboard.connectWallet();
      }
      if (wallets.length > 0) {
        // Setup wagmi watchers after successful connection
        await this.setupWagmiWatchers();
        this.syncConnectedStateFromConfig();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      return false;
    }
  }

  // Method to disconnect wallet
  public async disconnectWallet() {
    const wallets = this.onboard.state.get().wallets;
    if (wallets.length > 0) {
      await this.onboard.disconnectWallet({ label: wallets[0].label });
    }
  }

  // Method to switch chain
  public async switchChain(chainId: number) {
    try {
      // current primary wallet - as multiple wallets can connect this value is the currently active
      const [activeWallet] = this.onboard.state.get().wallets
      const { wagmiConnector } = activeWallet
      let chainAsNumber
      if (isHex(chainId)) {
        chainAsNumber = fromHex(chainId, 'number')
      } else if (!isHex(chainId) && typeof chainId === 'number') {
        chainAsNumber = chainId
      } else {
        throw new Error('Invalid chainId')
      }
      const wagmiConfig = this.onboard.state.get().wagmiConfig
      if (!wagmiConfig) {
        throw new Error("No WagmiConfig")
      }
      await switchChain(wagmiConfig, {
        chainId: chainAsNumber,
        connector: wagmiConnector
      });

      // Synchronize Web3-Onboard state and local chainId$ signal immediately
      try {
        const hexChainId = `0x${chainAsNumber.toString(16)}`;
        await this.onboard.setChain({ chainId: hexChainId });
      } catch (onboardError) {
        console.warn('Failed to sync chain to Web3-Onboard:', onboardError);
      }

      this.chainId$.set(chainAsNumber);
      return true;
    } catch (error) {
      console.error('Failed to switch chain:', error);
      return false;
    }
  }

  // Method to force account/wallet selection (forces MetaMask to show account selector, or opens onboard modal)
  public async switchAccount() {
    try {
      // 1. If window.ethereum is available, we can request permissions to force MetaMask to prompt account switching
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_requestPermissions',
            params: [{ eth_accounts: {} }]
          });
          // This will trigger accountsChanged in MetaMask, which Web3-Onboard will hear and sync.
          return;
        } catch (permError) {
          console.warn('MetaMask permission request failed or rejected:', permError);
        }
      }

      // 2. Fallback: Disconnect current and open connect modal to let them select
      await this.disconnectWallet();
      await this.connectWallet();
    } catch (error) {
      console.error('Failed to switch account:', error);
    }
  }



  async getAccountInfo() {
    const config = this.wagmiConfig;
    if (!config) throw new Error('Wagmi config not available');
    return getAccount(config);
  }

  async getBalanceNativeCurrency(account: Address) {
    const config = this.wagmiConfig;
    if (!config) throw new Error('Wagmi config not available');
    return await getBalance(config, {
      address: account,
    });
  }


  async getBalanceERC20(tokenAddress: `0x${string}`, account: `0x${string}`) {
    const config = this.wagmiConfig;
    if (!config) throw new Error('Wagmi config not available');

    const chainId = this.chainId || 31337;
    const results = await multicall(config, {
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
    const config = this.wagmiConfig;
    if (!config) throw new Error('Wagmi config not available');

    const activeChainId = chainId ?? this.chainId ?? 31337;
    const results = await multicall(config, {
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
    const config = this.wagmiConfig;
    if (!config) throw new Error('Wagmi config not available');

    const blockNumber = await getBlockNumber(
      config,
      {
        chainId: this.chainId
      }
    )
    return blockNumber
  }


  async getERC20Allowance(tokenAddress: `0x${string}`, contractToApprove: `0x${string}`, account: `0x${string}`, chainId?: number) {
    const config = this.wagmiConfig;
    if (!config) throw new Error('Wagmi config not available');

    const allowance = await readContract(config, {
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
      const config = this.wagmiConfig;
      if (!config) throw new Error('Wagmi config not available');

      const approvedAmount = await readContract(config, {
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
