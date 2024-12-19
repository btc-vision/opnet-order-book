import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Blockchain,
    BytesWriter,
    encodePointer,
    SafeMath,
    U256_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';

/**
 * StoredMap<K, V> implementation using u256 as keys.
 */
@final
export class StoredMapU64 {
    private readonly pointer: u16;
    private readonly subPointer: u256;

    constructor(pointer: u16, subPointer: u256 = u256.Zero) {
        this.pointer = pointer;
        this.subPointer = subPointer;
    }

    /**
     * Sets the value for a given key.
     * @param key - The key of type K.
     * @param offset
     * @param value - The value of type V.
     */
    public set(key: u256, offset: u8, value: u64): void {
        if (offset > 3) {
            throw new Error('Offset must be between 0 and 3');
        }

        const keyPointer = this.getKeyPointer(key);
        const currentValue = Blockchain.getStorageAt(keyPointer, u256.Zero);

        let result = SafeMath.shl(u256.fromU64(value), offset * 8);
        result = SafeMath.or(currentValue, result);

        Blockchain.setStorageAt(keyPointer, result);
    }

    /**
     * Retrieves the value for a given key.
     * @param key - The key of type K.
     * @param offset
     * @returns The value of type V or null if the key does not exist.
     */
    public get(key: u256, offset: u8): u64 {
        if (offset > 3) {
            throw new Error('Offset must be between 0 and 3');
        }

        const keyPointer = this.getKeyPointer(key);
        const val = Blockchain.getStorageAt(keyPointer, u256.Zero);

        return this.getU64AtOffset(val, offset);
    }

    public getU64AtOffset(value: u256, offset: u8): u64 {
        return u256.shr(value, offset * 8).toU64();
    }

    /**
     * Deletes the value for a given key.
     * @param key - The key of type K.
     */
    public delete(key: u256): void {
        const keyPointer = this.getKeyPointer(key);
        Blockchain.setStorageAt(keyPointer, u256.Zero);
    }

    /**
     * Generates the storage pointer for a given key.
     * @param key - The key of type K.
     * @returns The storage pointer as u256.
     */
    private getKeyPointer(key: u256): u256 {
        const writer = new BytesWriter(U256_BYTE_LENGTH * 2);

        writer.writeU256(this.subPointer);
        writer.writeU256(key);
        return encodePointer(this.pointer, writer.getBuffer());
    }
}
