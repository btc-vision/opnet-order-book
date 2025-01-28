import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    Blockchain,
    BytesReader,
    BytesWriter,
    encodePointer,
    MemorySlotPointer,
    Revert,
} from '@btc-vision/btc-runtime/runtime';

const bytes = new Uint8Array(15);
for (let i: i32 = 0; i < 15; i++) {
    bytes[i] = 0xff;
}

//export const MAX_RESERVATION_AMOUNT_PROVIDER = u128.fromBytes(bytes, true);

@final
export class UserLiquidity2 {
    private readonly u256Pointer: u256;
    private readonly liquidityPointer: u256;

    // Internal fields representing the components of UserLiquidity
    private activeFlag: u8 = 0;
    private priorityFlag: u8 = 0;
    private canProvide: u8 = 0;
    private isLiquidityProvider: u8 = 0;
    private isPendingRemoval: u8 = 0;

    private liquidityAmount: u128 = u128.Zero;
    private reservedAmount: u128 = u128.Zero;
    private liquidityProvided: u256 = u256.Zero;

    // Flags to manage state
    private isLoaded: bool = false;
    private isLoadedProvider: bool = false;
    private isChanged: bool = false;
    private liquidityChanged: bool = false;

    constructor(pointer: u16, liquidityPointer: u16, subPointer: MemorySlotPointer) {
        const writer = new BytesWriter(32);
        writer.writeU256(subPointer);

        const buffer: Uint8Array = writer.getBuffer();

        this.u256Pointer = encodePointer(pointer, buffer);
        this.liquidityPointer = encodePointer(liquidityPointer, buffer);
    }

    public get pendingRemoval(): boolean {
        this.ensureValues();
        return this.isPendingRemoval == 1;
    }

    public set pendingRemoval(pending: boolean) {
        this.ensureValues();
        if (this.isPendingRemoval != (pending ? 1 : 0)) {
            this.isPendingRemoval = pending ? 1 : 0;
            this.isChanged = true;
        }
    }

    @inline
    public getActiveFlag(): u8 {
        this.ensureValues();
        return this.activeFlag;
    }

    @inline
    public setActiveFlag(flag: u8): void {
        if (flag !== 0 && flag !== 1) {
            throw new Revert('Invalid active flag value');
        }

        this.ensureValues();
        if (this.activeFlag != flag) {
            this.activeFlag = flag;
            this.isChanged = true;
        }
    }

    @inline
    public getPriorityFlag(): boolean {
        this.ensureValues();
        return this.priorityFlag == 1;
    }

    @inline
    public setPriorityFlag(flag: u8): void {
        if (flag !== 0 && flag !== 1) {
            throw new Revert('Invalid priority flag value');
        }

        this.ensureValues();
        if (this.priorityFlag != flag) {
            this.priorityFlag = flag;
            this.isChanged = true;
        }
    }

    @inline
    public canProvideLiquidity(): boolean {
        this.ensureValues();
        return this.canProvide == 1;
    }

    @inline
    public setCanProvideLiquidity(canProvide: boolean): void {
        this.ensureValues();
        if (this.canProvide != (canProvide ? 1 : 0)) {
            this.canProvide = canProvide ? 1 : 0;
            this.isChanged = true;
        }
    }

    @inline
    public getReservedAmount(): u128 {
        this.ensureValues();
        return this.reservedAmount;
    }

    @inline
    public getLiquidityAmount(): u128 {
        this.ensureValues();
        return this.liquidityAmount;
    }

    @inline
    public setLiquidityAmount(amount: u128): void {
        this.ensureValues();
        if (this.liquidityAmount != amount) {
            this.liquidityAmount = amount;
            this.isChanged = true;
        }
    }

    @inline
    public setReservedAmount(amount: u128): void {
        this.ensureValues();
        if (this.reservedAmount != amount) {
            this.reservedAmount = amount;
            this.isChanged = true;
        }
    }

