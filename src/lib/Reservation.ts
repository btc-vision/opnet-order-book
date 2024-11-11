import { u256 } from 'as-bignum/assembly';
import { Address, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { StoredMapU256 } from '../stored/StoredMapU256';
import {
    RESERVATION_BUYER_POINTER,
    RESERVATION_EXPIRATION_BLOCK_POINTER,
    RESERVATION_TICKS_POINTER,
    RESERVATION_TOKEN_POINTER,
    RESERVATION_TOTAL_RESERVED_POINTER,
    TICK_RESERVATION_EXPIRATION_BLOCK_POINTER,
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

    public ticks: StoredMapU256<u256, u256>;
    public reservedTicks: StoredMapU256<u256, u256>;

    constructor(reservationId: u256, buyer: Address, token: Address, expirationBlock: u256) {
        this.reservationId = reservationId;
        this.buyer = buyer;
        this.token = token;
        this.totalReserved = u256.Zero;
        this.expirationBlock = expirationBlock;

        // Initialize ticks with a unique pointer, e.g., reservationId as subPointer
        this.ticks = new StoredMapU256<u256, u256>(RESERVATION_TICKS_POINTER, reservationId);

        this.reservedTicks = new StoredMapU256(
            TICK_RESERVATION_EXPIRATION_BLOCK_POINTER,
            u256.Zero,
        );
    }

    /**
     * Adds a reservation for a specific tick.
     * @param tickId - The tick identifier (u256).
     * @param amount - The amount reserved (u256).
     */
    public addReservation(tickId: u256, amount: u256): void {
        const currentAmount = this.ticks.get(tickId) || u256.Zero;
        const newAmount = SafeMath.add(currentAmount, amount);

        const currentReserved = this.reservedTicks.get(tickId) || u256.Zero;
        const newReserved = SafeMath.add(currentReserved, u256.Zero);
        this.reservedTicks.set(tickId, newReserved);

        this.ticks.set(tickId, newAmount);
        this.totalReserved = SafeMath.add(this.totalReserved, amount);
    }

    /**
     * Saves the current state of the reservation to storage.
     */
    public save(): void {
        const storageBuyer = new StoredMapU256<u256, u256>(
            RESERVATION_BUYER_POINTER,
            this.reservationId,
        );

        const storageToken = new StoredMapU256<u256, u256>(
            RESERVATION_TOKEN_POINTER,
            this.reservationId,
        );

        const storageTotalReserved = new StoredMapU256<u256, u256>(
            RESERVATION_TOTAL_RESERVED_POINTER,
            this.reservationId,
        );

        const storageExpirationBlock = new StoredMapU256<u256, u256>(
            RESERVATION_EXPIRATION_BLOCK_POINTER,
            this.reservationId,
        );

        storageBuyer.set(this.reservationId, u256.fromBytes(this.buyer));
        storageToken.set(this.reservationId, u256.fromBytes(this.token));

        storageTotalReserved.set(this.reservationId, this.totalReserved);
        storageExpirationBlock.set(this.reservationId, this.expirationBlock);
        // Ticks are saved separately in the StoredMap
    }

    /**
     * Loads the reservation data from storage.
     */
    public load(): void {
        const storageBuyer = new StoredMapU256<u256, u256>(
            RESERVATION_BUYER_POINTER,
            this.reservationId,
        );

        const buyerValue = storageBuyer.get(this.reservationId);
        if (buyerValue === null) {
            throw new Error(`Reservation ${this.reservationId} not found`);
        }

        const storageToken = new StoredMapU256<u256, u256>(
            RESERVATION_TOKEN_POINTER,
            this.reservationId,
        );

        const token = storageToken.get(this.reservationId);
        if (token === null) {
            throw new Error('Token not found');
        }

        const storageTotalReserved = new StoredMapU256<u256, u256>(
            RESERVATION_TOTAL_RESERVED_POINTER,
            this.reservationId,
        );

        const storageExpirationBlock = new StoredMapU256<u256, u256>(
            RESERVATION_EXPIRATION_BLOCK_POINTER,
            this.reservationId,
        );

        this.buyer = new Address(buyerValue.toBytes(false));
        this.token = new Address(token.toBytes(false));

        this.totalReserved = storageTotalReserved.get(this.reservationId) || u256.Zero;
        this.expirationBlock = storageExpirationBlock.get(this.reservationId) || u256.Zero;

        // Ticks are loaded separately from the StoredMap when needed
    }
}
