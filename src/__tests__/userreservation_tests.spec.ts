import { UserReservation } from '../data-types/UserReservation';
import { RESERVATION_ID_POINTER } from '../lib/StoredPointers';
import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesReader,
    BytesWriter,
} from '@btc-vision/btc-runtime/runtime';
import { ripemd160 } from '@btc-vision/btc-runtime/runtime/env/global';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

const tokenAddress1: Address = new Address([
    229, 26, 76, 180, 38, 124, 121, 223, 102, 39, 240, 138, 176, 156, 20, 68, 31, 90, 205, 152, 6,
    72, 189, 57, 202, 110, 217, 180, 106, 177, 172, 45,
]);
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

function generateReservationId(token: Address, owner: Address): u256 {
    const writer = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
    writer.writeAddress(token);
    writer.writeAddress(owner);
    const hash = ripemd160(writer.getBuffer());
    const hash2 = hash.slice(0, 16);

    return u128.fromBytes(hash2, true).toU256();
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

        expect(userReservation.getUserTimeoutBlockExpiration()).toStrictEqual(15);
    });

    it('should get 5 as UserTimeoutBlockExpiration when expiration block smaller/equal to current block number', () => {
        setBlockchainEnvironment(20);

        const reservation = generateReservationId(tokenAddress1, providerAddress1);
        const expirationBlock: u64 = 5;

        const userReservation = new UserReservation(RESERVATION_ID_POINTER, reservation);
        userReservation.setExpirationBlock(expirationBlock);

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

        expect(userReservation.getUserTimeoutBlockExpiration()).toStrictEqual(5);
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

        expect(userReservation.getUserTimeoutBlockExpiration()).toStrictEqual(15);
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