    public save(): void {
        if (this.isChanged) {
            const packed = this.packValues();
            Blockchain.setStorageAt(this.u256Pointer, packed);
            this.isChanged = false;
        }

        if (this.liquidityChanged) {
            Blockchain.setStorageAt(this.liquidityPointer, this.liquidityProvided);
            this.liquidityChanged = false;
        }
    }

    @inline
    public reset(): void {
        this.activeFlag = 0;
        this.priorityFlag = 0;
        this.canProvide = 0;
        this.liquidityAmount = u128.Zero;
        this.reservedAmount = u128.Zero;
        this.liquidityProvided = u256.Zero;
        this.pendingRemoval = false;
        this.setIsLp(false);
        this.isChanged = true;
    }

    @inline
    public isLp(): boolean {
        this.ensureValues();
        return this.isLiquidityProvider == 1;
    }

    @inline
    public setIsLp(isLp: boolean): void {
        this.ensureValues();
        if (this.isLiquidityProvider != (isLp ? 1 : 0)) {
            this.isLiquidityProvider = isLp ? 1 : 0;
            this.isChanged = true;
        }
    }

    @inline
    public getLiquidityProvided(): u256 {
        this.ensureLoadedLiquidity();
        return this.liquidityProvided;
    }

    @inline
    public setLiquidityProvided(liquidityProvided: u256): void {
        this.ensureLoadedLiquidity();
        if (!u256.eq(this.liquidityProvided, liquidityProvided)) {
            this.liquidityProvided = liquidityProvided;
            this.liquidityChanged = true;
        }
    }

    @inline
    public toString(): string {
        this.ensureValues();
        return `ActiveFlag: ${this.activeFlag}, LiquidityAmount: ${this.liquidityAmount.toString()}, ReservedAmount: ${this.reservedAmount.toString()}`;
    }

    @inline
    public toBytes(): u8[] {
        this.ensureValues();
        const packed = this.packValues();
        return packed.toBytes();
    }

    private ensureLoadedLiquidity(): void {
        if (!this.isLoadedProvider) {
            this.liquidityProvided = Blockchain.getStorageAt(this.liquidityPointer, u256.Zero);
            this.isLoadedProvider = true;
        }
    }

    private ensureValues(): void {
        if (!this.isLoaded) {
            const storedU256: u256 = Blockchain.getStorageAt(this.u256Pointer, u256.Zero);
            const reader = new BytesReader(storedU256.toUint8Array());

            const flag = reader.readU8();

            this.activeFlag = flag & 0b1;
            this.priorityFlag = (flag >> 1) & 0b1;
            this.canProvide = (flag >> 2) & 0b1;
            this.isLiquidityProvider = (flag >> 3) & 0b1;
            this.isPendingRemoval = (flag >> 4) & 0b1;

            // Unpack liquidityAmount (16 bytes, little endian)
            this.liquidityAmount = reader.readU128();

            // Additional 15 bytes are for the reservation amount
            const bytes = new Uint8Array(16);
            for (let i: i32 = 0; i < 15; i++) {
                bytes[i] = reader.readU8();
            }

            this.reservedAmount = u128.fromBytes(bytes, false);

            this.isLoaded = true;
        }
    }

    private packValues(): u256 {
        const writer = new BytesWriter(32);
        const flag: u8 =
            this.activeFlag |
            (this.priorityFlag << 1) |
            (this.canProvide << 2) |
            (this.isLiquidityProvider << 3) |
            (this.isPendingRemoval << 4);

        writer.writeU8(flag);

        // Pack liquidityAmount (16 bytes, little endian)
        writer.writeU128(this.liquidityAmount);

        const bytes = this.reservedAmount.toBytes(false);
        for (let i: i32 = 0; i < 15; i++) {
            writer.writeU8(bytes[i] || 0);
        }

        //bytes[15] = 0;

        //const checksum = u128.fromBytes(bytes, false);
        //if (!u128.eq(checksum, this.reservedAmount)) {
        //    throw new Revert('Precision loss in packing reserved amount');
        //}

        return u256.fromBytes(writer.getBuffer());
    }
}
