import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Potential,
    Revert,
    SafeMath,
    StoredU256,
    StoredU256Array,
    StoredU64,
} from '@btc-vision/btc-runtime/runtime';
import { StoredMapU256 } from '../../stored/StoredMapU256';
import {
    INITIAL_LIQUIDITY,
    LIQUIDITY_PRIORITY_QUEUE_POINTER,
    LIQUIDITY_QUEUE_POINTER,
    LP_BTC_OWED_POINTER,
    LP_BTC_OWED_RESERVED_POINTER,
    REMOVAL_QUEUE_POINTER,
    STARTING_INDEX_POINTER,
} from '../StoredPointers';
import { getProvider, Provider2 } from '../Provider2';

export class ProviderManager2 {
    private readonly _queue: StoredU256Array;
    private readonly _priorityQueue: StoredU256Array;
    private readonly _removalQueue: StoredU256Array;
    private readonly _startingIndex: StoredU64;
    private readonly _initialLiquidityProvider: StoredU256;
    private readonly _lpBTCowed: StoredMapU256;
    private readonly _lpBTCowedReserved: StoredMapU256;

    private currentIndex: u64 = 0;
    private currentIndexPriority: u64 = 0;
    private currentIndexRemoval: u64 = 0;

    constructor(
        public readonly token: Address,
        public readonly tokenIdUint8Array: Uint8Array,
        public readonly tokenId: u256,
        public readonly strictMinimumProviderReservationAmount: u256,
    ) {
        this._queue = new StoredU256Array(LIQUIDITY_QUEUE_POINTER, tokenIdUint8Array, u256.Zero);

        this._priorityQueue = new StoredU256Array(
            LIQUIDITY_PRIORITY_QUEUE_POINTER,
            tokenIdUint8Array,
            u256.Zero,
        );

        this._removalQueue = new StoredU256Array(
            REMOVAL_QUEUE_POINTER,
            tokenIdUint8Array,
            u256.Zero,
        );

        this._initialLiquidityProvider = new StoredU256(INITIAL_LIQUIDITY, tokenId, u256.Zero);
        this._lpBTCowed = new StoredMapU256(LP_BTC_OWED_POINTER);
        this._lpBTCowedReserved = new StoredMapU256(LP_BTC_OWED_RESERVED_POINTER);
        this._startingIndex = new StoredU64(STARTING_INDEX_POINTER, tokenId, u256.Zero);
    }

    public get previousReservationStandardStartingIndex(): u64 {
        return this._startingIndex.get(0);
    }

    public set previousReservationStandardStartingIndex(value: u64) {
        this._startingIndex.set(0, value);
    }

    public get previousReservationStartingIndex(): u64 {
        return this._startingIndex.get(1);
    }

    public set previousReservationStartingIndex(value: u64) {
        this._startingIndex.set(1, value);
    }

    public get previousRemovalStartingIndex(): u64 {
        return this._startingIndex.get(3);
    }

    public set previousRemovalStartingIndex(value: u64) {
        this._startingIndex.set(3, value);
    }

    public get initialLiquidityProvider(): u256 {
        return this._initialLiquidityProvider.value;
    }

    public set initialLiquidityProvider(value: u256) {
        this._initialLiquidityProvider.value = value;
    }

    public get priorityQueueLength(): u64 {
        return this._priorityQueue.getLength();
    }

    public get priorityQueueStartingIndex(): u64 {
        return this._priorityQueue.startingIndex();
    }

    public addToPriorityQueue(providerId: u256): void {
        this._priorityQueue.push(providerId);
    }

    public addToRemovalQueue(providerId: u256): void {
        this._removalQueue.push(providerId);
    }

    public addToStandardQueue(providerId: u256): void {
        this._queue.push(providerId);
    }

    public getFromPriorityQueue(providerIndex: u64): u256 {
        return this._priorityQueue.get(providerIndex);
    }

    public getFromRemovalQueue(providerIndex: u64): u256 {
        return this._removalQueue.get(providerIndex);
    }

    public getFromStandardQueue(providerIndex: u64): u256 {
        return this._queue.get(providerIndex);
    }

    public getBTCowed(providerId: u256): u256 {
        return this._lpBTCowed.get(providerId) || u256.Zero;
    }

    public setBTCowed(providerId: u256, amount: u256): void {
        this._lpBTCowed.set(providerId, amount);
    }

    public getBTCowedReserved(providerId: u256): u256 {
        return this._lpBTCowedReserved.get(providerId) || u256.Zero;
    }

    public setBTCowedReserved(providerId: u256, amount: u256): void {
        this._lpBTCowedReserved.set(providerId, amount);
    }

    public cleanUpQueues(): void {
        this.cleanUpStandardQueue();
        this.cleanUpPriorityQueue();
        this.cleanUpRemovalQueue();
    }

