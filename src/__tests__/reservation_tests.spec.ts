import { Address, Blockchain, BytesWriter } from '@btc-vision/btc-runtime/runtime';
import { clearCachedProviders } from '../lib/Provider2';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    LIQUIDITY_REMOVAL_TYPE,
    NORMAL_TYPE,
    PRIORITY_TYPE,
    Reservation2,
} from '../lib/Reservation2';

const providerAddress1: Address = new Address([
    68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101, 220, 185,
    192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
]);

const msgSender1: Address = new Address([
    56, 172, 228, 82, 23, 145, 109, 98, 102, 186, 35, 65, 115, 253, 83, 104, 64, 71, 143, 47, 250,
    36, 107, 117, 250, 119, 149, 253, 56, 102, 51, 108,
]);

const txOrigin1: Address = new Address([
    113, 221, 31, 226, 33, 248, 28, 254, 8, 16, 106, 44, 26, 240, 107, 94, 38, 154, 85, 230, 151,
    248, 2, 44, 146, 20, 195, 28, 32, 155, 140, 210,
]);

const contractDeployer1: Address = new Address([
    204, 190, 163, 95, 110, 134, 1, 4, 104, 204, 197, 231, 62, 122, 115, 178, 237, 191, 201, 77,
    105, 55, 36, 40, 108, 255, 168, 146, 19, 124, 126, 173,
]);

const contractAddress1: Address = new Address([
    88, 191, 35, 122, 155, 141, 248, 53, 37, 62, 101, 60, 10, 84, 39, 102, 23, 187, 180, 182, 82,
    28, 17, 107, 182, 139, 162, 187, 102, 146, 120, 99,
]);

const txId1: Uint8Array = new Uint8Array(32);
txId1.set([
    233, 46, 113, 133, 187, 115, 218, 211, 63, 34, 178, 231, 36, 25, 22, 110, 165, 124, 122, 201,
    247, 233, 124, 41, 254, 64, 210, 16, 98, 89, 139, 181,
]);
const txId2: Uint8Array = new Uint8Array(32);
txId2.set([
    189, 155, 208, 203, 149, 250, 116, 136, 30, 209, 224, 135, 201, 167, 123, 33, 172, 230, 39, 99,
    88, 244, 46, 38, 51, 187, 34, 141, 149, 4, 181, 150,
]);

const tokenAddress1: Address = new Address([
    229, 26, 76, 180, 38, 124, 121, 223, 102, 39, 240, 138, 176, 156, 20, 68, 31, 90, 205, 152, 6,
    72, 189, 57, 202, 110, 217, 180, 106, 177, 172, 45,
]);

function createReservationId(tokenAddress: Address, providerAddress: Address): u128 {
    const reservationArrayId: Uint8Array = Reservation2.generateId(tokenAddress, providerAddress);

    return u128.fromBytes(reservationArrayId, true);
}

function setBlockchainEnvironment(currentBlock: u64): void {
    const currentBlockValue: u256 = u256.fromU64(currentBlock);
    const medianTimestamp: u64 = 87129871;
    const safeRnd64: u64 = 3723476278;

    const writer: BytesWriter = new BytesWriter(255);

    writer.writeAddress(msgSender1);
    writer.writeAddress(txOrigin1);
    writer.writeBytes(txId1);
    writer.writeU256(currentBlockValue);
    writer.writeAddress(contractDeployer1);
    writer.writeAddress(contractAddress1);
    writer.writeU64(medianTimestamp);
    writer.writeU64(safeRnd64);

    Blockchain.setEnvironment(writer.getBuffer());
}

