import { u256 } from 'as-bignum/assembly';
import { Blockchain, SafeMath, StoredU256 } from '@btc-vision/btc-runtime/runtime';
import { StoredMapU256 } from '../stored/StoredMapU256';
import {
    RESERVATION_DURATION,
    RESERVATION_EXPIRATION_BLOCK_POINTER,
    RESERVATION_NUM_PROVIDERS_POINTER,
    RESERVATION_PROVIDERS_LIST_POINTER,
    RESERVATION_PROVIDERS_POINTER,
    RESERVATION_TOTAL_RESERVED_POINTER,
} from './StoredPointers';
import { Provider } from './Provider';
import { Tick } from '../tick/Tick';
import { TickUpdatedEvent } from '../events/TickUpdatedEvent';

/**
 * Reservation class representing a buyer's reservation.
 */
@final
export class Reservation {
    public reservationId: u256;
    public totalReserved: u256;
    public expirationBlock: u256;

    private storageTotalReserved: StoredMapU256;
    private storageExpirationBlock: StoredMapU256;
    private providers: StoredMapU256;

    constructor(reservationId: u256) {
        this.reservationId = reservationId;
        this.totalReserved = u256.Zero;
        this.expirationBlock = u256.Zero;

        this.storageTotalReserved = new StoredMapU256(
            RESERVATION_TOTAL_RESERVED_POINTER,
            reservationId,
        );

        this.storageExpirationBlock = new StoredMapU256(
            RESERVATION_EXPIRATION_BLOCK_POINTER,
            reservationId,
        );

        this.providers = new StoredMapU256(RESERVATION_PROVIDERS_POINTER, reservationId);

        // Removed class properties: providersList, storageNumProviders, numProviders
    }

    public get createdAt(): u256 {
        return u256.gt(this.expirationBlock, RESERVATION_DURATION)
            ? SafeMath.sub(this.expirationBlock, RESERVATION_DURATION)
            : u256.Zero;
    }

    /**
     * Checks if the reservation exists in storage.
     */
    public exist(): bool {
        this.load();

        if (this.hasExpired()) {
            return false;
        }

        return !this.totalReserved.isZero();
    }

    public valid(): bool {
        this.load();

        if (this.totalReserved.isZero()) {
            return false;
        }

        return !this.hasExpired();
    }

    /**
     * Adds a reservation for a specific amount.
     * @param amount - The amount reserved (u256).
     */
    public addReservation(amount: u256): void {
        this.totalReserved = SafeMath.add(this.totalReserved, amount);
    }

    public addProviderReservation(provider: Provider, amount: u256, tickId: u256): void {
        const providerAmount: u256 = this.providers.get(provider.subPointer) || u256.Zero;

        if (providerAmount.isZero()) {
            // Provider not yet added to the reservation for this tick
            const providersList = this.getProvidersList(tickId);
            const numProviders = this.getNumProviders(tickId);

            providersList.set(u256.fromU32(numProviders), provider.providerId);

            // Check for overflow
            if (numProviders >= U32.MAX_VALUE - 1) {
                throw new Error('Maximum number of providers reached');
            }

            const newNumProviders = numProviders + 1;
            this.setNumProviders(tickId, newNumProviders);
        }

        this.providers.set(provider.subPointer, SafeMath.add(providerAmount, amount));
    }

    public fulfillReservation(tick: Tick, tokenDecimals: u256): u256 {
        this.load();

        const tickId = tick.tickId;
        const numProviders = this.getNumProviders(tickId);
        const finalProviderList = this.getFinalProviderList(tickId, numProviders);

        let acquired: u256 = u256.Zero;
        for (let i: u32 = 0; i < numProviders; i++) {
            const providerId: u256 = finalProviderList[i];

            const provider = new Provider(providerId, tickId);
            const reservedAmount: u256 = this.providers.get(provider.subPointer);
            if (reservedAmount.isZero()) {
                throw new Error('Provider has no reservation');
            }

            const consumed: u256 = reservedAmount;
            acquired = SafeMath.add(acquired, consumed);

            // Process the fulfillment
            tick.consumeLiquidity(
                provider,
                consumed,
                reservedAmount,
                tokenDecimals,
                this.createdAt,
            );

            // Remove the reservation for this provider
            this.removeProviderReservation(provider);
        }

        // Emit TickUpdatedEvent for each tick
        const tickUpdatedEvent = new TickUpdatedEvent(
            tickId,
            tick.level,
            tick.getTotalLiquidity(),
            acquired,
        );

        Blockchain.emit(tickUpdatedEvent);

        return acquired;
    }

