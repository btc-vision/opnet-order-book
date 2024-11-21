import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { u256 } from 'as-bignum/assembly';

// Define constants for StoredMap and StoredArray pointers
export const TOTAL_RESERVES_POINTER: u16 = Blockchain.nextPointer;

// Define constants for StoredMap pointers
export const PROVIDER_ADDRESS_POINTER: u16 = Blockchain.nextPointer; // Unique pointer for provider addresses
export const TICK_RESERVED_AMOUNT_POINTER: u16 = Blockchain.nextPointer; // Unique pointer for tick liquidity amounts
export const TICK_LAST_PURGE_BLOCK: u16 = Blockchain.nextPointer; // Unique pointer for last purge block

// Define constants for StoredMap pointers
export const RESERVATION_STARTING_PROVIDERS: u16 = Blockchain.nextPointer; // Unique pointer for reservation ticks
export const RESERVATION_PROVIDERS_POINTER: u16 = Blockchain.nextPointer;
export const RESERVATION_TOTAL_RESERVED_POINTER: u16 = Blockchain.nextPointer; // Unique pointer for total reserved
export const RESERVATION_PROVIDERS_LIST_POINTER: u16 = Blockchain.nextPointer; // Unique pointer for total reserved
export const RESERVATION_NUM_PROVIDERS_POINTER: u16 = Blockchain.nextPointer; // Unique pointer for total reserved
export const RESERVATION_EXPIRATION_BLOCK_POINTER: u16 = Blockchain.nextPointer; // Unique pointer for expiration blocks

export const LIQUIDITY_PROVIDER_RESERVED_AT_BLOCK_CURRENT_COUNT: u16 = Blockchain.nextPointer;
export const LIQUIDITY_PROVIDER_RESERVED_AT_BLOCK_FOR_PROVIDER_ID: u16 = Blockchain.nextPointer;
export const LIQUIDITY_PROVIDER_RESERVED_AT_BLOCK_FOR_PROVIDER_VALUE: u16 = Blockchain.nextPointer;

export const LIQUIDITY_PROVIDER_AVAILABLE: u16 = Blockchain.nextPointer;
export const LIQUIDITY_PROVIDER_RESERVED: u16 = Blockchain.nextPointer;
export const LIQUIDITY_PROVIDER_HEAD_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_PROVIDER_LAST_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_PROVIDER_NEXT: u16 = Blockchain.nextPointer;
export const LIQUIDITY_PROVIDER_PREVIOUS: u16 = Blockchain.nextPointer;

export const TICK_BITMAP_BASE_POINTER: u16 = Blockchain.nextPointer; // Unique pointer for tick bitmaps

export const LIQUIDITY_LIMITATION: u16 = Blockchain.nextPointer;
export const RESERVATION_DURATION: u256 = u256.fromU32(5); // Reservation duration in blocks

export const FEE_CREDITS_POINTER: u16 = Blockchain.nextPointer; // Unique pointer for fee credits
