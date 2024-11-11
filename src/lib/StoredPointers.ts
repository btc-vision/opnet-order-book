import { Blockchain } from '@btc-vision/btc-runtime/runtime';

// Define constants for StoredMap and StoredArray pointers
export const TOTAL_RESERVES_POINTER: u16 = Blockchain.nextPointer;
export const TICK_HEAD_POINTER: u16 = Blockchain.nextPointer;
export const TICK_NEXT_VALUE_POINTER: u16 = Blockchain.nextPointer;
export const RESERVATION_IDS_POINTER: u16 = Blockchain.nextPointer;

// Define constants for StoredMap pointers
export const TICK_LIQUIDITY_POINTER: u16 = Blockchain.nextPointer; // Unique pointer for tick liquidity providers
export const TICK_RESERVATION_EXPIRATION_BLOCK_POINTER: u16 = Blockchain.nextPointer; // Unique pointer for tick reservation expiration blocks
export const PROVIDER_ADDRESS_POINTER: u16 = Blockchain.nextPointer; // Unique pointer for provider addresses
export const TICK_LEVEL_POINTER: u16 = Blockchain.nextPointer; // Unique pointer for tick levels
export const TICK_LIQUIDITY_AMOUNT_POINTER: u16 = Blockchain.nextPointer; // Unique pointer for tick liquidity amounts

// Define constants for StoredMap pointers
export const RESERVATION_TICKS_POINTER: u16 = Blockchain.nextPointer; // Unique pointer for reservation ticks
export const RESERVATION_BUYER_POINTER: u16 = Blockchain.nextPointer; // Unique pointer for reservation buyers
export const RESERVATION_TOKEN_POINTER: u16 = Blockchain.nextPointer; // Unique pointer for reservation tokens
export const RESERVATION_TOTAL_RESERVED_POINTER: u16 = Blockchain.nextPointer; // Unique pointer for total reserved
export const RESERVATION_EXPIRATION_BLOCK_POINTER: u16 = Blockchain.nextPointer; // Unique pointer for expiration blocks
