/**
 * Minimal ABI for the Uniswap V4 PoolManager.
 * Used for reading pool price via getSlot0(poolId) — a quick, single call
 * that returns sqrtPriceX96 directly, allowing same price math as V3.
 *
 * PoolId is bytes32: keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
 * This is pre-computed and stored in the DEX_REGISTRY as `poolId`.
 */
export const UNISWAP_V4_POOL_MANAGER_ABI = [
  {
    // Returns current pool state including sqrtPriceX96
    inputs: [{ internalType: 'bytes32', name: 'id', type: 'bytes32' }],
    name: 'getSlot0',
    outputs: [
      { internalType: 'uint160', name: 'sqrtPriceX96', type: 'uint160' },
      { internalType: 'int24', name: 'tick', type: 'int24' },
      { internalType: 'uint24', name: 'protocolFee', type: 'uint24' },
      { internalType: 'uint24', name: 'lpFee', type: 'uint24' }
    ],
    stateMutability: 'view',
    type: 'function'
  }
] as const;
