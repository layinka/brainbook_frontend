import { createConfig, http } from 'wagmi';
import { mainnet, sepolia, hardhat, celo, celoSepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

// Configure chains & providers with the Alchemy provider.
// Two popular providers are Alchemy (alchemy.com) and Infura (infura.io)
export const config = createConfig({
  chains: [mainnet, sepolia, hardhat, celo, celoSepolia],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [hardhat.id]: http(),
    [celo.id]: http(),
    [celoSepolia.id]: http(),
  },
  connectors: [
    injected(),
  ],
  ssr: true, // If your app uses server side rendering
});

// Export wagmi hooks for use throughout the app
export {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useBalance,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useBlockNumber
} from 'wagmi';

export { mainnet, sepolia, hardhat, celo, celoSepolia } from 'wagmi/chains';
