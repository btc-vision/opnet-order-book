import {
    Address,
    Blockchain,
    BytesWriter,
    Potential,
    Revert,
    SafeMath,
    StoredU128Array,
    StoredU256,
    StoredU256Array,
    StoredU64,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from 'as-bignum/assembly';
import {
    LIQUIDITY_EWMA_L_POINTER,
    LIQUIDITY_EWMA_LAST_UPDATE_BLOCK_POINTER,
    LIQUIDITY_EWMA_P0_POINTER,
    LIQUIDITY_EWMA_V_POINTER,
    LIQUIDITY_PRIORITY_QUEUE_POINTER,
    LIQUIDITY_QUEUE_POINTER,
    LIQUIDITY_QUOTE_HISTORY_POINTER,
    LIQUIDITY_RESERVED_POINTER,
    RESERVATION_IDS_BY_BLOCK_POINTER,
    RESERVATION_SETTINGS_POINTER,
    TOTAL_RESERVES_POINTER,
} from './StoredPointers';
import { StoredMapU256 } from '../stored/StoredMapU256';
import { getProvider, Provider } from './Provider';
import { LiquidityAddedEvent } from '../events/LiquidityAddedEvent';
import { quoter, Quoter } from '../math/Quoter';
import { LiquidityReserved } from '../events/LiquidityReserved';
import { Reservation } from './Reservation';
import { MAX_RESERVATION_AMOUNT_PROVIDER } from '../data-types/UserLiquidity';
import { ReservationCreatedEvent } from '../events/ReservationCreatedEvent';

export class LiquidityQueue {
    public static RESERVATION_EXPIRE_AFTER: u64 = 5;
    public static STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT: u256 = u256.fromU32(600); // 750 satoshis worth.
    public static MINIMUM_PROVIDER_RESERVATION_AMOUNT: u256 = u256.fromU32(1000); // 750 satoshis worth.
    public static MINIMUM_LIQUIDITY_IN_SAT_VALUE_ADD_LIQUIDITY: u256 = u256.fromU32(10_000); // 100_000 satoshis worth.

    public static PRICE_PER_USER_IN_PRIORITY_QUEUE_BTC: u64 = 1000;
    public static PERCENT_TOKENS_FOR_PRIORITY_QUEUE: u128 = u128.fromU32(30); // 3%
    public static PERCENT_TOKENS_FOR_PRIORITY_FACTOR: u128 = u128.fromU32(1000); // 100%

    public readonly tokenId: u256;
    private readonly _p0: StoredU256;
    private readonly _ewmaL: StoredU256;
    private readonly _ewmaV: StoredU256;

    private readonly _queue: StoredU256Array;
    private readonly _priorityQueue: StoredU256Array;
    private readonly _totalReserves: StoredMapU256;
    private readonly _totalReserved: StoredMapU256;

    private readonly _settingPurge: StoredU64;
    private readonly _reservationSettings: StoredU64;
    private readonly _quoteHistory: StoredU256Array;

    private currentIndex: u64 = 0;
    private currentIndexPriority: u64 = 0;

    constructor(
        public readonly token: Address,
        public readonly tokenIdUint8Array: Uint8Array,
    ) {
        const tokenId = u256.fromBytes(token, true);
        this.tokenId = tokenId;

        this._queue = new StoredU256Array(LIQUIDITY_QUEUE_POINTER, tokenIdUint8Array, u256.Zero);
        this._priorityQueue = new StoredU256Array(
            LIQUIDITY_PRIORITY_QUEUE_POINTER,
            tokenIdUint8Array,
            u256.Zero,
        );
        this._quoteHistory = new StoredU256Array(
            LIQUIDITY_QUOTE_HISTORY_POINTER,
            tokenIdUint8Array,
            u256.Zero,
        );

        this._ewmaL = new StoredU256(LIQUIDITY_EWMA_L_POINTER, tokenId, u256.Zero);
        this._ewmaV = new StoredU256(LIQUIDITY_EWMA_V_POINTER, tokenId, u256.Zero);
        this._p0 = new StoredU256(LIQUIDITY_EWMA_P0_POINTER, tokenId, u256.Zero);

        this._totalReserves = new StoredMapU256(TOTAL_RESERVES_POINTER);
        this._totalReserved = new StoredMapU256(LIQUIDITY_RESERVED_POINTER);

        this._settingPurge = new StoredU64(
            LIQUIDITY_EWMA_LAST_UPDATE_BLOCK_POINTER,
            tokenId,
            u256.Zero,
        );

        this._reservationSettings = new StoredU64(RESERVATION_SETTINGS_POINTER, tokenId, u256.Zero);

        this.purgeReservationsAndRestoreProviders();
    }

    public get p0(): u256 {
        return this._p0.value;
    }

    public set p0(value: u256) {
        this._p0.value = SafeMath.mul(value, Quoter.SCALING_FACTOR);
    }

    public get ewmaV(): u256 {
        return this._ewmaV.value;
    }

    public set ewmaV(value: u256) {
        this._ewmaV.value = value;
    }

    public get ewmaL(): u256 {
        return this._ewmaL.value;
    }

    public set ewmaL(value: u256) {
        this._ewmaL.value = value;
    }

    public get reservedLiquidity(): u256 {
        return this._totalReserved.get(this.tokenId) || u256.Zero;
    }

    public get liquidity(): u256 {
        return this._totalReserves.get(this.tokenId) || u256.Zero;
    }

    public get lastUpdateBlockEWMA_V(): u64 {
        return this._settingPurge.get(0);
    }

    public set lastUpdateBlockEWMA_V(value: u64) {
        this._settingPurge.set(0, value);
    }

    public get lastUpdateBlockEWMA_L(): u64 {
        return this._settingPurge.get(1);
    }

    public set lastUpdateBlockEWMA_L(value: u64) {
        this._settingPurge.set(1, value);
    }

    public get lastPurgedBlock(): u64 {
        return this._settingPurge.get(2);
    }

    public set lastPurgedBlock(value: u64) {
        this._settingPurge.set(2, value);
    }

    public get previousReservationStandardStartingIndex(): u64 {
        return this._reservationSettings.get(0);
    }

    public set previousReservationStandardStartingIndex(value: u64) {
        this._reservationSettings.set(0, value);
    }

    public get previousReservationStartingIndex(): u64 {
        return this._reservationSettings.get(1);
    }

    public set previousReservationStartingIndex(value: u64) {
        this._reservationSettings.set(1, value);
    }

    public save(): void {
        this.previousReservationStandardStartingIndex =
            this.currentIndex === 0 ? this.currentIndex : this.currentIndex - 1;

        this.previousReservationStartingIndex =
            this.currentIndexPriority === 0
                ? this.currentIndexPriority
                : this.currentIndexPriority - 1;

        this._settingPurge.save();
        this._queue.save();
        this._priorityQueue.save();
        this._quoteHistory.save();
        this._reservationSettings.save();
    }

    public quote(): u256 {
        return quoter.calculatePrice(this.p0, this.ewmaV, this.ewmaL);
    }

    public addLiquidity(
        providerId: u256,
        amountIn: u128,
        receiver: string,
        usePriorityQueue: boolean,
    ): void {
        const provider: Provider = getProvider(providerId);
        const liquidity: u128 = provider.liquidity;

        // Tax for priority queue
        const liquidityAmount: u128 = usePriorityQueue
            ? this.getTokensAfterTax(amountIn)
            : amountIn;

        const taxAmount: u128 = SafeMath.sub128(amountIn, liquidityAmount);
        if (!u128.lt(liquidity, SafeMath.sub128(u128.Max, liquidityAmount))) {
            throw new Revert('Liquidity overflow. Please add a smaller amount.');
        }

        if (provider.isPriority() && !usePriorityQueue) {
            throw new Revert(
                'You already have an active position in the priority queue. Please use the priority queue.',
            );
        }

        const quote = this.quote();
        if (quote.isZero()) {
            throw new Revert(`Quote is zero. Please set P0 if you are the owner of the token.`);
        }

        const liquidityInSatoshis: u256 = SafeMath.div(liquidityAmount.toU256(), quote);
        if (
            u256.lt(
                liquidityInSatoshis,
                LiquidityQueue.MINIMUM_LIQUIDITY_IN_SAT_VALUE_ADD_LIQUIDITY,
            )
        ) {
            throw new Revert(
                `Liquidity value is too low, it must be at least worth ${LiquidityQueue.MINIMUM_LIQUIDITY_IN_SAT_VALUE_ADD_LIQUIDITY} satoshis.`,
            );
        }

        // TODO: Verify if the BTC fees were provided.
        provider.liquidity = SafeMath.add128(liquidity, liquidityAmount);

        if (!provider.reserved.isZero()) {
            if (provider.btcReceiver !== receiver) {
                throw new Revert(
                    'Cannot change receiver address for provider when someone reserved your liquidity',
                );
            }
        }

        if (!provider.isActive()) {
            provider.setActive(true, usePriorityQueue);

            if (usePriorityQueue) {
                this._priorityQueue.push(providerId);
            } else {
                this._queue.push(providerId);
            }
        }

        if (usePriorityQueue) {
            // TODO: Transfer the token fees somewhere.
            TransferHelper.safeTransferFrom(
                this.token,
                Blockchain.tx.sender,
                Address.dead(),
                taxAmount.toU256(),
            );
        }

        const liquidityAmountU256: u256 = liquidityAmount.toU256();
        TransferHelper.safeTransferFrom(
            this.token,
            Blockchain.tx.sender,
            Blockchain.contractAddress,
            liquidityAmountU256,
        );

        this.updateTotalReserve(this.tokenId, liquidityAmountU256, true);

        // Update the EWMA of liquidity after adding liquidity
        this.updateEWMA_L();
        this.setBlockQuote();

        const liquidityEvent = new LiquidityAddedEvent(provider.liquidity, receiver);
        Blockchain.emit(liquidityEvent);
    }

    public reserveLiquidity(buyer: Address, maximumAmountIn: u256, minimumAmountOut: u256): u256 {
        const reservation = new Reservation(buyer, this.token);
        if (reservation.valid()) {
            throw new Revert('Reservation already active');
        }

        const currentPrice: u256 = this.quote();

        let tokensReserved: u256 = u256.Zero;
        let satSpent: u256 = u256.Zero;
        let tokensRemaining: u256 = SafeMath.mul(maximumAmountIn, currentPrice);

        const totalAvailableLiquidity: u256 = SafeMath.sub(this.liquidity, this.reservedLiquidity);
        if (u256.lt(totalAvailableLiquidity, tokensRemaining)) {
            tokensRemaining = totalAvailableLiquidity;
        }

        if (tokensRemaining.isZero()) {
            return u256.Zero;
        }

        let c: u32 = 0;
        while (!tokensRemaining.isZero()) {
            const provider: Provider | null = this.getNextProviderWithLiquidity();
            if (provider === null) {
                break;
            }

            const providerLiquidity: u256 = SafeMath.sub128(
                provider.liquidity,
                provider.reserved,
            ).toU256();

            const maxCostInSatoshis: u256 = SafeMath.div(providerLiquidity, currentPrice);
            if (
                u256.lt(
                    maxCostInSatoshis,
                    LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
                )
            ) {
                if (provider.reserved.isZero()) {
                    // Remove provider from the queue
                    if (provider.isPriority()) {
                        this._priorityQueue.delete(provider.indexedAt);
                    } else {
                        this._queue.delete(provider.indexedAt);
                    }

                    provider.reset();
                }

                // this should also be checked on the swap method.
                continue;
            }

            let reserveAmount: u256 = SafeMath.min(
                SafeMath.min(providerLiquidity, tokensRemaining),
                MAX_RESERVATION_AMOUNT_PROVIDER.toU256(),
            );

            // should never underflow
            let costInSatoshis: u256 = SafeMath.div(reserveAmount, currentPrice);
            const amountLeftInSatoshis: u256 = SafeMath.sub(maxCostInSatoshis, costInSatoshis);
            if (u256.lt(amountLeftInSatoshis, LiquidityQueue.MINIMUM_PROVIDER_RESERVATION_AMOUNT)) {
                // We have to check for remaning dust.
                costInSatoshis = maxCostInSatoshis;
                reserveAmount = providerLiquidity;

                // this should also be checked on the swap method.
            }

            // Update provider's reserved amount
            const reservedAmountU128 = reserveAmount.toU128();
            provider.reserved = SafeMath.add128(provider.reserved, reservedAmountU128);

            // Change reserves.
            tokensReserved = SafeMath.add(tokensReserved, reserveAmount);

            // Check for underflow
            if (u256.gt(tokensRemaining, reserveAmount)) {
                tokensRemaining = SafeMath.sub(tokensRemaining, reserveAmount);
            } else {
                tokensRemaining = u256.Zero;
            }

            satSpent = SafeMath.add(satSpent, costInSatoshis);

            // Add reservation to the reservation list
            reservation.reserveAtIndex(
                provider.indexedAt,
                reserveAmount.toU128(),
                provider.isPriority(),
            );
            c++;

            // Emit reservation event containing the provider's BTC receiver address
            const liquidityReservedEvent = new LiquidityReserved(
                provider.btcReceiver,
                reserveAmount.toU128(),
            );
            Blockchain.emit(liquidityReservedEvent);
        }

        if (tokensReserved.isZero()) {
            //throw new Revert('No liquidity available');
            return u256.Zero;
        }

        if (u256.lt(tokensReserved, minimumAmountOut)) {
            throw new Revert('Not enough liquidity reserved');
        }

        this.updateTotalReserved(this.tokenId, tokensReserved, true);

        // Config for the reservation
        reservation.setExpirationBlock(
            Blockchain.block.numberU64 + LiquidityQueue.RESERVATION_EXPIRE_AFTER,
        );

        reservation.save();

        const reservationList = this.getReservationListForBlock(Blockchain.block.numberU64);
        reservationList.push(reservation.reservationId);
        reservationList.save();

        // Update the EWMA of buy volume after the trade is executed
        this.updateEWMA_V(tokensReserved);
        this.updateEWMA_L();
        this.setBlockQuote();

        const reservationEvent = new ReservationCreatedEvent(tokensReserved, satSpent);
        Blockchain.emit(reservationEvent);

        return tokensReserved;
    }

    public updateEWMA_V(currentBuyVolume: u256): void {
        const blocksElapsed: u64 = SafeMath.sub64(
            Blockchain.block.numberU64,
            this.lastUpdateBlockEWMA_V,
        );

        const scaledCurrentBuyVolume: u256 = SafeMath.mul(currentBuyVolume, Quoter.SCALING_FACTOR);

        this.ewmaV = quoter.updateEWMA(
            scaledCurrentBuyVolume,
            this.ewmaV,
            u256.fromU64(blocksElapsed),
        );

        this.lastUpdateBlockEWMA_V = Blockchain.block.numberU64;
    }

    public updateEWMA_L(): void {
        const blocksElapsed: u64 = SafeMath.sub64(
            Blockchain.block.numberU64,
            this.lastUpdateBlockEWMA_L,
        );

        const currentLiquidityU256: u256 = SafeMath.mul(
            SafeMath.sub(this.liquidity, this.reservedLiquidity),
            Quoter.SCALING_FACTOR,
        );

        if (currentLiquidityU256.isZero()) {
            // When liquidity is zero, adjust EWMA_L to decrease over time
            const decayFactor: u256 = Quoter.pow(
                Quoter.DECAY_RATE_PER_BLOCK,
                u256.fromU64(blocksElapsed),
            );

            // Adjust ewmaL by applying the decay
            this.ewmaL = SafeMath.div(SafeMath.mul(this.ewmaL, decayFactor), Quoter.SCALING_FACTOR);
        } else {
            this.ewmaL = quoter.updateEWMA(
                currentLiquidityU256,
                this.ewmaL,
                u256.fromU64(blocksElapsed),
            );
        }

        this.lastUpdateBlockEWMA_L = Blockchain.block.numberU64;
    }

    private getTokensAfterTax(amountIn: u128): u128 {
        const tokensForPriorityQueue: u128 = SafeMath.div128(
            SafeMath.mul128(amountIn, LiquidityQueue.PERCENT_TOKENS_FOR_PRIORITY_QUEUE),
            LiquidityQueue.PERCENT_TOKENS_FOR_PRIORITY_FACTOR,
        );

        return SafeMath.sub128(amountIn, tokensForPriorityQueue);
    }

    private purgeReservationsAndRestoreProviders(): void {
        // We must restore the reserved liquidity that was not consumed by reservations that expired.
        // If the provider have less than the minimum amount of liquidity, even after restoring the reserved liquidity, we must destroy the provider.
        // We must also remove the expired reservations from the queue.
        // We must subtract the expired reserved liquidity of the total reserved liquidity and the provider's reserved liquidity.
        // We must also update the total reserves.
        // We must update the EMWA of liquidity and volume if necessary.
        // We must be very efficient in the purging process. We must not iterate over the entire queue.
        // We must store all the reservations id to a list (block based) and iterate over them. Add this to reserveLiquidity, the array can be an u128 array since reservations are 128 bits.
        // Note that the list should be by token and by block at the same time, so we must make the sha256 of the block by the token.
        // We do not clear the list as it uses a lot of gas. We just set the length to zero.
        // We need to load every reservation in the block and check if they are consumed or not, we can do reservation.isActive() to know if the reservation is still active.
        // We only load the reservations from x to x + y, where x is the last purged block. y is how many block to check maximum. y can not be bigger than RESERVATION_EXPIRE_AFTER. x + y can not be bigger than currentBlock - RESERVATION_EXPIRE_AFTER.
        // This allows us to skip all the blocks that we are sure had no reservations.

        const lastPurgedBlock: u64 = this.lastPurgedBlock;
        const currentBlockNumber: u64 = Blockchain.block.numberU64;
        const expireAfter: u64 = LiquidityQueue.RESERVATION_EXPIRE_AFTER;

        // Determine the maximum block to purge
        let maxBlockToPurge: u64 = lastPurgedBlock + expireAfter;
        if (currentBlockNumber > expireAfter) {
            const maxPossibleBlock = currentBlockNumber - expireAfter;
            if (maxBlockToPurge > maxPossibleBlock) {
                maxBlockToPurge = maxPossibleBlock;
            }
        } else {
            this.onNoPurge();
            // Not enough blocks have passed to purge any reservations
            return;
        }

        // If no new blocks to purge
        if (lastPurgedBlock >= maxBlockToPurge) {
            this.onNoPurge();
            return;
        }

        let updatedOne: boolean = false;
        for (let blockNumber = lastPurgedBlock + 1; blockNumber <= maxBlockToPurge; blockNumber++) {
            //Blockchain.log(`Purging reservations for block ${blockNumber}`);
            const reservationList = this.getReservationListForBlock(blockNumber);
            const reservationIds = reservationList.getAll(0, reservationList.getLength() as u32);

            for (let i = 0; i < reservationIds.length; i++) {
                const reservationId = reservationIds[i];
                const reservation = Reservation.load(reservationId);

                if (!reservation.isActive()) {
                    // Skip inactive reservations (consumed)
                    continue;
                }

                const reservedIndexes = reservation.getReservedIndexes();
                const reservedValues = reservation.getReservedValues();
                const reservedPriority = reservation.getReservedPriority();

                for (let j = 0; j < reservedIndexes.length; j++) {
                    const providerIndex = reservedIndexes[j];
                    const reservedAmount = reservedValues[j];
                    const priority = reservedPriority[j];

                    const providerId = priority
                        ? this._priorityQueue.get(providerIndex)
                        : this._queue.get(providerIndex);

                    const provider = getProvider(providerId);
                    provider.indexedAt = providerIndex;

                    // Decrease provider's reserved amount
                    provider.reserved = SafeMath.sub128(provider.reserved, reservedAmount);

                    // Check if provider's available liquidity is less than minimum required
                    const availableLiquidity = SafeMath.sub128(
                        provider.liquidity,
                        provider.reserved,
                    );
                    if (
                        u128.lt(
                            availableLiquidity,
                            LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT.toU128(),
                        )
                    ) {
                        Blockchain.log(
                            `Provider ${providerId} has less than minimum liquidity. Destroying provider. (priority: ${priority}, index: ${providerIndex})`,
                        );
                        // Dust is not reserved, so we must subtract it from the total reserves.
                        if (provider.isPriority()) {
                            this._priorityQueue.delete(provider.indexedAt);
                        } else {
                            this._queue.delete(provider.indexedAt);
                        }

                        // Destroy the provider
                        provider.reset();
                    }

                    //Blockchain.log(
                    //    `Restored ${reservedAmount.toString()} of reserved liquidity for provider ${providerId}`,
                    //);

                    // Save the provider
                    provider.save();

                    updatedOne = true;
                }

                // Adjust total reserved liquidity
                const totalReservedAmount = reservedValues.reduce<u256>(
                    (acc, val) => SafeMath.add(acc, val.toU256()),
                    u256.Zero,
                );

                //Blockchain.log(`Restored ${totalReservedAmount.toString()} of reserved liquidity`);

                this.updateTotalReserved(this.tokenId, totalReservedAmount, false);

                // Delete the reservation data
                reservation.delete();
            }

            // Set reservation list length to zero
            reservationList.setLength(0);
            reservationList.save();
        }

        if (updatedOne) {
            // Update EWMA of liquidity
            this.updateEWMA_L(); // temporally.

            // Save where to restart from.
            this.previousReservationStartingIndex = 0;
            this.previousReservationStandardStartingIndex = 0;
        } else {
            this.onNoPurge();
        }

        // Update lastPurgedBlock
        this.lastPurgedBlock = maxBlockToPurge;
    }

    private onNoPurge(): void {
        this.currentIndex = this.previousReservationStandardStartingIndex;
        this.currentIndexPriority = this.previousReservationStartingIndex;
    }

    private getReservationListForBlock(blockNumber: u64): StoredU128Array {
        // 28 bytes, 4 bytes left, 4 bytes for the indexes, which will never happen since the theoretical limit is 4000 OP_NET transactions per block.
        const writer = new BytesWriter(8 + this.tokenIdUint8Array.length);
        writer.writeU64(blockNumber);
        writer.writeBytes(this.tokenIdUint8Array); // 20 bytes.

        const keyBytes = writer.getBuffer();
        return new StoredU128Array(RESERVATION_IDS_BY_BLOCK_POINTER, keyBytes, u256.Zero);
    }

    private setBlockQuote(): void {
        // I am aware that this will break at block 2^32, but it is not a concern for now or any human lifetime.
        // In 82850 years, everything will break
        if (<u64>u32.MAX_VALUE < Blockchain.block.numberU64) {
            throw new Revert('Block number is too large');
        }

        const blockNumberU32: u32 = <u32>Blockchain.block.numberU64;
        this._quoteHistory.set(blockNumberU32, this.quote());
    }

    private updateTotalReserve(token: u256, amount: u256, increase: bool): void {
        const currentReserve = this._totalReserves.get(token) || u256.Zero;
        const newReserve = increase
            ? SafeMath.add(currentReserve, amount)
            : SafeMath.sub(currentReserve, amount);

        this._totalReserves.set(token, newReserve);
    }

    private updateTotalReserved(token: u256, amount: u256, increase: bool): void {
        const currentReserved = this._totalReserved.get(token) || u256.Zero;
        const newReserved = increase
            ? SafeMath.add(currentReserved, amount)
            : SafeMath.sub(currentReserved, amount);

        this._totalReserved.set(token, newReserved);
    }

    // LAST IN FIRST OUT
    private getNextPriorityListProvider(): Provider | null {
        let provider: Potential<Provider> = null;
        let providerId: u256;

        const length: u64 = this._priorityQueue.getLength();
        const index: u64 = this._priorityQueue.startingIndex();

        // Ensure that the starting index does not exceed the queue length to prevent underflow
        if (index > length) {
            return null;
        }

        if (this.currentIndexPriority === 0) {
            this.currentIndexPriority = index;
        }

        while (this.currentIndexPriority < length) {
            //Blockchain.log(
            //    `Priority queue length: ${length}, index: ${index}, i: ${this.currentIndexPriority}`,
            //);

            const difference: u64 = this.currentIndexPriority - index;

            // Ensure the difference fits within a u16 to prevent overflow
            if (difference > <u64>u32.MAX_VALUE) {
                throw new Revert('Index difference exceeds u16.MAX_VALUE');
            }

            const v: u16 = <u16>difference;

            // Additional check to ensure that casting did not wrap around
            if (v === u16.MAX_VALUE && difference !== <u64>u16.MAX_VALUE) {
                throw new Revert('Index overflow detected');
            }

            providerId = this._priorityQueue.get(this.currentIndexPriority);
            if (providerId === u256.Zero) {
                this.currentIndexPriority++;
                continue;
            }

            provider = getProvider(providerId);
            if (!provider.isActive()) {
                this.currentIndexPriority++;
                continue;
            }

            if (u128.lt(provider.liquidity, provider.reserved)) {
                throw new Revert(
                    `Impossible state: liquidity < reserved for provider ${providerId}.`,
                );
            }

            const availableLiquidity: u128 = SafeMath.sub128(provider.liquidity, provider.reserved);
            if (!availableLiquidity.isZero()) {
                provider.indexedAt = v;
                this.currentIndexPriority++;

                return provider;
            }

            // Check for potential overflow before incrementing
            if (this.currentIndexPriority == u64.MAX_VALUE) {
                throw new Revert('Index increment overflow');
            }

            this.currentIndexPriority++;
        }

        return null;
    }

    // FIRST IN LAST OUT
    private getNextProviderWithLiquidity(): Provider | null {
        const priorityProvider = this.getNextPriorityListProvider();
        if (priorityProvider !== null) {
            return priorityProvider;
        }

        let provider: Potential<Provider> = null;
        let providerId: u256;

        const length: u64 = this._queue.getLength();
        const index: u64 = this._queue.startingIndex();

        // Ensure that the starting index does not exceed the queue length to prevent underflow
        if (index > length) {
            throw new Revert('Starting index exceeds queue length');
        }

        if (this.currentIndex === 0) {
            this.currentIndex = index;
        }

        while (this.currentIndex < length) {
            const difference: u64 = this.currentIndex - index;

            // Ensure the difference fits within a u16 to prevent overflow
            if (difference > <u64>u32.MAX_VALUE) {
                throw new Revert('Index difference exceeds u16.MAX_VALUE');
            }

            const v: u16 = <u16>difference;

            // Additional check to ensure that casting did not wrap around
            if (v === u16.MAX_VALUE && difference !== <u64>u16.MAX_VALUE) {
                throw new Revert('Index overflow detected');
            }

            providerId = this._queue.get(this.currentIndex);
            if (providerId === u256.Zero) {
                this.currentIndex++;
                continue;
            }

            provider = getProvider(providerId);
            if (!provider.isActive()) {
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
                provider.indexedAt = v;
                this.currentIndex++;

                return provider;
            }

            // Check for potential overflow before incrementing
            if (this.currentIndex == u64.MAX_VALUE) {
                throw new Revert('Index increment overflow');
            }

            this.currentIndex++;
        }

        return null;
    }
}
