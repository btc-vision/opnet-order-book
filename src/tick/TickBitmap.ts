import { u256 } from 'as-bignum/assembly';
import { Address, Blockchain, SafeMath } from '@btc-vision/btc-runtime/runtime';

class Position {
    wordPos: i64;
    bitPos: u8;

    constructor(wordPos: i64, bitPos: u8) {
        this.wordPos = wordPos;
        this.bitPos = bitPos;
    }
}

export class TickBitmap {
    private readonly bitmapBasePointer: u32; // Base pointer (u16)
    private readonly token: Address; // Token address

    constructor(bitmapBasePointer: u16, token: Address) {
        this.bitmapBasePointer = u32(bitmapBasePointer);
        this.token = token;
    }

    // Checks if a tick is initialized
    public isInitialized(tickIndex: i64): bool {
        const position: Position = this.getPosition(tickIndex);
        const wordPos: i64 = position.wordPos;
        const bitPos: u8 = position.bitPos;

        const storagePointer = this.getStoragePointer(wordPos);
        const word = Blockchain.getStorageAt(storagePointer, u256.Zero);

        const mask = SafeMath.shl(u256.One, <u32>bitPos);
        return u256.ne(SafeMath.and(word, mask), u256.Zero);
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
            word = SafeMath.and(word, SafeMath.xor(u256.Max, mask));
        }

        Blockchain.setStorageAt(storagePointer, word);
    }

    // Finds the next initialized tick in the given direction
    public nextInitializedTick(tickIndex: i64, lte: bool): i64 {
        const position: Position = this.getPosition(tickIndex);

        let wordPos: i64 = position.wordPos;
        const bitPos: u8 = position.bitPos;

        let storagePointer = this.getStoragePointer(wordPos);
        let word = Blockchain.getStorageAt(storagePointer, u256.Zero);

        if (lte) {
            // Mask bits above the current bitPos
            const mask: u256 = SafeMath.sub(SafeMath.shl(u256.One, <u32>(bitPos + 1)), u256.One);
            word = SafeMath.and(word, mask);

            while (word.isZero()) {
                wordPos -= 1;
                storagePointer = this.getStoragePointer(wordPos);
                word = Blockchain.getStorageAt(storagePointer, u256.Zero);

                if (word.isZero() && wordPos < -1000000) {
                    throw new Error('No initialized tick found below');
                }
            }

            const msb = this.mostSignificantBit(word);
            return (wordPos << 8) | msb;
        } else {
            // Mask bits below the current bitPos
            const mask: u256 = SafeMath.sub(SafeMath.shl(u256.One, <u32>bitPos), u256.One).not();
            word = SafeMath.and(word, mask);

            while (word.isZero()) {
                wordPos += 1;
                storagePointer = this.getStoragePointer(wordPos);
                word = Blockchain.getStorageAt(storagePointer, u256.Zero);
                if (word.isZero() && wordPos > 1000000) {
                    throw new Error('No initialized tick found above');
                }
            }

            const lsb = this.leastSignificantBit(word);
            return (wordPos << 8) | lsb;
        }
    }

    // Compute the storage pointer using base pointer and subpointer (token + wordPos)
    private getStoragePointer(wordPos: i64): u256 {
        const basePointerU256: u256 = SafeMath.shl(u256.fromU32(this.bitmapBasePointer), 240); // Shift base pointer to the first 16 bits

        // Token address (160 bits)
        const tokenU256 = u256.fromBytes(this.token); // Ensure token address is 160 bits

        // wordPos (up to 80 bits)
        const wordPosU256 = u256.fromI64(wordPos); // Ensure wordPos fits within remaining bits

        // Combine token address and wordPos into subpointer
        const tokenShifted = SafeMath.shl(tokenU256, 80); // Shift token address to the first 80 bits
        const subpointer = SafeMath.or(tokenShifted, wordPosU256); // Combine token address and wordPos

        // Combine base pointer and subpointer
        return SafeMath.or(basePointerU256, subpointer);
    }

    // Gets the word position and bit position for a given tick index
    private getPosition(tickIndex: i64): Position {
        const wordPos = tickIndex >> 8; // Divide by 256
        const bitPos = tickIndex & 0xff; // Modulo 256
        return new Position(wordPos, <u8>bitPos);
    }

    // Helper function to find the most significant bit set
    private mostSignificantBit(word: u256): u8 {
        for (let i: i32 = 255; i >= 0; i--) {
            const mask = SafeMath.shl(u256.One, <u32>i);
            if (!SafeMath.and(word, mask).isZero()) {
                return <u8>i;
            }
        }
        throw new Error('MSB not found');
    }

    // Helper function to find the least significant bit set
    private leastSignificantBit(word: u256): u8 {
        for (let i: u32 = 0; i < 256; i++) {
            const mask = SafeMath.shl(u256.One, i);
            if (!SafeMath.and(word, mask).isZero()) {
                return <u8>i;
            }
        }
        throw new Error('LSB not found');
    }
}
