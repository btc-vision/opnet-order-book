import {
    Blockchain,
    BytesWriter,
    Revert,
    SafeMath,
    StoredU256,
    StoredU64,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from 'as-bignum/assembly';
import { StoredMapU256 } from '../stored/StoredMapU256';
import {
    LIQUIDITY_PROVIDER_HEAD_POINTER,
    LIQUIDITY_PROVIDER_LAST_POINTER,
    LIQUIDITY_PROVIDER_RESERVED_AT_BLOCK_CURRENT_COUNT,
    LIQUIDITY_PROVIDER_RESERVED_AT_BLOCK_FOR_PROVIDER_ID,
    LIQUIDITY_PROVIDER_RESERVED_AT_BLOCK_FOR_PROVIDER_VALUE,
    RESERVATION_DURATION_U64,
    TICK_LAST_PURGE_BLOCK,
    TICK_RESERVED_AMOUNT_POINTER,
} from '../lib/StoredPointers';
import { getProvider, Provider } from '../lib/Provider';
import { Reservation } from '../lib/Reservation';

const TICK_LAST_PURGE: u8 = 0;

/**
 * Tick class representing a liquidity position at a specific price level.
 */
@final
export class Tick {
    public static readonly MINIMUM_VALUE_POSITION: u128 = u128.fromU32(1_000);

    public tickId: u256;
    public level: u128; // Price level (in satoshis per token)

    public reservedAmount: u256; // Total tokens reserved at this price level
    private liquidityAmount: u256; // Total tokens available at this price level

    private readonly liquidityProviderHead: StoredU256; // Store the first liquidity provider
    private readonly liquidityProviderLast: StoredU256; // Store the last liquidity provider

    private tickParameters: StoredU64;

    private storageReservedAmount: StoredU256;

    private purgedThisExecutions: bool = false;
    private readonly liquidityPointer: u256;

    constructor(tickId: u256, level: u128, liquidityPointer: u256) {
        this.tickId = tickId;
        this.level = level;

        this.liquidityPointer = liquidityPointer;
        this.liquidityAmount = Blockchain.getStorageAt(liquidityPointer, u256.Zero);

        this.liquidityProviderHead = new StoredU256(
            LIQUIDITY_PROVIDER_HEAD_POINTER,
            tickId,
            u256.Zero,
        );

        this.liquidityProviderLast = new StoredU256(
            LIQUIDITY_PROVIDER_LAST_POINTER,
            tickId,
            u256.Zero,
        );

        const storageReservedAmount = new StoredU256(
            TICK_RESERVED_AMOUNT_POINTER,
            tickId,
            u256.Zero,
        );

        this.storageReservedAmount = storageReservedAmount;
        this.reservedAmount = storageReservedAmount.value;

        // Initialize lastPurgeBlock
        this.tickParameters = new StoredU64(TICK_LAST_PURGE_BLOCK, tickId, u256.Zero);
    }

    /**
     * Adds liquidity to this tick.
     */
    public addLiquidity(providerId: u256, amount: u256, btcReceiver: string): void {
        const providerNode: Provider = getProvider(providerId, this.tickId);

        // Check if the current head is defined or not.
        if (this.liquidityProviderHead.value.isZero()) {
            // If not defined, we set the first provider of the chain.
            this.liquidityProviderHead.value = providerId;
        }

        // If the provider exists, update amount, user keeps his position regarding his liquidity.
        providerNode.amount = SafeMath.add128(providerNode.amount, amount.toU128());
        providerNode.btcReceiver = btcReceiver;

        // Manage the tail of the chain.
        if (
            !this.liquidityProviderLast.value.isZero() &&
            this.liquidityProviderLast.value != providerId
        ) {
            // Set previous
            providerNode.previousProviderId.value = this.liquidityProviderLast.value;

            // Set next
            const previousProvider = getProvider(this.liquidityProviderLast.value, this.tickId);
            previousProvider.nextProviderId.value = providerId;
        }

        this.liquidityProviderLast.value = providerId;
        this.liquidityAmount = SafeMath.add(this.liquidityAmount, amount);

        providerNode.save();

        this.saveLiquidityAmount();
    }

    /**
     * DO NOT USE THIS METHOD WHERE IT IS UNSAFE. CHECKS ARE REQUIRED.
     * @param provider
     */
    public removeLiquidity(provider: Provider): void {
        //Blockchain.log(
        //    [REMOVE] Removing provider ${provider.providerId} from tick ${this.tickId} - ${provider.amount.value} tokens,
        //);

        this.liquidityAmount = SafeMath.sub(this.liquidityAmount, provider.amount.toU256());
        this.saveLiquidityAmount();

        this.reservedAmount = SafeMath.sub(this.reservedAmount, provider.reservedAmount.toU256());

        provider.reservedAmount = u128.Zero;
        provider.amount = u128.Zero;

        const previousProviderId: u256 = provider.previousProviderId.value;
        const nextProviderId: u256 = provider.nextProviderId.value;

        // If the provider is the head of the chain
        if (this.liquidityProviderHead.value == provider.providerId) {
            this.liquidityProviderHead.value = nextProviderId;
        } else if (!previousProviderId.isZero()) {
            const previousProvider = getProvider(previousProviderId, this.tickId);
            previousProvider.nextProviderId.value = nextProviderId;
        }

        // If the provider is the tail of the chain
        if (this.liquidityProviderLast.value == provider.providerId) {
            this.liquidityProviderLast.value = previousProviderId;
        } else if (!nextProviderId.isZero()) {
            const nextProvider = getProvider(nextProviderId, this.tickId);
            nextProvider.previousProviderId.value = previousProviderId;
        }

        provider.nextProviderId.value = u256.Zero;
        provider.previousProviderId.value = u256.Zero;
    }

    /**
     * Returns the next liquidity provider in the linked list.
     * If currentProviderId is zero, it returns the head of the list.
     */
    public getNextLiquidityProvider(currentProviderId: u256): Provider | null {
        if (currentProviderId.isZero()) {
            if (this.liquidityProviderHead.value.isZero()) {
                return null;
            }
            return getProvider(this.liquidityProviderHead.value, this.tickId);
        } else {
            const currentProvider = getProvider(currentProviderId, this.tickId);
            if (currentProvider.nextProviderId.value.isZero()) {
                return null;
            }
            return getProvider(currentProvider.nextProviderId.value, this.tickId);
        }
    }

    /**
     * Returns the available liquidity for new reservations.
     */
    public getAvailableLiquidity(): u256 {
        this.purgeExpiredReservations();

        return SafeMath.sub(this.liquidityAmount, this.reservedAmount);
    }

    /**
     * Returns the total liquidity in this tick.
     */
    public getTotalLiquidity(): u256 {
        return this.liquidityAmount;
    }

    /**
     * Returns the total reserved liquidity in this tick.
     */
    public getReservedLiquidity(): u256 {
        this.purgeExpiredReservations();

        return this.reservedAmount;
    }

    public removeReservationForProvider(provider: Provider, reservedAmount: u128): void {
        provider.reservedAmount = SafeMath.sub128(provider.reservedAmount, reservedAmount);

        this.reservedAmount = SafeMath.sub(this.reservedAmount, reservedAmount.toU256());
    }

    /**
     * Increases the reserved amount in this tick.
     */
    public addReservation(reservation: Reservation, amount: u256, tokenDecimals: u128): u256 {
        // Quick check, gas efficient
        const availableLiquidity = this.getAvailableLiquidity();
        if (u256.gt(amount, availableLiquidity)) {
            throw new Revert('Not enough liquidity left to reserve');
        }

        const countStoredU256 = this.getReservedProviderCountAtBlock(Blockchain.block.numberU64);
        const mapProviders = this.getProviderIdAtBlock(Blockchain.block.numberU64);
        const mapValues = this.getReservedAmountAtBlockForProvider(Blockchain.block.numberU64);

        let amountToReserve: u256 = amount;

        let providerNode = this.getNextLiquidityProvider(u256.Zero);
        while (providerNode && !u256.eq(amountToReserve, u256.Zero)) {
            const availableProviderLiquidity = SafeMath.sub128(
                providerNode.amount,
                providerNode.reservedAmount,
            );
            
            if (!availableProviderLiquidity.isZero()) {
                const satoshisValue: u128 = SafeMath.div128(
                    SafeMath.mul128(availableProviderLiquidity, this.level),
                    tokenDecimals,
                );

                // If the reserve amount is less than the minimum value, burn (dust).
                if (u128.lt(satoshisValue, Tick.MINIMUM_VALUE_POSITION)) {
                    // BURN the remaining tokens.
                    this.burnTokens(providerNode);
                    continue;
                }

                const reserveAmount: u128 = u256.lt(
                    availableProviderLiquidity.toU256(),
                    amountToReserve,
                )
                    ? availableProviderLiquidity
                    : amountToReserve.toU128();

                const reserveAmountSatoshisValue: u128 = SafeMath.div128(
                    SafeMath.mul128(reserveAmount, this.level),
                    tokenDecimals,
                );

                // If the amount of token to reserve is less than the minimum value, skip.
                if (u128.lt(reserveAmountSatoshisValue, Tick.MINIMUM_VALUE_POSITION)) {
                    Blockchain.log(`Skipping reservation of ${reserveAmount} tokens, too small.`);
                    break;
                }

                // Update provider's reserved amount
                providerNode.reservedAmount = SafeMath.add128(
                    providerNode.reservedAmount,
                    reserveAmount,
                );

                const reservedU256 = reserveAmount.toU256();
                this.reservedAmount = SafeMath.add(reservedU256, this.reservedAmount);

                // Update reservation
                reservation.addProviderReservation(providerNode, reservedU256);

                // Decrease remaining amount to reserve
                amountToReserve = SafeMath.sub(amountToReserve, reservedU256);

                // Track reserved amount per provider at expiration block
                const reservedAmount = mapValues.get(providerNode.providerId);
                if (reservedAmount.isZero()) {
                    const count = countStoredU256.value || u256.Zero;
                    mapProviders.set(count, providerNode.providerId);

                    countStoredU256.value = SafeMath.add(count, u256.One);
                    Blockchain.log(
                        `Adding reservation for provider ${providerNode.providerId} - ${countStoredU256.value}`,
                    );
                }

                mapValues.set(providerNode.providerId, SafeMath.add(reservedAmount, reservedU256));

                // Save the provider.
                providerNode.save();
            } else {
                throw new Revert(
                    `This error should never happen. If it does, there is a critical bug.`,
                );
            }

            providerNode = this.getNextLiquidityProvider(providerNode.providerId);
        }

        // Track amount of providers.
        reservation.increaseCounterIndex();

        this.saveLiquidityAmount();
        this.saveReservedAmount();

        return SafeMath.sub(amount, amountToReserve);
    }

    /**
     * Consumes liquidity from this tick and provider.
     */
    public consumeLiquidity(
        provider: Provider,
        consumed: u128,
        reserved: u128,
        tokenDecimals: u128,
        createdAt: u64,
    ): void {
        if (u128.lt(provider.amount, consumed)) {
            throw new Revert('Not enough liquidity left to consume');
        }

        this.removeReservationForProvider(provider, reserved);

        provider.amount = SafeMath.sub128(provider.amount, consumed);
        this.liquidityAmount = SafeMath.sub(this.liquidityAmount, consumed.toU256());

        const providerAvailableLiquidity = provider.amount;
        const value = SafeMath.div128(
            SafeMath.mul128(providerAvailableLiquidity, this.level),
            tokenDecimals,
        );

        if (u128.lt(value, Tick.MINIMUM_VALUE_POSITION)) {
            this.removeLiquidity(provider);
        }

        // To be able to revert the reserved amount
        const mapValues: StoredMapU256 = this.getReservedAmountAtBlockForProvider(createdAt);
        const valueAtExpiration: u256 = mapValues.get(provider.providerId);
        if (valueAtExpiration.isZero()) {
            throw new Revert('No reserved amount found for this provider (consume)');
        }

        mapValues.set(provider.providerId, SafeMath.sub(valueAtExpiration, reserved.toU256()));

        // Save the provider changes.
        provider.save();

        this.saveLiquidityAmount();
        this.saveReservedAmount();
    }

    /**
     * Loads the tick data from storage, including the liquidity provider head.
     */
    public hasLiquidity(): bool {
        return !this.liquidityAmount.isZero();
    }

    public saveReservedAmount(): void {
        this.storageReservedAmount.value = this.reservedAmount;
    }

    public saveLiquidityAmount(): void {
        Blockchain.setStorageAt(this.liquidityPointer, this.liquidityAmount);
    }

    private burnTokens(providerNode: Provider): void {
        this.removeLiquidity(providerNode);
    }

    private getPurgeSubPointer(blockId: u64): u256 {
        const writer = new BytesWriter(32);
        writer.writeU256(this.tickId);
        writer.writeU8At(<u8>(blockId & 0xff), 6); //Overriding the 6th byte with the blockId

        return u256.fromBytes(writer.getBuffer(), false);
    }

    /**
     * Reservation duration should not be greater than 255 blocks.
     * @param blockId
     * @private
     */
    private getProviderIdAtBlock(blockId: u64): StoredMapU256 {
        return new StoredMapU256(
            LIQUIDITY_PROVIDER_RESERVED_AT_BLOCK_FOR_PROVIDER_ID,
            this.getPurgeSubPointer(blockId),
        );
    }

    private getReservedAmountAtBlockForProvider(blockId: u64): StoredMapU256 {
        const pointer = this.getPurgeSubPointer(blockId);

        return new StoredMapU256(LIQUIDITY_PROVIDER_RESERVED_AT_BLOCK_FOR_PROVIDER_VALUE, pointer);
    }

    /**
     * Purges expired reservations by adjusting the reserved amount.
     */
    private purgeExpiredReservations(): void {
        // Prevent multiple purges in the same execution
        if (this.purgedThisExecutions) return;
        this.purgedThisExecutions = true;

        const currentBlock: u64 = Blockchain.block.numberU64;
        const reservationDuration: u64 = RESERVATION_DURATION_U64;

        // Calculate the cutoff block: blocks <= cutoffBlock are expired
        let cutoffBlock: u64;
        if (currentBlock > reservationDuration) {
            cutoffBlock = SafeMath.sub64(currentBlock, reservationDuration);
        } else {
            // If currentBlock < RESERVATION_DURATION, set cutoff to zero
            cutoffBlock = 0;
        }

        // Determine the start block for purging
        let startBlock: u64;
        const lastPurgedBlock: u64 = this.tickParameters.get(TICK_LAST_PURGE);
        if (lastPurgedBlock > 0) {
            // Start from the next block after the last purged block
            startBlock = SafeMath.add64(lastPurgedBlock, 1);
        } else {
            // If no previous purge, start from block 1
            startBlock = 1;
        }

        // If startBlock > cutoffBlock, nothing to purge
        if (startBlock > cutoffBlock) {
            return;
        }

        // Determine the end block: min(startBlock + RESERVATION_DURATION - 1, cutoffBlock)
        const tentativeEndBlock: u64 = SafeMath.add64(
            startBlock,
            SafeMath.sub64(reservationDuration, 1),
        );

        let endBlock: u64;
        if (tentativeEndBlock <= cutoffBlock) {
            endBlock = tentativeEndBlock;
        } else {
            endBlock = cutoffBlock;
        }

        // Calculate the maximum number of blocks to purge in this execution
        const maxBlocksToPurge: u64 = reservationDuration;

        // Initialize purge counter
        let purgedCount: u64 = 0;

        // Initialize blockId to startBlock
        let blockId: u64 = startBlock;

        Blockchain.log(
            `Purging reservations for tick ${this.tickId} from block ${startBlock} to ${endBlock} - ${purgedCount < maxBlocksToPurge},`,
        );

        // Loop to purge blocks from startBlock to endBlock, up to maxBlocksToPurge
        while (blockId < endBlock && purgedCount < maxBlocksToPurge) {
            this.purgeBlock(blockId);
            purgedCount++;
            blockId = SafeMath.add64(blockId, 1);
        }

        // Update lastPurgeBlock to the last purged block
        if (purgedCount > 0) {
            this.tickParameters.set(TICK_LAST_PURGE, SafeMath.sub64(blockId, 1));

            // TODO: Be more efficient with this call.
            this.tickParameters.save();
        }
    }

    private getReservedProviderCountAtBlock(blockId: u64): StoredU256 {
        const pointer: u256 = this.getPurgeSubPointer(blockId);
        return new StoredU256(
            LIQUIDITY_PROVIDER_RESERVED_AT_BLOCK_CURRENT_COUNT,
            pointer,
            u256.Zero,
        );
    }

    private purgeBlock(blockId: u64): void {
        // Load reservations that expired at this block
        const countStoredU256 = this.getReservedProviderCountAtBlock(blockId);
        const count: u32 = countStoredU256.value.toU32();
        if (count == 0) return;

        const mapProviders: StoredMapU256 = this.getProviderIdAtBlock(blockId);
        const mapValues: StoredMapU256 = this.getReservedAmountAtBlockForProvider(blockId);

        Blockchain.log(`Purging ${count} reservations for tick ${this.tickId} at block ${blockId}`);

        for (let i: u32 = 0; i < count; i++) {
            const providerId: u256 = mapProviders.get(u256.fromU32(i));
            if (providerId.isZero()) {
                throw new Revert('Provider ID is zero');
            }

            Blockchain.log(`Purging reservation for provider ${providerId} at block ${blockId}`);

            const reservedTotalU256: u256 = mapValues.get(providerId);
            const provider = getProvider(providerId, this.tickId);

            provider.reservedAmount = SafeMath.sub128(
                provider.reservedAmount,
                reservedTotalU256.toU128(),
            );

            provider.save();

            this.reservedAmount = SafeMath.sub(this.reservedAmount, reservedTotalU256);

            // Clean up the mappings
            mapValues.set(providerId, u256.Zero);
        }

        // Reset count for this block
        countStoredU256.value = u256.Zero;
    }
}
