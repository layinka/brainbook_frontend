// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

// BrainBook contract addresses per chain
export interface BrainBookContracts {
  brainbookToken: string;      // ERC-20 BRAINBOOK token
  brainbookNFT: string;        // ERC-1155 BrainBookNFT (achievements + game items)
  brainbookGameManager: string; // BrainBookGameManager orchestrator
  brainbookStaking: string;     // BrainBookStaking rewards lockup
  brainbookLiquidityMining: string; // BrainBookLiquidityMining rewards lockup
  ubeswapPool: string;          // Ubeswap V3 BRAINBOOK/cUSD pool — for TWAP price oracle
}

// ─── DEX Registry Types ──────────────────────────────────────────────────────
export type DexProtocol = 'uniswap-v3' | 'uniswap-v4';
export type StablecoinSymbol = 'cUSD' | 'USDC' | 'USDT';

export interface DexEntry {
  id: string;
  name: string;                  // Display name e.g. "Ubeswap V3"
  logoEmoji: string;             // Fallback emoji icon
  chain: string;                 // Human-readable chain name
  chainId: number;               // EVM chain ID
  protocol: DexProtocol;
  enabled: boolean;              // If false, shown as "Coming Soon"
  pairName: string;              // e.g. "BRAINBOOK/cUSD"
  stablecoinAddress: string;     // Address of the stable side (cUSD, USDC, USDT)
  stablecoinSymbol: StablecoinSymbol;
  feeTier: number;               // In bps, e.g. 3000 = 0.3%
  tickSpacing: number;           // Tick spacing for V3/V4 math
  swapUrl: string;               // External deep-link for trading on the DEX site
  // V3 specific
  poolAddress?: string;          // V3 pool for TWAP price reading
  routerAddress?: string;        // V3 SwapRouter02 address
  // V4 specific
  poolManagerAddress?: string;   // V4 PoolManager (global singleton per chain)
  poolId?: string;               // bytes32 PoolId hash for V4 pool
  universalRouterAddress?: string; // V4 UniversalRouter address
  hooksAddress?: string;         // V4 hooks contract (zero address if none)
}

// ─── DEX Registry ─────────────────────────────────────────────────────────────
// Add/remove/enable entries here. poolAddress/routerAddress/poolId populated after BRAINBOOK deployment.
const ZERO = '0x0000000000000000000000000000000000000000';

