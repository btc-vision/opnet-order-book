import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Blockchain,
    BytesWriter,
    encodePointer,
    U256_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';

/**
 * StoredMap<K, V> implementation using u256 as keys.
 */
@final
export class StoredMapU256 {
    private readonly pointer: u16;
    private readonly subPointer: u256;

    constructor(pointer: u16, subPointer: u256 = u256.Zero) {
        this.pointer = pointer;
        this.subPointer = subPointer;
    }

    /**
     * Sets the value for a given key.
     * @param key - The key of type K.
     * @param value - The value of type V.
     */
    public set(key: u256, value: u256): void {
        const keyPointer = this.getKeyPointer(key);
        Blockchain.setStorageAt(keyPointer, value);
    }

    /**
     * Retrieves the value for a given key.
     * @param key - The key of type K.
     * @returns The value of type V or null if the key does not exist.
     */
    public get(key: u256): u256 {
        const keyPointer = this.getKeyPointer(key);
        return Blockchain.getStorageAt(keyPointer, u256.Zero);
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
