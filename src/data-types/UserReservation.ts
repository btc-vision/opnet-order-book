import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Blockchain,
    BytesReader,
    BytesWriter,
    encodePointer,
    MemorySlotPointer,
} from '@btc-vision/btc-runtime/runtime';
import { LiquidityQueue } from '../lib/Liquidity/LiquidityQueue';

@final
export class UserReservation {
    private readonly u256Pointer: u256;

    private expirationBlock: u64 = 0;
    private priorityIndex: u64 = 0;
    private purgeIndex: u32 = u32.MAX_VALUE;

    private isTimeout: bool = false;
    private reservedLP: bool = false;

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
        const writer = new BytesWriter(32);
        writer.writeU256(subPointer);

        this.u256Pointer = encodePointer(pointer, writer.getBuffer());
    }

    public get reservedForLiquidityPool(): bool {
        this.ensureValues();
        return this.reservedLP;
    }

    public set reservedForLiquidityPool(value: bool) {
        this.ensureValues();

        if (this.reservedLP != value) {
            this.reservedLP = value;
            this.isChanged = true;
        }
    }

    public static getPackDefaultValue(): u256 {
        const bytes = new Uint8Array(32);
        for (let i: i32 = 0; i < 17; i++) {
            bytes[i] = 0x00;
        }

        for (let i: i32 = 17; i < 21; i++) {
            bytes[i] = 0xff;
        }

        for (let i: i32 = 21; i < 32; i++) {
            bytes[i] = 0x00;
        }

        return u256.fromBytes(bytes, true);
    }

    /**
     * @method getExpirationBlock
     * @description Retrieves the expiration block.
     * @returns {u64} - The expiration block.
     */
    @inline
    public getExpirationBlock(): u64 {
        this.ensureValues();

        if (this.expirationBlock < Blockchain.block.numberU64) {
            return 0;
        }

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
            this.isTimeout = false;
            this.isChanged = true;
        }
    }

    /**
     * @method timeout
     * @description Timeout the user.
     * @returns {void} - Timeout the user.
     */
    @inline
    public timeout(): void {
        this.ensureValues();
        this.isTimeout = true;
        this.isChanged = true;
    }

    /**
     * @method getUserTimeoutBlockExpiration
     * @description Retrieves the user timeout if any.
     * @returns {u64} - The user timeout block expiration.
     */
    @inline
    public getUserTimeoutBlockExpiration(): u64 {
        this.ensureValues();
        return this.expirationBlock + LiquidityQueue.TIMEOUT_AFTER_EXPIRATION;
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
     * @method setPurgeIndex
     * @description Set purge index.
     * @returns {void}
     */
    @inline
    public setPurgeIndex(index: u32): void {
        this.ensureValues();
        if (this.purgeIndex != index) {
            this.purgeIndex = index;
            this.isChanged = true;
        }
    }

    /**
     * @method getPurgeIndex
     * @description Get purge index.
     * @returns {u32}
     */
    @inline
    public getPurgeIndex(): u32 {
        this.ensureValues();
        return this.purgeIndex;
    }

    /**
     * @method reset
     * @description Resets all fields to their default values and marks the state as changed.
     */
    @inline
    public reset(isTimeout: boolean): void {
        this.priorityIndex = 0;
        this.reservedLP = false;
        this.purgeIndex = u32.MAX_VALUE;

        if (!isTimeout) {
            this.expirationBlock = 0;
            this.isTimeout = false;
        }

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
        return `ExpirationBlock: ${this.expirationBlock}`;
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

    private unpackFlags(flag: u8): void {
        this.reservedLP = !!(flag & 0b1);
        this.isTimeout = !!(flag & 0b10);
        // (flag >> 1) & 0b1;
    }

    private packFlags(): u8 {
        let flags: u8 = 0;

        if (this.reservedLP) flags |= 0b1;
        if (this.isTimeout) flags |= 0b10;

        return flags;
    }

    /**
     * @private
     * @method ensureValues
     * @description Loads and unpacks the u256 value from storage into the internal fields.
     */
    private ensureValues(): void {
        if (!this.isLoaded) {
            const storedU256: u256 = Blockchain.getStorageAt(
                this.u256Pointer,
                UserReservation.getPackDefaultValue(),
            );

            const reader = new BytesReader(storedU256.toUint8Array(true));

            // Unpack flags (1 byte)
            this.unpackFlags(reader.readU8());

            // Unpack expirationBlock (8 bytes, little endian)
            this.expirationBlock = reader.readU64();

            // Unpack priorityIndex (8 bytes, little endian)
            this.priorityIndex = reader.readU64();

            // Unpack purgeIndex (4 bytes, little endian)
            this.purgeIndex = reader.readU32();

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
        const writer = new BytesWriter(32);

        // Pack flags (1 byte)
        writer.writeU8(this.packFlags());

        // Pack expirationBlock (8 bytes, little endian)
        writer.writeU64(this.expirationBlock);

        // Pack priorityIndex (8 bytes, little endian)
        writer.writeU64(this.priorityIndex);

        // Pack purgeIndex (4 bytes, little endian)
        writer.writeU32(this.purgeIndex);

        return u256.fromBytes(writer.getBuffer(), true);
    }
}
