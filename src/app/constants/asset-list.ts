import { Token } from '../models/token.model';

export const ASSETS: Token[] = [
  // Ethereum Native
  {
    address: '0x0000000000000000000000000000000000000000',
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    chain: 'Ethereum',
    icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
    isNative: true
  },
  
  // Ethereum Tokens
  {
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
    chain: 'Ethereum',
    icon: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png'
  },
  {
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    name: 'Tether USD',
    symbol: 'USDT',
    decimals: 6,
    chain: 'Ethereum',
    icon: 'https://cryptologos.cc/logos/tether-usdt-logo.png'
  },
  {
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    name: 'Dai Stablecoin',
    symbol: 'DAI',
    decimals: 18,
    chain: 'Ethereum',
    icon: 'https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.png'
  },
  
  // Stellar Native
  {
    address: 'XLM',
    name: 'Stellar Lumen',
    symbol: 'XLM',
    decimals: 7,
    chain: 'Stellar',
    icon: 'https://cryptologos.cc/logos/stellar-xlm-logo.png',
    isNative: true
  },
  
  // Stellar Tokens
  {
    address: 'USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 7,
    chain: 'Stellar',
    icon: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png'
  },
  {
    address: 'USDT-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    name: 'Tether USD',
    symbol: 'USDT',
    decimals: 7,
    chain: 'Stellar',
    icon: 'https://cryptologos.cc/logos/tether-usdt-logo.png'
  },
  {
    address: 'DAI-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    name: 'Dai Stablecoin',
    symbol: 'DAI',
    decimals: 7,
    chain: 'Stellar',
    icon: 'https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.png'
  },
  
  // Wrapped Tokens
  {
    address: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
    name: 'Wrapped Staked ETH',
    symbol: 'wstETH',
    decimals: 18,
    chain: 'Ethereum',
    icon: 'https://cryptologos.cc/logos/lido-staked-ether-steth-logo.png',
    contractAddress: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0'
  },
  {
    address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    name: 'Lido Staked ETH',
    symbol: 'stETH',
    decimals: 18,
    chain: 'Ethereum',
    icon: 'https://cryptologos.cc/logos/lido-staked-ether-steth-logo.png',
    contractAddress: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84'
  }
];

// Helper function to find a token by address and chain
export function findTokenByAddress(address: string, chain: string): Token | undefined {
  return ASSETS.find(token => 
    token.address.toLowerCase() === address.toLowerCase() && 
    token.chain === chain
  );
}

// Helper function to get native token for a chain
export function getNativeToken(chain: string): Token | undefined {
  return ASSETS.find(token => token.chain === chain && token.isNative);
}
