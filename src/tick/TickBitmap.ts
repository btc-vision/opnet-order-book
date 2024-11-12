import { u256 } from 'as-bignum/assembly';
import { Address, Blockchain, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { TICK_BITMAP_BASE_POINTER } from '../lib/StoredPointers';

export class TickBitmap {
    private readonly bitmapBasePointer: u32; // Base pointer (u16)
    private readonly token: Address; // Token address

    constructor(token: Address) {
        this.bitmapBasePointer = u32(TICK_BITMAP_BASE_POINTER);
        this.token = token;
    }

    // Sets a tick as initialized or uninitialized
    public flipTick(tickIndex: u64, initialized: bool): void {
        const storagePointer = this.getStoragePointer(tickIndex);
        if (initialized) {
            Blockchain.setStorageAt(storagePointer, u256.fromI64(tickIndex));
        } else {
            Blockchain.setStorageAt(storagePointer, u256.Zero);
        }
    }

    // Finds the next initialized tick in the given direction
    public nextInitializedTick(tickIndex: u64, lte: boolean, shouldThrow: boolean): u64 {
        // Compute the initial storage pointer
        const storagePointer = this.getStoragePointer(tickIndex);

        // Attempt to find the next storage pointer with a value greater than zero
        const nextStoragePointer: u256 = Blockchain.getNextPointerGreaterThan(storagePointer, lte);
        if (nextStoragePointer.isZero()) {
            throw new Error('No initialized tick found in the specified direction');
        }

        // Load the word at the next storage pointer
        const word = Blockchain.getStorageAt(nextStoragePointer, u256.Zero);
        if (word.isZero() && shouldThrow) {
            throw new Error('No initialized tick found at the storage pointer');
        }

        return word.toU64();
    }

    // Compute the storage pointer using base pointer and subpointer (token + wordPos)
    private getStoragePointer(wordPos: u64): u256 {
        const basePointerU256 = SafeMath.shl(u256.fromU32(this.bitmapBasePointer), 240);
        const tokenU256 = u256.fromBytes(this.token);
        const wordPosU256 = u256.fromU64(wordPos);

        const tokenShifted = SafeMath.shl(tokenU256, 80);
        const subpointer = SafeMath.or(tokenShifted, wordPosU256);

        return SafeMath.or(basePointerU256, subpointer);
    }
}
