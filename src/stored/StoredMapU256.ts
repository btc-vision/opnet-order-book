import { Blockchain, BytesWriter, encodePointer } from '@btc-vision/btc-runtime/runtime';
import { u256 } from 'as-bignum/assembly';

/**
 * StoredMap<K, V> implementation using u256 as keys.
 */
@final
export class StoredMapU256<K, V extends u256> {
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
    public set(key: K, value: V): void {
        const keyPointer = this.getKeyPointer(key);
        const serializedValue = this.serialize(value);
        Blockchain.setStorageAt(keyPointer, serializedValue);
    }

    /**
     * Retrieves the value for a given key.
     * @param key - The key of type K.
     * @returns The value of type V or null if the key does not exist.
     */
    public get(key: K): V | null {
        const keyPointer = this.getKeyPointer(key);
        const storedValue = Blockchain.getStorageAt(keyPointer, u256.Zero);

        // If the stored value is zero, assume it doesn't exist
        if (storedValue.isZero()) {
            return null;
        }

        return this.deserialize(storedValue);
    }

    /**
     * Deletes the value for a given key.
     * @param key - The key of type K.
     */
    public delete(key: K): void {
        const keyPointer = this.getKeyPointer(key);
        Blockchain.setStorageAt(keyPointer, u256.Zero);
    }

    /**
     * Generates the storage pointer for a given key.
     * @param key - The key of type K.
     * @returns The storage pointer as u256.
     */
    private getKeyPointer(key: K): u256 {
        const serializedKey = this.serializeKey(key);
        const writer = new BytesWriter(32 + 32 + 2);

        writer.writeU16(this.pointer);
        writer.writeU256(this.subPointer);
        writer.writeU256(serializedKey);
        return encodePointer(writer.getBuffer());
    }

    /**
     * Serializes the key to u256.
     * @param key - The key of type K.
     * @returns The serialized key as u256.
     */
    private serializeKey(key: K): u256 {
        // Assuming K is always u256 in our use case
        return key as unknown as u256;
    }

    /**
     * Serializes the value to u256.
     * @param value - The value of type V.
     * @returns The serialized value as u256.
     */
    private serialize(value: V): u256 {
        // Assuming V is always u256 in our use case
        return value as unknown as u256;
    }

    /**
     * Deserializes the stored u256 value back to type V.
     * @param value - The stored value as u256.
     * @returns The deserialized value of type V.
     */
    private deserialize(value: u256): V {
        // Assuming V is always u256 in our use case
        return value as unknown as V;
    }
}
