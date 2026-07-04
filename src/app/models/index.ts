import { type Address, type Hex } from 'viem';

// Core order types
export interface LimitOrder {
  salt: bigint;
  maker: Address;
  receiver: Address;
  makerAsset: Address;
  takerAsset: Address;
  makingAmount: bigint;
  takingAmount: bigint;
  makerTraits: bigint;
}

export interface OrderSignature {
  r: Hex;
  vs: Hex;
}

export interface StoredOrder {
  id: string;
  order: LimitOrder;
  signature: OrderSignature;
  orderHash: Hex;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  filledAmount?: bigint;
  chainId: number;
}

export enum OrderStatus {
  ACTIVE = 'active',
  FILLED = 'filled',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  PARTIAL = 'partial'
}

export enum OrderType {
  REGULAR = 'regular',
  FUSION_PLUS = 'fusion+'
}

export enum SwapStatus {
  PENDING = 'pending',
  DEPOSITED = 'deposited',
  REVEALED = 'revealed',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired'
}

// Fusion+ specific types
export interface FusionPlusOrder extends LimitOrder {
  sourceChain: number;
  destinationChain: number;
  secretHash: Hex;
  secret?: Hex; // Only known to user initially
  timelock: TimelockConfig;
  safetyDeposit: bigint;
  srcEscrowAddress?: Address;
  dstEscrowAddress?: Address;
}

export interface TimelockConfig {
  srcWithdrawal: number;
  dstWithdrawal: number;
  srcCancellation: number;
  dstCancellation: number;
}

export interface EscrowImmutables {
  orderHash: Hex;
  hashlock: Hex;
  maker: Address;
  taker: Address;
  token: Address;
  amount: bigint;
  safetyDeposit: bigint;
  timelocks: TimelockConfig;
}

// Maker traits configuration
export interface MakerTraitsConfig {
  allowedSender?: Address;
  shouldCheckEpoch?: boolean;
  allowPartialFill?: boolean;
  allowMultipleFills?: boolean;
  usePermit2?: boolean;
  unwrapWeth?: boolean;
  expiry?: number;
  nonce?: number;
  series?: number;
}

// Taker traits configuration
export interface TakerTraitsConfig {
  makingAmount?: boolean;
  unwrapWeth?: boolean;
  skipMakerPermit?: boolean;
  usePermit2?: boolean;
  target?: Hex;
  extension?: Hex;
  interaction?: Hex;
  threshold?: bigint;
}

// API request/response types
export interface CreateOrderRequest {
  makerAsset: Address;
  takerAsset: Address;
  makingAmount: string;
  takingAmount: string;
  makerAssetDecimals: number;
  takerAssetDecimals: number;
  expiry?: number;
  allowPartialFill?: boolean;
  allowMultipleFills?: boolean;
  makerTraits?: MakerTraitsConfig;
}

export interface CreateFusionOrderRequest extends CreateOrderRequest {
  sourceChain: number;
  destinationChain: number;
  safetyDeposit: string;
}

export interface OrderBookEntry {
  order: StoredOrder;
  price: number;
  size: number;
}

export interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  pair: {
    base: Address;
    quote: Address;
  };
}

// Dutch auction types
export interface DutchAuction {
  id: string;
  fusionOrder: FusionPlusOrder;
  startPrice: bigint;
  endPrice: bigint;
  startTime: number;
  endTime: number;
  currentPrice: bigint;
  status: AuctionStatus;
  bids: AuctionBid[];
}

export enum AuctionStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired'
}

export interface AuctionBid {
  resolver: Address;
  price: bigint;
  timestamp: number;
  txHash?: Hex;
}

// Resolver types
export interface ResolverConfig {
  address: Address;
  privateKey: Hex;
  supportedChains: number[];
  minProfitBps: number; // Basis points (100 = 1%)
  maxGasPrice: bigint;
  safetyDepositETH: string;
}

export interface ResolverMetrics {
  totalSwaps: number;
  successfulSwaps: number;
  totalProfit: bigint;
  averageExecutionTime: number;
  supportedPairs: Array<{
    sourceChain: number;
    destinationChain: number;
    baseToken: Address;
    quoteToken: Address;
  }>;
}