describe('Reservation tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should create a new reservation and initialize correctly', () => {
        setBlockchainEnvironment(1);

        const reservation: Reservation2 = new Reservation2(tokenAddress1, providerAddress1);
        const reservationId = u128.fromBytes(
            Reservation2.generateId(tokenAddress1, providerAddress1),
            true,
        );

        expect(reservation.reservedIndexes.getLength()).toStrictEqual(0);
        expect(reservation.reservedValues.getLength()).toStrictEqual(0);
        expect(reservation.reservedPriority.getLength()).toStrictEqual(0);
        expect(reservation.reservedLP).toBeFalsy();
        expect(reservation.expirationBlock()).toStrictEqual(0);
        expect(reservation.userTimeoutBlockExpiration).toStrictEqual(5);
        expect(reservation.getPurgeIndex()).toStrictEqual(u32.MAX_VALUE);
        expect(reservation.reservationId).toStrictEqual(reservationId);
    });

    it('should correctly get/set expiration block when greater than current block number', () => {
        setBlockchainEnvironment(1);

        const reservation: Reservation2 = new Reservation2(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(10);

        expect(reservation.expirationBlock()).toStrictEqual(10);
    });

    it('should get 0 as expiration block when smaller/equal to current block number', () => {
        setBlockchainEnvironment(10);

        const reservation: Reservation2 = new Reservation2(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(10);

        expect(reservation.expirationBlock()).toStrictEqual(10);

        setBlockchainEnvironment(10);

        const reservation2: Reservation2 = new Reservation2(tokenAddress1, providerAddress1);

        reservation2.setExpirationBlock(9);

        expect(reservation2.expirationBlock()).toStrictEqual(0);
    });

    it('should correctly return the createdAt block', () => {
        setBlockchainEnvironment(1);
        const reservation: Reservation2 = new Reservation2(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(10);

        expect(reservation.createdAt).toStrictEqual(5);
    });

    it('should correctly set the purge index', () => {
        setBlockchainEnvironment(1);
        const reservation: Reservation2 = new Reservation2(tokenAddress1, providerAddress1);

        reservation.setPurgeIndex(10);

        expect(reservation.getPurgeIndex()).toStrictEqual(10);
    });

    it('should correctly return the getUserTimeoutBlockExpiration block', () => {
        setBlockchainEnvironment(1);
        const reservation: Reservation2 = new Reservation2(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(10);

        expect(reservation.userTimeoutBlockExpiration).toStrictEqual(15);
    });

    it('should correctly set the reservedLP state', () => {
        setBlockchainEnvironment(1);

        const reservation: Reservation2 = new Reservation2(tokenAddress1, providerAddress1);

        reservation.reservedLP = true;

        expect(reservation.reservedLP).toBeTruthy();

        reservation.reservedLP = false;

        expect(reservation.reservedLP).toBeFalsy();
    });

    it('should return an empty reservation when loading a non existing reservationId', () => {
        setBlockchainEnvironment(1);

        const reservationId = createReservationId(tokenAddress1, providerAddress1);
        const reservation: Reservation2 = Reservation2.load(reservationId);

        expect(reservation.reservedIndexes.getLength()).toStrictEqual(0);
        expect(reservation.reservedValues.getLength()).toStrictEqual(0);
        expect(reservation.reservedPriority.getLength()).toStrictEqual(0);
        expect(reservation.reservedLP).toBeFalsy();
        expect(reservation.expirationBlock()).toStrictEqual(0);
        expect(reservation.userTimeoutBlockExpiration).toStrictEqual(5);
        expect(reservation.getPurgeIndex()).toStrictEqual(u32.MAX_VALUE);
        expect(reservation.reservationId).toStrictEqual(reservationId);
    });

    it('should correctly load a reservation when loading an existing reservationId', () => {
        setBlockchainEnvironment(3);

        const reservationId: u128 = createReservationId(tokenAddress1, providerAddress1);
        const reservation: Reservation2 = new Reservation2(tokenAddress1, providerAddress1);

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

        const reservation2: Reservation2 = Reservation2.load(reservationId);

        expect(reservation2.reservationId).toStrictEqual(reservationId);

        expect(reservation2.expirationBlock()).toStrictEqual(expirationBlock);
        expect(reservation2.reservedLP).toStrictEqual(reservedLP);
        expect(reservation2.getPurgeIndex()).toStrictEqual(purgeIndex);
        expect(reservation2.userTimeoutBlockExpiration).toStrictEqual(15);
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
        const reservation: Reservation2 = new Reservation2(tokenAddress1, providerAddress1);

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

        const reservation2: Reservation2 = Reservation2.load(reservationId);

        expect(reservation2.reservationId).toStrictEqual(reservationId);

        expect(reservation2.expirationBlock()).toStrictEqual(expirationBlock);
        expect(reservation2.reservedLP).toStrictEqual(reservedLP);
        expect(reservation2.getPurgeIndex()).toStrictEqual(purgeIndex);
        expect(reservation2.userTimeoutBlockExpiration).toStrictEqual(15);
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
        expect(reservation2.userTimeoutBlockExpiration).toStrictEqual(5);

        // Ensure deleted value are persisted
        const reservation3: Reservation2 = Reservation2.load(reservationId);

        expect(reservation3.reservedIndexes.getLength()).toStrictEqual(0);
        expect(reservation3.reservedValues.getLength()).toStrictEqual(0);
        expect(reservation3.reservedPriority.getLength()).toStrictEqual(0);
        expect(reservation3.getPurgeIndex()).toStrictEqual(u32.MAX_VALUE);
        expect(reservation3.reservedLP).toBeFalsy();
        expect(reservation3.expirationBlock()).toStrictEqual(0);
        expect(reservation3.userTimeoutBlockExpiration).toStrictEqual(5);
    });

    it('should be expired when current block > expiration block', () => {
        setBlockchainEnvironment(5);
        const reservation: Reservation2 = new Reservation2(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(2);

        expect(reservation.expired()).toBeTruthy();
    });

    it('should not be expired when current block < expiration block', () => {
        setBlockchainEnvironment(5);
        const reservation: Reservation2 = new Reservation2(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(20);

        expect(reservation.expired()).toBeFalsy();
    });

    it('should be valid when not expired and reservedIndexes > 0', () => {
        setBlockchainEnvironment(5);
        const reservation: Reservation2 = new Reservation2(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(20);
        reservation.reserveAtIndex(1, u128.fromU64(1000), LIQUIDITY_REMOVAL_TYPE);

        expect(reservation.valid()).toBeTruthy();
    });

    it('should be invalid when expired and reservedIndexes > 0', () => {
        setBlockchainEnvironment(5);
        const reservation: Reservation2 = new Reservation2(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(2);
        reservation.reserveAtIndex(1, u128.fromU64(1000), LIQUIDITY_REMOVAL_TYPE);

        expect(reservation.valid()).toBeFalsy();
    });

    it('should be invalid when expired and reservedIndexes = 0', () => {
        setBlockchainEnvironment(5);
        const reservation: Reservation2 = new Reservation2(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(2);

        expect(reservation.valid()).toBeFalsy();
    });

    it('should be invalid when not expired and reservedIndexes = 0', () => {
        setBlockchainEnvironment(5);
        const reservation: Reservation2 = new Reservation2(tokenAddress1, providerAddress1);

        reservation.setExpirationBlock(20);

        expect(reservation.valid()).toBeFalsy();
    });

    it('should correctly reserveAtIndex', () => {
        setBlockchainEnvironment(3);

        const reservationId: u128 = createReservationId(tokenAddress1, providerAddress1);
        const reservation: Reservation2 = new Reservation2(tokenAddress1, providerAddress1);

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
