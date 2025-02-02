import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
} from '@btc-vision/btc-runtime/runtime';
import { ripemd160, sha256 } from '@btc-vision/btc-runtime/runtime/env/global';
import { Reservation } from '../lib/Reservation';
import { clearCachedProviders, getProvider, Provider } from '../lib/Provider';
import { ProviderManager } from '../lib/Liquidity/ProviderManager';
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
    const reservationArrayId: Uint8Array = Reservation.generateId(tokenAddress, providerAddress);

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

function createProvider(
    providerAddress: Address,
    tokenAddress: Address,
    pendingRemoval: boolean = false,
    isLP: boolean = true,
    canProvideLiquidity: boolean = true,
    btcReceiver: string = 'e123e2d23d233',
    liquidityProvided: u256 = u256.fromU64(1000),
    liquidity: u128 = u128.fromU64(1000),
    reserved: u128 = u128.fromU64(0),
    isActive: bool = true,
    isPriority: bool = false,
): Provider {
    const providerId: u256 = addressToPointerU256(providerAddress, tokenAddress);
    const provider: Provider = getProvider(providerId);

    provider.setActive(isActive, isPriority);
    provider.pendingRemoval = pendingRemoval;
    provider.isLp = isLP;
    provider.liquidityProvided = liquidityProvided;
    provider.liquidity = liquidity;
    provider.reserved = reserved;
    provider.btcReceiver = btcReceiver;

    if (canProvideLiquidity) {
        provider.enableLiquidityProvision();
    }

    return provider;
}

const STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT: u256 = u256.fromU32(600);

