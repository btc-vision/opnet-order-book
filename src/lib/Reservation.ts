import { u256 } from 'as-bignum/assembly';
import { Blockchain, SafeMath, StoredU256 } from '@btc-vision/btc-runtime/runtime';
import { StoredMapU256 } from '../stored/StoredMapU256';
import {
    RESERVATION_DURATION,
    RESERVATION_EXPIRATION_BLOCK_POINTER,
    RESERVATION_NUM_PROVIDERS_POINTER,
    RESERVATION_PROVIDERS_LIST_POINTER,
    RESERVATION_PROVIDERS_POINTER,
    RESERVATION_STARTING_PROVIDERS,
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

    // StoredMap<u256, u256> for tickId => providerId
    public startingProviders: StoredMapU256;

    private storageTotalReserved: StoredMapU256;
    private storageExpirationBlock: StoredMapU256;
    private providers: StoredMapU256;

    // New fields to track providers involved in the reservation
    private providersList: StoredMapU256;
    private storageNumProviders: StoredU256;
    private numProviders: u256;

    constructor(reservationId: u256) {
        this.reservationId = reservationId;
        this.totalReserved = u256.Zero;
        this.expirationBlock = u256.Zero;

        // Initialize startingProviders with a unique pointer
        this.startingProviders = new StoredMapU256(RESERVATION_STARTING_PROVIDERS, reservationId);

        this.storageTotalReserved = new StoredMapU256(
            RESERVATION_TOTAL_RESERVED_POINTER,
            reservationId,
        );

        this.storageExpirationBlock = new StoredMapU256(
            RESERVATION_EXPIRATION_BLOCK_POINTER,
            reservationId,
        );

        this.providers = new StoredMapU256(RESERVATION_PROVIDERS_POINTER, reservationId);

        // Initialize providersList and numProviders
        this.providersList = new StoredMapU256(RESERVATION_PROVIDERS_LIST_POINTER, reservationId);
        const storageNumProviders = new StoredU256(
            RESERVATION_NUM_PROVIDERS_POINTER,
            reservationId,
            u256.Zero,
        );

        this.storageNumProviders = storageNumProviders;

        this.numProviders = storageNumProviders.value;
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

        // hasExpired also acts as a check to make sure we prevent any future reservation for 5 blocks if one has been made before
        // This prevents spamming of reservations from the same user, gifting of the same token.

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

    public setReservationStartingTick(tickId: u256, providerId: u256): void {
        this.startingProviders.set(tickId, providerId); // set starting provider id
    }

    public addProviderReservation(provider: Provider, amount: u256): void {
        const providerAmount: u256 = this.providers.get(provider.subPointer) || u256.Zero;

        if (providerAmount.isZero()) {
            // Provider not yet added to the reservation
            this.providersList.set(this.numProviders, provider.providerId);
            this.numProviders = SafeMath.add(this.numProviders, u256.One);
        }

        this.providers.set(provider.subPointer, SafeMath.add(providerAmount, amount));
    }

    public fulfillReservation(tick: Tick, tokenDecimals: u256, startingProvider: u256): u256 {
        this.load();

        let acquired: u256 = u256.Zero;

        let foundStartingProvider: bool = false;
        for (let i = u256.Zero; u256.lt(i, this.numProviders); i = SafeMath.add(i, u256.One)) {
            const providerId = this.providersList.get(i);
            if (!foundStartingProvider && providerId == startingProvider) {
                foundStartingProvider = true;
                Blockchain.log(`[WOW] Found starting provider ${providerId}`);
            } else {
                Blockchain.log(
                    `Skipping provider ${providerId} as it is not the starting provider`,
                );
                continue;
            }

            const provider = new Provider(providerId, tick.tickId);
            const reservedAmount: u256 = this.providers.get(provider.subPointer);
            if (reservedAmount.isZero()) {
                continue;
            }

            // TODO: Check UTXOs.
            const consumed: u256 = reservedAmount;
            acquired = SafeMath.add(acquired, consumed);

            // Process the fulfillment (e.g., transfer tokens, update balances)
            tick.consumeLiquidity(
                provider,
                consumed, // Consumed amount
                reservedAmount, // Reserved amount
                tokenDecimals, // Assuming tokenDecimals is 10^8
                this.createdAt,
            );

            // Remove the reservation for this provider
            this.removeProviderReservation(provider);
            //tick.removeReservationForProvider(provider, reservedAmount);

            // Emit TickUpdatedEvent for each tick
            const tickUpdatedEvent = new TickUpdatedEvent(
                tick.tickId,
                tick.level,
                tick.getTotalLiquidity(),
                reservedAmount,
            );

            Blockchain.emit(tickUpdatedEvent);
        }

        // Clear the reservation
        this.delete();

        return acquired;
    }

    public cancelReservation(tick: Tick): void {
        this.load();

        for (let i = u256.Zero; u256.lt(i, this.numProviders); i = SafeMath.add(i, u256.One)) {
            const providerId = this.providersList.get(i);
            const provider = new Provider(providerId, tick.tickId);

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
        this.storageNumProviders.value = this.numProviders;
    }

    /**
     * Deletes the reservation from storage.
     */
    public delete(): void {
        this.storageTotalReserved.delete(this.reservationId);
        this.storageExpirationBlock.delete(this.reservationId);
        this.storageNumProviders.value = u256.Zero;
        // Optionally, clear providers and providersList mappings
    }

    /**
     * Loads the reservation data from storage.
     */
    public load(): void {
        this.totalReserved = this.storageTotalReserved.get(this.reservationId) || u256.Zero;
        this.expirationBlock = this.storageExpirationBlock.get(this.reservationId) || u256.Zero;
        this.numProviders = this.storageNumProviders.value;

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
}
