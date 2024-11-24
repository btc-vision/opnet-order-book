import { Blockchain } from '@btc-vision/btc-runtime/runtime';

export const TOTAL_RESERVES_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_LIMITATION: u16 = Blockchain.nextPointer;
export const FEE_CREDITS_POINTER: u16 = Blockchain.nextPointer;

export const PROVIDER_LIQUIDITY_POINTER: u16 = Blockchain.nextPointer;
export const PROVIDER_ADDRESS_POINTER: u16 = Blockchain.nextPointer;

export const LIQUIDITY_QUOTE_HISTORY_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_QUEUE_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_RESERVED_POINTER: u16 = Blockchain.nextPointer;

export const LIQUIDITY_EWMA_V_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_EWMA_L_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_EWMA_P0_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_EWMA_LAST_UPDATE_BLOCK_POINTER: u16 = Blockchain.nextPointer;

export const RESERVATION_INDEXES: u16 = Blockchain.nextPointer;
export const RESERVATION_AMOUNTS: u16 = Blockchain.nextPointer;
export const RESERVATION_ID_POINTER: u16 = Blockchain.nextPointer;
