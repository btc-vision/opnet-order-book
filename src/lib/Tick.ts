import { Blockchain, BytesWriter, encodePointer, Revert, SafeMath, StoredU256 } from '@btc-vision/btc-runtime/runtime';
import { u256 } from 'as-bignum/assembly';
import { StoredMapU256 } from '../stored/StoredMapU256';
import {
    LIQUIDITY_PROVIDER_HEAD_POINTER,
    RESERVED_AMOUNT_INDEX_POINTERS,
    TICK_LAST_PURGE_BLOCK,
    TICK_LEVEL_POINTER,
    TICK_LIQUIDITY_AMOUNT_POINTER,
    TICK_RESERVED_AMOUNT_POINTER,
} from './StoredPointers';
import { LiquidityProviderNode } from './LiquidityProviderNode';

/**
 * Tick class representing a liquidity position at a specific price level.
 */
@final
export class Tick {
    public tickId: u256;
    public level: u256; // Price level (in satoshis per token)
    public liquidityAmount: u256; // Total tokens available at this price level
    public reservedAmount: u256; // Total tokens reserved at this price level

    private liquidityProviderHead: u256; // Store the providerId of the head

    // Reservation duration in blocks
    private readonly reservationDuration: u32 = 5;

    private lastPurgeBlock: StoredU256;

    private purgedThisExecutions: bool = false;

    constructor(tickId: u256, level: u256) {
        this.tickId = tickId;
        this.level = level;
        this.liquidityAmount = u256.Zero;
        this.reservedAmount = u256.Zero;

        this.liquidityProviderHead = u256.Zero;

        // Initialize liquidityProviders with a unique pointer, e.g., tickId as subPointer
        this.lastPurgeBlock = new StoredU256(TICK_LAST_PURGE_BLOCK, tickId, u256.Zero);
    }

    /**
     * Adds liquidity to this tick.
     */
    public addLiquidity(providerId: u256, amount: u256, btcReceiver: string): void {
        const providerNode: LiquidityProviderNode = new LiquidityProviderNode(providerId);
        if (providerNode.load(this.tickId)) {
            // Provider exists, update amount
            providerNode.amount = SafeMath.add(providerNode.amount, amount);
        } else {
            // New provider, add to the linked list
            providerNode.amount = amount;
            providerNode.btcReceiver = btcReceiver;
            providerNode.nextProviderId = this.liquidityProviderHead;

            // Update the head of the linked list
            this.liquidityProviderHead = providerId;
        }

        // Save the provider node
        providerNode.save(this.tickId);

        // Update the stored head pointer
        const headStorage = new StoredU256(LIQUIDITY_PROVIDER_HEAD_POINTER, this.tickId, u256.Zero);
        headStorage.value = this.liquidityProviderHead;

        this.liquidityAmount = SafeMath.add(this.liquidityAmount, amount);
    }

    public removeLiquidity(providerId: u256, amount: u256): void {
        const providerNode = new LiquidityProviderNode(providerId);
        if (!providerNode.load(this.tickId)) {
            throw new Revert('Provider does not exist in this tick');
        }

        if (u256.gt(amount, providerNode.amount)) {
            throw new Revert('Cannot remove more than provided liquidity');
        }

        providerNode.amount = SafeMath.sub(providerNode.amount, amount);
        if (providerNode.amount.isZero()) {
            // Cost way too much gas to delete the node, so we just set the amount to zero
        } else {
            providerNode.save(this.tickId);
        }

        this.liquidityAmount = SafeMath.sub(this.liquidityAmount, amount);
    }

    public getOwnedLiquidity(providerId: u256): u256 {
        const providerNode = new LiquidityProviderNode(providerId);
        if (!providerNode.load(this.tickId)) {
            return u256.Zero;
        }

        return providerNode.amount;
    }

    /**
     * Returns the next liquidity provider in the linked list.
     * If currentProviderId is zero, it returns the head of the list.
     */
    public getNextLiquidityProvider(currentProviderId: u256): LiquidityProviderNode | null {
        if (currentProviderId.isZero()) {
            if (this.liquidityProviderHead.isZero()) {
                return null;
            }

            const providerNode = new LiquidityProviderNode(this.liquidityProviderHead);
            if (providerNode.load(this.tickId)) {
                return providerNode;
            } else {
                return null;
            }
        }

        const currentProviderNode = new LiquidityProviderNode(currentProviderId);
        if (!currentProviderNode.load(this.tickId)) {
            return null;
        }

        const nextProviderId = currentProviderNode.nextProviderId;
        if (nextProviderId.isZero()) {
            return null;
        }

        const nextProviderNode = new LiquidityProviderNode(nextProviderId);
        if (nextProviderNode.load(this.tickId)) {
            return nextProviderNode;
        } else {
            return null;
        }
    }

    public reservationsCount(): u256 {
        const totalReserved = new StoredU256(
            RESERVED_AMOUNT_INDEX_POINTERS,
            this.tickId,
            u256.Zero,
        );

        return totalReserved.value;
    }

    /**
     * Returns the available liquidity for new reservations.
     */
    public getAvailableLiquidity(autoSave: bool): u256 {
        this.purgeExpiredReservations();

        if (autoSave) {
            this.saveReservedAmount();
        }

        return SafeMath.sub(this.liquidityAmount, this.reservedAmount);
    }

