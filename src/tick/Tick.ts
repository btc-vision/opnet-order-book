import { Blockchain, Revert, SafeMath, StoredU256 } from '@btc-vision/btc-runtime/runtime';
import { u256 } from 'as-bignum/assembly';
import { StoredMapU256 } from '../stored/StoredMapU256';
import {
    LIQUIDITY_PROVIDER_HEAD_POINTER,
    LIQUIDITY_PROVIDER_LAST_POINTER,
    LIQUIDITY_PROVIDER_RESERVED_AT_BLOCK_CURRENT_COUNT,
    LIQUIDITY_PROVIDER_RESERVED_AT_BLOCK_FOR_PROVIDER_ID,
    LIQUIDITY_PROVIDER_RESERVED_AT_BLOCK_FOR_PROVIDER_VALUE,
    RESERVATION_DURATION,
    TICK_LAST_PURGE_BLOCK,
    TICK_RESERVED_AMOUNT_POINTER,
} from '../lib/StoredPointers';
import { Provider } from '../lib/Provider';
import { Reservation } from '../lib/Reservation';

/**
 * Tick class representing a liquidity position at a specific price level.
 */
@final
export class Tick {
    public static readonly MINIMUM_VALUE_POSITION: u256 = u256.fromU32(1_000);

    public tickId: u256;
    public level: u256; // Price level (in satoshis per token)
    public liquidityAmount: u256; // Total tokens available at this price level
    public reservedAmount: u256; // Total tokens reserved at this price level

    private readonly liquidityProviderHead: StoredU256; // Store the first liquidity provider
    private readonly liquidityProviderLast: StoredU256; // Store the last liquidity provider

    private lastPurgeBlock: StoredU256;

    private storageReservedAmount: StoredU256;

    private purgedThisExecutions: bool = false;
    private readonly liquidityPointer: u256;

    constructor(tickId: u256, level: u256, liquidityPointer: u256) {
        this.tickId = tickId;
        this.level = level;

        this.liquidityPointer = liquidityPointer;

        const liquidityAmount = Blockchain.getStorageAt(liquidityPointer, u256.Zero);
        this.liquidityAmount = liquidityAmount || u256.Zero;

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
        this.lastPurgeBlock = new StoredU256(TICK_LAST_PURGE_BLOCK, tickId, u256.Zero);
    }

    /**
     * Adds liquidity to this tick.
     */
    public addLiquidity(providerId: u256, amount: u256, btcReceiver: string): void {
        const providerNode: Provider = new Provider(providerId, this.tickId);

        // Check if the current head is defined or not.
        if (this.liquidityProviderHead.value.isZero()) {
            // If not defined, we set the first provider of the chain.
            this.liquidityProviderHead.value = providerId;
        }

        // If the provider exists, update amount, user keeps his position regarding his liquidity.
        providerNode.amount.value = SafeMath.add(providerNode.amount.value, amount);
        providerNode.btcReceiver = btcReceiver;

        // Manage the tail of the chain.
        if (
            !this.liquidityProviderLast.value.isZero() &&
            this.liquidityProviderLast.value != providerId
        ) {
            // Set previous
            providerNode.previousProviderId.value = this.liquidityProviderLast.value;

            // Set next
            const previousProvider = new Provider(this.liquidityProviderLast.value, this.tickId);

            previousProvider.nextProviderId.value = providerId;
        }

        this.liquidityProviderLast.value = providerId;
        this.liquidityAmount = SafeMath.add(this.liquidityAmount, amount);

        this.saveLiquidityAmount();
    }

