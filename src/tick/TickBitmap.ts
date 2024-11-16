import { u256 } from 'as-bignum/assembly';
import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
    Potential,
    SafeMath,
} from '@btc-vision/btc-runtime/runtime';
import { TICK_BITMAP_BASE_POINTER } from '../lib/StoredPointers';
import { Tick } from './Tick';
import { sha256 } from '../../../btc-runtime/runtime/env/global';

//const maxBit80Array = new Uint8Array(10);
//maxBit80Array.set([255, 255, 255, 255, 255, 255, 255, 255, 255, 255]);

//const maxBit80 = u256.fromBytes(maxBit80Array);

export class TickBitmap {
    private static readonly bitmapBasePointer: u32 = u32(TICK_BITMAP_BASE_POINTER); // Base pointer for tick bitmaps
    private readonly token: Address; // Token address

    constructor(token: Address) {
        this.token = token;
    }

    // Compute the storage pointer using base pointer and subpointer (token + wordPos)
    public static getStoragePointer(token: Address, pointer: u64): u256 {
        const basePointerU256 = SafeMath.shl(u256.fromU32(this.bitmapBasePointer), 240);
        const tokenU256 = u256.fromBytes(token);
        const wordPosU256 = u256.fromU64(pointer);

        // check for 80bit overflow of value tokenU256
        // if (wordPosU256 > maxBit80) {
        // even if u64
        // throw new Error('Word position is too large');
        // }

        const tokenShifted = SafeMath.shl(tokenU256, 80);
        const subpointer = SafeMath.or(tokenShifted, wordPosU256);

        return SafeMath.or(basePointerU256, subpointer);
    }

    // Finds the next initialized tick in the given direction
    public nextInitializedTick(tickIndex: u64, valueAtLeast: u256, lte: boolean): Potential<Tick> {
        // Compute the initial storage pointer
        const storagePointer = TickBitmap.getStoragePointer(this.token, tickIndex);

        // Attempt to find the next storage pointer with a value greater than zero
        const nextStoragePointer: u256 = Blockchain.getNextPointerGreaterThan(
            storagePointer,
            valueAtLeast,
            lte,
        );

        // mask 80 bits
        // eslint-disable-next-line no-loss-of-precision
        const value: u256 = SafeMath.and(nextStoragePointer, u256.fromU64(0xffffffffffffffff));
        const tickId = this.generateTickId(this.token, value);

        if (nextStoragePointer.isZero()) {
            return null;
        }

        return new Tick(tickId, value, nextStoragePointer);
    }

    /**
     * Generates a unique tick ID based on token address and price level.
     * @param token - The token Address.
     * @param level - The price level as u256.
     * @returns The unique tick ID as u256.
     */
    private generateTickId(token: Address, level: u256): u256 {
        const data = new BytesWriter(ADDRESS_BYTE_LENGTH + 32);
        data.writeAddress(token);
        data.writeU256(level);

        return u256.fromBytes(sha256(data.getBuffer()));
    }
}