    public getNextProviderWithLiquidity(): Provider2 | null {
        // 1. Removal queue first
        const removalProvider = this.getNextRemovalQueueProvider();
        if (removalProvider !== null) {
            return removalProvider;
        }

        // 2. Then priority queue
        const priorityProvider = this.getNextPriorityListProvider();
        if (priorityProvider !== null) {
            return priorityProvider;
        }

        // 3. Then normal queue
        let provider: Potential<Provider2> = null;
        let providerId: u256;

        const length: u64 = this._queue.getLength();
        const index: u64 = this._queue.startingIndex();

        if (index > length) {
            throw new Revert('Starting index exceeds queue length');
        }

        if (this.currentIndex === 0) {
            this.currentIndex = index;
        }

        while (this.currentIndex < length) {
            const i: u64 = this.currentIndex;
            providerId = this._queue.get(i);

            if (providerId === u256.Zero) {
                this.currentIndex++;
                continue;
            }
            provider = getProvider(providerId);

            if (!provider.isActive()) {
                this.currentIndex++;
                continue;
            }

            if (provider.isPriority()) {
                this.currentIndex++;
                continue;
            }

            if (u128.lt(provider.liquidity, provider.reserved)) {
                throw new Revert(
                    `Impossible state: liquidity < reserved for provider ${providerId}.`,
                );
            }

            const availableLiquidity: u128 = SafeMath.sub128(provider.liquidity, provider.reserved);
            if (!availableLiquidity.isZero()) {
                provider.indexedAt = i;
                this.currentIndex++;
                provider.fromRemovalQueue = false;
                return provider;
            }

            if (this.currentIndex == u64.MAX_VALUE) {
                throw new Revert('Index increment overflow');
            }
            this.currentIndex++;
        }

        // fallback to initial liquidity provider
        if (!this._initialLiquidityProvider.value.isZero()) {
            const initProvider = getProvider(this._initialLiquidityProvider.value);
            if (initProvider.isActive()) {
                const availableLiquidity: u128 = SafeMath.sub128(
                    initProvider.liquidity,
                    initProvider.reserved,
                );

                if (!availableLiquidity.isZero()) {
                    initProvider.indexedAt = u32.MAX_VALUE;
                    return initProvider;
                }
            }
        }

        return null;
    }

    public removePendingLiquidityProviderFromRemovalQueue(provider: Provider2, i: u64): void {
        this._removalQueue.delete(i);

        provider.pendingRemoval = false;
        provider.isLp = false;
    }

    public resetProvider(provider: Provider2, burnRemainingFunds: boolean = true): void {
        if (burnRemainingFunds && !provider.liquidity.isZero()) {
            //!!!!TransferHelper.safeTransfer(this.token, Address.dead(), provider.liquidity.toU256());
        }

        if (!u256.eq(provider.providerId, this._initialLiquidityProvider.value)) {
            if (provider.isPriority()) {
                this._priorityQueue.delete(provider.indexedAt);
            } else {
                this._queue.delete(provider.indexedAt);
            }
        }

        provider.reset();
    }

    public resetStartingIndex(): void {
        this.previousReservationStartingIndex = 0;
        this.previousReservationStandardStartingIndex = 0;
        this.previousRemovalStartingIndex = 0;
    }

    public restoreCurrentIndex(): void {
        this.currentIndex = this.previousReservationStandardStartingIndex;
        this.currentIndexPriority = this.previousReservationStartingIndex;
        this.currentIndexRemoval = this.previousRemovalStartingIndex;
    }

    public save(): void {
        this.previousReservationStandardStartingIndex =
            this.currentIndex === 0 ? this.currentIndex : this.currentIndex - 1;

        this.previousReservationStartingIndex =
            this.currentIndexPriority === 0
                ? this.currentIndexPriority
                : this.currentIndexPriority - 1;

        this.previousRemovalStartingIndex =
            this.currentIndexRemoval === 0
                ? this.currentIndexRemoval
                : this.currentIndexRemoval - 1;

        this._startingIndex.save();
        this._queue.save();
        this._priorityQueue.save();
        this._removalQueue.save();
    }

    private cleanUpRemovalQueue(): void {
        const removalLength: u64 = this._removalQueue.getLength();
        let removalIndex: u64 = this.previousRemovalStartingIndex;

        while (removalIndex < removalLength) {
            const providerId = this._removalQueue.get(removalIndex);
            if (providerId === u256.Zero) {
                removalIndex++;
                continue;
            }

            const provider = getProvider(providerId);
            if (provider.pendingRemoval) {
                this._removalQueue.setStartingIndex(removalIndex);
                break;
            } else {
                this._removalQueue.delete(removalIndex);
            }
            removalIndex++;
        }
        this.previousRemovalStartingIndex = removalIndex;
    }