    /**
     * DO NOT USE THIS METHOD WHERE IT IS UNSAFE. CHECKS ARE REQUIRED.
     * @param provider
     */
    public removeLiquidity(provider: Provider): void {
        this.liquidityAmount = SafeMath.sub(this.liquidityAmount, provider.amount.value);
        this.reservedAmount = SafeMath.sub(this.reservedAmount, provider.reservedAmount.value);

        provider.reservedAmount.value = u256.Zero;
        provider.amount.value = u256.Zero;

        const previousProviderId: u256 = provider.previousProviderId.value;
        const nextProviderId: u256 = provider.nextProviderId.value;

        // If the provider is the head of the chain
        if (this.liquidityProviderHead.value == provider.providerId) {
            this.liquidityProviderHead.value = nextProviderId;
        } else if (!previousProviderId.isZero()) {
            const previousProvider = new Provider(previousProviderId, this.tickId);
            previousProvider.nextProviderId.value = nextProviderId;
        }

        // If the provider is the tail of the chain
        if (this.liquidityProviderLast.value == provider.providerId) {
            this.liquidityProviderLast.value = previousProviderId;
        } else if (!nextProviderId.isZero()) {
            const nextProvider = new Provider(nextProviderId, this.tickId);
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
            return new Provider(this.liquidityProviderHead.value, this.tickId);
        } else {
            const currentProvider = new Provider(currentProviderId, this.tickId);
            if (currentProvider.nextProviderId.value.isZero()) {
                return null;
            }
            return new Provider(currentProvider.nextProviderId.value, this.tickId);
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
        this.purgeExpiredReservations();

        return this.liquidityAmount;
    }

    /**
     * Returns the total reserved liquidity in this tick.
     */
    public getReservedLiquidity(): u256 {
        this.purgeExpiredReservations();

        return this.reservedAmount;
    }

    public removeReservationForProvider(provider: Provider, reservedAmount: u256): void {
        provider.reservedAmount.value = SafeMath.sub(provider.reservedAmount.value, reservedAmount);

        this.reservedAmount = SafeMath.sub(this.reservedAmount, reservedAmount);
    }

    /**
     * Increases the reserved amount in this tick.
     */
    public addReservation(reservation: Reservation, amount: u256, tokenDecimals: u256): u256 {
        this.purgeExpiredReservations();

        // Quick check, gas efficient
        const availableLiquidity = this.getAvailableLiquidity();
        if (u256.gt(amount, availableLiquidity)) {
            throw new Revert('Not enough liquidity left to reserve');
        }

        const expirationBlock = SafeMath.add(Blockchain.block.number, RESERVATION_DURATION);

        const countStoredU256 = this.getReservedAmountAtBlock(expirationBlock);
        const mapProviders = this.getProviderIdAtBlock(expirationBlock);
        const mapValues = this.getReservedAmountAtBlockForProvider(expirationBlock);

        let amountToReserve: u256 = amount;

        let isFirstProvider: boolean = true;
        let providerNode = this.getNextLiquidityProvider(u256.Zero);
        while (providerNode && !u256.eq(amountToReserve, u256.Zero)) {
            const availableProviderLiquidity = SafeMath.sub(
                providerNode.amount.value,
                providerNode.reservedAmount.value,
            );

            if (!availableProviderLiquidity.isZero()) {
                const satoshisValue: u256 = SafeMath.div(
                    SafeMath.mul(availableProviderLiquidity, this.level),
                    tokenDecimals,
                );

                // If the reserve amount is less than the minimum value, burn (dust).
                if (u256.lt(satoshisValue, Tick.MINIMUM_VALUE_POSITION)) {
                    // BURN the remaining tokens.
                    this.burnTokens(providerNode);
                    continue;
                }

                const reserveAmount: u256 = u256.lt(availableProviderLiquidity, amountToReserve)
                    ? availableProviderLiquidity
                    : amountToReserve;

                const reserveAmountSatoshisValue: u256 = SafeMath.div(
                    SafeMath.mul(reserveAmount, this.level),
                    tokenDecimals,
                );

                // If the amount of token to reserve is less than the minimum value, skip.
                if (u256.lt(reserveAmountSatoshisValue, Tick.MINIMUM_VALUE_POSITION)) {
                    Blockchain.log(`Skipping reservation of ${reserveAmount} tokens, too small.`);
                    break;
                }

                // Update provider's reserved amount
                providerNode.reservedAmount.value = SafeMath.add(
                    providerNode.reservedAmount.value,
                    reserveAmount,
                );

                this.reservedAmount = SafeMath.add(this.reservedAmount, reserveAmount);

                // Update reservation
                reservation.addProviderReservation(providerNode, reserveAmount);

                if (isFirstProvider) {
                    reservation.setReservationStartingTick(this.tickId, providerNode.providerId);
                    isFirstProvider = false;
                }

                // Decrease remaining amount to reserve
                amountToReserve = SafeMath.sub(amountToReserve, reserveAmount);

                // Track reserved amount per provider at expiration block
                const reservedAmount = mapValues.get(providerNode.providerId);
                if (reservedAmount.isZero()) {
                    const count = countStoredU256.value || u256.Zero;
                    mapProviders.set(count, providerNode.providerId);

                    countStoredU256.value = SafeMath.add(count, u256.One);
                }

                mapValues.set(providerNode.providerId, SafeMath.add(reservedAmount, reserveAmount));
            } else {
                throw new Revert(
                    `This error should never happen. If it does, there is a critical bug.`,
                );
            }

            providerNode = this.getNextLiquidityProvider(providerNode.providerId);
        }

        this.saveLiquidityAmount();
        this.saveReservedAmount();

        return SafeMath.sub(amount, amountToReserve);
    }

    /**
     * Consumes liquidity from this tick and provider.
     */
    public consumeLiquidity(
        provider: Provider,
        consumed: u256,
        reserved: u256,
        tokenDecimals: u256,
        expirationBlock: u256,
    ): void {
        if (u256.lt(provider.amount.value, consumed)) {
            throw new Revert('Not enough liquidity left to consume');
        }

        provider.amount.value = SafeMath.sub(provider.amount.value, consumed);
        this.liquidityAmount = SafeMath.sub(this.liquidityAmount, consumed);

        const providerAvailableLiquidity = provider.amount.value;
        const value = SafeMath.div(
            SafeMath.mul(providerAvailableLiquidity, this.level),
            tokenDecimals,
        );

        if (u256.lt(value, Tick.MINIMUM_VALUE_POSITION)) {
            this.removeLiquidity(provider);
        }

        if (!provider.reservedAmount.value.isZero()) {
            provider.reservedAmount.value = SafeMath.sub(provider.reservedAmount.value, reserved);
            this.reservedAmount = SafeMath.sub(this.reservedAmount, reserved);
        }

        const mapValues: StoredMapU256 = this.getReservedAmountAtBlockForProvider(expirationBlock);
        const valueAtExpiration: u256 = mapValues.get(provider.providerId);
        if (valueAtExpiration.isZero()) {
            throw new Revert('No reserved amount found for this provider (consume)');
        }

        mapValues.set(provider.providerId, SafeMath.sub(valueAtExpiration, reserved));
    }

    /**
     * Loads the tick data from storage, including the liquidity provider head.
     */
    public load(): bool {
        return !this.liquidityAmount.isZero();
    }

    public saveReservedAmount(): void {
        this.storageReservedAmount.value = this.reservedAmount;
    }

    public saveLiquidityAmount(): void {
        Blockchain.setStorageAt(this.liquidityPointer, this.liquidityAmount);
    }

    private burnTokens(providerNode: Provider): void {
        Blockchain.log(
            `Burning ${providerNode.amount.value} tokens from provider ${providerNode.providerId}. Liquidity left too small.`,
        );

        this.removeLiquidity(providerNode);
    }

    private getPurgeSubPointer(blockId: u256): u256 {
        // Save some bytes by masking only the first byte of the blockId
        const blockIdMasked = SafeMath.and(blockId, u256.fromU32(0xff));

        // Now we place this masked blockId in the first byte of the provider's subPointer
        return SafeMath.or(SafeMath.shl(blockIdMasked, 248), this.tickId);
    }

    /**
     * Reservation duration should not be greater than 255 blocks.
     * @param blockId
     * @private
     */
    private getProviderIdAtBlock(blockId: u256): StoredMapU256 {
        return new StoredMapU256(
            LIQUIDITY_PROVIDER_RESERVED_AT_BLOCK_FOR_PROVIDER_ID,
            this.getPurgeSubPointer(blockId),
        );
    }

    private getReservedAmountAtBlockForProvider(blockId: u256): StoredMapU256 {
        return new StoredMapU256(
            LIQUIDITY_PROVIDER_RESERVED_AT_BLOCK_FOR_PROVIDER_VALUE,
            this.getPurgeSubPointer(blockId),
        );
    }

    private getReservedAmountAtBlock(blockId: u256): StoredU256 {
        const maskedBlockId = SafeMath.and(blockId, u256.fromU32(0xff));
        const subPointer = SafeMath.or(SafeMath.shl(maskedBlockId, 248), this.tickId);

        return new StoredU256(
            LIQUIDITY_PROVIDER_RESERVED_AT_BLOCK_CURRENT_COUNT,
            subPointer,
            u256.Zero,
        );
    }

    /**
     * Purges expired reservations by adjusting the reserved amount.
     */
    private purgeExpiredReservations(): void {
        if (this.purgedThisExecutions) return; // No need to purge twice in the same execution
        this.purgedThisExecutions = true;

        const startBlock = this.lastPurgeBlock.value;
        const endBlock = SafeMath.sub(Blockchain.block.number, u256.One);

        // Update last purge block to the current block
        this.lastPurgeBlock.value = Blockchain.block.number;

        // If startBlock is greater than endBlock, nothing to purge
        if (u256.gt(startBlock, endBlock)) {
            return;
        }

        for (
            let blockId = startBlock;
            u256.le(blockId, endBlock) && !u256.eq(blockId, Blockchain.block.number);
            blockId = SafeMath.add(blockId, u256.One)
        ) {
            this.purgeBlock(blockId);
        }
    }

    private purgeBlock(blockId: u256): void {
        // Load reservations that expired at this block
        const countStoredU256 = this.getReservedAmountAtBlock(blockId);
        const count: u32 = countStoredU256.value.toU32();
        if (count == 0) return;

        const mapProviders: StoredMapU256 = this.getProviderIdAtBlock(blockId);
        const mapValues: StoredMapU256 = this.getReservedAmountAtBlockForProvider(blockId);
        for (let i: u32 = 0; i < count; i++) {
            const providerId: u256 = mapProviders.get(u256.fromU32(i));
            const reservedTotal: u256 = mapValues.get(providerId);
            const provider = new Provider(providerId, this.tickId);

            Blockchain.log(
                `[PURGE] Provider ${providerId} reserved ${reservedTotal} at block ${blockId}. Purging.`,
            );

            provider.reservedAmount.value = SafeMath.sub(
                provider.reservedAmount.value,
                reservedTotal,
            );

            this.reservedAmount = SafeMath.sub(this.reservedAmount, reservedTotal);

            // Clean up the mappings
            mapValues.set(providerId, u256.Zero);
        }

        // Reset count for this block
        countStoredU256.value = u256.Zero;
    }
}
