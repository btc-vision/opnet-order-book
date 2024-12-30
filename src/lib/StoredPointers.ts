import { Blockchain } from '@btc-vision/btc-runtime/runtime';

export const FEE_SETTINGS_POINTER: u16 = Blockchain.nextPointer;
export const TOTAL_RESERVES_POINTER: u16 = Blockchain.nextPointer;

export const PROVIDER_LIQUIDITY_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_PROVIDER_POINTER: u16 = Blockchain.nextPointer;
export const PROVIDER_ADDRESS_POINTER: u16 = Blockchain.nextPointer;

export const LIQUIDITY_QUOTE_HISTORY_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_QUEUE_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_PRIORITY_QUEUE_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_RESERVED_POINTER: u16 = Blockchain.nextPointer;

export const LIQUIDITY_VIRTUAL_BTC_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_VIRTUAL_T_POINTER: u16 = Blockchain.nextPointer;
export const LAST_VIRTUAL_BLOCK_UPDATE_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_P0_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_LAST_UPDATE_BLOCK_POINTER: u16 = Blockchain.nextPointer;
export const RESERVATION_SETTINGS_POINTER: u16 = Blockchain.nextPointer;

export const RESERVATION_INDEXES: u16 = Blockchain.nextPointer;
export const RESERVATION_AMOUNTS: u16 = Blockchain.nextPointer;
export const RESERVATION_PRIORITY: u16 = Blockchain.nextPointer;
export const RESERVATION_ID_POINTER: u16 = Blockchain.nextPointer;
export const RESERVATION_IDS_BY_BLOCK_POINTER: u16 = Blockchain.nextPointer;

export const ANTI_BOT_MAX_TOKENS_PER_RESERVATION: u16 = Blockchain.nextPointer;
export const INITIAL_LIQUIDITY: u16 = Blockchain.nextPointer;

export const DELTA_BTC_BUY: u16 = Blockchain.nextPointer;
export const DELTA_TOKENS_ADD: u16 = Blockchain.nextPointer;
export const DELTA_TOKENS_BUY: u16 = Blockchain.nextPointer;
export const DELTA_TOKENS_SELL: u16 = Blockchain.nextPointer;

export const LP_BTC_OWED_POINTER: u16 = Blockchain.nextPointer;
export const LP_BTC_OWED_RESERVED_POINTER: u16 = Blockchain.nextPointer;

export const REMOVAL_QUEUE_POINTER: u16 = Blockchain.nextPointer;
export const VOLATILITY_POINTER: u16 = Blockchain.nextPointer;