    /**
     * Increases the reserved amount in this tick.
     */
    public addReservation(amount: u256): void {
        this.purgeExpiredReservations();

        const availableLiquidity = this.getAvailableLiquidity(false);
        if (u256.gt(amount, availableLiquidity)) {
            throw new Revert('Not enough liquidity left to reserve');
        }

        // Get the storage for the current block
        const reservedAmountAtCurrentBlock = this.getBlockReservedAmount(Blockchain.block.number);
        const previousAmount = reservedAmountAtCurrentBlock.value;

        // Accumulate the amount at the current block
        reservedAmountAtCurrentBlock.value = SafeMath.add(previousAmount, amount);

        // Increase reservedAmount
        this.reservedAmount = SafeMath.add(this.reservedAmount, amount);
    }

    /**
     * Decreases the reserved amount in this tick.
     */
    public removeReservation(amount: u256): void {
        this.reservedAmount = SafeMath.sub(this.reservedAmount, amount);
        // We don't adjust per-block storage here because the reservation is fulfilled or canceled
    }

    /**
     * Saves the current state of the tick to storage.
     */
    public save(): void {
        const storageLevel = new StoredMapU256<u256, u256>(TICK_LEVEL_POINTER, this.tickId);
        const storageLiquidityAmount = new StoredMapU256<u256, u256>(
            TICK_LIQUIDITY_AMOUNT_POINTER,
            this.tickId,
        );

        const storageReservedAmount = new StoredMapU256<u256, u256>(
            TICK_RESERVED_AMOUNT_POINTER,
            this.tickId,
        );

        const headStorage = new StoredU256(LIQUIDITY_PROVIDER_HEAD_POINTER, this.tickId, u256.Zero);

        storageLevel.set(this.tickId, this.level);
        storageLiquidityAmount.set(this.tickId, this.liquidityAmount);
        storageReservedAmount.set(this.tickId, this.reservedAmount);
        headStorage.value = this.liquidityProviderHead;
    }

    /**
     * Loads the tick data from storage, including the liquidity provider head.
     */
    public load(): bool {
        const storageLevel = new StoredMapU256<u256, u256>(TICK_LEVEL_POINTER, this.tickId);
        const level = storageLevel.get(this.tickId);
        if (level === null) {
            // Tick does not exist
            this.level = u256.Zero;
            this.liquidityAmount = u256.Zero;
            this.reservedAmount = u256.Zero;
            this.liquidityProviderHead = u256.Zero;

            return false;
        }

        const storageLiquidityAmount = new StoredMapU256<u256, u256>(
            TICK_LIQUIDITY_AMOUNT_POINTER,
            this.tickId,
        );

        const storageReservedAmount = new StoredMapU256<u256, u256>(
            TICK_RESERVED_AMOUNT_POINTER,
            this.tickId,
        );

        const headStorage = new StoredU256(LIQUIDITY_PROVIDER_HEAD_POINTER, this.tickId, u256.Zero);

        this.level = level;
        this.liquidityAmount = storageLiquidityAmount.get(this.tickId) || u256.Zero;
        this.reservedAmount = storageReservedAmount.get(this.tickId) || u256.Zero;
        this.liquidityProviderHead = headStorage.value || u256.Zero;

        return true;
    }

    private saveReservedAmount(): void {
        const storageReservedAmount = new StoredMapU256<u256, u256>(
            TICK_RESERVED_AMOUNT_POINTER,
            this.tickId,
        );

        storageReservedAmount.set(this.tickId, this.reservedAmount);
    }

    /**
     * Generates a unique storage pointer for a given block number and tick.
     */
    private tickSubPointerForBlock(block: u256): u256 {
        const writer = new BytesWriter(64);
        writer.writeU256(this.tickId);
        writer.writeU256(block);

        return encodePointer(writer.getBuffer());
    }

    /**
     * Retrieves the StoredU256 for the reserved amount at a given block.
     */
    private getBlockReservedAmount(block: u256): StoredU256 {
        const blockPointer = this.tickSubPointerForBlock(block);

        return new StoredU256(TICK_RESERVED_AMOUNT_POINTER, blockPointer, u256.Zero);
    }

    /**
     * Purges expired reservations by adjusting the reserved amount.
     */
    private purgeExpiredReservations(): void {
        if (this.purgedThisExecutions) return; // No need to purge twice in the same execution
        this.purgedThisExecutions = true;

        // Calculate the maximum block to purge (current block - reservation duration)
        const maxBlockToPurge = SafeMath.sub(
            Blockchain.block.number,
            u256.fromU32(this.reservationDuration),
        );

        // If last purge block is greater than or equal to maxBlockToPurge, nothing to purge
        if (u256.ge(this.lastPurgeBlock.value, maxBlockToPurge)) {
            return; // Nothing to purge
        }

        // Start purging from the block after the last purged block
        const startBlock: u256 = SafeMath.add(this.lastPurgeBlock.value, u256.One);

        // Iterate over blocks to purge
        for (
            let blockId = startBlock;
            u256.le(blockId, maxBlockToPurge);
            blockId = SafeMath.add(blockId, u256.One)
        ) {
            this.purgeBlock(blockId);
        }

        // Update last purge block to the max block purged
        this.lastPurgeBlock.value = maxBlockToPurge;
    }

    private purgeBlock(blockId: u256): void {
        // Retrieve the reserved amount for this block
        const expiredReservedAmount = this.getBlockReservedAmount(blockId);

        const amount = expiredReservedAmount.value;
        if (!amount.isZero()) {
            // Subtract the expired amount from reservedAmount
            this.reservedAmount = SafeMath.sub(this.reservedAmount, amount);

            // Reset the reserved amount at this block
            expiredReservedAmount.value = u256.Zero;
        }
    }
}