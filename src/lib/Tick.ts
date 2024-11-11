import { Revert, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { u256 } from 'as-bignum/assembly';
import { StoredMapU256 } from '../stored/StoredMapU256';
import {
    PROVIDER_ADDRESS_POINTER,
    TICK_LEVEL_POINTER,
    TICK_LIQUIDITY_AMOUNT_POINTER,
    TICK_LIQUIDITY_POINTER,
    TICK_RESERVATION_EXPIRATION_BLOCK_POINTER,
} from './StoredPointers';
import { AdvancedStoredString } from '../stored/AdvancedStoredString';

/**
 * Tick class representing a liquidity position at a specific price level.
 */
@final
export class Tick {
    public tickId: u256;
    public level: u256; // Price level (in satoshis per token)
    public liquidityAmount: u256; // Total tokens available at this price level

    // StoredMap<u256, u256> for provider ID (u256) => amount provided
    public liquidityProviders: StoredMapU256<u256, u256>;

    // For reservations tracking (expires after a certain block number)
    public reservedTicks: StoredMapU256<u256, u256>;

    constructor(tickId: u256, level: u256) {
        this.tickId = tickId;
        this.level = level;
        this.liquidityAmount = u256.Zero;

        // Initialize liquidityProviders with a unique pointer, e.g., tickId as subPointer
        this.liquidityProviders = new StoredMapU256<u256, u256>(TICK_LIQUIDITY_POINTER, tickId);

        // Initialize reservations
        this.reservedTicks = new StoredMapU256(
            TICK_RESERVATION_EXPIRATION_BLOCK_POINTER,
            u256.Zero,
        );
    }

    /**
     * Adds liquidity to this tick.
     * @param providerId - The unique identifier for the liquidity provider (u256).
     * @param amount - The amount of tokens to add as liquidity.
     * @param btcReceiver - The receiver address of bitcoin.
     */
    public addLiquidity(providerId: u256, amount: u256, btcReceiver: string): void {
        const currentAmount = this.liquidityProviders.get(providerId) || u256.Zero;
        const newAmount = SafeMath.add(currentAmount, amount);

        this.liquidityProviders.set(providerId, newAmount);
        this.liquidityAmount = SafeMath.add(this.liquidityAmount, amount);

        const address = new AdvancedStoredString(PROVIDER_ADDRESS_POINTER, providerId);
        address.value = btcReceiver;
    }

    public getAddressOf(providerId: u256): string {
        const address = new AdvancedStoredString(PROVIDER_ADDRESS_POINTER, providerId);
        return address.value;
    }

    /**
     * Removes liquidity from this tick.
     * @param providerId - The unique identifier for the liquidity provider (u256).
     * @param amount - The amount of tokens to remove from liquidity.
     */
    public removeLiquidity(providerId: u256, amount: u256): void {
        const currentAmount = this.liquidityProviders.get(providerId);
        if (!currentAmount || currentAmount.isZero()) {
            throw new Revert('Provider has no liquidity in this tick');
        }

        if (u256.lt(currentAmount, amount)) {
            throw new Revert('Not enough liquidity to remove');
        }

        const newAmount = SafeMath.sub(currentAmount, amount);
        if (newAmount.isZero()) {
            this.liquidityProviders.delete(providerId);
        } else {
            this.liquidityProviders.set(providerId, newAmount);
        }

        this.liquidityAmount = SafeMath.sub(this.liquidityAmount, amount);
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

        storageLevel.set(this.tickId, this.level);
        storageLiquidityAmount.set(this.tickId, this.liquidityAmount);

        // Liquidity providers are saved separately in the StoredMap
    }

    /**
     * Loads the tick data from storage.
     */
    public load(): bool {
        const storageLevel = new StoredMapU256<u256, u256>(TICK_LEVEL_POINTER, this.tickId);

        const level = storageLevel.get(this.tickId);
        if (level === null) {
            // Tick does not exist
            this.level = u256.Zero;
            this.liquidityAmount = u256.Zero;

            return false;
        }

        const storageLiquidityAmount = new StoredMapU256<u256, u256>(
            TICK_LIQUIDITY_AMOUNT_POINTER,
            this.tickId,
        );

        this.level = level;
        this.liquidityAmount = storageLiquidityAmount.get(this.tickId) || u256.Zero;

        return true;
    }

    /**
     * How many people reserved this tick?
     */
    public reservationsCount(): u256 {
        const hasReservations = this.reservedTicks.get(this.tickId);

        return hasReservations || u256.Zero;
    }
}
