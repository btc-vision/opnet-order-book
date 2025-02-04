import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { clearCachedProviders, Provider } from '../lib/Provider';
import { ProviderManager } from '../lib/Liquidity/ProviderManager';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    createProvider,
    createProviders,
    providerAddress1,
    STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
    tokenAddress1,
    tokenId1,
    tokenIdUint8Array1,
} from './test_helper';

describe('ProviderManager tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
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

    it('should correctly persists the value when save is called and currentIndex > 0', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providers = createProviders(4, 0);

        for (let i: u8 = 0; i < 4; i++) {
            providers[i].liquidity = u128.fromU32(1000);
            providers[i].reserved = u128.fromU32(999);
            manager.setBTCowedReserved(providers[i].providerId, u256.fromU32(777777));
            manager.setBTCowed(providers[i].providerId, u256.fromU32(666666));
            manager.addToStandardQueue(providers[i].providerId);
        }

        // Should set currentIndex to 2
        const p1 = manager.getNextProviderWithLiquidity();
        const p2 = manager.getNextProviderWithLiquidity();

        expect(p1).toBe(providers[0]);
        expect(p2).toBe(providers[1]);

        manager.save();

        //previousReservationStandardStartingIndex = currentIndex - 1
        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(1);
    });

    it('should correctly persists the value when save is called and currentIndexPriority > 0', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providers = createProviders(4, 0);

        for (let i: u8 = 0; i < 4; i++) {
            providers[i].setActive(true, true);
            providers[i].liquidity = u128.fromU32(1000);
            providers[i].reserved = u128.fromU32(999);
            manager.setBTCowedReserved(providers[i].providerId, u256.fromU32(777777));
            manager.setBTCowed(providers[i].providerId, u256.fromU32(666666));
            manager.addToPriorityQueue(providers[i].providerId);
        }

        // Should set currentIndex to 2
        const p1 = manager.getNextProviderWithLiquidity();
        const p2 = manager.getNextProviderWithLiquidity();
        const p3 = manager.getNextProviderWithLiquidity();

        expect(p1).toBe(providers[0]);
        expect(p2).toBe(providers[1]);
        expect(p3).toBe(providers[2]);

        manager.save();

        //previousReservationStartingIndex = currentIndexPriority - 1
        expect(manager.previousReservationStartingIndex).toStrictEqual(2);
    });

    it('should correctly persists the value when save is called and currentIndexRemoval > 0', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const providers = createProviders(4, 0, true);

        for (let i: u8 = 0; i < 4; i++) {
            manager.setBTCowedReserved(providers[i].providerId, u256.fromU32(777777));
            manager.setBTCowed(providers[i].providerId, u256.fromU32(888888));
            manager.addToRemovalQueue(providers[i].providerId);
        }

        // Should set currentIndex to 2
        const p1 = manager.getNextProviderWithLiquidity();
        const p2 = manager.getNextProviderWithLiquidity();
        const p3 = manager.getNextProviderWithLiquidity();

        expect(p1).toBe(providers[0]);
        expect(p2).toBe(providers[1]);
        expect(p3).toBe(providers[2]);

        manager.save();

        //previousReservationStartingIndex = currentIndexPriority - 1
        expect(manager.previousRemovalStartingIndex).toStrictEqual(2);
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

    it('should burn the provider funds when resetProvider is called with burnRemainingFunds is true and liquidity is not 0', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider: Provider = createProvider(providerAddress1, tokenAddress1);
        manager.resetProvider(provider, true);

        expect(TransferHelper.safeTransferCalled).toBeTruthy();
    });

    it('should not burn the provider funds when resetProvider is called with burnRemainingFunds is true and liquidity is 0', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider: Provider = createProvider(providerAddress1, tokenAddress1);
        provider.liquidity = u128.Zero;
        manager.resetProvider(provider, true);

        expect(TransferHelper.safeTransferCalled).toBeFalsy();
    });

    it('should not burn the provider funds when resetProvider is called with burnRemainingFunds is false', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider: Provider = createProvider(providerAddress1, tokenAddress1);
        provider.liquidity = u128.Zero;
        manager.resetProvider(provider, false);

        expect(TransferHelper.safeTransferCalled).toBeFalsy();
    });

    it('should not remove the initialprovider from the queues but reset it when resetProvider is called and provider is the initialliquidity provider', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider: Provider = createProvider(providerAddress1, tokenAddress1);
        manager.initialLiquidityProvider = provider.providerId;

        manager.resetProvider(provider, false);

        expect(provider.isActive()).toBeFalsy();
    });

    it('should remove the provider from the priority queue and reset it when resetProvider is called', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider: Provider = createProvider(providerAddress1, tokenAddress1);
        provider.setActive(true, true);
        manager.addToPriorityQueue(provider.providerId);

        const provider2 = manager.getNextProviderWithLiquidity();

        expect(provider2).not.toBeNull();
        if (provider2 !== null) {
            manager.resetProvider(provider2, false);

            expect(provider2.isActive()).toBeFalsy();
            expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        }
    });

    it('should remove the provider from the standard queue and reset it when resetProvider is called', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );

        const provider: Provider = createProvider(providerAddress1, tokenAddress1);
        provider.setActive(true, false);
        manager.addToStandardQueue(provider.providerId);

        const provider2 = manager.getNextProviderWithLiquidity();

        expect(provider2).not.toBeNull();
        if (provider2 !== null) {
            manager.resetProvider(provider2, false);

            expect(provider2.isActive()).toBeFalsy();
            expect(manager.getFromStandardQueue(0)).toStrictEqual(u256.Zero);
        }
    });
});
