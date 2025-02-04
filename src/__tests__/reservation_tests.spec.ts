import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { clearCachedProviders } from '../lib/Provider';
import { u128 } from '@btc-vision/as-bignum/assembly';
import {
    LIQUIDITY_REMOVAL_TYPE,
    NORMAL_TYPE,
    PRIORITY_TYPE,
    Reservation,
} from '../lib/Reservation';

import {
    createReservationId,
    providerAddress1,
    setBlockchainEnvironment,
    tokenAddress1,
} from './test_helper';

describe('Reservation tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should create a new reservation and initialize correctly', () => {
        setBlockchainEnvironment(1);

        const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);
        const reservationId = u128.fromBytes(
            Reservation.generateId(tokenAddress1, providerAddress1),
            true,
        );

        expect(reservation.reservedIndexes.getLength()).toStrictEqual(0);
        expect(reservation.reservedValues.getLength()).toStrictEqual(0);
        expect(reservation.reservedPriority.getLength()).toStrictEqual(0);
        expect(reservation.reservedLP).toBeFalsy();
        expect(reservation.expirationBlock()).toStrictEqual(0);
        expect(reservation.userTimeoutBlockExpiration).toStrictEqual(0);
        expect(reservation.getPurgeIndex()).toStrictEqual(u32.MAX_VALUE);
        expect(reservation.reservationId).toStrictEqual(reservationId);
    });

    it('should correctly get/set expiration block when greater than current block number', () => {
        setBlockchainEnvironment(1);

        const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(10);

        expect(reservation.expirationBlock()).toStrictEqual(10);
    });

    it('should get 0 as expiration block when smaller/equal to current block number', () => {
        setBlockchainEnvironment(10);

        const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(10);

        expect(reservation.expirationBlock()).toStrictEqual(10);

        setBlockchainEnvironment(10);

        const reservation2: Reservation = new Reservation(tokenAddress1, providerAddress1);

        reservation2.setExpirationBlock(9);

        expect(reservation2.expirationBlock()).toStrictEqual(0);
    });

    it('should correctly return the createdAt block', () => {
        setBlockchainEnvironment(1);
        const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(10);

        expect(reservation.createdAt).toStrictEqual(5);
    });

    it('should correctly set the purge index', () => {
        setBlockchainEnvironment(1);
        const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

        reservation.setPurgeIndex(10);

        expect(reservation.getPurgeIndex()).toStrictEqual(10);
    });

    it('should correctly return the getUserTimeoutBlockExpiration block when timedout', () => {
        setBlockchainEnvironment(1);
        const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(10);
        reservation.timeout();
        expect(reservation.userTimeoutBlockExpiration).toStrictEqual(15);
    });

    it('should return 0 as the getUserTimeoutBlockExpiration block when not timedout', () => {
        setBlockchainEnvironment(1);
        const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(10);

        expect(reservation.userTimeoutBlockExpiration).toStrictEqual(0);
    });

    it('should correctly set the reservedLP state', () => {
        setBlockchainEnvironment(1);

        const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

        reservation.reservedLP = true;

        expect(reservation.reservedLP).toBeTruthy();

        reservation.reservedLP = false;

        expect(reservation.reservedLP).toBeFalsy();
    });

    it('should return an empty reservation when loading a non existing reservationId', () => {
        setBlockchainEnvironment(1);

        const reservationId = createReservationId(tokenAddress1, providerAddress1);
        const reservation: Reservation = Reservation.load(reservationId);

        expect(reservation.reservedIndexes.getLength()).toStrictEqual(0);
        expect(reservation.reservedValues.getLength()).toStrictEqual(0);
        expect(reservation.reservedPriority.getLength()).toStrictEqual(0);
        expect(reservation.reservedLP).toBeFalsy();
        expect(reservation.expirationBlock()).toStrictEqual(0);
        expect(reservation.userTimeoutBlockExpiration).toStrictEqual(0);
        expect(reservation.getPurgeIndex()).toStrictEqual(u32.MAX_VALUE);
        expect(reservation.reservationId).toStrictEqual(reservationId);
    });

    it('should correctly load a reservation when loading an existing reservationId', () => {
        setBlockchainEnvironment(3);

        const reservationId: u128 = createReservationId(tokenAddress1, providerAddress1);
        const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

        expect(reservation.reservationId).toStrictEqual(reservationId);

        const amount1: u128 = u128.fromU64(1000);
        const amount2: u128 = u128.fromU64(2000);
        const amount3: u128 = u128.fromU64(3000);
        const expirationBlock: u64 = 10;
        const reservedLP: bool = true;
        const purgeIndex: u32 = 10;

        reservation.setExpirationBlock(expirationBlock);
        reservation.reservedLP = reservedLP;
        reservation.setPurgeIndex(purgeIndex);
        reservation.reserveAtIndex(1, amount1, LIQUIDITY_REMOVAL_TYPE);
        reservation.reserveAtIndex(2, amount2, PRIORITY_TYPE);
        reservation.reserveAtIndex(3, amount3, NORMAL_TYPE);
        reservation.timeout();

        reservation.save();

        const reservation2: Reservation = Reservation.load(reservationId);

        expect(reservation2.reservationId).toStrictEqual(reservationId);

        expect(reservation2.expirationBlock()).toStrictEqual(expirationBlock);
        expect(reservation2.reservedLP).toStrictEqual(reservedLP);
        expect(reservation2.getPurgeIndex()).toStrictEqual(purgeIndex);
        expect(reservation2.userTimeoutBlockExpiration).toStrictEqual(expirationBlock + 5);
        expect(reservation2.reservedIndexes.getLength()).toStrictEqual(3);
        expect(reservation2.reservedValues.getLength()).toStrictEqual(3);
        expect(reservation2.reservedPriority.getLength()).toStrictEqual(3);
        expect(reservation2.getQueueTypes()).toStrictEqual([
            LIQUIDITY_REMOVAL_TYPE,
            PRIORITY_TYPE,
            NORMAL_TYPE,
        ]);
        expect(reservation2.getReservedIndexes()).toStrictEqual([1, 2, 3]);
        expect(reservation2.getReservedValues()).toStrictEqual([amount1, amount2, amount3]);
    });

    it('should delete existing reservation', () => {
        setBlockchainEnvironment(3);
        const reservationId: u128 = createReservationId(tokenAddress1, providerAddress1);
        const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

        expect(reservation.reservationId).toStrictEqual(reservationId);

        const amount1: u128 = u128.fromU64(1000);
        const amount2: u128 = u128.fromU64(2000);
        const amount3: u128 = u128.fromU64(3000);
        const expirationBlock: u64 = 10;
        const reservedLP: bool = true;
        const purgeIndex: u32 = 10;

        reservation.setExpirationBlock(expirationBlock);
        reservation.reservedLP = reservedLP;
        reservation.setPurgeIndex(purgeIndex);
        reservation.reserveAtIndex(1, amount1, LIQUIDITY_REMOVAL_TYPE);
        reservation.reserveAtIndex(2, amount2, PRIORITY_TYPE);
        reservation.reserveAtIndex(3, amount3, NORMAL_TYPE);

        reservation.save();

        const reservation2: Reservation = Reservation.load(reservationId);

        expect(reservation2.reservationId).toStrictEqual(reservationId);

        expect(reservation2.expirationBlock()).toStrictEqual(expirationBlock);
        expect(reservation2.reservedLP).toStrictEqual(reservedLP);
        expect(reservation2.getPurgeIndex()).toStrictEqual(purgeIndex);
        expect(reservation2.userTimeoutBlockExpiration).toStrictEqual(0);
        expect(reservation2.reservedIndexes.getLength()).toStrictEqual(3);
        expect(reservation2.reservedValues.getLength()).toStrictEqual(3);
        expect(reservation2.reservedPriority.getLength()).toStrictEqual(3);
        expect(reservation2.getQueueTypes()).toStrictEqual([
            LIQUIDITY_REMOVAL_TYPE,
            PRIORITY_TYPE,
            NORMAL_TYPE,
        ]);
        expect(reservation2.getReservedIndexes()).toStrictEqual([1, 2, 3]);
        expect(reservation2.getReservedValues()).toStrictEqual([amount1, amount2, amount3]);

        reservation2.delete(false);

        expect(reservation2.reservedIndexes.getLength()).toStrictEqual(0);
        expect(reservation2.reservedValues.getLength()).toStrictEqual(0);
        expect(reservation2.reservedPriority.getLength()).toStrictEqual(0);
        expect(reservation2.getPurgeIndex()).toStrictEqual(u32.MAX_VALUE);
        expect(reservation2.reservedLP).toBeFalsy();
        expect(reservation2.expirationBlock()).toStrictEqual(0);
        expect(reservation2.userTimeoutBlockExpiration).toStrictEqual(0);

        // Ensure deleted value are persisted
        const reservation3: Reservation = Reservation.load(reservationId);

        expect(reservation3.reservedIndexes.getLength()).toStrictEqual(0);
        expect(reservation3.reservedValues.getLength()).toStrictEqual(0);
        expect(reservation3.reservedPriority.getLength()).toStrictEqual(0);
        expect(reservation3.getPurgeIndex()).toStrictEqual(u32.MAX_VALUE);
        expect(reservation3.reservedLP).toBeFalsy();
        expect(reservation3.expirationBlock()).toStrictEqual(0);
        expect(reservation3.userTimeoutBlockExpiration).toStrictEqual(0);
    });

    it('should be expired when current block > expiration block', () => {
        setBlockchainEnvironment(5);
        const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(2);

        expect(reservation.expired()).toBeTruthy();
    });

    it('should not be expired when current block < expiration block', () => {
        setBlockchainEnvironment(5);
        const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(20);

        expect(reservation.expired()).toBeFalsy();
    });

    it('should be valid when not expired and reservedIndexes > 0', () => {
        setBlockchainEnvironment(5);
        const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(20);
        reservation.reserveAtIndex(1, u128.fromU64(1000), LIQUIDITY_REMOVAL_TYPE);

        expect(reservation.valid()).toBeTruthy();
    });

    it('should be invalid when expired and reservedIndexes > 0', () => {
        setBlockchainEnvironment(5);
        const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(2);
        reservation.reserveAtIndex(1, u128.fromU64(1000), LIQUIDITY_REMOVAL_TYPE);

        expect(reservation.valid()).toBeFalsy();
    });

    it('should be invalid when expired and reservedIndexes = 0', () => {
        setBlockchainEnvironment(5);
        const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(2);

        expect(reservation.valid()).toBeFalsy();
    });

    it('should be invalid when not expired and reservedIndexes = 0', () => {
        setBlockchainEnvironment(5);
        const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(20);

        expect(reservation.valid()).toBeFalsy();
    });

    it('should correctly reserveAtIndex', () => {
        setBlockchainEnvironment(3);

        const reservationId: u128 = createReservationId(tokenAddress1, providerAddress1);
        const reservation: Reservation = new Reservation(tokenAddress1, providerAddress1);

        expect(reservation.reservationId).toStrictEqual(reservationId);

        const amount1: u128 = u128.fromU64(1000);
        const amount2: u128 = u128.fromU64(2000);
        const amount3: u128 = u128.fromU64(3000);

        reservation.reserveAtIndex(1, amount1, LIQUIDITY_REMOVAL_TYPE);
        reservation.reserveAtIndex(2, amount2, PRIORITY_TYPE);
        reservation.reserveAtIndex(3, amount3, NORMAL_TYPE);

        expect(reservation.reservedIndexes.getLength()).toStrictEqual(3);
        expect(reservation.reservedValues.getLength()).toStrictEqual(3);
        expect(reservation.reservedPriority.getLength()).toStrictEqual(3);
        expect(reservation.getQueueTypes()).toStrictEqual([
            LIQUIDITY_REMOVAL_TYPE,
            PRIORITY_TYPE,
            NORMAL_TYPE,
        ]);
        expect(reservation.getReservedIndexes()).toStrictEqual([1, 2, 3]);
        expect(reservation.getReservedValues()).toStrictEqual([amount1, amount2, amount3]);
    });
});
