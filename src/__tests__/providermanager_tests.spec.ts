import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
} from '@btc-vision/btc-runtime/runtime';
import { ripemd160, sha256 } from '@btc-vision/btc-runtime/runtime/env/global';
import { Reservation2 } from '../lib/Reservation2';
import { clearCachedProviders } from '../lib/Provider2';
import { ProviderManager2 } from '../lib/Liquidity/ProviderManager2';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

const providerAddress1: Address = new Address([
    68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101, 220, 185,
    192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
]);

const providerAddress2: Address = new Address([
    196, 73, 104, 227, 216, 12, 216, 134, 87, 166, 168, 44, 5, 101, 71, 69, 204, 213, 154, 86, 76,
    124, 186, 77, 90, 216, 39, 6, 239, 122, 100, 1,
]);

const providerAddress3: Address = new Address([
    84, 79, 41, 213, 125, 76, 182, 184, 94, 85, 157, 217, 19, 45, 4, 70, 179, 164, 179, 31, 71, 53,
    209, 126, 10, 49, 77, 37, 107, 101, 113, 216,
]);

const msgSender1: Address = new Address([
    56, 172, 228, 82, 23, 145, 109, 98, 102, 186, 35, 65, 115, 253, 83, 104, 64, 71, 143, 47, 250,
    36, 107, 117, 250, 119, 149, 253, 56, 102, 51, 108,
]);

const msgSender2: Address = new Address([
    220, 11, 198, 33, 187, 6, 231, 40, 174, 165, 186, 169, 5, 108, 5, 211, 94, 23, 64, 162, 45, 199,
    82, 175, 147, 117, 30, 10, 108, 174, 211, 147,
]);

