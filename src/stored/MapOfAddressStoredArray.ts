import { Address } from '@btc-vision/btc-runtime/runtime';
import { StoredArray } from './StoredArray';
import { u256 } from 'as-bignum/assembly';

/**
 * MapOfAddressStoredArray<T> implementation.
 * This class maps each Address to its corresponding StoredArray<T>.
 */
@final
export class MapOfAddressStoredArray<T> {
    private readonly pointer: u16;

    constructor(pointer: u16) {
        this.pointer = pointer;
    }

    /**
     * Retrieves the StoredArray<T> associated with a specific Address.
     * @param address - The Address to retrieve the array for.
     * @returns The StoredArray<T> associated with the Address.
     */
    public get(address: Address): StoredArray<T> {
        const addressUint = u256.fromBytes(address);
        return new StoredArray<T>(this.pointer, addressUint);
    }
}
