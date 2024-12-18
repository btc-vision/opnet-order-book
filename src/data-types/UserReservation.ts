import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Blockchain,
    BytesReader,
    BytesWriter,
    encodePointer,
    MemorySlotPointer,
    U256_BYTE_LENGTH,
    U64_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';

@final
export class UserReservation {
    private readonly u256Pointer: u256;

    // Internal fields representing the components of UserReservation
    private expirationBlock: u64 = 0;
    private startingIndex: u64 = 0;

    // Flags to manage state
    private isLoaded: bool = false;
    private isChanged: bool = false;

    /**
     * @constructor
     * @param {u16} pointer - The primary pointer identifier.
     * @param {MemorySlotPointer} subPointer - The sub-pointer for memory slot addressing.
     */
    constructor(
        public pointer: u16,
        public subPointer: MemorySlotPointer,
    ) {
        const writer = new BytesWriter(U256_BYTE_LENGTH);
        writer.writeU256(subPointer);

        this.u256Pointer = encodePointer(pointer, writer.getBuffer());
    }

    /**
     * @method getExpirationBlock
     * @description Retrieves the expiration block.
     * @returns {u64} - The expiration block.
     */
    @inline
    public getExpirationBlock(): u64 {
        this.ensureValues();
        return this.expirationBlock;
    }

    /**
     * @method setExpirationBlock
     * @description Sets the expiration block.
     * @param {u64} block - The expiration block to set.
     */
    @inline
    public setExpirationBlock(block: u64): void {
        this.ensureValues();
        if (this.expirationBlock != block) {
            this.expirationBlock = block;
            this.isChanged = true;
        }
    }

    /**
     * @method getStartingIndex
     * @description Retrieves the starting index.
     * @returns {u64} - The starting index.
     */
    @inline
    public getStartingIndex(): u64 {
        this.ensureValues();
        return this.startingIndex;
    }

    /**
     * @method setStartingIndex
     * @description Sets the starting index.
     * @param {u64} index - The starting index to set.
     */
    @inline
    public setStartingIndex(index: u64): void {
        this.ensureValues();
        if (this.startingIndex != index) {
            this.startingIndex = index;
            this.isChanged = true;
        }
    }

    /**
     * @method save
     * @description Persists the cached values to storage if any have been modified.
     */
    public save(): void {
        if (this.isChanged) {
            const packed = this.packValues();
            Blockchain.setStorageAt(this.u256Pointer, packed);
            this.isChanged = false;
        }
    }

    /**
     * @method reset
     * @description Resets all fields to their default values and marks the state as changed.
     */
    @inline
    public reset(): void {
        this.expirationBlock = 0;
        this.startingIndex = 0;
        this.isChanged = true;
    }

    /**
     * @method toString
     * @description Returns a string representation of the UserReservation.
     * @returns {string} - A string detailing all fields.
     */
    @inline
    public toString(): string {
        this.ensureValues();
        return `ExpirationBlock: ${this.expirationBlock}, StartingIndex: ${this.startingIndex}`;
    }

    /**
     * @method toBytes
     * @description Returns the packed u256 value as a byte array.
     * @returns {u8[]} - The packed u256 value in byte form.
     */
    @inline
    public toBytes(): u8[] {
        this.ensureValues();
        const packed = this.packValues();
        return packed.toBytes();
    }

    /**
     * @private
     * @method ensureValues
     * @description Loads and unpacks the u256 value from storage into the internal fields.
     */
    private ensureValues(): void {
        if (!this.isLoaded) {
            const storedU256: u256 = Blockchain.getStorageAt(this.u256Pointer, u256.Zero);
            const reader = new BytesReader(storedU256.toUint8Array(true));

            // Unpack expirationBlock (8 bytes, little endian)
            this.expirationBlock = reader.readU64();

            // Unpack startingIndex (8 bytes, little endian)
            this.startingIndex = reader.readU64();

            // Skip remaining bytes (if any)
            this.isLoaded = true;
        }
    }

    /**
     * @private
     * @method packValues
     * @description Packs the internal fields into a single u256 value for storage.
     * @returns {u256} - The packed u256 value.
     */
    private packValues(): u256 {
        const writer = new BytesWriter(U64_BYTE_LENGTH * 2);

        // Pack expirationBlock (8 bytes, little endian)
        writer.writeU64(this.expirationBlock);

        // Pack startingIndex (8 bytes, little endian)
        writer.writeU64(this.startingIndex);

        return u256.fromBytes(writer.getBuffer(), true);
    }
}