const txOrigin1: Address = new Address([
    113, 221, 31, 226, 33, 248, 28, 254, 8, 16, 106, 44, 26, 240, 107, 94, 38, 154, 85, 230, 151,
    248, 2, 44, 146, 20, 195, 28, 32, 155, 140, 210,
]);
const txOrigin2: Address = new Address([
    227, 185, 130, 207, 92, 89, 62, 145, 15, 240, 69, 14, 174, 179, 55, 177, 194, 1, 216, 210, 179,
    131, 230, 233, 106, 183, 138, 42, 10, 179, 2, 153,
]);
const contractDeployer1: Address = new Address([
    204, 190, 163, 95, 110, 134, 1, 4, 104, 204, 197, 231, 62, 122, 115, 178, 237, 191, 201, 77,
    105, 55, 36, 40, 108, 255, 168, 146, 19, 124, 126, 173,
]);
const contractDeployer2: Address = new Address([
    245, 67, 231, 181, 243, 123, 8, 242, 179, 109, 140, 31, 10, 151, 248, 188, 68, 244, 160, 246,
    223, 87, 42, 225, 39, 108, 34, 130, 163, 235, 24, 163,
]);
const contractAddress1: Address = new Address([
    88, 191, 35, 122, 155, 141, 248, 53, 37, 62, 101, 60, 10, 84, 39, 102, 23, 187, 180, 182, 82,
    28, 17, 107, 182, 139, 162, 187, 102, 146, 120, 99,
]);
const contractAddress2: Address = new Address([
    94, 205, 124, 93, 174, 4, 230, 77, 227, 188, 102, 175, 46, 92, 219, 212, 103, 214, 153, 217,
    151, 178, 174, 203, 41, 209, 89, 123, 188, 113, 72, 105,
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
const tokenIdUint8Array1: Uint8Array = ripemd160(tokenAddress1);
const tokenId1: u256 = u256.fromBytes(tokenAddress1, true);

const tokenAddress2: Address = new Address([
    222, 40, 197, 58, 44, 174, 172, 146, 11, 2, 236, 98, 173, 123, 172, 221, 45, 8, 99, 251, 190,
    151, 230, 90, 170, 2, 198, 68, 224, 254, 129, 245,
]);
const tokenIdUint8Array2: Uint8Array = ripemd160(tokenAddress2);
const tokenId2: u256 = u256.fromBytes(tokenAddress2, true);

function addressToPointerU256(address: Address, token: Address): u256 {
    const writer = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
    writer.writeAddress(address);
    writer.writeAddress(token);
    return u256.fromBytes(sha256(writer.getBuffer()), true);
}

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

const STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT: u256 = u256.fromU32(600);

describe('ProviderManager tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should create a new providermanager and initialize correctly', () => {
        const manager: ProviderManager2 = new ProviderManager2(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(0);
        expect(manager.previousReservationStartingIndex).toStrictEqual(0);
        expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
        expect(manager.initialLiquidityProvider).toStrictEqual(u256.Zero);
        expect(manager.priorityQueueLength).toStrictEqual(0);
        expect(manager.priorityQueueStartingIndex).toStrictEqual(0);
        expect(manager.priorityQueueStartingIndex).toStrictEqual(0);
    });

    it('should set the initialLiquidityProvider correctly', () => {
        const manager: ProviderManager2 = new ProviderManager2(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const initialLiquidityProvider = u256.fromU64(99999);

        manager.initialLiquidityProvider = initialLiquidityProvider;

        expect(manager.initialLiquidityProvider).toStrictEqual(initialLiquidityProvider);
    });

    it('should set the BTCowed correctly', () => {
        const manager: ProviderManager2 = new ProviderManager2(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providerId1: u256 = u256.fromU64(10000);
        const amount1: u256 = u256.fromU64(99999);

        manager.setBTCowed(providerId1, amount1);

        expect(manager.getBTCowed(providerId1)).toStrictEqual(amount1);
    });

    it('should return 0 BTCowed when no BTC owed to provider', () => {
        const manager: ProviderManager2 = new ProviderManager2(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providerId1: u256 = u256.fromU64(10000);

        expect(manager.getBTCowed(providerId1)).toStrictEqual(u256.Zero);
    });

    it('should replace the BTCowed for an existing BTC balance', () => {
        const manager: ProviderManager2 = new ProviderManager2(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providerId1: u256 = u256.fromU64(10000);
        const amount1: u256 = u256.fromU64(99999);
        const amount2: u256 = u256.fromU64(88888);

        manager.setBTCowed(providerId1, amount1);

        expect(manager.getBTCowed(providerId1)).toStrictEqual(amount1);

        manager.setBTCowed(providerId1, amount2);

        expect(manager.getBTCowed(providerId1)).toStrictEqual(amount2);
    });

    it('should set the BTCowedReserved correctly', () => {
        const manager: ProviderManager2 = new ProviderManager2(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providerId1: u256 = u256.fromU64(22222);
        const amount1: u256 = u256.fromU64(11111);

        manager.setBTCowedReserved(providerId1, amount1);

        expect(manager.getBTCowedReserved(providerId1)).toStrictEqual(amount1);
    });

    it('should return 0 BTCowedReserved when no BTC owed to provider', () => {
        const manager: ProviderManager2 = new ProviderManager2(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providerId1: u256 = u256.fromU64(22222);

        expect(manager.getBTCowedReserved(providerId1)).toStrictEqual(u256.Zero);
    });

    it('should replace the BTCowedReserved for an existing BTC balance', () => {
        const manager: ProviderManager2 = new ProviderManager2(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providerId1: u256 = u256.fromU64(22222);
        const amount1: u256 = u256.fromU64(33333);
        const amount2: u256 = u256.fromU64(44444);

        manager.setBTCowedReserved(providerId1, amount1);

        expect(manager.getBTCowedReserved(providerId1)).toStrictEqual(amount1);

        manager.setBTCowedReserved(providerId1, amount2);

        expect(manager.getBTCowedReserved(providerId1)).toStrictEqual(amount2);
    });

    it('should return 0 when getFromPriorityQueue does not contains the provider index or is empty', () => {
        const manager: ProviderManager2 = new ProviderManager2(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providerIdIndex1: u64 = 22222;
        const providerIdIndex2: u64 = 0;
        const providerIdIn: u256 = u256.fromU64(1000);

        const providerIdOut1: u256 = manager.getFromPriorityQueue(providerIdIndex1);

        expect(providerIdOut1).toStrictEqual(u256.Zero);

        manager.addToPriorityQueue(providerIdIn);
        const providerIdOut2: u256 = manager.getFromPriorityQueue(providerIdIndex2);

        expect(providerIdOut2).toStrictEqual(providerIdIn);
    });

    it('should return 0 when getFromRemovalQueue does not contains the provider index or is empty', () => {
        const manager: ProviderManager2 = new ProviderManager2(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providerIdIndex1: u64 = 22222;
        const providerIdIndex2: u64 = 0;
        const providerIdIn: u256 = u256.fromU64(1000);

        const providerIdOut1: u256 = manager.getFromRemovalQueue(providerIdIndex1);

        expect(providerIdOut1).toStrictEqual(u256.Zero);

        manager.addToRemovalQueue(providerIdIn);
        const providerIdOut2: u256 = manager.getFromRemovalQueue(providerIdIndex2);

        expect(providerIdOut2).toStrictEqual(providerIdIn);
    });

    it('should return 0 when getFromStandardQueue does not contains the provider index or is empty', () => {
        const manager: ProviderManager2 = new ProviderManager2(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providerIdIndex1: u64 = 22222;
        const providerIdIndex2: u64 = 0;
        const providerIdIn: u256 = u256.fromU64(1000);

        const providerIdOut1: u256 = manager.getFromStandardQueue(providerIdIndex1);

        expect(providerIdOut1).toStrictEqual(u256.Zero);

        manager.addToStandardQueue(providerIdIn);
        const providerIdOut2: u256 = manager.getFromStandardQueue(providerIdIndex2);

        expect(providerIdOut2).toStrictEqual(providerIdIn);
    });

    it('should empty all the queues when cleanUpQueues is called', () => {
        const manager: ProviderManager2 = new ProviderManager2(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        manager.addToPriorityQueue(u256.fromU64(1));
        manager.addToPriorityQueue(u256.fromU64(0));
        manager.addToRemovalQueue(u256.fromU64(2));
        manager.addToRemovalQueue(u256.fromU64(0));
        manager.addToStandardQueue(u256.fromU64(3));
        manager.addToStandardQueue(u256.fromU64(0));

        manager.cleanUpQueues();
    });
});
