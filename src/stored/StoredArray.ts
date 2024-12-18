import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Blockchain,
    BytesWriter,
    encodePointer,
    SafeMath,
    U16_BYTE_LENGTH,
    U256_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';

/**
 * StoredArray<T> implementation using u256 as elements.
 * This class provides an array-like storage mechanism optimized for gas efficiency.
 */
@final
export class StoredArray<T> {
    private readonly pointer: u16;
    private readonly subPointer: u256;
    private currentIndex: u256 = u256.Zero;

    constructor(pointer: u16, subPointer: u256 = u256.Zero) {
        this.pointer = pointer;
        this.subPointer = subPointer;
    }

    /**
     * Pushes a new value to the array.
     * @param value - The value of type T to be added to the array.
     */
    public push(value: T): void {
        const length = this.getLength();
        const itemPointer = this.getItemPointer(length);

        const serializedValue = this.serialize(value);
        Blockchain.setStorageAt(itemPointer, serializedValue);

        const newLength = SafeMath.add(length, u256.One);
        this.setLength(newLength);
    }

    /**
     * Loads the next element in the array during iteration.
     * @returns The next element of type T or null if the end is reached.
     */
    public loadNext(): T | null {
        const length = this.getLength();

        if (u256.lt(this.currentIndex, length)) {
            const itemPointer = this.getItemPointer(this.currentIndex);
            const value = Blockchain.getStorageAt(itemPointer, u256.Zero);

            this.currentIndex = SafeMath.add(this.currentIndex, u256.One);

            return this.deserialize(value);
        } else {
            // Reset index for future iterations
            this.currentIndex = u256.Zero;
            return null;
        }
    }

    /**
     * Resets the internal iterator index.
     */
    public resetIndex(): void {
        this.currentIndex = u256.Zero;
    }

    /**
     * Generates the storage pointer for a given index.
     * @param index - The index of the element.
     * @returns The storage pointer as u256.
     */
    private getItemPointer(index: u256): u256 {
        const writer = new BytesWriter(U256_BYTE_LENGTH * 2);
        writer.writeU256(this.subPointer);
        writer.writeU256(index);

        return encodePointer(this.pointer, writer.getBuffer());
    }

    /**
     * Retrieves the current length of the array.
     * @returns The length as u256.
     */
    private getLength(): u256 {
        const lengthPointer = this.getLengthPointer();
        return Blockchain.getStorageAt(lengthPointer, u256.Zero);
    }

    /**
     * Sets the new length of the array.
     * @param length - The new length as u256.
     */
    private setLength(length: u256): void {
        const lengthPointer = this.getLengthPointer();
        Blockchain.setStorageAt(lengthPointer, length);
    }

    /**
     * Generates the storage pointer for the array length.
     * @returns The storage pointer as u256.
     */
    private getLengthPointer(): u256 {
        const writer = new BytesWriter(U16_BYTE_LENGTH + U256_BYTE_LENGTH);
        writer.writeU16(this.pointer);
        writer.writeU256(this.subPointer);

        return encodePointer(writer.getBuffer());
    }

    /**
     * Serializes the value to u256.
     * @param value - The value of type T.
     * @returns The serialized value as u256.
     */
    private serialize(value: T): u256 {
        // Assuming T is always u256 in our use case
        return value as unknown as u256;
    }

    /**
     * Deserializes the stored u256 value back to type T.
     * @param value - The stored value as u256.
     * @returns The deserialized value of type T.
     */
    private deserialize(value: u256): T {
        // Assuming T is always u256 in our use case
        return value as unknown as T;
    }
}
