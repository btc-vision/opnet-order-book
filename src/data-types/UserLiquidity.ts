import { u128, u256 } from 'as-bignum/assembly';
import {
    Blockchain,
    BytesReader,
    BytesWriter,
    encodePointer,
    MemorySlotPointer,
} from '../../../btc-runtime/runtime';

@final
export class UserLiquidity {
    private readonly u256Pointer: u256;

    // Internal fields representing the components of UserLiquidity
    private activeFlag: u8 = 0;
    private pendingReservationsFlag: u8 = 0;
    private liquidityAmount: u128 = u128.Zero;
    private spare: StaticArray<u8> = new StaticArray<u8>(14);

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

    /**
     * @method getActiveFlag
     * @description Retrieves the active position flag.
     * @returns {u8} - The active flag (0 or 1).
     */
    @inline
    public getActiveFlag(): u8 {
        this.ensureValues();
        return this.activeFlag;
    }

    /**
     * @method setActiveFlag
     * @description Sets the active position flag.
     * @param {u8} flag - The active flag value (0 or 1).
     */
    @inline
    public setActiveFlag(flag: u8): void {
        assert(flag == 0 || flag == 1, 'Invalid active flag value');
        this.ensureValues();
        if (this.activeFlag != flag) {
            this.activeFlag = flag;
            this.isChanged = true;
        }
    }

    /**
     * @method getPendingReservationsFlag
     * @description Retrieves the pending reservations flag.
     * @returns {u8} - The pending reservations flag (0 or 1).
     */
    @inline
    public getPendingReservationsFlag(): u8 {
        this.ensureValues();
        return this.pendingReservationsFlag;
    }

    /**
     * @method setPendingReservationsFlag
     * @description Sets the pending reservations flag.
     * @param {u8} flag - The pending reservations flag value (0 or 1).
     */
    @inline
    public setPendingReservationsFlag(flag: u8): void {
        assert(flag == 0 || flag == 1, 'Invalid pending reservations flag value');
        this.ensureValues();
        if (this.pendingReservationsFlag != flag) {
            this.pendingReservationsFlag = flag;
            this.isChanged = true;
        }
    }

    /**
     * @method getLiquidityAmount
     * @description Retrieves the liquidity amount.
     * @returns {u128} - The liquidity amount.
     */
    @inline
    public getLiquidityAmount(): u128 {
        this.ensureValues();
        return this.liquidityAmount;
    }

    /**
     * @method setLiquidityAmount
     * @description Sets the liquidity amount.
     * @param {u128} amount - The liquidity amount to set.
     */
    @inline
    public setLiquidityAmount(amount: u128): void {
        this.ensureValues();
        if (this.liquidityAmount != amount) {
            this.liquidityAmount = amount;
            this.isChanged = true;
        }
    }

    /**
     * @method getSpare
     * @description Retrieves the spare bytes.
     * @returns {StaticArray<u8>} - The 14-byte spare array.
     */
    @inline
    public getSpare(): StaticArray<u8> {
        this.ensureValues();
        return this.spare;
    }

    /**
     * @method setSpare
     * @description Sets the spare bytes.
     * @param {StaticArray<u8>} spareBytes - The 14-byte array to set as spare.
     */
    @inline
    public setSpare(spareBytes: StaticArray<u8>): void {
        assert(spareBytes.length == 14, 'Spare bytes must be exactly 14 bytes');
        this.ensureValues();
        let changed = false;
        for (let i: u8 = 0; i < 14; i++) {
            if (this.spare[i] != spareBytes[i]) {
                this.spare[i] = spareBytes[i];
                changed = true;
            }
        }
        if (changed) {
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
        this.activeFlag = 0;
        this.pendingReservationsFlag = 0;
        this.liquidityAmount = u128.Zero;

        for (let i: u8 = 0; i < 14; i++) {
            this.spare[i] = 0;
        }
        this.isChanged = true;
    }

    /**
     * @method toString
     * @description Returns a string representation of the UserLiquidity.
     * @returns {string} - A string detailing all fields.
     */
    @inline
    public toString(): string {
        this.ensureValues();
        let spareStr = '';
        for (let i: u8 = 0; i < 14; i++) {
            spareStr += this.spare[i].toString(16).padStart(2, '0');
        }
        return `ActiveFlag: ${this.activeFlag}, PendingReservationsFlag: ${this.pendingReservationsFlag}, LiquidityAmount: ${this.liquidityAmount.toString()}, Spare: ${spareStr}`;
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
            const reader = new BytesReader(storedU256.toUint8Array());

            // Unpack activeFlag (1 byte)
            this.activeFlag = reader.readU8();

            // Unpack pendingReservationsFlag (1 byte)
            this.pendingReservationsFlag = reader.readU8();

            // Unpack liquidityAmount (16 bytes, little endian)
            this.liquidityAmount = reader.readU128();

            // Unpack spare (14 bytes)
            for (let i: u8 = 0; i < 14; i++) {
                this.spare[i] = reader.readU8();
            }

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

        // Pack activeFlag (1 byte)
        writer.writeU8(this.activeFlag);

        // Pack pendingReservationsFlag (1 byte)
        writer.writeU8(this.pendingReservationsFlag);

        // Pack liquidityAmount (16 bytes, little endian)
        writer.writeU128(this.liquidityAmount);

        // Pack spare bytes (14 bytes)
        for (let i: u8 = 0; i < 14; i++) {
            writer.writeU8(this.spare[i]);
        }

        return u256.fromBytes(writer.getBuffer());
    }
}
