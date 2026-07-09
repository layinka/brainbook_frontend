export const BRAIN_BOOK_STAKING_ABI = [
  {
    inputs: [
      { name: "_initialOwner", type: "address", typeName: "address" },
      { name: "_stakingToken", type: "address", typeName: "address" },
      { name: "_rewardToken", type: "address", typeName: "address" }
    ],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    inputs: [{ name: "account", type: "address", typeName: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256", typeName: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "account", type: "address", typeName: "address" }],
    name: "earned",
    outputs: [{ name: "", type: "uint256", typeName: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getReward",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "amount", type: "uint256", typeName: "uint256" }],
    name: "stake",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "amount", type: "uint256", typeName: "uint256" }],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "exit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ name: "", type: "uint256", typeName: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "stakingToken",
    outputs: [{ name: "", type: "address", typeName: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "rewardToken",
    outputs: [{ name: "", type: "address", typeName: "address" }],
    stateMutability: "view",
    type: "function"
  }
] as const;
