import { UserReservation } from '../data-types/UserReservation';
import { RESERVATION_ID_POINTER } from '../lib/StoredPointers';
import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
} from '@btc-vision/btc-runtime/runtime';
import { ripemd160 } from '@btc-vision/btc-runtime/runtime/env/global';
import { u128 } from '@btc-vision/as-bignum/assembly';

const tokenAddress1: Address = new Address([
    229, 26, 76, 180, 38, 124, 121, 223, 102, 39, 240, 138, 176, 156, 20, 68, 31, 90, 205, 152, 6,
    72, 189, 57, 202, 110, 217, 180, 106, 177, 172, 45,
]);
const providerAddress1: Address = new Address([
    68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101, 220, 185,
    192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
]);

function generateReservationId(token: Address, owner: Address): Uint8Array {
    const writer = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
    writer.writeAddress(token);
    writer.writeAddress(owner);
    const hash = ripemd160(writer.getBuffer());
    return hash.slice(0, 16);
}

describe('UserReservation tests', () => {
    beforeEach(() => {
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('reservedForLiquidityPool correctly set', () => {
        const reservationId: Uint8Array = generateReservationId(tokenAddress1, providerAddress1);
        const reservation = u128.fromBytes(reservationId, true);

        const userReservation = new UserReservation(RESERVATION_ID_POINTER, reservation.toU256());
        userReservation.reservedForLiquidityPool = true;

        expect(userReservation.reservedForLiquidityPool).toBeTruthy();
    });

    it('ExpirationBlock correctly set', () => {
        const reservationId: Uint8Array = generateReservationId(tokenAddress1, providerAddress1);
        const reservation = u128.fromBytes(reservationId, true);
        const expirationBlock: u64 = 10;

        const userReservation = new UserReservation(RESERVATION_ID_POINTER, reservation.toU256());
        userReservation.setExpirationBlock(expirationBlock);

        expect(userReservation.getExpirationBlock()).toStrictEqual(expirationBlock);
    });

    it('UserTimeoutBlockExpiration correctly set', () => {
        const reservationId: Uint8Array = generateReservationId(tokenAddress1, providerAddress1);
        const reservation = u128.fromBytes(reservationId, true);
        const userTimeoutBlockExpiration: u64 = 20;

        const userReservation = new UserReservation(RESERVATION_ID_POINTER, reservation.toU256());
        userReservation.setUserTimeoutBlockExpiration(userTimeoutBlockExpiration);

        expect(userReservation.getUserTimeoutBlockExpiration()).toStrictEqual(
            userTimeoutBlockExpiration,
        );
    });
    it('Reset should restore value to default', () => {
        const reservationId: Uint8Array = generateReservationId(tokenAddress1, providerAddress1);
        const reservation = u128.fromBytes(reservationId, true);
        const userTimeoutBlockExpiration: u64 = 20;
        const expirationBlock: u64 = 10;

        const userReservation = new UserReservation(RESERVATION_ID_POINTER, reservation.toU256());
        userReservation.reservedForLiquidityPool = true;
        userReservation.setExpirationBlock(expirationBlock);
        userReservation.setUserTimeoutBlockExpiration(userTimeoutBlockExpiration);

        userReservation.reset();

        expect(userReservation.getUserTimeoutBlockExpiration()).toStrictEqual(
            userTimeoutBlockExpiration,
        );
        expect(userReservation.getExpirationBlock()).toStrictEqual(0);
        expect(userReservation.reservedForLiquidityPool).toBeFalsy();
    });
    it('Save should correctly persists the values', () => {
        const reservationId: Uint8Array = generateReservationId(tokenAddress1, providerAddress1);
        const reservation = u128.fromBytes(reservationId, true);
        const userTimeoutBlockExpiration: u64 = 20;
        const expirationBlock: u64 = 10;

        const userReservation = new UserReservation(RESERVATION_ID_POINTER, reservation.toU256());
        userReservation.reservedForLiquidityPool = true;
        userReservation.setExpirationBlock(expirationBlock);
        userReservation.setUserTimeoutBlockExpiration(userTimeoutBlockExpiration);

        userReservation.save();

        const userReservation2 = new UserReservation(RESERVATION_ID_POINTER, reservation.toU256());

        expect(userReservation2.getUserTimeoutBlockExpiration()).toStrictEqual(
            userTimeoutBlockExpiration,
        );
        expect(userReservation2.getExpirationBlock()).toStrictEqual(expirationBlock);
        expect(userReservation2.reservedForLiquidityPool).toBeTruthy();
    });
});
