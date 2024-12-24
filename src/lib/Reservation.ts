import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
    StoredBooleanArray,
    StoredU128Array,
    StoredU32Array,
} from '@btc-vision/btc-runtime/runtime';
import {
    RESERVATION_AMOUNTS,
    RESERVATION_ID_POINTER,
    RESERVATION_INDEXES,
    RESERVATION_PRIORITY,
} from './StoredPointers';
import { ripemd160 } from '@btc-vision/btc-runtime/runtime/env/global';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { UserReservation } from '../data-types/UserReservation';
import { LiquidityQueue } from './LiquidityQueue';

export class Reservation {
    public reservedIndexes: StoredU32Array;
    public reservedValues: StoredU128Array;
    public reservedPriority: StoredBooleanArray;

    public reservationId: u128;
    public userReservation: UserReservation;

    public constructor(
        token: Address,
        owner: Address,
        reservationId: Uint8Array = new Uint8Array(0),
    ) {
        if (reservationId.length == 0) {
            reservationId = Reservation.generateId(token, owner);
        }

        const reservation = u128.fromBytes(reservationId, true);
        this.userReservation = new UserReservation(RESERVATION_ID_POINTER, reservation.toU256());
        this.reservationId = reservation;

        this.reservedIndexes = new StoredU32Array(RESERVATION_INDEXES, reservationId, u256.Zero);
        this.reservedValues = new StoredU128Array(RESERVATION_AMOUNTS, reservationId, u256.Zero);
        this.reservedPriority = new StoredBooleanArray(
            RESERVATION_PRIORITY,
            reservationId,
            u256.Zero,
        );
    }

    public get createdAt(): u64 {
        const block: u64 = this.expirationBlock();

        return block - LiquidityQueue.RESERVATION_EXPIRE_AFTER;
    }

    public static load(reservationId: u128): Reservation {
        return new Reservation(Address.dead(), Address.dead(), reservationId.toUint8Array(true));
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
        this.userReservation.save();
        this.reservedIndexes.save();
        this.reservedValues.save();
        this.reservedPriority.save();
    }

    public expired(): bool {
        return Blockchain.block.numberU64 > this.userReservation.getExpirationBlock();
    }

    public setExpirationBlock(block: u64): void {
        this.userReservation.setExpirationBlock(block);
    }

    public isActive(): bool {
        return this.userReservation.getExpirationBlock() > 0;
    }

    //public setStartingIndex(normal: u64, priority: u64): void {
    //    this.userReservation.setStartingIndex(normal, priority);
    //}

    public valid(): bool {
        return !this.expired() && this.reservedIndexes.getLength() > 0;
    }

    public expirationBlock(): u64 {
        return this.userReservation.getExpirationBlock();
    }

    public delete(): void {
        this.reservedIndexes.reset();
        this.reservedValues.reset();
        this.reservedPriority.reset();

        this.userReservation.setExpirationBlock(0);

        this.save();
    }

    public reserveAtIndex(index: u32, amount: u128, priority: boolean): void {
        this.reservedIndexes.push(index);
        this.reservedValues.push(amount);
        this.reservedPriority.push(priority);
    }

    public getReservedPriority(): bool[] {
        return this.reservedPriority.getAll(0, this.reservedPriority.getLength());
    }

    public getReservedIndexes(): u32[] {
        return this.reservedIndexes.getAll(0, this.reservedIndexes.getLength());
    }

    public getReservedValues(): u128[] {
        return this.reservedValues.getAll(0, this.reservedValues.getLength() as u32);
    }
}
