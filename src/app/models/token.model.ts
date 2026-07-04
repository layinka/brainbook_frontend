// Supported blockchain networks
export type Network = 'Ethereum' | 'Stellar' | 'Polygon' | 'Binance';

// Token interface
export interface Token {
  address: string;        // Contract address or asset ID
  name: string;           // Full token name (e.g., "USD Coin")
  symbol: string;         // Token symbol (e.g., "USDC")
  decimals: number;       // Token decimals (e.g., 6 for USDC, 18 for most ERC-20)
  chain: Network;         // Blockchain network
  icon: string;           // URL to token icon
  isNative?: boolean;     // Whether it's the native token (e.g., ETH, XLM)
  contractAddress?: string; // For wrapped tokens
}