    private cleanUpPriorityQueue(): void {
        const priorityLength: u64 = this._priorityQueue.getLength();
        let priorityIndex: u64 = this.previousReservationStartingIndex;

        while (priorityIndex < priorityLength) {
            const providerId = this._priorityQueue.get(priorityIndex);
            if (providerId === u256.Zero) {
                priorityIndex++;
                continue;
            }

            const provider = getProvider(providerId);
            if (provider.isActive()) {
                this._priorityQueue.setStartingIndex(priorityIndex);
                break;
            } else {
                this._priorityQueue.delete(priorityIndex);
            }
            priorityIndex++;
        }
        this.previousReservationStartingIndex = priorityIndex;
    }

    private cleanUpStandardQueue(): void {
        const length: u64 = this._queue.getLength();
        let index: u64 = this.previousReservationStandardStartingIndex;

        while (index < length) {
            const providerId = this._queue.get(index);
            if (providerId === u256.Zero) {
                index++;
                continue;
            }
            const provider = getProvider(providerId);
            if (provider.isActive()) {
                this._queue.setStartingIndex(index);
                break;
            } else {
                this._queue.delete(index);
            }
            index++;
        }
        this.previousReservationStandardStartingIndex = index;
    }

    private getNextRemovalQueueProvider(): Provider2 | null {
        const length: u64 = this._removalQueue.getLength();
        const index: u64 = this._removalQueue.startingIndex();

        // Initialize our pointer if it’s zero
        if (this.currentIndexRemoval === 0) {
            this.currentIndexRemoval = index;
        }

        // Scan forward until we find a valid LP in 'pendingRemoval'
        while (this.currentIndexRemoval < length) {
            const i: u64 = this.currentIndexRemoval;
            const providerId = this._removalQueue.get(i);

            if (providerId.isZero()) {
                // empty slot
                this.currentIndexRemoval++;
                continue;
            }

            const provider = getProvider(providerId);

            // Ensure it's truly in "pendingRemoval" state
            // and is actually an LP who is owed BTC.
            if (provider.pendingRemoval && provider.isLp) {
                const owedBTC = this.getBTCowed(providerId);
                const reservedBTC = this.getBTCowedReserved(providerId);
                const left = SafeMath.sub(owedBTC, reservedBTC);
                if (!left.isZero() && u256.gt(left, this.strictMinimumProviderReservationAmount)) {
                    // This is the next valid removal provider. We do NOT
                    // check provider.liquidity here, because they've already
                    // withdrawn tokens. For the AMM, we treat them as if
                    // they can 'sell' an equivalent portion of tokens for BTC.
                    provider.indexedAt = i;
                    provider.fromRemovalQueue = true;
                    // Advance the pointer
                    this.currentIndexRemoval++;
                    return provider;
                } else {
                    if (u256.lt(owedBTC, this.strictMinimumProviderReservationAmount)) {
                        //Blockchain.log(`Provider ${providerId} has owed BTC less than minimum`);
                        // If they don't have owed BTC, they can be removed from queue
                        //this.removePendingLiquidityProviderFromRemovalQueue(provider, i);
                        throw new Revert(
                            `Impossible state: Provider should have been removed from queue during swap operation.`,
                        );
                    }
                }
            } else {
                // If not pending removal, remove from queue
                //this.removePendingLiquidityProviderFromRemovalQueue(provider, i);
                // !!! TODO: Cannot have this throw in production or it will break the pool
                throw new Revert(`To be tested.`);
            }
            this.currentIndexRemoval++;
        }

        return null;
    }

    private getNextPriorityListProvider(): Provider2 | null {
        let provider: Potential<Provider2> = null;
        let providerId: u256;

        const length: u64 = this._priorityQueue.getLength();
        const index: u64 = this._priorityQueue.startingIndex();

        if (index > length) {
            return null;
        }

        if (this.currentIndexPriority === 0) {
            this.currentIndexPriority = index;
        }

        while (this.currentIndexPriority < length) {
            const i: u64 = this.currentIndexPriority;
            providerId = this._priorityQueue.get(i);
            if (providerId === u256.Zero) {
                this.currentIndexPriority++;
                continue;
            }

            provider = getProvider(providerId);
            if (!provider.isActive()) {
                this.currentIndexPriority++;
                continue;
            }

            if (!provider.isPriority()) {
                throw new Revert('Impossible state: provider is not priority in priority queue.');
            }

            if (u128.lt(provider.liquidity, provider.reserved)) {
                throw new Revert(
                    `Impossible state: liquidity < reserved for provider ${providerId}.`,
                );
            }

            const availableLiquidity: u128 = SafeMath.sub128(provider.liquidity, provider.reserved);
            if (!availableLiquidity.isZero()) {
                provider.indexedAt = i;
                this.currentIndexPriority++;
                provider.fromRemovalQueue = false;
                return provider;
            }

            if (this.currentIndexPriority == u64.MAX_VALUE) {
                throw new Revert('Index increment overflow');
            }

            this.currentIndexPriority++;
        }

        return null;
    }
}
