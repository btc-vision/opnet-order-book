import { UserReservation } from '../data-types/UserReservation';
import { RESERVATION_ID_POINTER } from '../lib/StoredPointers';
import { Blockchain, BytesReader } from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    generateReservationId,
    providerAddress1,
    setBlockchainEnvironment,
    tokenAddress1,
} from './test_helper';

describe('UserReservation tests', () => {
    beforeEach(() => {
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should correctly get/set reservedForLiquidityPool', () => {
        const reservation = generateReservationId(tokenAddress1, providerAddress1);

        const userReservation = new UserReservation(RESERVATION_ID_POINTER, reservation);
        userReservation.reservedForLiquidityPool = true;

        expect(userReservation.reservedForLiquidityPool).toBeTruthy();
    });

    it('should correctly get/set purge index', () => {
        const reservation = generateReservationId(tokenAddress1, providerAddress1);

        const userReservation = new UserReservation(RESERVATION_ID_POINTER, reservation);
        userReservation.setPurgeIndex(10);

        expect(userReservation.getPurgeIndex()).toStrictEqual(10);
    });

    it('should correctly get/set expiration block when greater than current block number', () => {
        setBlockchainEnvironment(1);

        const reservation = generateReservationId(tokenAddress1, providerAddress1);
        const expirationBlock: u64 = 10;

        const userReservation = new UserReservation(RESERVATION_ID_POINTER, reservation);
        userReservation.setExpirationBlock(expirationBlock);

        expect(userReservation.getExpirationBlock()).toStrictEqual(expirationBlock);
    });

    it('should get 0 as expiration block when smaller/equal to current block number', () => {
        setBlockchainEnvironment(10);

        const reservation = generateReservationId(tokenAddress1, providerAddress1);
        const expirationBlock: u64 = 5;

        const userReservation = new UserReservation(RESERVATION_ID_POINTER, reservation);
        userReservation.setExpirationBlock(expirationBlock);

        expect(userReservation.getExpirationBlock()).toStrictEqual(0);
    });

    it('should get expiration block + 5 as UserTimeoutBlockExpiration when expiration block greater than current block number', () => {
        setBlockchainEnvironment(5);

        const reservation = generateReservationId(tokenAddress1, providerAddress1);
        const expirationBlock: u64 = 10;

        const userReservation = new UserReservation(RESERVATION_ID_POINTER, reservation);
        userReservation.setExpirationBlock(expirationBlock);
        userReservation.timeout();

        expect(userReservation.getUserTimeoutBlockExpiration()).toStrictEqual(15);
    });

    it('should get 5 as UserTimeoutBlockExpiration when expiration block smaller/equal to current block number', () => {
        setBlockchainEnvironment(20);

        const reservation = generateReservationId(tokenAddress1, providerAddress1);
        const expirationBlock: u64 = 5;

        const userReservation = new UserReservation(RESERVATION_ID_POINTER, reservation);
        userReservation.setExpirationBlock(expirationBlock);
        userReservation.timeout();

        expect(userReservation.getUserTimeoutBlockExpiration()).toStrictEqual(10);
    });

    it('should restore value to default when calling reset with no timeout', () => {
        setBlockchainEnvironment(5);
        const reservation = generateReservationId(tokenAddress1, providerAddress1);
        const expirationBlock: u64 = 10;
        const purgeIndex: u32 = 11;

        const userReservation = new UserReservation(RESERVATION_ID_POINTER, reservation.toU256());
        userReservation.reservedForLiquidityPool = true;
        userReservation.setExpirationBlock(expirationBlock);
        userReservation.setPurgeIndex(purgeIndex);

        userReservation.reset(false);

        expect(userReservation.getUserTimeoutBlockExpiration()).toStrictEqual(0);
        expect(userReservation.getExpirationBlock()).toStrictEqual(0);
        expect(userReservation.reservedForLiquidityPool).toBeFalsy();
        expect(userReservation.getPurgeIndex()).toStrictEqual(u32.MAX_VALUE);
    });

    it('should restore value to default when calling reset with timeout', () => {
        setBlockchainEnvironment(5);
        const reservation = generateReservationId(tokenAddress1, providerAddress1);
        const expirationBlock: u64 = 10;
        const purgeIndex: u32 = 11;

        const userReservation = new UserReservation(RESERVATION_ID_POINTER, reservation.toU256());
        userReservation.reservedForLiquidityPool = true;
        userReservation.setExpirationBlock(expirationBlock);
        userReservation.setPurgeIndex(purgeIndex);

        userReservation.reset(true);

        expect(userReservation.getUserTimeoutBlockExpiration()).toStrictEqual(0);
        expect(userReservation.getExpirationBlock()).toStrictEqual(expirationBlock);
        expect(userReservation.reservedForLiquidityPool).toBeFalsy();
        expect(userReservation.getPurgeIndex()).toStrictEqual(u32.MAX_VALUE);
    });

    it('should correctly persists the values when saved', () => {
        const reservation = generateReservationId(tokenAddress1, providerAddress1);
        const expirationBlock: u64 = 10;
        const purgeIndex: u32 = 11;

        const userReservation = new UserReservation(RESERVATION_ID_POINTER, reservation.toU256());
        userReservation.reservedForLiquidityPool = true;
        userReservation.setExpirationBlock(expirationBlock);
        userReservation.setPurgeIndex(purgeIndex);

        userReservation.save();

        const userReservation2 = new UserReservation(RESERVATION_ID_POINTER, reservation.toU256());
        expect(userReservation2.getPurgeIndex()).toStrictEqual(purgeIndex);
        expect(userReservation2.getExpirationBlock()).toStrictEqual(expirationBlock);
        expect(userReservation2.reservedForLiquidityPool).toBeTruthy();
    });

    it('should correctly convert flags to byte[] when all true', () => {
        const reservation = generateReservationId(tokenAddress1, providerAddress1);
        const expirationBlock: u64 = 10;
        const purgeIndex: u32 = 11;

        const userReservation = new UserReservation(RESERVATION_ID_POINTER, reservation.toU256());
        userReservation.reservedForLiquidityPool = true;
        userReservation.setExpirationBlock(expirationBlock);
        userReservation.setPurgeIndex(purgeIndex);
        userReservation.timeout();

        const bytes: u8[] = userReservation.toBytes();
        const packed: u256 = u256.fromBytes(bytes);
        const reader = new BytesReader(packed.toUint8Array(true));
        const flags: u8 = reader.readU8();

        const reservedLP: bool = !!(flags & 0b1);
        const isTimeout: bool = !!(flags & 0b10);

        expect(reservedLP).toBeTruthy();
        expect(isTimeout).toBeTruthy();
    });

    it('should correctly convert flags to byte[] when all false', () => {
        const reservation = generateReservationId(tokenAddress1, providerAddress1);
        const expirationBlock: u64 = 10;
        const purgeIndex: u32 = 11;

        const userReservation = new UserReservation(RESERVATION_ID_POINTER, reservation.toU256());
        userReservation.reservedForLiquidityPool = false;
        userReservation.setExpirationBlock(expirationBlock);
        userReservation.setPurgeIndex(purgeIndex);

        const bytes: u8[] = userReservation.toBytes();
        const packed: u256 = u256.fromBytes(bytes);
        const reader = new BytesReader(packed.toUint8Array(true));
        const flags: u8 = reader.readU8();

        const reservedLP: bool = !!(flags & 0b1);
        const isTimeout: bool = !!(flags & 0b10);

        expect(reservedLP).toBeFalsy();
        expect(isTimeout).toBeFalsy();
    });
});
