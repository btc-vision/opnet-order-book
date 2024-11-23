import { Blockchain } from '@btc-vision/btc-runtime/runtime';

export const TOTAL_RESERVES_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_LIMITATION: u16 = Blockchain.nextPointer;
export const FEE_CREDITS_POINTER: u16 = Blockchain.nextPointer;

export const PROVIDER_LIQUIDITY_POINTER: u16 = Blockchain.nextPointer;
export const PROVIDER_ADDRESS_POINTER: u16 = Blockchain.nextPointer;

export const LIQUIDITY_QUEUE_POINTER: u16 = Blockchain.nextPointer;
export const LIQUIDITY_RESERVED_POINTER: u16 = Blockchain.nextPointer;
