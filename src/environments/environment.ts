// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

// BrainBook contract addresses per chain
export interface BrainBookContracts {
  brainbookToken: string;      // ERC-20 BRAINBOOK token
  brainbookNFT: string;        // ERC-1155 BrainBookNFT (achievements + game items)
  brainbookGameManager: string; // BrainBookGameManager orchestrator
}

export interface FeeCurrencyOption {
  symbol: string;
  name: string;
  address: `0x${string}`;
}


// BrainBook contracts organized by chain ID
const ALL_CONTRACTS: Record<number, BrainBookContracts> = {
  // Hardhat Local Network (Chain ID: 31337)
  31337: {
    brainbookToken: '0x0000000000000000000000000000000000000000', // Set after local deploy
    brainbookNFT: '0x0000000000000000000000000000000000000000', // Set after local deploy
    brainbookGameManager: '0x0000000000000000000000000000000000000000', // Set after local deploy
  },
  // Celo Alfajores Testnet (Chain ID: 44787)
  44787: {
    brainbookToken: '0x0000000000000000000000000000000000000000', // Set after deploy
    brainbookNFT: '0x0000000000000000000000000000000000000000', // Set after deploy
    brainbookGameManager: '0x0000000000000000000000000000000000000000', // Set after deploy
  },
  // Celo Mainnet (Chain ID: 42220)
  42220: {
    brainbookToken: '0x0000000000000000000000000000000000000000', // Set after mainnet deploy
    brainbookNFT: '0x0000000000000000000000000000000000000000', // Set after mainnet deploy
    brainbookGameManager: '0x0000000000000000000000000000000000000000', // Set after mainnet deploy
  },
}

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
};


/*
 * For easier debugging in development, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
