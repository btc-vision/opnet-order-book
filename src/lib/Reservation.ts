import { u256 } from 'as-bignum/assembly';
import { Address, Blockchain, Revert, SafeMath, StoredU256 } from '@btc-vision/btc-runtime/runtime';
import { StoredMapU256 } from '../stored/StoredMapU256';
import {
    RESERVATION_BUYER_POINTER,
    RESERVATION_EXPIRATION_BLOCK_POINTER,
    RESERVATION_TICKS_POINTER,
    RESERVATION_TOKEN_POINTER,
    RESERVATION_TOTAL_RESERVED_POINTER,
    RESERVED_AMOUNT_INDEX_POINTERS,
} from './StoredPointers';

/**
 * Reservation class representing a buyer's reservation.
 */
@final
export class Reservation {
    public reservationId: u256;
    public buyer: Address;
    public token: Address;
    public totalReserved: u256;
    public expirationBlock: u256;

    // StoredMap<u256, u256> for tickId => amount reserved
    public ticks: StoredMapU256;

    private readonly storageBuyer: StoredMapU256;

    constructor(reservationId: u256, buyer: Address, token: Address, expirationBlock: u256) {
        this.reservationId = reservationId;
        this.buyer = buyer;
        this.token = token;
        this.totalReserved = u256.Zero;
        this.expirationBlock = expirationBlock;

        // Initialize ticks with a unique pointer
        this.ticks = new StoredMapU256(RESERVATION_TICKS_POINTER, reservationId);

        this.storageBuyer = new StoredMapU256(RESERVATION_BUYER_POINTER, reservationId);
    }

    /**
     * Checks if the reservation exists in storage.
     */
    public exist(): bool {
        return !this.storageBuyer.get(this.reservationId).isZero();
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

        const totalReserved = new StoredU256(RESERVED_AMOUNT_INDEX_POINTERS, tickId, u256.Zero);
        totalReserved.value = SafeMath.add(totalReserved.value, u256.One);
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
        const storageToken = new StoredMapU256(RESERVATION_TOKEN_POINTER, this.reservationId);

        const storageTotalReserved = new StoredMapU256(
            RESERVATION_TOTAL_RESERVED_POINTER,
            this.reservationId,
        );

        const storageExpirationBlock = new StoredMapU256(
            RESERVATION_EXPIRATION_BLOCK_POINTER,
            this.reservationId,
        );

        this.storageBuyer.set(this.reservationId, u256.fromBytes(this.buyer));
        storageToken.set(this.reservationId, u256.fromBytes(this.token));
        storageTotalReserved.set(this.reservationId, this.totalReserved);
        storageExpirationBlock.set(this.reservationId, this.expirationBlock);
    }

    /**
     * Deletes the reservation from storage.
     */
    public delete(): void {
        const storageToken = new StoredMapU256(RESERVATION_TOKEN_POINTER, this.reservationId);
        const storageTotalReserved = new StoredMapU256(
            RESERVATION_TOTAL_RESERVED_POINTER,
            this.reservationId,
        );

        const storageExpirationBlock = new StoredMapU256(
            RESERVATION_EXPIRATION_BLOCK_POINTER,
            this.reservationId,
        );

        this.storageBuyer.delete(this.reservationId);
        storageToken.delete(this.reservationId);
        storageTotalReserved.delete(this.reservationId);
        storageExpirationBlock.delete(this.reservationId);
    }

    /**
     * Loads the reservation data from storage.
     */
    public load(): void {
        const buyerValue = this.storageBuyer.get(this.reservationId);
        if (buyerValue.isZero()) {
            throw new Revert(`Reservation ${this.reservationId} not found`);
        }

        const storageToken = new StoredMapU256(RESERVATION_TOKEN_POINTER, this.reservationId);
        const token: u256 = storageToken.get(this.reservationId);
        if (token.isZero()) {
            throw new Revert('Token not found');
        }

        const storageTotalReserved = new StoredMapU256(
            RESERVATION_TOTAL_RESERVED_POINTER,
            this.reservationId,
        );

        const storageExpirationBlock = new StoredMapU256(
            RESERVATION_EXPIRATION_BLOCK_POINTER,
            this.reservationId,
        );

        this.buyer = new Address(buyerValue.toBytes(false));
        this.token = new Address(token.toBytes(false));
        this.totalReserved = storageTotalReserved.get(this.reservationId);
        this.expirationBlock = storageExpirationBlock.get(this.reservationId);
    }

    /**
     * Checks if the reservation has expired.
     */
    public hasExpired(): bool {
        return u256.le(this.expirationBlock, Blockchain.block.number);
    }
}
