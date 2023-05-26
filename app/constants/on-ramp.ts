import { NETWORKS_CHAIN_ID } from './network';

export enum FIAT_ORDER_PROVIDERS {
  WYRE = 'WYRE',
  WYRE_APPLE_PAY = 'WYRE_APPLE_PAY',
  TRANSAK = 'TRANSAK',
  MOONPAY = 'MOONPAY',
  // The key for fiat on-ramp aggregator
  AGGREGATOR = 'AGGREGATOR',
}

export enum FIAT_ORDER_STATES {
  PENDING = 'PENDING',
  FAILED = 'FAILED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export const FORMATTED_NETWORK_NAMES = {
  [NETWORKS_CHAIN_ID.MAINNET]: 'Ethereum Mainnet',
  [NETWORKS_CHAIN_ID.BSC]: 'Binance Smart Chain',
  [NETWORKS_CHAIN_ID.POLYGON]: 'Polygon',
  [NETWORKS_CHAIN_ID.AVAXCCHAIN]: 'Avalanche',
  [NETWORKS_CHAIN_ID.CELO]: 'Celo',
  [NETWORKS_CHAIN_ID.FANTOM]: 'Fantom',
  [NETWORKS_CHAIN_ID.LINEA_TESTNET]: 'Linea Goerli test network',
} as const;

export const NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000';
