import { u128, u256 } from 'as-bignum/assembly';
import { Address, Blockchain, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { TICK_BITMAP_BASE_POINTER } from '../lib/StoredPointers';

class Position {
    wordPos: i64;
    bitPos: u8;

    constructor(wordPos: i64, bitPos: u8) {
        this.wordPos = wordPos;
        this.bitPos = bitPos;
    }
}

export class TickBitmap {
    // Precomputed constants to avoid recomputing
    private static readonly TWO_POW_128: u256 = SafeMath.shl(u256.One, 128);
    private static readonly TWO_POW_64: u256 = SafeMath.shl(u256.One, 64);
    private static readonly TWO_POW_32: u256 = SafeMath.shl(u256.One, 32);
    private static readonly TWO_POW_16: u256 = SafeMath.shl(u256.One, 16);
    private static readonly TWO_POW_8: u256 = SafeMath.shl(u256.One, 8);
    private static readonly TWO_POW_4: u256 = SafeMath.shl(u256.One, 4);
    private static readonly TWO_POW_2: u256 = SafeMath.shl(u256.One, 2);
    private static readonly TWO_POW_1: u256 = SafeMath.shl(u256.One, 1);

    private static readonly U128_MAX: u256 = u256.fromU128(u128.Max);
    private static readonly U64_MAX: u256 = u256.fromU64(u64.MAX_VALUE);
    private static readonly U32_MAX: u256 = u256.fromU32(u32.MAX_VALUE);
    private static readonly U16_MAX: u256 = u256.from(u16.MAX_VALUE);
    private static readonly U8_MAX: u256 = u256.from(u8.MAX_VALUE);

    private static readonly U8_F: u256 = u256.from(0xf);
    private static readonly U8_3: u256 = u256.from(0x3);
    private static readonly U8_1: u256 = u256.from(0x1);

    // eslint-disable-next-line no-loss-of-precision
    private static readonly fromWordPos: u256 = u256.fromU64(0xffffffffffffffffffff);

    private readonly bitmapBasePointer: u32; // Base pointer (u16)
    private readonly token: Address; // Token address

    constructor(token: Address) {
        this.bitmapBasePointer = u32(TICK_BITMAP_BASE_POINTER);
        this.token = token;
    }

    // Sets a tick as initialized or uninitialized
    public flipTick(tickIndex: i64, initialized: bool): void {
        const position: Position = this.getPosition(tickIndex);
        const wordPos: i64 = position.wordPos;
        const bitPos: u8 = position.bitPos;

        const storagePointer = this.getStoragePointer(wordPos);
        let word = Blockchain.getStorageAt(storagePointer, u256.Zero);

        const mask = SafeMath.shl(u256.One, <u32>bitPos);
        if (initialized) {
            word = SafeMath.or(word, mask);
        } else {
            word = SafeMath.and(word, mask.not());
        }

        Blockchain.setStorageAt(storagePointer, word);
    }

    // Finds the next initialized tick in the given direction
    /*public nextInitializedTick(tickIndex: i64, lte: boolean): i64 {
        const position: Position = this.getPosition(tickIndex);
        let wordPos: i64 = position.wordPos;

        // Compute the initial storage pointer
        const storagePointer = this.getStoragePointer(wordPos);
        Blockchain.log(`Finding next tick from ${tickIndex} at ${storagePointer} - ${this.token}`);

        // Attempt to find the next storage pointer with a value greater than zero
        const nextStoragePointer: u256 = Blockchain.getNextPointerGreaterThan(storagePointer, lte);
        if (nextStoragePointer.isZero()) {
            throw new Error('No initialized tick found in the specified direction');
        }

        // Extract the word position from the next storage pointer
        wordPos = this.extractWordPos(nextStoragePointer);

        // Load the word at the next storage pointer
        const word = Blockchain.getStorageAt(nextStoragePointer, u256.Zero);

        if (word.isZero()) {
            throw new Error('No initialized tick found at the storage pointer');
        }

        if (lte) {
            // For lte, we need to find the most significant bit set
            const msb = this.mostSignificantBit(word);
            return (wordPos << 8) | msb;
        } else {
            // For gte, we need to find the least significant bit set
            const lsb = this.leastSignificantBit(word);
            return (wordPos << 8) | lsb;
        }
    }*/

    // Finds the next initialized tick in the given direction
    public nextInitializedTick(tickIndex: i64, lte: bool): i64 {
        const position: Position = this.getPosition(tickIndex);

        let wordPos: i64 = position.wordPos;
        const bitPos: u8 = position.bitPos;

        while (true) {
            const storagePointer = this.getStoragePointer(wordPos);
            let word = Blockchain.getStorageAt(storagePointer, u256.Zero);

            if (word.isZero()) {
                // Move to the next word in the appropriate direction
                wordPos = lte ? wordPos - 1 : wordPos + 1;
                continue;
            }

            if (lte) {
                // Mask bits above the current bitPos
                const mask = SafeMath.shr(u256.Max, 255 - bitPos);
                word = SafeMath.and(word, mask);

                if (word.isZero()) {
                    wordPos -= 1;
                    continue;
                }

                // Find the most significant bit set
                const msb = this.mostSignificantBit(word);
                return (wordPos << 8) | msb;
            } else {
                // Mask bits below the current bitPos
                const mask = SafeMath.shl(u256.Max, bitPos);
                word = SafeMath.and(word, mask);

                if (word.isZero()) {
                    wordPos += 1;
                    continue;
                }

                // Find the least significant bit set
                const lsb = this.leastSignificantBit(word);
                return (wordPos << 8) | lsb;
            }
        }
    }

    // Compute the storage pointer using base pointer and subpointer (token + wordPos)
    private getStoragePointer(wordPos: i64): u256 {
        const basePointerU256 = SafeMath.shl(u256.fromU32(this.bitmapBasePointer), 240);

        const tokenU256 = u256.fromBytes(this.token);

        const wordPosU256 = u256.fromI64(wordPos);

        const tokenShifted = SafeMath.shl(tokenU256, 80);
        const subpointer = SafeMath.or(tokenShifted, wordPosU256);

        return SafeMath.or(basePointerU256, subpointer);
    }

    // Extracts the word position from a storage pointer
    private extractWordPos(storagePointer: u256): i64 {
        // The word position is in the least significant 80 bits of the subpointer
        const wordPosU256 = SafeMath.and(storagePointer, TickBitmap.fromWordPos);
        return wordPosU256.toI64();
    }

    // Gets the word position and bit position for a given tick index
    private getPosition(tickIndex: i64): Position {
        const wordPos = tickIndex >> 8; // Divide by 256
        const bitPos = tickIndex & 0xff; // Modulo 256
        return new Position(wordPos, <u8>bitPos);
    }

    // Efficient method to find the most significant bit set
    private mostSignificantBit(word: u256): u8 {
        if (word.isZero()) {
            throw new Error('MSB not found');
        }

        let msb: u8 = 0;
        let x = word.clone();

        if (u256.ge(x, TickBitmap.TWO_POW_128)) {
            x = SafeMath.shr(x, 128);
            msb += 128;
        }
        if (u256.ge(x, TickBitmap.TWO_POW_64)) {
            x = SafeMath.shr(x, 64);
            msb += 64;
        }
        if (u256.ge(x, TickBitmap.TWO_POW_32)) {
            x = SafeMath.shr(x, 32);
            msb += 32;
        }
        if (u256.ge(x, TickBitmap.TWO_POW_16)) {
            x = SafeMath.shr(x, 16);
            msb += 16;
        }
        if (u256.ge(x, TickBitmap.TWO_POW_8)) {
            x = SafeMath.shr(x, 8);
            msb += 8;
        }
        if (u256.ge(x, TickBitmap.TWO_POW_4)) {
            x = SafeMath.shr(x, 4);
            msb += 4;
        }
        if (u256.ge(x, TickBitmap.TWO_POW_2)) {
            x = SafeMath.shr(x, 2);
            msb += 2;
        }
        if (u256.ge(x, TickBitmap.TWO_POW_1)) {
            msb += 1;
        }

        return msb;
    }

    // Efficient method to find the least significant bit set
    private leastSignificantBit(word: u256): u8 {
        if (word.isZero()) {
            throw new Error('LSB not found');
        }

        let lsb: u8 = 0;
        let x = word.clone();

        if (SafeMath.and(x, TickBitmap.U128_MAX).isZero()) {
            x = SafeMath.shr(x, 128);
            lsb += 128;
        }
        if (SafeMath.and(x, TickBitmap.U64_MAX).isZero()) {
            x = SafeMath.shr(x, 64);
            lsb += 64;
        }
        if (SafeMath.and(x, TickBitmap.U32_MAX).isZero()) {
            x = SafeMath.shr(x, 32);
            lsb += 32;
        }
        if (SafeMath.and(x, TickBitmap.U16_MAX).isZero()) {
            x = SafeMath.shr(x, 16);
            lsb += 16;
        }
        if (SafeMath.and(x, TickBitmap.U8_MAX).isZero()) {
            x = SafeMath.shr(x, 8);
            lsb += 8;
        }
        if (SafeMath.and(x, TickBitmap.U8_F).isZero()) {
            x = SafeMath.shr(x, 4);
            lsb += 4;
        }
        if (SafeMath.and(x, TickBitmap.U8_3).isZero()) {
            x = SafeMath.shr(x, 2);
            lsb += 2;
        }
        if (SafeMath.and(x, TickBitmap.U8_1).isZero()) {
            lsb += 1;
        }

        return lsb;
    }
}
