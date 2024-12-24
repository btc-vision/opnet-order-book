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
    TransactionOutput,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    ANTI_BOT_MAX_TOKENS_PER_RESERVATION,
    INITIAL_LIQUIDITY,
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
import { SwapExecutedEvent } from '../events/SwapExecutedEvent';
import { getTotalFeeCollected } from '../utils/OrderBookUtils';

export class LiquidityQueue {
    public static RESERVATION_EXPIRE_AFTER: u64 = 5;

    public static STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT: u256 = u256.fromU32(600); // 750 satoshis worth.
    public static MINIMUM_PROVIDER_RESERVATION_AMOUNT: u256 = u256.fromU32(1000); // 750 satoshis worth.
    public static MINIMUM_LIQUIDITY_IN_SAT_VALUE_ADD_LIQUIDITY: u256 = u256.fromU32(10_000); // 100_000 satoshis worth.

    public static PERCENT_TOKENS_FOR_PRIORITY_QUEUE: u128 = u128.fromU32(30); // 3%
    public static PERCENT_TOKENS_FOR_PRIORITY_FACTOR: u128 = u128.fromU32(1000); // 100%

    public static PRICE_PER_USER_IN_PRIORITY_QUEUE_BTC: u64 = 100;
    public static PRIORITY_QUEUE_BASE_FEES: u64 = 1000; // 1000 satoshis

    public readonly tokenId: u256;
    private readonly _p0: StoredU256;
    private readonly _ewmaL: StoredU256;
    private readonly _ewmaV: StoredU256;

    private readonly _queue: StoredU256Array;
    private readonly _priorityQueue: StoredU256Array;
    private readonly _totalReserves: StoredMapU256;
    private readonly _totalReserved: StoredMapU256;

    private readonly _initialLiquidityProvider: StoredU256;

    private readonly _settingPurge: StoredU64;
    private readonly _settings: StoredU64;
    private readonly _quoteHistory: StoredU256Array;
    private readonly _maxTokenPerSwap: StoredU256;

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

        this._maxTokenPerSwap = new StoredU256(
            ANTI_BOT_MAX_TOKENS_PER_RESERVATION,
            tokenId,
            u256.Zero,
        );

        this._totalReserves = new StoredMapU256(TOTAL_RESERVES_POINTER);
        this._totalReserved = new StoredMapU256(LIQUIDITY_RESERVED_POINTER);

        this._initialLiquidityProvider = new StoredU256(INITIAL_LIQUIDITY, tokenId, u256.Zero);

        this._settingPurge = new StoredU64(
            LIQUIDITY_EWMA_LAST_UPDATE_BLOCK_POINTER,
            tokenId,
            u256.Zero,
        );

