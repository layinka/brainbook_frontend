/**
 * Minimal ABI for Uniswap V4 UniversalRouter.
 * execute(commands, inputs) — command-based routing for V4 swaps.
 *
 * V4_SWAP command = 0x10
 * Action SWAP_EXACT_IN_SINGLE = 0x06
 *
 * Inputs are ABI-encoded using encodeV4SwapInput() in game-contract.service.ts.
 */
export const UNISWAP_V4_UNIVERSAL_ROUTER_ABI = [
  {
    inputs: [
      { internalType: 'bytes', name: 'commands', type: 'bytes' },
      { internalType: 'bytes[]', name: 'inputs', type: 'bytes[]' }
    ],
    name: 'execute',
    outputs: [],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'bytes', name: 'commands', type: 'bytes' },
      { internalType: 'bytes[]', name: 'inputs', type: 'bytes[]' },
      { internalType: 'uint256', name: 'deadline', type: 'uint256' }
    ],
    name: 'execute',
    outputs: [],
    stateMutability: 'payable',
    type: 'function'
  }
] as const;
