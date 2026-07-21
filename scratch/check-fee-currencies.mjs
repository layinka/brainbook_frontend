import { createPublicClient, http, formatGwei } from 'viem';
import { celoSepolia } from 'viem/chains';

const client = createPublicClient({ chain: celoSepolia, transport: http() });

const REGISTRY = '0x000000000000000000000000000000000000ce10';
const registryAbi = [{
  name: 'getAddressForString', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'identifier', type: 'string' }],
  outputs: [{ type: 'address' }]
}];

const directoryAbi = [{
  name: 'getCurrencies', type: 'function', stateMutability: 'view',
  inputs: [], outputs: [{ type: 'address[]' }]
}];

const erc20Abi = [
  { name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
];

const dir = await client.readContract({
  address: REGISTRY, abi: registryAbi,
  functionName: 'getAddressForString', args: ['FeeCurrencyDirectory']
});
console.log('FeeCurrencyDirectory:', dir);

const currencies = await client.readContract({ address: dir, abi: directoryAbi, functionName: 'getCurrencies' });
console.log('Whitelisted fee currencies on Celo Sepolia:');
for (const c of currencies) {
  let sym = '?', dec = '?';
  try { sym = await client.readContract({ address: c, abi: erc20Abi, functionName: 'symbol' }); } catch {}
  try { dec = await client.readContract({ address: c, abi: erc20Abi, functionName: 'decimals' }); } catch {}
  let gp = '?';
  try {
    const hex = await client.request({ method: 'eth_gasPrice', params: [c] });
    gp = formatGwei(BigInt(hex)) + ' gwei';
  } catch (e) { gp = 'gasPrice ERR: ' + (e.shortMessage || e.message).slice(0, 60); }
  console.log(`  ${c}  symbol=${sym} decimals=${dec} gasPrice=${gp}`);
}

// Is the app's USDm (0xdE9e...) in the list?
const USDM = '0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b'.toLowerCase();
console.log('\nApp USDm registered directly:', currencies.some(c => c.toLowerCase() === USDM));
