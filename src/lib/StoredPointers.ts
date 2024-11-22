import { Blockchain } from '@btc-vision/btc-runtime/runtime';

export const TOTAL_RESERVES_POINTER: u16 = Blockchain.nextPointer;
export const PROVIDER_ADDRESS_POINTER: u16 = Blockchain.nextPointer;

export const TICK_RESERVED_AMOUNT_POINTER: u16 = Blockchain.nextPointer;
export const TICK_LAST_PURGE_BLOCK: u16 = Blockchain.nextPointer;

export const RESERVATION_PROVIDERS_POINTER: u16 = Blockchain.nextPointer;
export const RESERVATION_PROVIDERS_LIST_POINTER: u16 = Blockchain.nextPointer;
export const RESERVATION_EXPIRATION_BLOCK_POINTER: u16 = Blockchain.nextPointer;

export const LIQUIDITY_PROVIDER_RESERVED_AT_BLOCK_CURRENT_COUNT: u16 = Blockchain.nextPointer;
export const LIQUIDITY_PROVIDER_RESERVED_AT_BLOCK_FOR_PROVIDER_ID: u16 = Blockchain.nextPointer;
export const LIQUIDITY_PROVIDER_RESERVED_AT_BLOCK_FOR_PROVIDER_VALUE: u16 = Blockchain.nextPointer;

export const LIQUIDITY_PROVIDER_AVAILABLE: u16 = Blockchain.nextPointer;
export const LIQUIDITY_PROVIDER_HEAD_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_PROVIDER_LAST_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_PROVIDER_NEXT: u16 = Blockchain.nextPointer;
export const LIQUIDITY_PROVIDER_PREVIOUS: u16 = Blockchain.nextPointer;

export const TICK_BITMAP_BASE_POINTER: u16 = Blockchain.nextPointer;

export const LIQUIDITY_LIMITATION: u16 = Blockchain.nextPointer;
export const RESERVATION_DURATION_U64: u64 = 5;
export const FEE_CREDITS_POINTER: u16 = Blockchain.nextPointer;