export const DEX_REGISTRY: DexEntry[] = [
  // ── Celo Mainnet ──────────────────────────────────────────────────────────
  {
    id: 'ubeswap-v3-celo-cusd',
    name: 'Ubeswap V3',
    logoEmoji: '🌾',
    chain: 'Celo Mainnet',
    chainId: 42220,
    protocol: 'uniswap-v3',
    enabled: true,
    pairName: 'BRAINBOOK / cUSD',
    stablecoinAddress: '0x765DE816845861e75A25fCA122bb6898B8B1282a', // cUSD on Celo mainnet
    stablecoinSymbol: 'cUSD',
    feeTier: 3000,
    tickSpacing: 60,
    swapUrl: 'https://ubeswap.org/#/swap',
    poolAddress: ZERO,       // Set after BRAINBOOK/cUSD pool creation on Ubeswap V3 (Celo)
    routerAddress: '0x5615CDAb10dc425a742d643d949a7F474C01abc4', // Ubeswap V3 SwapRouter on Celo
  },
  {
    id: 'ubeswap-v3-celo-usdc',
    name: 'Ubeswap V3',
    logoEmoji: '🌾',
    chain: 'Celo Mainnet',
    chainId: 42220,
    protocol: 'uniswap-v3',
    enabled: false,           // Enable after BRAINBOOK/USDC pool is live
    pairName: 'BRAINBOOK / USDC',
    stablecoinAddress: '0xceba9300f2b948710d2653dd7b07f33a8b32118c', // USDC on Celo mainnet
    stablecoinSymbol: 'USDC',
    feeTier: 3000,
    tickSpacing: 60,
    swapUrl: 'https://ubeswap.org/#/swap',
    poolAddress: ZERO,
    routerAddress: '0x5615CDAb10dc425a742d643d949a7F474C01abc4',
  },
  // ── Celo Alfajores Testnet ─────────────────────────────────────────────────
  {
    id: 'ubeswap-v3-alfajores-cusd',
    name: 'Ubeswap V3 (Testnet)',
    logoEmoji: '🌾',
    chain: 'Celo Alfajores',
    chainId: 44787,
    protocol: 'uniswap-v3',
    enabled: true,
    pairName: 'BRAINBOOK / cUSD',
    stablecoinAddress: '0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1', // cUSD on Alfajores
    stablecoinSymbol: 'cUSD',
    feeTier: 3000,
    tickSpacing: 60,
    swapUrl: 'https://ubeswap.org/#/swap',
    poolAddress: ZERO,       // Set after testnet pool creation
    routerAddress: '0x5615CDAb10dc425a742d643d949a7F474C01abc4',
  },
  // ── Celo Sepolia Testnet ───────────────────────────────────────────────────
  {
    id: 'ubeswap-v3-celo-sepolia-cusd',
    name: 'Ubeswap V3 (Celo Sepolia)',
    logoEmoji: '🌾',
    chain: 'Celo Sepolia',
    chainId: 11142220, // Celo Sepolia chain ID
    protocol: 'uniswap-v3',
    enabled: true,
    pairName: 'BRAINBOOK / cUSD',
    stablecoinAddress: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B', // cUSD on Celo Sepolia
    stablecoinSymbol: 'cUSD',
    feeTier: 3000,
    tickSpacing: 60,
    swapUrl: 'https://ubeswap.org/#/swap',
    poolAddress: ZERO,       // Set after Celo Sepolia pool creation
    routerAddress: '0x5615CDAb10dc425a742d643d949a7F474C01abc4', // Confirm Ubeswap Celo Sepolia router addr
  },
  // ── Ethereum Mainnet — Uniswap V4 ─────────────────────────────────────────
  {
    id: 'uniswap-v4-eth-usdc',
    name: 'Uniswap V4',
    logoEmoji: '🦄',
    chain: 'Ethereum Mainnet',
    chainId: 1,
    protocol: 'uniswap-v4',
    enabled: false,           // Enable after BRAINBOOK is bridged to Ethereum
    pairName: 'BRAINBOOK / USDC',
    stablecoinAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC on Ethereum
    stablecoinSymbol: 'USDC',
    feeTier: 3000,
    tickSpacing: 60,
    swapUrl: 'https://app.uniswap.org/swap',
    poolManagerAddress: '0x000000000004444c5dc75cB358380D2e3dE08A90', // Uniswap V4 PoolManager (Ethereum)
    poolId: ZERO,             // bytes32 PoolId — computed after pool creation
    universalRouterAddress: '0x66a9893cc07D91D95f08a2d21E4f1ba5d4D40A21', // Uniswap V4 UniversalRouter (Ethereum)
    hooksAddress: ZERO,
  },
  // ── Ethereum Sepolia — Uniswap V4 ─────────────────────────────────────────
  {
    id: 'uniswap-v4-sepolia-usdc',
    name: 'Uniswap V4 (Sepolia)',
    logoEmoji: '🦄',
    chain: 'Ethereum Sepolia',
    chainId: 11155111,
    protocol: 'uniswap-v4',
    enabled: false,           // Enable after testnet pool created
    pairName: 'BRAINBOOK / USDC',
    stablecoinAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC on Sepolia
    stablecoinSymbol: 'USDC',
    feeTier: 3000,
    tickSpacing: 60,
    swapUrl: 'https://app.uniswap.org/swap',
    poolManagerAddress: '0x00B036B58a818B1BC34d502D3fE730Db729e62AC', // Uniswap V4 PoolManager (Sepolia)
    poolId: ZERO,
    universalRouterAddress: '0x3a9d48ab9751398bbfa63ad67599bb04e4bdf98b', // Uniswap V4 UniversalRouter (Sepolia)
    hooksAddress: ZERO,
  },
];

export interface FeeCurrencyOption {
  symbol: string;
  name: string;
  address: `0x${string}`;
}


