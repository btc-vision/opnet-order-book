import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
    StoredU128Array,
    StoredU16Array,
} from '@btc-vision/btc-runtime/runtime';
import { RESERVATION_AMOUNTS, RESERVATION_ID_POINTER, RESERVATION_INDEXES } from './StoredPointers';
import { ripemd160 } from '@btc-vision/btc-runtime/runtime/env/global';
import { u128, u256 } from 'as-bignum/assembly';
import { UserReservation } from '../data-types/UserReservation';

export class Reservation {
    public reservedIndexes: StoredU16Array;
    public reservedValues: StoredU128Array;
    public reservationId: u128;

    private userReservation: UserReservation;

    public constructor(
        public readonly token: Address,
        public readonly owner: Address,
    ) {
        const reservationId = Reservation.generateId(token, owner);

        const reservation = u128.fromBytes(reservationId, true);
        this.userReservation = new UserReservation(RESERVATION_ID_POINTER, reservation.toU256());
        this.reservationId = reservation;

        this.reservedIndexes = new StoredU16Array(RESERVATION_INDEXES, reservationId, u256.Zero);
        this.reservedValues = new StoredU128Array(RESERVATION_AMOUNTS, reservationId, u256.Zero);
    }

    public static generateId(token: Address, owner: Address): Uint8Array {
        const writer = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        writer.writeAddress(owner);
        writer.writeAddress(token);

        // only use the first 16 bytes (fit 128 bits)
        // this is a design choice. the odds that two ACTIVE reservations have the same ID is 1 in 2^128
        const hash = ripemd160(writer.getBuffer());

        return hash.slice(0, 16);
    }

    public save(): void {
        Blockchain.log(
            `Reserved ${this.reservedIndexes.getLength()} providers for ${this.reservationId}`,
        );

        this.userReservation.save();
        this.reservedIndexes.save();
        this.reservedValues.save();
    }

    public expired(): bool {
        return Blockchain.block.numberU64 < this.userReservation.getExpirationBlock();
    }

    public setExpirationBlock(block: u64, setStartingIndex: u64): void {
        this.userReservation.setExpirationBlock(block);
        this.userReservation.setStartingIndex(setStartingIndex);
    }

    public valid(): bool {
        return !this.expired() && this.reservedIndexes.getLength() > 0;
    }

    public delete(): void {
        this.reservedIndexes.reset();
        this.reservedValues.reset();

        this.userReservation.setExpirationBlock(0);
        this.userReservation.setStartingIndex(0);
    }

    public reserveAtIndex(index: u16, amount: u128): void {
        this.reservedIndexes.push(index);
        this.reservedValues.push(amount);
    }

    public getReservedIndexes(): u16[] {
        return this.reservedIndexes.getAll(0, this.reservedIndexes.getLength());
    }

    public getReservedValues(): u128[] {
        return this.reservedValues.getAll(0, this.reservedValues.getLength());
    }
}