describe('ProviderManager tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should create a new providermanager and initialize correctly', () => {
        const manager: ProviderManager = new ProviderManager(
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
        const manager: ProviderManager = new ProviderManager(
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
        const manager: ProviderManager = new ProviderManager(
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
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providerId1: u256 = u256.fromU64(10000);

        expect(manager.getBTCowed(providerId1)).toStrictEqual(u256.Zero);
    });

    it('should replace the BTCowed for an existing BTC balance', () => {
        const manager: ProviderManager = new ProviderManager(
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
        const manager: ProviderManager = new ProviderManager(
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
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providerId1: u256 = u256.fromU64(22222);

        expect(manager.getBTCowedReserved(providerId1)).toStrictEqual(u256.Zero);
    });

    it('should replace the BTCowedReserved for an existing BTC balance', () => {
        const manager: ProviderManager = new ProviderManager(
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
        const manager: ProviderManager = new ProviderManager(
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
        const manager: ProviderManager = new ProviderManager(
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
        const manager: ProviderManager = new ProviderManager(
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

    it('should add a provider to the priority queue', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providerIdIn: u256 = u256.fromU64(1000);

        manager.addToPriorityQueue(providerIdIn);

        const providerIdOut1: u256 = manager.getFromPriorityQueue(0);

        expect(providerIdOut1).toStrictEqual(providerIdIn);
    });

    it('should add a provider to the removal queue', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providerIdIn: u256 = u256.fromU64(1000);

        manager.addToRemovalQueue(providerIdIn);

        const providerIdOut1: u256 = manager.getFromRemovalQueue(0);

        expect(providerIdOut1).toStrictEqual(providerIdIn);
    });

    it('should add a provider to the standard queue', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providerIdIn: u256 = u256.fromU64(1000);

        manager.addToStandardQueue(providerIdIn);

        const providerIdOut1: u256 = manager.getFromStandardQueue(0);

        expect(providerIdOut1).toStrictEqual(providerIdIn);
    });

    it('should remove a pending liquidity provider from the removal queue when removePendingLiquidityProviderFromRemovalQueue is called', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1, true);
        provider1.isLp = true;

        manager.addToRemovalQueue(provider1.providerId);

        expect(manager.getFromRemovalQueue(0)).toStrictEqual(provider1.providerId);

        manager.removePendingLiquidityProviderFromRemovalQueue(provider1, 0);

        expect(provider1.isLp).toBeFalsy();
        expect(provider1.pendingRemoval).toBeFalsy();

        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
    });

    it('should reset the 3 previous starting indexes to 0 when resetStartingIndex is called', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        manager.previousReservationStartingIndex = 10;
        manager.previousReservationStandardStartingIndex = 11;
        manager.previousRemovalStartingIndex = 12;

        manager.resetStartingIndex();

        expect(manager.previousReservationStartingIndex).toStrictEqual(0);
        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(0);
        expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
    });

    it('should restore the 3 current indexes to the previous value when restoreCurrentIndex is called', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        manager.previousReservationStartingIndex = 10;
        manager.previousReservationStandardStartingIndex = 11;
        manager.previousRemovalStartingIndex = 12;

        manager.restoreCurrentIndex();

        expect(manager.previousReservationStartingIndex).toStrictEqual(10);
        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(11);
        expect(manager.previousRemovalStartingIndex).toStrictEqual(12);
    });

    //new items in removal queue and previousRemovalStartingIndex = 0
    // - 1 provider
    // - 1 provider in pendingRemoval state
    // - 1 provider and 1 provider in pendingRemoval state
    // - 2 providers not in pendingRemoval state
    // - 2 providers in pendingRemoval state
    // - 1 provider in pendingRemoval state and 1 provider

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex = 0, 1 provider', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
        expect(manager.removalQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);

        manager.addToRemovalQueue(provider1.providerId);

        expect(manager.removalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.removalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex = 0, 1 provider in pending removal', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
        expect(manager.removalQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1, true);

        manager.addToRemovalQueue(provider1.providerId);

        expect(manager.removalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(provider1.providerId);
        expect(manager.removalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex = 0, 1 provider and 1 provider in pendingRemoval state', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
        expect(manager.removalQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        const provider2: Provider = createProvider(providerAddress2, tokenAddress1, true);

        manager.addToRemovalQueue(provider1.providerId);
        manager.addToRemovalQueue(provider2.providerId);

        expect(manager.removalQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(provider2.providerId);
        expect(manager.removalQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex = 0, 2 provider not in pendingRemoval state', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
        expect(manager.removalQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);

        manager.addToRemovalQueue(provider1.providerId);
        manager.addToRemovalQueue(provider2.providerId);

        expect(manager.removalQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(2);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.removalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex = 0, 1 provider in pendingRemoval state and 1 provider', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
        expect(manager.removalQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1, true);
        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);

        manager.addToRemovalQueue(provider1.providerId);
        manager.addToRemovalQueue(provider2.providerId);

        expect(manager.removalQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(provider1.providerId);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(provider2.providerId);
        expect(manager.removalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex = 0, 2 providers in pendingRemoval state', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
        expect(manager.removalQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1, true);
        const provider2: Provider = createProvider(providerAddress2, tokenAddress1, true);

        manager.addToRemovalQueue(provider1.providerId);
        manager.addToRemovalQueue(provider2.providerId);

        expect(manager.removalQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(0);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(provider1.providerId);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(provider2.providerId);
        expect(manager.removalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex <> 0, 1 provider', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        manager.addToRemovalQueue(provider1.providerId);
        expect(manager.removalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);

        manager.addToRemovalQueue(provider2.providerId);
        expect(manager.removalQueueLength).toStrictEqual(2);
        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(2);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.removalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex <> 0, 1 provider in pending removal', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        manager.addToRemovalQueue(provider1.providerId);
        expect(manager.removalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress1, tokenAddress1, true);

        manager.addToRemovalQueue(provider2.providerId);

        expect(manager.removalQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(provider1.providerId);
        expect(manager.removalQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex <> 0, 1 provider and 1 provider in pendingRemoval state', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        manager.addToRemovalQueue(provider1.providerId);
        expect(manager.removalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        const provider3: Provider = createProvider(providerAddress3, tokenAddress1, true);

        manager.addToRemovalQueue(provider2.providerId);
        manager.addToRemovalQueue(provider3.providerId);

        expect(manager.removalQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(2);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(2)).toStrictEqual(provider3.providerId);
        expect(manager.removalQueueStartingIndex).toStrictEqual(2);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex <> 0, 2 provider not in pendingRemoval state', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        manager.addToRemovalQueue(provider1.providerId);
        expect(manager.removalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        const provider3: Provider = createProvider(providerAddress3, tokenAddress1);

        manager.addToRemovalQueue(provider2.providerId);
        manager.addToRemovalQueue(provider3.providerId);

        expect(manager.removalQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(3);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(2)).toStrictEqual(u256.Zero);
        expect(manager.removalQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex <> 0, 1 provider in pendingRemoval state and 1 provider', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        manager.addToRemovalQueue(provider1.providerId);
        expect(manager.removalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1, true);
        const provider3: Provider = createProvider(providerAddress3, tokenAddress1);

        manager.addToRemovalQueue(provider2.providerId);
        manager.addToRemovalQueue(provider3.providerId);

        expect(manager.removalQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(provider2.providerId);
        expect(manager.getFromRemovalQueue(2)).toStrictEqual(provider3.providerId);
        expect(manager.removalQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex <> 0, 2 providers in pendingRemoval state', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        manager.addToRemovalQueue(provider1.providerId);
        expect(manager.removalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress1, tokenAddress1, true);
        const provider3: Provider = createProvider(providerAddress2, tokenAddress1, true);

        manager.addToRemovalQueue(provider2.providerId);
        manager.addToRemovalQueue(provider3.providerId);

        expect(manager.removalQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(provider2.providerId);
        expect(manager.getFromRemovalQueue(2)).toStrictEqual(provider3.providerId);
        expect(manager.removalQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousRemovalStartingIndex and removal queue state when cleanUpQueues is called, previousRemovalStartingIndex <> 0, 1 provider in pendingRemoval state and 1 provider', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        manager.addToRemovalQueue(provider1.providerId);
        expect(manager.removalQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.removalQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress1, tokenAddress1, true);
        const provider3: Provider = createProvider(providerAddress2, tokenAddress1);

        manager.addToRemovalQueue(provider2.providerId);
        manager.addToRemovalQueue(provider3.providerId);

        expect(manager.removalQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(1);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(provider2.providerId);
        expect(manager.getFromRemovalQueue(2)).toStrictEqual(provider3.providerId);
        expect(manager.removalQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex = 0, 1 provider not active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        expect(manager.previousReservationStartingIndex).toStrictEqual(0);
        expect(manager.priorityQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(false, true);

        manager.addToPriorityQueue(provider1.providerId);

        expect(manager.priorityQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(1);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.priorityQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex = 0, 1 provider active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        expect(manager.previousReservationStartingIndex).toStrictEqual(0);
        expect(manager.priorityQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(true, true);

        manager.addToPriorityQueue(provider1.providerId);

        expect(manager.priorityQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(0);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(provider1.providerId);
        expect(manager.priorityQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex = 0, 1 provider not active and 1 provider active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        expect(manager.previousReservationStartingIndex).toStrictEqual(0);
        expect(manager.priorityQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(false, true);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.setActive(true, true);

        manager.addToPriorityQueue(provider1.providerId);
        manager.addToPriorityQueue(provider2.providerId);

        expect(manager.priorityQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(1);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(provider2.providerId);
        expect(manager.priorityQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex = 0, 2 provider not active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        expect(manager.previousReservationStartingIndex).toStrictEqual(0);
        expect(manager.priorityQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(false, true);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.setActive(false, true);

        manager.addToPriorityQueue(provider1.providerId);
        manager.addToPriorityQueue(provider2.providerId);

        expect(manager.priorityQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(2);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.priorityQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex = 0, 1 provider active and 1 provider not active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        expect(manager.previousReservationStartingIndex).toStrictEqual(0);
        expect(manager.priorityQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(true, true);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.setActive(false, true);

        manager.addToPriorityQueue(provider1.providerId);
        manager.addToPriorityQueue(provider2.providerId);

        expect(manager.priorityQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(0);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(provider1.providerId);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(provider2.providerId);
        expect(manager.priorityQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex = 0, 2 providers active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        expect(manager.previousReservationStartingIndex).toStrictEqual(0);
        expect(manager.priorityQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(true, true);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.setActive(true, true);

        manager.addToPriorityQueue(provider1.providerId);
        manager.addToPriorityQueue(provider2.providerId);

        expect(manager.priorityQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(0);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(provider1.providerId);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(provider2.providerId);
        expect(manager.priorityQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex <> 0, 1 provider not active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(false, true);

        manager.addToPriorityQueue(provider1.providerId);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.setActive(false, true);

        manager.addToPriorityQueue(provider2.providerId);
        expect(manager.priorityQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(2);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.priorityQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex <> 0, 1 provider active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(false, true);

        manager.addToPriorityQueue(provider1.providerId);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress1, tokenAddress1);
        provider2.setActive(true, true);

        manager.addToPriorityQueue(provider2.providerId);

        expect(manager.priorityQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(1);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(provider1.providerId);
        expect(manager.priorityQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex <> 0, 1 provider not active and 1 provider active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(false, true);

        manager.addToPriorityQueue(provider1.providerId);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.setActive(false, true);

        const provider3: Provider = createProvider(providerAddress3, tokenAddress1);
        provider3.setActive(true, true);

        manager.addToPriorityQueue(provider2.providerId);
        manager.addToPriorityQueue(provider3.providerId);

        expect(manager.priorityQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(2);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(2)).toStrictEqual(provider3.providerId);
        expect(manager.priorityQueueStartingIndex).toStrictEqual(2);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex <> 0, 2 provider not active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(false, true);

        manager.addToPriorityQueue(provider1.providerId);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.setActive(false, true);

        const provider3: Provider = createProvider(providerAddress3, tokenAddress1);
        provider3.setActive(false, true);

        manager.addToPriorityQueue(provider2.providerId);
        manager.addToPriorityQueue(provider3.providerId);

        expect(manager.priorityQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(3);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(2)).toStrictEqual(u256.Zero);
        expect(manager.priorityQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex <> 0, 1 provider active and 1 provider not active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(false, true);

        manager.addToPriorityQueue(provider1.providerId);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.setActive(true, true);

        const provider3: Provider = createProvider(providerAddress3, tokenAddress1);
        provider3.setActive(false, true);

        manager.addToPriorityQueue(provider2.providerId);
        manager.addToPriorityQueue(provider3.providerId);

        expect(manager.priorityQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(1);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(provider2.providerId);
        expect(manager.getFromPriorityQueue(2)).toStrictEqual(provider3.providerId);
        expect(manager.priorityQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex <> 0, 2 providers active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(false, true);

        manager.addToPriorityQueue(provider1.providerId);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress1, tokenAddress1, true);
        provider2.setActive(true, true);

        const provider3: Provider = createProvider(providerAddress2, tokenAddress1, true);
        provider3.setActive(true, true);

        manager.addToPriorityQueue(provider2.providerId);
        manager.addToPriorityQueue(provider3.providerId);

        expect(manager.priorityQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(1);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(provider2.providerId);
        expect(manager.getFromPriorityQueue(2)).toStrictEqual(provider3.providerId);
        expect(manager.priorityQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousReservationStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStartingIndex <> 0, 1 provider active state and 1 provider not active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(false, true);

        manager.addToPriorityQueue(provider1.providerId);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(1);
        expect(manager.priorityQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress1, tokenAddress1);
        provider2.setActive(true, true);

        const provider3: Provider = createProvider(providerAddress2, tokenAddress1);
        provider3.setActive(false, true);

        manager.addToPriorityQueue(provider2.providerId);
        manager.addToPriorityQueue(provider3.providerId);

        expect(manager.priorityQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(1);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(provider2.providerId);
        expect(manager.getFromPriorityQueue(2)).toStrictEqual(provider3.providerId);
        expect(manager.priorityQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousReservationStandardStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStandardStartingIndex = 0, 1 provider not active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(0);
        expect(manager.standardQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(false, true);

        manager.addToStandardQueue(provider1.providerId);

        expect(manager.standardQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(1);
        expect(manager.getFromStandardQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.standardQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStandardStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStandardStartingIndex = 0, 1 provider active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(0);
        expect(manager.standardQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(true, true);

        manager.addToStandardQueue(provider1.providerId);

        expect(manager.standardQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(0);
        expect(manager.getFromStandardQueue(0)).toStrictEqual(provider1.providerId);
        expect(manager.standardQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStandardStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStandardStartingIndex = 0, 1 provider not active and 1 provider active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(0);
        expect(manager.standardQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(false, true);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.setActive(true, true);

        manager.addToStandardQueue(provider1.providerId);
        manager.addToStandardQueue(provider2.providerId);

        expect(manager.standardQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(1);
        expect(manager.getFromStandardQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromStandardQueue(1)).toStrictEqual(provider2.providerId);
        expect(manager.standardQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousReservationStandardStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStandardStartingIndex = 0, 2 provider not active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(0);
        expect(manager.standardQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(false, true);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.setActive(false, true);

        manager.addToStandardQueue(provider1.providerId);
        manager.addToStandardQueue(provider2.providerId);

        expect(manager.standardQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(2);
        expect(manager.getFromStandardQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromStandardQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.standardQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStandardStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStandardStartingIndex = 0, 1 provider active and 1 provider not active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(0);
        expect(manager.standardQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(true, true);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.setActive(false, true);

        manager.addToStandardQueue(provider1.providerId);
        manager.addToStandardQueue(provider2.providerId);

        expect(manager.standardQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(0);
        expect(manager.getFromStandardQueue(0)).toStrictEqual(provider1.providerId);
        expect(manager.getFromStandardQueue(1)).toStrictEqual(provider2.providerId);
        expect(manager.standardQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStandardStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStandardStartingIndex = 0, 2 providers active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(0);
        expect(manager.standardQueueLength).toStrictEqual(0);

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(true, true);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.setActive(true, true);

        manager.addToStandardQueue(provider1.providerId);
        manager.addToStandardQueue(provider2.providerId);

        expect(manager.standardQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(0);
        expect(manager.getFromStandardQueue(0)).toStrictEqual(provider1.providerId);
        expect(manager.getFromStandardQueue(1)).toStrictEqual(provider2.providerId);
        expect(manager.standardQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStandardStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStandardStartingIndex <> 0, 1 provider not active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(false, true);

        manager.addToStandardQueue(provider1.providerId);
        expect(manager.standardQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(1);
        expect(manager.standardQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.setActive(false, true);

        manager.addToStandardQueue(provider2.providerId);
        expect(manager.standardQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(2);
        expect(manager.getFromStandardQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromStandardQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.standardQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStandardStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStandardStartingIndex <> 0, 1 provider active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(false, true);

        manager.addToStandardQueue(provider1.providerId);
        expect(manager.standardQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(1);
        expect(manager.standardQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress1, tokenAddress1);
        provider2.setActive(true, true);

        manager.addToStandardQueue(provider2.providerId);

        expect(manager.standardQueueLength).toStrictEqual(2);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(1);
        expect(manager.getFromStandardQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromStandardQueue(1)).toStrictEqual(provider1.providerId);
        expect(manager.standardQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousReservationStandardStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStandardStartingIndex <> 0, 1 provider not active and 1 provider active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(false, true);

        manager.addToStandardQueue(provider1.providerId);
        expect(manager.standardQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(1);
        expect(manager.standardQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.setActive(false, true);

        const provider3: Provider = createProvider(providerAddress3, tokenAddress1);
        provider3.setActive(true, true);

        manager.addToStandardQueue(provider2.providerId);
        manager.addToStandardQueue(provider3.providerId);

        expect(manager.standardQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(2);
        expect(manager.getFromStandardQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromStandardQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.getFromStandardQueue(2)).toStrictEqual(provider3.providerId);
        expect(manager.standardQueueStartingIndex).toStrictEqual(2);
    });

    it('should correctly set previousReservationStandardStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStandardStartingIndex <> 0, 2 provider not active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(false, true);

        manager.addToStandardQueue(provider1.providerId);
        expect(manager.standardQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(1);
        expect(manager.standardQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.setActive(false, true);

        const provider3: Provider = createProvider(providerAddress3, tokenAddress1);
        provider3.setActive(false, true);

        manager.addToStandardQueue(provider2.providerId);
        manager.addToStandardQueue(provider3.providerId);

        expect(manager.standardQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(3);
        expect(manager.getFromStandardQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromStandardQueue(1)).toStrictEqual(u256.Zero);
        expect(manager.getFromStandardQueue(2)).toStrictEqual(u256.Zero);
        expect(manager.standardQueueStartingIndex).toStrictEqual(0);
    });

    it('should correctly set previousReservationStandardStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStandardStartingIndex <> 0, 1 provider active and 1 provider not active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(false, true);

        manager.addToStandardQueue(provider1.providerId);
        expect(manager.standardQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(1);
        expect(manager.standardQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider2.setActive(true, true);

        const provider3: Provider = createProvider(providerAddress3, tokenAddress1);
        provider3.setActive(false, true);

        manager.addToStandardQueue(provider2.providerId);
        manager.addToStandardQueue(provider3.providerId);

        expect(manager.standardQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(1);
        expect(manager.getFromStandardQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromStandardQueue(1)).toStrictEqual(provider2.providerId);
        expect(manager.getFromStandardQueue(2)).toStrictEqual(provider3.providerId);
        expect(manager.standardQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousReservationStandardStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStandardStartingIndex <> 0, 2 providers active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(false, true);

        manager.addToStandardQueue(provider1.providerId);
        expect(manager.standardQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(1);
        expect(manager.standardQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress1, tokenAddress1, true);
        provider2.setActive(true, true);

        const provider3: Provider = createProvider(providerAddress2, tokenAddress1, true);
        provider3.setActive(true, true);

        manager.addToStandardQueue(provider2.providerId);
        manager.addToStandardQueue(provider3.providerId);

        expect(manager.standardQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(1);
        expect(manager.getFromStandardQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromStandardQueue(1)).toStrictEqual(provider2.providerId);
        expect(manager.getFromStandardQueue(2)).toStrictEqual(provider3.providerId);
        expect(manager.standardQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly set previousReservationStandardStartingIndex and priority queue state when cleanUpQueues is called, previousReservationStandardStartingIndex <> 0, 1 provider active state and 1 provider not active', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        provider1.setActive(false, true);

        manager.addToStandardQueue(provider1.providerId);
        expect(manager.standardQueueLength).toStrictEqual(1);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(1);
        expect(manager.standardQueueLength).toStrictEqual(1);

        const provider2: Provider = createProvider(providerAddress1, tokenAddress1);
        provider2.setActive(true, true);

        const provider3: Provider = createProvider(providerAddress2, tokenAddress1);
        provider3.setActive(false, true);

        manager.addToStandardQueue(provider2.providerId);
        manager.addToStandardQueue(provider3.providerId);

        expect(manager.standardQueueLength).toStrictEqual(3);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(1);
        expect(manager.getFromStandardQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromStandardQueue(1)).toStrictEqual(provider2.providerId);
        expect(manager.getFromStandardQueue(2)).toStrictEqual(provider3.providerId);
        expect(manager.standardQueueStartingIndex).toStrictEqual(1);
    });

    it('should correctly persists the value when save is called', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        manager.initialLiquidityProvider = u256.fromU32(1);
        manager.setBTCowedReserved(u256.fromU32(10), u256.fromU32(999999));
        manager.setBTCowedReserved(u256.fromU32(11), u256.fromU32(888888));
        manager.setBTCowed(u256.fromU32(20), u256.fromU32(777777));
        manager.setBTCowed(u256.fromU32(21), u256.fromU32(666666));

        manager.addToStandardQueue(u256.fromU32(1000));
        manager.addToStandardQueue(u256.fromU32(1001));
        manager.addToStandardQueue(u256.fromU32(1002));

        manager.addToPriorityQueue(u256.fromU32(2000));
        manager.addToPriorityQueue(u256.fromU32(2001));
        manager.addToPriorityQueue(u256.fromU32(2002));

        manager.addToRemovalQueue(u256.fromU32(3000));
        manager.addToRemovalQueue(u256.fromU32(3001));
        manager.addToRemovalQueue(u256.fromU32(3002));

        manager.save();

        const manager2: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        expect(manager.initialLiquidityProvider).toStrictEqual(u256.fromU32(1));
        expect(manager2.getBTCowedReserved(u256.fromU32(10))).toStrictEqual(u256.fromU32(999999));
        expect(manager2.getBTCowedReserved(u256.fromU32(11))).toStrictEqual(u256.fromU32(888888));
        expect(manager2.getBTCowed(u256.fromU32(20))).toStrictEqual(u256.fromU32(777777));
        expect(manager2.getBTCowed(u256.fromU32(21))).toStrictEqual(u256.fromU32(666666));

        expect(manager2.previousReservationStartingIndex).toStrictEqual(0);
        expect(manager2.previousReservationStandardStartingIndex).toStrictEqual(0);
        expect(manager2.previousRemovalStartingIndex).toStrictEqual(0);

        expect(manager2.standardQueueLength).toStrictEqual(3);
        expect(manager2.priorityQueueLength).toStrictEqual(3);
        expect(manager2.removalQueueLength).toStrictEqual(3);

        expect(manager2.priorityQueueStartingIndex).toStrictEqual(0);
        expect(manager2.removalQueueStartingIndex).toStrictEqual(0);
        expect(manager2.standardQueueStartingIndex).toStrictEqual(0);

        expect(manager2.getFromStandardQueue(0)).toStrictEqual(u256.fromU32(1000));
        expect(manager2.getFromStandardQueue(1)).toStrictEqual(u256.fromU32(1001));
        expect(manager2.getFromStandardQueue(2)).toStrictEqual(u256.fromU32(1002));

        expect(manager2.getFromPriorityQueue(0)).toStrictEqual(u256.fromU32(2000));
        expect(manager2.getFromPriorityQueue(1)).toStrictEqual(u256.fromU32(2001));
        expect(manager2.getFromPriorityQueue(2)).toStrictEqual(u256.fromU32(2002));

        expect(manager2.getFromRemovalQueue(0)).toStrictEqual(u256.fromU32(3000));
        expect(manager2.getFromRemovalQueue(1)).toStrictEqual(u256.fromU32(3001));
        expect(manager2.getFromRemovalQueue(2)).toStrictEqual(u256.fromU32(3002));
    });

    it('should return null when calling getNextProviderWithLiquidity and no provider are found', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider = manager.getNextProviderWithLiquidity();

        expect(provider).toBeNull();
    });
});

describe('ProviderManager getNextProviderWithLiquidity with only providers in removal queue tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should set currentIndexRemoval to removalQueue startingIndex when currentIndexRemoval = 0 and provider valid for the test ', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
    });

    it('should use currentIndexRemoval when currentIndexRemoval <> 0 and provider valid for the test', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
    });

    it('should skip deleted providers when there are some in the removal queue before the valid provider for the test', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
    });

    it('should remove provider from the removal queue when the provider is not in pendingRemoval and is a LP', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
    });

    it('should remove provider from the removal queue when the provider is not in pendingRemoval and is not a LP', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
    });

    it('should remove provider from the removal queue when the provider is in pendingRemoval and is not a LP', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
    });

    it('should return the provider when the provider states are valid and (owedBTC - reservedBTC) > strictMinimumProviderReservationAmount', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
    });

    it('should be ??? when the provider states are valid but owedBTC = reservedBTC', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
    });

    it('should be removed from the removal queue when the provider states are valid but (owedBTC - reservedBTC) < strictMinimumProviderReservationAmount', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
    });

    it('should be removed from the removal queue when the provider states are valid but (owedBTC - reservedBTC) = strictMinimumProviderReservationAmount', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
    });

    it('should return null when no provider found', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
    });
});

describe('ProviderManager getNextProviderWithLiquidity with only providers in priority queue tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });
});

describe('ProviderManager getNextProviderWithLiquidity with only providers in standard queue tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });
});

describe('ProviderManager getNextProviderWithLiquidity with only initial liquidity provider tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });
});