// BrainBook contracts organized by chain ID
const ALL_CONTRACTS: Record<number, BrainBookContracts> = {
  // Hardhat Local Network (Chain ID: 31337)
  31337: {
    brainbookToken: '0x5fbdb2315678afecb367f032d93f642f64180aa3',      // Set after local deploy
    brainbookNFT: '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512',        // Set after local deploy
    brainbookGameManager: '0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0', // Set after local deploy
    brainbookStaking: '0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9',     // Set after local deploy
    brainbookLiquidityMining: '0xdc64a140aa3e981100a9beca4e685f962f0cf6c9', // Set after local deploy
    ubeswapPool: '0x0000000000000000000000000000000000000000',          // No pool on local — fallback price used
  },
  // Celo Alfajores Testnet (Chain ID: 44787)
  44787: {
    brainbookToken: '0x0000000000000000000000000000000000000000',      // Set after deploy
    brainbookNFT: '0x0000000000000000000000000000000000000000',        // Set after deploy
    brainbookGameManager: '0x0000000000000000000000000000000000000000', // Set after deploy
    brainbookStaking: '0x0000000000000000000000000000000000000000',     // Set after deploy
    brainbookLiquidityMining: '0x0000000000000000000000000000000000000000', // Set after deploy
    ubeswapPool: '0x0000000000000000000000000000000000000000',          // Set after Ubeswap V3 pool creation
  },
  // Celo Mainnet (Chain ID: 42220)
  42220: {
    brainbookToken: '0x0000000000000000000000000000000000000000',      // Set after mainnet deploy
    brainbookNFT: '0x0000000000000000000000000000000000000000',        // Set after mainnet deploy
    brainbookGameManager: '0x0000000000000000000000000000000000000000', // Set after mainnet deploy
    brainbookStaking: '0x0000000000000000000000000000000000000000',     // Set after mainnet deploy
    brainbookLiquidityMining: '0x0000000000000000000000000000000000000000', // Set after mainnet deploy
    ubeswapPool: '0x0000000000000000000000000000000000000000',          // Set after Ubeswap V3 BRAINBOOK/cUSD pool creation
  },
};

// Chain-specific fee currencies for chains that support feeCurrency in tx payloads.
// Add more CELO-compatible fee currencies here as they become available.
const ALL_FEE_CURRENCIES: Record<number, FeeCurrencyOption[]> = {
  // Celo Mainnet
  42220: [
    {
      symbol: 'USDm',
      name: 'USDm',
      address: '0x471EcE3750Da237f93B8E339c536989b8978a438'
    }
  ],
  // Celo Sepolia
  11142220: [
    {
      symbol: 'USDm',
      name: 'USDm',
      address: '0x765DE816845861e75A25fCA122bb6898B8B1282a'
    }
  ]
}

export const environment = {
  production: false,
  appName: 'BrainBook',
  apiUrl: 'http://localhost:3011/api/v1',
  authUrl: 'http://localhost:3011',
  walletConnectProjectId: '6dc075707b4e66bff8df286aab204770',

  // BrainBook contract configuration per chain
  contracts: ALL_CONTRACTS,
  feeCurrenciesByChain: ALL_FEE_CURRENCIES,

  // Default chain: Celo Alfajores for dev/testing
  defaultChainId: 44787,

  // Game config
  questionsPerRound: 20,
  maxLives: 3,

  // Rewarded Ads (AppLovin — SDK integration pending)
  adsEnabled: true,  // set false in MiniPay (handled dynamically via Web3Service.isMiniPay)
  appLovinSdkKey: '', // Set when AppLovin SDK is integrated

  // Game Rewards Configuration
  rewards: {
    correctAnswer: 0.1,
    topicCompletion: 5.0,
    topicCompletionNftName: 'Topic Aficionado NFT Badge',
    weeklyWarriorNftName: 'Weekly Warrior NFT Badge',

    // Daily rewards list for 7-day calendar
    dailyCalendar: [
      { dayNumber: 1, rewardText: '1 BRAINBOOK', icon: '🧠', type: 'token', amount: 1 },
      { dayNumber: 2, rewardText: '2 BRAINBOOK', icon: '🧠', type: 'token', amount: 2 },
      { dayNumber: 3, rewardText: 'Time Freeze', icon: '⏳', type: 'item', amount: 1 },
      { dayNumber: 4, rewardText: '4 BRAINBOOK', icon: '🧠', type: 'token', amount: 4 },
      { dayNumber: 5, rewardText: 'Hint Reveal', icon: '💡', type: 'item', amount: 1 },
      { dayNumber: 6, rewardText: '8 BRAINBOOK', icon: '🧠', type: 'token', amount: 8 },
      { dayNumber: 7, rewardText: 'Weekly Warrior NFT', icon: '🛡️', type: 'nft', amount: 1 }
    ]
  }
};


/*
 * For easier debugging in development, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