    public cancelReservation(tick: Tick): void {
        this.load();

        const tickId = tick.tickId;
        const numProviders = this.getNumProviders(tickId);
        const providersList = this.getProvidersList(tickId);

        for (let i: u32 = 0; i < numProviders; i++) {
            const val = u256.fromU32(i);
            const providerId = providersList.get(val);
            const provider = new Provider(providerId, tickId);

            const reservedAmount = this.providers.get(provider.subPointer);
            if (reservedAmount.isZero()) {
                continue;
            }

            // Restore the reserved amount back to provider's available amount
            tick.removeReservationForProvider(provider, reservedAmount);

            // Remove the reservation for this provider
            this.removeProviderReservation(provider);
        }

        // Clear the reservation
        this.delete();
    }

    public removeProviderReservation(provider: Provider): void {
        this.providers.set(provider.subPointer, u256.Zero);
    }

    /**
     * Saves the current state of the reservation to storage.
     */
    public save(): void {
        this.storageTotalReserved.set(this.reservationId, this.totalReserved);
        this.storageExpirationBlock.set(
            this.reservationId,
            SafeMath.add(Blockchain.block.number, RESERVATION_DURATION),
        );
        // No need to save numProviders here; it's saved via setNumProviders
    }

    /**
     * Deletes the reservation from storage.
     */
    public delete(): void {
        this.storageTotalReserved.delete(this.reservationId);
        this.storageExpirationBlock.delete(this.reservationId);
        // Optionally, clear providers and providersList mappings
    }

    /**
     * Loads the reservation data from storage.
     */
    public load(): void {
        this.totalReserved = this.storageTotalReserved.get(this.reservationId) || u256.Zero;
        this.expirationBlock = this.storageExpirationBlock.get(this.reservationId) || u256.Zero;

        if (u256.eq(this.createdAt, Blockchain.block.number) && !this.expirationBlock.isZero()) {
            throw new Error('Reservation not active yet.');
        }
    }

    /**
     * Checks if the reservation has expired.
     */
    public hasExpired(): bool {
        return u256.lt(this.expirationBlock, Blockchain.block.number);
    }

    // Helper method to combine reservationId and tickId into a unique key
    private combineIds(id1: u256, id2: u256): u256 {
        const shiftAmount = 128;
        const shiftedId1 = SafeMath.shl(id1, shiftAmount);
        return u256.add(shiftedId1, id2);
    }

    // Accessor for providersList per tick
    private getProvidersList(tickId: u256): StoredMapU256 {
        const subPointer = this.combineIds(this.reservationId, tickId);
        return new StoredMapU256(RESERVATION_PROVIDERS_LIST_POINTER, subPointer);
    }

    // Accessor for storageNumProviders per tick
    private getStorageNumProviders(tickId: u256): StoredU256 {
        const subPointer = this.combineIds(this.reservationId, tickId);
        return new StoredU256(RESERVATION_NUM_PROVIDERS_POINTER, subPointer, u256.Zero);
    }

    // Accessor for numProviders per tick
    private getNumProviders(tickId: u256): u32 {
        const storageNumProviders = this.getStorageNumProviders(tickId);
        return storageNumProviders.value.toU32();
    }

    // Mutator for numProviders per tick
    private setNumProviders(tickId: u256, numProviders: u32): void {
        const storageNumProviders = this.getStorageNumProviders(tickId);
        storageNumProviders.value = u256.fromU32(numProviders);
    }

    // Accessor for finalProviderList per tick
    private getFinalProviderList(tickId: u256, numProviders: u32): u256[] {
        const providersList = this.getProvidersList(tickId);
        const finalProviderList: u256[] = [];
        for (let i: u32 = 0; i < numProviders; i++) {
            const val = u256.fromU32(i);
            const providerId = providersList.get(val);
            finalProviderList.push(providerId);
        }
        return finalProviderList;
    }
}
