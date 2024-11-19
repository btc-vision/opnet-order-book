import { u256 } from 'as-bignum/assembly';
import { Blockchain, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { StoredMapU256 } from '../stored/StoredMapU256';
import {
    RESERVATION_DURATION,
    RESERVATION_EXPIRATION_BLOCK_POINTER,
    RESERVATION_TICKS_POINTER,
    RESERVATION_TOTAL_RESERVED_POINTER,
} from './StoredPointers';

/**
 * Reservation class representing a buyer's reservation.
 */
@final
export class Reservation {
    public reservationId: u256;
    public totalReserved: u256;
    public expirationBlock: u256;

    // StoredMap<u256, u256> for tickId => amount reserved
    public ticks: StoredMapU256;

    private storageTotalReserved: StoredMapU256;
    private storageExpirationBlock: StoredMapU256;

    constructor(reservationId: u256) {
        this.reservationId = reservationId;
        this.totalReserved = u256.Zero;
        this.expirationBlock = u256.Zero;

        // Initialize ticks with a unique pointer
        this.ticks = new StoredMapU256(RESERVATION_TICKS_POINTER, reservationId);

        this.storageTotalReserved = new StoredMapU256(
            RESERVATION_TOTAL_RESERVED_POINTER,
            reservationId,
        );

        this.storageExpirationBlock = new StoredMapU256(
            RESERVATION_EXPIRATION_BLOCK_POINTER,
            reservationId,
        );
    }

    /**
     * Checks if the reservation exists in storage.
     */
    public exist(): bool {
        this.load();

        // hasExpired also act as a check to make sure we prevent any future reservation for 5 blocks if one have been made before
        // This prevent spamming of reservations from the same user, gifting of the same token.

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
     * Adds a reservation for a specific tick.
     * @param tickId - The tick identifier (u256).
     * @param amount - The amount reserved (u256).
     */
    public addReservation(tickId: u256, amount: u256): void {
        const currentAmount = this.ticks.get(tickId) || u256.Zero;
        const newAmount = SafeMath.add(currentAmount, amount);

        this.ticks.set(tickId, newAmount);
        this.totalReserved = SafeMath.add(this.totalReserved, amount);
    }

    /**
     * Gets the reserved amount for a specific tick.
     */
    public getReservedAmountForTick(tickId: u256): u256 {
        return this.ticks.get(tickId) || u256.Zero;
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
    }

    /**
     * Deletes the reservation from storage.
     */
    public delete(): void {
        this.storageTotalReserved.delete(this.reservationId);
    }

    /**
     * Loads the reservation data from storage.
     */
    public load(): void {
        this.totalReserved = this.storageTotalReserved.get(this.reservationId);
        this.expirationBlock = this.storageExpirationBlock.get(this.reservationId);

        if (u256.eq(this.expirationBlock, Blockchain.block.number)) {
            throw new Error('Reservation not active yet.');
        }
    }

    /**
     * Checks if the reservation has expired.
     */
    public hasExpired(): bool {
        return u256.le(this.expirationBlock, Blockchain.block.number);
    }
}