// Event types
export interface OrderEvent {
  type: 'OrderCreated' | 'OrderFilled' | 'OrderCancelled' | 'OrderExpired';
  orderHash: Hex;
  order: StoredOrder;
  timestamp: number;
  txHash?: Hex;
  blockNumber?: number;
}

export interface FusionEvent {
  type: 'AuctionStarted' | 'EscrowDeployed' | 'SecretRevealed' | 'SwapCompleted';
  auctionId: string;
  fusionOrder: FusionPlusOrder;
  resolver?: Address;
  timestamp: number;
  txHash?: Hex;
  chainId: number;
}

// WebSocket message types
export interface WebSocketMessage {
  type: 'order' | 'fusion' | 'system';
  event: OrderEvent | FusionEvent | SystemEvent;
  timestamp: number;
}

export interface SystemEvent {
  type: 'ResolverOnline' | 'ResolverOffline' | 'ChainStatus';
  data: any;
  timestamp: number;
}

// Contract addresses by chain
export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  blockExplorer: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  contracts: {
    fusionContract?: string;
    escrowFactory?: string;
  };
  tokens: {
    [symbol: string]: {
      address: Address;
      decimals: number;
      name: string;
      symbol: string;
      logoURI?: string;
    };
  };
}

// Database models
export interface OrderModel {
  _id?: string;
  orderHash: string;
  order: LimitOrder;
  signature: OrderSignature;
  status: OrderStatus;
  type: OrderType;
  chainId: number;
  createdAt: Date;
  updatedAt: Date;
  filledAmount?: string;
  cancelledAt?: Date;
  expiredAt?: Date;
}

export interface FusionOrderModel extends OrderModel {
  sourceChain: number;
  destinationChain: number;
  secretHash: string;
  secret?: string;
  timelock: TimelockConfig;
  safetyDeposit: string;
  srcEscrowAddress?: string;
  dstEscrowAddress?: string;
  auctionId?: string;
  resolver?: string;
}

// Error types
export class OrderError extends Error {
  constructor(
    message: string,
    public code: string,
    public orderHash?: string
  ) {
    super(message);
    this.name = 'OrderError';
  }
}

export class FusionError extends Error {
  constructor(
    message: string,
    public code: string,
    public auctionId?: string,
    public chainId?: number
  ) {
    super(message);
    this.name = 'FusionError';
  }
}

// Utility types
export type ChainId = 1 | 42161 | 137 | 10 | 8453; // Ethereum, Arbitrum, Polygon, Optimism, Base

export interface TokenInfo {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

export interface PriceInfo {
  token: Address;
  priceUSD: number;
  priceETH: number;
  timestamp: number;
  source: string;
}

// Constants
export const MAKER_TRAITS_FLAGS = {
  NO_PARTIAL_FILLS: 255n,
  ALLOW_MULTIPLE_FILLS: 254n,
  NEED_PREINTERACTION: 252n,
  NEED_POSTINTERACTION: 251n,
  NEED_EPOCH_CHECK: 250n,
  HAS_EXTENSION: 249n,
  USE_PERMIT2: 248n,
  UNWRAP_WETH: 247n,
} as const;

export const TAKER_TRAITS_FLAGS = {
  MAKER_AMOUNT_FLAG: 1n << 255n,
  UNWRAP_WETH_FLAG: 1n << 254n,
  SKIP_ORDER_PERMIT_FLAG: 1n << 253n,
  USE_PERMIT2_FLAG: 1n << 252n,
  ARGS_HAS_TARGET: 1n << 251n,
} as const;

export const EIP712_DOMAIN = {
  name: '1inch Limit Order Protocol',
  version: '4',
} as const;

export const ORDER_TYPE = [
  { name: 'salt', type: 'uint256' },
  { name: 'maker', type: 'address' },
  { name: 'receiver', type: 'address' },
  { name: 'makerAsset', type: 'address' },
  { name: 'takerAsset', type: 'address' },
  { name: 'makingAmount', type: 'uint256' },
  { name: 'takingAmount', type: 'uint256' },
  { name: 'makerTraits', type: 'uint256' },
] as const;
