import { createPublicClient, http } from 'viem';
import { celoSepolia, celo } from 'viem/chains';

const DIRECTORY_ABI = [
  {
    name: 'getCurrencyConfig', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{
      type: 'tuple', components: [
        { name: 'oracle', type: 'address' },
        { name: 'intrinsicGas', type: 'uint256' },
      ]
    }]
  },
  {
    name: 'getCurrencies', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'address[]' }]
  },
];

const registryAbi = [{
  name: 'getAddressForString', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'identifier', type: 'string' }],
  outputs: [{ type: 'address' }]
}];

for (const chain of [celoSepolia, celo]) {
  const client = createPublicClient({ chain, transport: http() });
  const dir = await client.readContract({
    address: '0x000000000000000000000000000000000000ce10',
    abi: registryAbi, functionName: 'getAddressForString', args: ['FeeCurrencyDirectory']
  });
  console.log(`\n${chain.name} — FeeCurrencyDirectory: ${dir}`);
  const currencies = await client.readContract({ address: dir, abi: DIRECTORY_ABI, functionName: 'getCurrencies' });
  for (const c of currencies) {
    try {
      const cfg = await client.readContract({ address: dir, abi: DIRECTORY_ABI, functionName: 'getCurrencyConfig', args: [c] });
      console.log(`  ${c}  intrinsicGas=${cfg.intrinsicGas}`);
    } catch (e) {
      console.log(`  ${c}  getCurrencyConfig ERR: ${(e.shortMessage || e.message).slice(0, 60)}`);
    }
  }
}