        this._settings = new StoredU64(RESERVATION_SETTINGS_POINTER, tokenId, u256.Zero);

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
        return this._settings.get(0);
    }

    public set previousReservationStandardStartingIndex(value: u64) {
        this._settings.set(0, value);
    }

    public get previousReservationStartingIndex(): u64 {
        return this._settings.get(1);
    }

    public set previousReservationStartingIndex(value: u64) {
        this._settings.set(1, value);
    }

    public get antiBotExpirationBlock(): u64 {
        return this._settings.get(2);
    }

    public set antiBotExpirationBlock(value: u64) {
        this._settings.set(2, value);
    }

    public get maxTokensPerReservation(): u256 {
        return this._maxTokenPerSwap.value;
    }

    public set maxTokensPerReservation(value: u256) {
        this._maxTokenPerSwap.value = value;
    }

    public createPool(
        floorPrice: u256,
        providerId: u256,
        initialLiquidity: u128,
        receiver: string,
        antiBotEnabledFor: u16,
        antiBotMaximumTokensPerReservation: u256,
    ): void {
        this.p0 = floorPrice;

        this._initialLiquidityProvider.value = providerId;
        this.addLiquidity(providerId, initialLiquidity, receiver, false, true);

        // Anti bot settings if enabled...
        if (antiBotEnabledFor) {
            this.antiBotExpirationBlock = Blockchain.block.numberU64 + u64(antiBotEnabledFor);
            this.maxTokensPerReservation = antiBotMaximumTokensPerReservation;
        }

        this.save();
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
        this._settings.save();
    }

    public quote(): u256 {
        return quoter.calculatePrice(this.p0, this.ewmaV, this.ewmaL);
    }

    public addLiquidity(
        providerId: u256,
        amountIn: u128,
        receiver: string,
        usePriorityQueue: boolean,
        initialLiquidity: boolean = false,
    ): void {
        if (u256.eq(providerId, this._initialLiquidityProvider.value) && !initialLiquidity) {
            throw new Revert('You can only add liquidity to the initial provider once.');
        }

        const provider: Provider = getProvider(providerId);
        const oldLiquidity: u128 = provider.liquidity;
        if (!u128.lt(oldLiquidity, SafeMath.sub128(u128.Max, amountIn))) {
            throw new Revert('Liquidity overflow. Please add a smaller amount.');
        }

        if (provider.isPriority() && !usePriorityQueue) {
            throw new Revert(
                'You already have an active position in the priority queue. Please use the priority queue.',
            );
        }

        const quote = this.quote();
        if (quote.isZero()) {
            throw new Revert('Quote is zero. Please set P0 if you are the owner of the token.');
        }

        const liquidityInSatoshis: u256 = SafeMath.div(amountIn.toU256(), quote);
        if (
            u256.lt(
                liquidityInSatoshis,
                LiquidityQueue.MINIMUM_LIQUIDITY_IN_SAT_VALUE_ADD_LIQUIDITY,
            )
        ) {
            throw new Revert(
                `Liquidity value is too low, it must be at least worth ${LiquidityQueue.MINIMUM_LIQUIDITY_IN_SAT_VALUE_ADD_LIQUIDITY} satoshis. (was worth ${liquidityInSatoshis} sat)`,
            );
        }

        // Transfer the full amountIn from user to contract first
        TransferHelper.safeTransferFrom(
            this.token,
            Blockchain.tx.sender,
            Blockchain.contractAddress,
            amountIn.toU256(),
        );

        // Compute net liquidity if priority is requested for the new amount
        // If normal queue: no tax on new liquidity
        // If priority queue: tax on new liquidity
        const newLiquidityNet: u128 = usePriorityQueue
            ? this.getTokensAfterTax(amountIn)
            : amountIn;

        const newTax: u128 = SafeMath.sub128(amountIn, newLiquidityNet);

        // If transitioning from normal to priority:
        // We must also tax the old liquidity at the same rate
        let oldTax: u128 = u128.Zero;
        const wasNormal = !provider.isPriority() && provider.isActive() && usePriorityQueue;
        if (wasNormal) {
            // Compute tax on old liquidity
            oldTax = this.computePriorityTax(oldLiquidity.toU256()).toU128();

            // Switch provider to priority
            provider.setActive(true, true);
            this._priorityQueue.push(providerId);
        } else if (!provider.isActive()) {
            // If provider not active, activate now
            provider.setActive(true, usePriorityQueue);

            if (!initialLiquidity) {
                if (usePriorityQueue) {
                    this._priorityQueue.push(providerId);
                } else {
                    this._queue.push(providerId);
                }
            }
        }

        // Add new liquidity to the provider
        provider.liquidity = SafeMath.add128(oldLiquidity, amountIn);

        // If provider's liquidity is reserved by someone else, we cannot change the receiver
        if (!provider.reserved.isZero() && provider.btcReceiver !== receiver) {
            throw new Revert(
                'Cannot change receiver address for provider when someone reserved your liquidity',
            );
        } else if (provider.reserved.isZero()) {
            provider.btcReceiver = receiver;
        }

        this.updateTotalReserve(this.tokenId, amountIn.toU256(), true);

        // If priority, we must remove oldTax + newTax from provider's liquidity and total reserves
        if (usePriorityQueue) {
            // Verify fees collected are enough to use priority queue
            const feesCollected: u64 = getTotalFeeCollected();
            const costPriorityQueue: u64 = this.getCostPriorityFee();

            if (feesCollected < costPriorityQueue) {
                throw new Revert('Not enough fees collected to use priority queue.');
            }

            const totalTax: u128 = SafeMath.add128(oldTax, newTax);
            if (!totalTax.isZero()) {
                // Remove tax from provider liquidity
                provider.liquidity = SafeMath.sub128(provider.liquidity, totalTax);

                // Remove tax from total reserves
                this.updateTotalReserve(this.tokenId, totalTax.toU256(), false);

                // Transfer the total tax from contract to dead
                TransferHelper.safeTransfer(this.token, Address.dead(), totalTax.toU256());
            }
        }

        // Update EWMA and block quote
        this.updateEWMA_L();
        this.setBlockQuote();

        // Emit liquidity added event
        const liquidityEvent = new LiquidityAddedEvent(provider.liquidity, receiver);
        Blockchain.emit(liquidityEvent);
    }

    public swap(buyer: Address): void {
        // We must now get the user reservation and consume all the reserved position when possible.
        // If the user have sent not enough tokens for a specific provider, we must consume the amount worth of what the user sent.
        // If there is not enough liquidity left in the provider, we must burn the tokens left and destroy the provider.
        // If a provider is destroyed, we must increase the startingIndex of the queue until we find a provider that is active. (after all providers trades are executed)
        // We must also update the total reserves and the total reserved, we must update EWMA of liquidity and volume.
        // We must fetch the quote that was stored at the creation of the reservation.
        // To get the amount of satoshis that the user sent to a provider, we must use the findAmountForAddressInOutputUTXOs() method.
        // We must reset the user reservation after the trade is executed.
        // Once the swap is executed, we must check the queues for inactive providers and destroy them (starting from the starting index), we then update the starting index.
        // We must set to 0 the reservation in the "reservation list" for the block so it doesn't get purged since it's already consumed. (technically optional)

        // Retrieve the user's reservation
        const reservation = new Reservation(buyer, this.token);
        if (!reservation.valid()) {
            throw new Revert('No active reservation found for this address.');
        }

        if (
            reservation.expirationBlock() - LiquidityQueue.RESERVATION_EXPIRE_AFTER ===
            Blockchain.block.numberU64
        ) {
            throw new Revert('Too early');
        }

        // Fetch the quote stored at the time of reservation
        const quoteAtReservation = this._quoteHistory.get(reservation.createdAt);
        if (quoteAtReservation.isZero()) {
            throw new Revert(
                `Critical error: Quote at reservation is zero. Report that to the owner of this contract.`,
            );
        }

        // Get the outputs of the transaction to find amounts sent to providers
        const outputs: TransactionOutput[] = Blockchain.tx.outputs;

        // Get reserved indexes, values, and priority flags from the reservation
        const reservedIndexes = reservation.getReservedIndexes();
        const reservedValues = reservation.getReservedValues();
        const reservedPriority = reservation.getReservedPriority();

        let totalTokensTransferred: u256 = u256.Zero;
        let totalSatoshisSpent: u256 = u256.Zero;

        for (let i = 0; i < reservedIndexes.length; i++) {
            const providerIndex: u64 = reservedIndexes[i];
            const reservedAmount = reservedValues[i]; // u128
            const priority = reservedPriority[i];

            // Retrieve the provider
            const providerId = priority
                ? this._priorityQueue.get(providerIndex)
                : this._queue.get(providerIndex);

            if (providerId.isZero()) throw new Revert(`Invalid provider at index ${providerIndex}`);

            const provider = getProvider(providerId);
            provider.indexedAt = providerIndex;

            // Get the amount of satoshis sent by the buyer to the provider's BTC receiver address
            const satoshisSent = this.findAmountForAddressInOutputUTXOs(
                outputs,
                provider.btcReceiver,
            );

            if (satoshisSent.isZero()) {
                Blockchain.log(`Expected amount ${satoshisSent} from ${provider.btcReceiver}`);

                // Buyer didn't send any satoshis to this provider
                this.restoreReservedLiquidityForProvider(provider, reservedAmount);
                continue;
            }

            // Adjust for scaling factor
            const tokensToTransfer = SafeMath.mul(satoshisSent, quoteAtReservation);
            //Blockchain.log(
            //    `Expected amount: ${reservedAmount}, Actual amount: ${tokensToTransfer}`,
            //);

            // Cap the tokens to transfer to the reserved amount
            const reservedU256 = reservedAmount.toU256();
            const tokensToTransferCapped = SafeMath.min(tokensToTransfer, reservedU256);
            if (tokensToTransferCapped.isZero()) {
                this.restoreReservedLiquidityForProvider(provider, reservedAmount);
                continue;
            }

            // Update provider's reserved and liquidity amounts
            const tokensToTransferU128 = tokensToTransferCapped.toU128();
            //Blockchain.log(
            //    `(${provider.indexedAt}) Transferring ${tokensToTransferU128} tokens to ${buyer}, ${provider.btcReceiver} spent ${satoshisSent} satoshis, provider ${provider.btcReceiver} reserved ${provider.reserved} liquidity ${provider.liquidity}`,
            //);

            provider.reserved = SafeMath.sub128(provider.reserved, tokensToTransferU128);
            provider.liquidity = SafeMath.sub128(provider.liquidity, tokensToTransferU128);

            // Verify for dust and minimum amount left.
            const satoshisLeftValue: u256 = SafeMath.div(
                provider.liquidity.toU256(),
                quoteAtReservation,
            );

            if (
                u256.lt(
                    satoshisLeftValue,
                    LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
                )
            ) {
                this.resetProvider(provider);
            }

            // Update total tokens transferred and satoshis spent
            totalTokensTransferred = SafeMath.add(totalTokensTransferred, tokensToTransferCapped);
            totalSatoshisSpent = SafeMath.add(totalSatoshisSpent, satoshisSent);
        }

        if (totalTokensTransferred.isZero()) {
            throw new Revert(
                'No tokens were transferred. Ensure you have sent the correct amount of satoshis.',
            );
        }

        //Blockchain.log(
        //    `Total tokens transferred: ${totalTokensTransferred}, Total satoshis spent: ${totalSatoshisSpent}`,
        //);

        TransferHelper.safeTransfer(this.token, buyer, totalTokensTransferred);

        // Update total reserves and total reserved
        this.updateTotalReserved(this.tokenId, totalTokensTransferred, false);
        this.updateTotalReserve(this.tokenId, totalTokensTransferred, false);

        // Update EWMA of liquidity and volume
        this.updateEWMA_V(totalTokensTransferred);
        this.updateEWMA_L();

        // Reset the user's reservation after the trade is executed
        reservation.delete();

        // Remove inactive providers from the queues and update starting indexes
        this.cleanUpQueues();

        const swapEvent = new SwapExecutedEvent(buyer, totalSatoshisSpent, totalTokensTransferred);
        Blockchain.emit(swapEvent);
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

        // anti-bot limits check
        if (Blockchain.block.numberU64 <= this.antiBotExpirationBlock) {
            if (u256.gt(maximumAmountIn, this.maxTokensPerReservation)) {
                throw new Revert('You cannot exceed the anti-bot maximum tokens per reservation.');
            }
        }

        //Blockchain.log(
        //    `Current price: ${currentPrice}, Maximum amount in: ${maximumAmountIn}, Tokens remaining: ${tokensRemaining}`,
        //);

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
                    this.resetProvider(provider);
                }

                // this should also be checked on the swap method.
                continue;
            }

            // TODO: Make sure this works correctly, we can only reserve 15 bytes.
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

            // TODO: Change this to a u32 array instead of u16. and add checks.
            if (provider.indexedAt > u32.MAX_VALUE) {
                throw new Revert('IndexedAt is bigger than u16 (change to u32)');
            }

            // Add reservation to the reservation list
            reservation.reserveAtIndex(
                <u32>provider.indexedAt,
                reserveAmount.toU128(),
                provider.isPriority(),
            );
            c++;

            // Emit reservation event containing the provider's BTC receiver address
            const liquidityReservedEvent = new LiquidityReserved(
                provider.btcReceiver,
                costInSatoshis.toU128(),
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
            //const decayFactor: u256 = Quoter.pow(
            //    Quoter.DECAY_RATE_PER_BLOCK,
            //    u256.fromU64(blocksElapsed),
            //);
            // Adjust ewmaL by applying the decay
            //this.ewmaL = u256.One; //SafeMath.div(SafeMath.mul(this.ewmaL, decayFactor), Quoter.SCALING_FACTOR);
        } else {
            this.ewmaL = quoter.updateEWMA(
                currentLiquidityU256,
                this.ewmaL,
                u256.fromU64(blocksElapsed),
            );
        }

        this.lastUpdateBlockEWMA_L = Blockchain.block.numberU64;
    }

    public getCostPriorityFee(): u64 {
        const length = this._priorityQueue.getLength();
        const startingIndex = this._priorityQueue.startingIndex();
        const realLength = length - startingIndex;

        return (
            realLength * LiquidityQueue.PRICE_PER_USER_IN_PRIORITY_QUEUE_BTC +
            LiquidityQueue.PRIORITY_QUEUE_BASE_FEES
        );
    }

    /**
     * Compute the priority tax (3%) for a given amount of liquidity.
     * Based on PERCENT_TOKENS_FOR_PRIORITY_QUEUE = 30 and PERCENT_TOKENS_FOR_PRIORITY_FACTOR = 1000,
     * tax = amount * (30/1000) = amount * 0.03
     */
    private computePriorityTax(amount: u256): u256 {
        const numerator = SafeMath.mul(
            amount,
            LiquidityQueue.PERCENT_TOKENS_FOR_PRIORITY_QUEUE.toU256(),
        );
        return SafeMath.div(numerator, LiquidityQueue.PERCENT_TOKENS_FOR_PRIORITY_FACTOR.toU256());
    }

    private resetProvider(provider: Provider): void {
        if (!provider.liquidity.isZero()) {
            TransferHelper.safeTransfer(this.token, Address.dead(), provider.liquidity.toU256());
        }

        if (provider.isPriority()) {
            this._priorityQueue.delete(provider.indexedAt + this._priorityQueue.startingIndex());
        } else {
            this._queue.delete(provider.indexedAt + this._priorityQueue.startingIndex());
        }

        provider.reset();
    }

    private restoreReservedLiquidityForProvider(provider: Provider, reserved: u128): void {
        provider.reserved = SafeMath.sub128(provider.reserved, reserved);
        provider.liquidity = SafeMath.add128(provider.liquidity, reserved);

        this.updateTotalReserved(this.tokenId, reserved.toU256(), false);
    }

    private cleanUpQueues(): void {
        // Clean up standard queue
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

        // Clean up priority queue
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

    private findAmountForAddressInOutputUTXOs(outputs: TransactionOutput[], address: string): u256 {
        let amount: u64 = 0;
        for (let i = 0; i < outputs.length; i++) {
            const output = outputs[i];
            if (output.to === address) {
                amount += output.value;
            }
        }

        return u256.fromU64(amount);
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
        // Note that the list should be by token and by block at the same time, so we must make the sha256 of the block by the token..
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

        //Blockchain.log(
        //    `Purging reservations from block ${lastPurgedBlock + 1} to ${maxBlockToPurge}, current block ${currentBlockNumber}, last purge: ${this.lastPurgedBlock}`,
        //);

        let totalReservedAmount: u256 = u256.Zero;
        let updatedOne: boolean = false;
        for (let blockNumber = lastPurgedBlock; blockNumber < maxBlockToPurge; blockNumber++) {
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
                    const providerIndex: u64 = reservedIndexes[j];
                    const reservedAmount: u128 = reservedValues[j];
                    const priority: bool = reservedPriority[j];

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
                        //Blockchain.log(
                        //    `Provider ${providerId} has less than minimum liquidity. Destroying provider. (priority: ${priority}, index: ${providerIndex})`,
                        //);
                        // Dust is not reserved, so we must subtract it from the total reserves.
                        if (provider.isPriority()) {
                            this._priorityQueue.delete(providerIndex);
                        } else {
                            this._queue.delete(providerIndex);
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
                totalReservedAmount = SafeMath.add(
                    totalReservedAmount,
                    reservedValues.reduce<u256>(
                        (acc, val) => SafeMath.add(acc, val.toU256()),
                        u256.Zero,
                    ),
                );

                // Delete the reservation data
                reservation.delete();
            }

            // Set reservation list length to zero
            reservationList.deleteAll();
            reservationList.save();
        }

        if (updatedOne) {
            //Blockchain.log(`Restored ${totalReservedAmount.toString()} of reserved liquidity`);

            this.updateTotalReserved(this.tokenId, totalReservedAmount, false);

            // Update EWMA of liquidity
            this.updateEWMA_L(); // temporally.

            // Save where to restart from.
            this.previousReservationStartingIndex = 0;
            this.previousReservationStandardStartingIndex = 0;
        } else {
            this.onNoPurge();
        }

        // Update lastPurgedBlock
        this.lastPurgedBlock = currentBlockNumber;
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

            //const difference: u64 = this.currentIndexPriority - index;

            // Ensure the difference fits within a u16 to prevent overflow
            //if (difference > <u64>u32.MAX_VALUE) {
            //    throw new Revert('Index difference exceeds u16.MAX_VALUE');
            //}

            //const v: u16 = <u16>difference;

            // Additional check to ensure that casting did not wrap around
            //if (v === u16.MAX_VALUE && difference !== <u64>u16.MAX_VALUE) {
            //    throw new Revert('Index overflow detected');
            //}

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
            //const difference: u64 = this.currentIndex - index;

            // Ensure the difference fits within a u16 to prevent overflow
            //if (difference > <u64>u32.MAX_VALUE) {
            //    throw new Revert('Index difference exceeds u16.MAX_VALUE');
            //}

            //const v: u16 = <u16>difference;

            // Additional check to ensure that casting did not wrap around
            //if (v === u16.MAX_VALUE && difference !== <u64>u16.MAX_VALUE) {
            //    throw new Revert('Index overflow detected');
            //}

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
                // Moved to priority queue
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
                provider.indexedAt = i; //v;
                this.currentIndex++;

                return provider;
            }

            // Check for potential overflow before incrementing
            if (this.currentIndex == u64.MAX_VALUE) {
                throw new Revert('Index increment overflow');
            }

            this.currentIndex++;
        }

        // Initial liquidity provider
        if (!this._initialLiquidityProvider.value.isZero()) {
            const initProvider = getProvider(this._initialLiquidityProvider.value);

            if (initProvider.isActive()) {
                const availableLiquidity: u128 = SafeMath.sub128(
                    initProvider.liquidity,
                    initProvider.reserved,
                );

                if (!availableLiquidity.isZero()) {
                    return initProvider;
                }
            }
        }

        return null;
    }
}
