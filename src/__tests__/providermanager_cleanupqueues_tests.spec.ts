import { Blockchain, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { clearCachedProviders, Provider } from '../lib/Provider';
import { ProviderManager } from '../lib/Liquidity/ProviderManager';
import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    createProvider,
    providerAddress1,
    providerAddress2,
    providerAddress3,
    STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
    tokenAddress1,
    tokenId1,
    tokenIdUint8Array1,
} from './test_helper';

describe('ProviderManager removal queue cleanUpQueues tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

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

    it('should skip a deleted provider and correctly set previousRemovalStartingIndex', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);

        manager.addToRemovalQueue(provider1.providerId);
        manager.addToRemovalQueue(provider2.providerId);

        manager.removePendingLiquidityProviderFromRemovalQueue(provider1, 0);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);

        manager.cleanUpQueues();

        expect(manager.previousRemovalStartingIndex).toStrictEqual(2);
        expect(manager.getFromRemovalQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromRemovalQueue(1)).toStrictEqual(u256.Zero);
    });
});

describe('ProviderManager priority queue cleanUpQueues tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
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

    it('should skip a deleted provider and correctly set previousReservationStartingIndex', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider1.setActive(true, true);
        provider1.indexedAt = 0;
        provider2.setActive(false, true);
        manager.addToPriorityQueue(provider1.providerId);
        manager.addToPriorityQueue(provider2.providerId);

        expect(manager.getFromPriorityQueue(0)).toStrictEqual(provider1.providerId);

        manager.resetProvider(provider1, false);

        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);

        manager.cleanUpQueues();

        expect(manager.previousReservationStartingIndex).toStrictEqual(2);
        expect(manager.getFromPriorityQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromPriorityQueue(1)).toStrictEqual(u256.Zero);
    });
});

describe('ProviderManager standard queue cleanUpQueues tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
        TransferHelper.clearMockedResults();
    });

    it('should correctly set previousReservationStandardStartingIndex and queue state when cleanUpQueues is called, previousReservationStandardStartingIndex = 0, 1 provider not active', () => {
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

    it('should correctly set previousReservationStandardStartingIndex and queue state when cleanUpQueues is called, previousReservationStandardStartingIndex = 0, 1 provider active', () => {
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

    it('should correctly set previousReservationStandardStartingIndex and queue state when cleanUpQueues is called, previousReservationStandardStartingIndex = 0, 1 provider not active and 1 provider active', () => {
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

    it('should correctly set previousReservationStandardStartingIndex and queue state when cleanUpQueues is called, previousReservationStandardStartingIndex = 0, 2 provider not active', () => {
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

    it('should correctly set previousReservationStandardStartingIndex and queue state when cleanUpQueues is called, previousReservationStandardStartingIndex = 0, 1 provider active and 1 provider not active', () => {
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

    it('should correctly set previousReservationStandardStartingIndex and queue state when cleanUpQueues is called, previousReservationStandardStartingIndex = 0, 2 providers active', () => {
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

    it('should correctly set previousReservationStandardStartingIndex and queue state when cleanUpQueues is called, previousReservationStandardStartingIndex <> 0, 1 provider not active', () => {
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

    it('should correctly set previousReservationStandardStartingIndex and queue state when cleanUpQueues is called, previousReservationStandardStartingIndex <> 0, 1 provider active', () => {
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

    it('should correctly set previousReservationStandardStartingIndex and queue state when cleanUpQueues is called, previousReservationStandardStartingIndex <> 0, 1 provider not active and 1 provider active', () => {
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

    it('should correctly set previousReservationStandardStartingIndex and queue state when cleanUpQueues is called, previousReservationStandardStartingIndex <> 0, 2 provider not active', () => {
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

    it('should correctly set previousReservationStandardStartingIndex and queue state when cleanUpQueues is called, previousReservationStandardStartingIndex <> 0, 1 provider active and 1 provider not active', () => {
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

    it('should correctly set previousReservationStandardStartingIndex and queue state when cleanUpQueues is called, previousReservationStandardStartingIndex <> 0, 2 providers active', () => {
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

    it('should correctly set previousReservationStandardStartingIndex and queue state when cleanUpQueues is called, previousReservationStandardStartingIndex <> 0, 1 provider active state and 1 provider not active', () => {
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

    it('should skip a deleted provider and correctly set previousReservationStandardStartingIndex', () => {
        const manager: ProviderManager = new ProviderManager(
            tokenAddress1,
            tokenIdUint8Array1,
            tokenId1,
            STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
        );
        const provider1: Provider = createProvider(providerAddress1, tokenAddress1);
        const provider2: Provider = createProvider(providerAddress2, tokenAddress1);
        provider1.setActive(true, false);
        provider1.indexedAt = 0;
        provider2.setActive(false, false);
        manager.addToStandardQueue(provider1.providerId);
        manager.addToStandardQueue(provider2.providerId);

        expect(manager.getFromStandardQueue(0)).toStrictEqual(provider1.providerId);

        manager.resetProvider(provider1, false);

        expect(manager.getFromStandardQueue(0)).toStrictEqual(u256.Zero);

        manager.cleanUpQueues();

        expect(manager.previousReservationStandardStartingIndex).toStrictEqual(2);
        expect(manager.getFromStandardQueue(0)).toStrictEqual(u256.Zero);
        expect(manager.getFromStandardQueue(1)).toStrictEqual(u256.Zero);
    });
});
