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
    DELTA_BTC_BUY,
    DELTA_BTC_SELL,
    DELTA_TOKENS_ADD,
    DELTA_TOKENS_BUY,
    DELTA_TOKENS_SELL,
    INITIAL_LIQUIDITY,
    LIQUIDITY_EWMA_B_POINTER,
    LIQUIDITY_EWMA_L_POINTER,
    LIQUIDITY_EWMA_LAST_UPDATE_BLOCK_POINTER,
    LIQUIDITY_EWMA_P0_POINTER,
    LIQUIDITY_EWMA_S_POINTER,
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
import { LiquidityReserved } from '../events/LiquidityReserved';
import { Reservation } from './Reservation';
import { MAX_RESERVATION_AMOUNT_PROVIDER } from '../data-types/UserLiquidity';
import { ReservationCreatedEvent } from '../events/ReservationCreatedEvent';
import { SwapExecutedEvent } from '../events/SwapExecutedEvent';
import { getTotalFeeCollected } from '../utils/OrderBookUtils';
import { FeeManager } from './FeeManager';

export class LiquidityQueue {
    // Reservation settings
    public static RESERVATION_EXPIRE_AFTER: u64 = 5;
    public static STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT: u256 = u256.fromU32(600);

    public static MINIMUM_PROVIDER_RESERVATION_AMOUNT: u256 = u256.fromU32(1000);
    public static MINIMUM_LIQUIDITY_IN_SAT_VALUE_ADD_LIQUIDITY: u256 = u256.fromU32(10_000);
    public static PERCENT_TOKENS_FOR_PRIORITY_QUEUE: u128 = u128.fromU32(30);
    public static PERCENT_TOKENS_FOR_PRIORITY_FACTOR: u128 = u128.fromU32(1000);

    // -----------------------------------------
    //private static readonly BTC_DECIMALS: u32 = 8;
    private static readonly TOKEN_DECIMALS: u32 = 20;

    public readonly tokenId: u256;

    // "virtual" reserves
    private readonly _virtualBTCReserve: StoredU256;
    private readonly _virtualTokenReserve: StoredU256;

    // We'll keep p0 in a pointer
    private readonly _p0: StoredU256;
    private readonly _initialLiquidityProvider: StoredU256;
    private readonly _queue: StoredU256Array;
    private readonly _priorityQueue: StoredU256Array;
    private readonly _quoteHistory: StoredU256Array;
    private readonly _totalReserves: StoredMapU256;
    private readonly _totalReserved: StoredMapU256;

    // We'll store the last block updated
    private readonly _lastVirtualUpdateBlock: StoredU64;
    private readonly _settingPurge: StoredU64;
    private readonly _settings: StoredU64;
    private readonly _maxTokenPerSwap: StoredU256;

    // Indices for the queue
    private currentIndex: u64 = 0;
    private currentIndexPriority: u64 = 0;
    private readonly _deltaTokensAdd: StoredU256;

    // Buys (BTC in, tokens out)
    private readonly _deltaBTCBuy: StoredU256;
    private readonly _deltaTokensBuy: StoredU256;

    // Sells (tokens in, BTC out)
    private readonly _deltaBTCSell: StoredU256;
    private readonly _deltaTokensSell: StoredU256;
    private calculatedScaleFactor: u256 = u256.Zero;

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

        // virtual reserves
        this._virtualBTCReserve = new StoredU256(LIQUIDITY_EWMA_B_POINTER, tokenId, u256.Zero);
        this._virtualTokenReserve = new StoredU256(LIQUIDITY_EWMA_S_POINTER, tokenId, u256.Zero);
        this._p0 = new StoredU256(LIQUIDITY_EWMA_P0_POINTER, tokenId, u256.Zero);

        // new accumulators
        this._deltaTokensAdd = new StoredU256(DELTA_TOKENS_ADD, tokenId, u256.Zero);
        this._deltaBTCBuy = new StoredU256(DELTA_BTC_BUY, tokenId, u256.Zero);
        this._deltaTokensBuy = new StoredU256(DELTA_TOKENS_BUY, tokenId, u256.Zero);
        this._deltaBTCSell = new StoredU256(DELTA_BTC_SELL, tokenId, u256.Zero);
        this._deltaTokensSell = new StoredU256(DELTA_TOKENS_SELL, tokenId, u256.Zero);

        // last block
        this._lastVirtualUpdateBlock = new StoredU64(LIQUIDITY_EWMA_L_POINTER, tokenId, u256.Zero);

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

        // Purge old reservations
        this.purgeReservationsAndRestoreProviders();
    }

    // ================================
    public get p0(): u256 {
        return this._p0.value;
    }

    // ================================
    // GETTERS & SETTERS

    public set p0(value: u256) {
        this._p0.value = value;
    }

    public get virtualBTCReserve(): u256 {
        return this._virtualBTCReserve.value;
    }

    public set virtualBTCReserve(value: u256) {
        this._virtualBTCReserve.value = value;
    }

    public get virtualTokenReserve(): u256 {
        return this._virtualTokenReserve.value;
    }

    public set virtualTokenReserve(value: u256) {
        this._virtualTokenReserve.value = value;
    }

    public get deltaTokensAdd(): u256 {
        return this._deltaTokensAdd.value;
    }

    public set deltaTokensAdd(val: u256) {
        this._deltaTokensAdd.value = val;
    }

    public get deltaBTCBuy(): u256 {
        return this._deltaBTCBuy.value;
    }

    public set deltaBTCBuy(val: u256) {
        this._deltaBTCBuy.value = val;
    }

    public get deltaTokensBuy(): u256 {
        return this._deltaTokensBuy.value;
    }

    public set deltaTokensBuy(val: u256) {
        this._deltaTokensBuy.value = val;
    }

    public get deltaBTCSell(): u256 {
        return this._deltaBTCSell.value;
    }

    public set deltaBTCSell(val: u256) {
        this._deltaBTCSell.value = val;
    }

    public get deltaTokensSell(): u256 {
        return this._deltaTokensSell.value;
    }

    public set deltaTokensSell(val: u256) {
        this._deltaTokensSell.value = val;
    }

    public get lastVirtualUpdateBlock(): u64 {
        return this._lastVirtualUpdateBlock.get(0);
    }

    public set lastVirtualUpdateBlock(value: u64) {
        this._lastVirtualUpdateBlock.set(0, value);
    }

    public get reservedLiquidity(): u256 {
        return this._totalReserved.get(this.tokenId) || u256.Zero;
    }

    public get liquidity(): u256 {
        return this._totalReserves.get(this.tokenId) || u256.Zero;
    }

    public get lastPurgedBlock(): u64 {
        return this._settingPurge.get(2);
    }

    public set lastPurgedBlock(value: u64) {
        this._settingPurge.set(2, value);
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

    public get maxReserves5BlockPercent(): u64 {
        return this._settings.get(3);
    }

    public set maxReserves5BlockPercent(value: u64) {
        this._settings.set(3, value);
    }

    // This ensures we don't lose precision if B < T.
    public get SCALE_FACTOR(): u256 {
        if (this.calculatedScaleFactor.isZero()) {
            //const diff =  - LiquidityQueue.BTC_DECIMALS;
            this.calculatedScaleFactor = SafeMath.pow(
                u256.fromU32(10),
                u256.fromU32(LiquidityQueue.TOKEN_DECIMALS),
            );
        }

        return this.calculatedScaleFactor;
    }

    public createPool(
        floorPrice: u256,
        providerId: u256,
        initialLiquidity: u128,
        receiver: string,
        antiBotEnabledFor: u16,
        antiBotMaximumTokensPerReservation: u256,
        maxReservesIn5BlocksPercent: u16,
    ): void {
        this.p0 = floorPrice;
        this._initialLiquidityProvider.value = providerId;

        const initialLiquidityU256 = initialLiquidity.toU256();
        this.virtualBTCReserve = SafeMath.div(initialLiquidityU256, floorPrice);
        this.virtualTokenReserve = initialLiquidityU256;

        // set max reserves in 5 blocks
        this.maxReserves5BlockPercent = <u64>maxReservesIn5BlocksPercent;

        // add initial liquidity
        this.addLiquidity(providerId, initialLiquidity, receiver, false, true);

        // if dev wants anti-bot
        if (antiBotEnabledFor) {
            this.antiBotExpirationBlock = Blockchain.block.numberU64 + u64(antiBotEnabledFor);
            this.maxTokensPerReservation = antiBotMaximumTokensPerReservation;
        }

        //Blockchain.log(
        //    `Initial quote for token: ${this.quote()}, T0: ${initialLiquidityU256}, B0: ${this.virtualBTCReserve}, S0: ${this.virtualTokenReserve}, F: ${floorPrice}`,
        //);

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
        this.updateVirtualPoolIfNeeded();
        const T: u256 = this.virtualTokenReserve;
        if (T.isZero()) {
            return u256.Zero;
        }

        return SafeMath.div(T, this.virtualBTCReserve);
    }

    public addLiquidity(
        providerId: u256,
        amountIn: u128,
        receiver: string,
        usePriorityQueue: boolean,
        initialLiquidity: boolean = false,
    ): void {
        // once-per-block update
        this.updateVirtualPoolIfNeeded();

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

        // If not initial liquidity, we do a price check
        if (!initialLiquidity) {
            const currentPrice: u256 = this.quote(); // scaled
            if (currentPrice.isZero()) {
                throw new Revert('Quote is zero. Please set P0 if you are the owner of the token.');
            }
            if (u256.eq(providerId, this._initialLiquidityProvider.value)) {
                throw new Revert(`Initial provider can only add once, if not initialLiquidity.`);
            }
            //
            // Convert user's tokens to satoshi value for the "minimum liquidity in sat" check:
            //
            const liquidityInSatoshis: u256 = this.tokensToSatoshis(
                amountIn.toU256(),
                currentPrice,
            );
            //Blockchain.log(
            //    `liquidityInSatoshis: ${liquidityInSatoshis}, currentPrice: ${currentPrice}`,
            //);
            if (
                u256.lt(
                    liquidityInSatoshis,
                    LiquidityQueue.MINIMUM_LIQUIDITY_IN_SAT_VALUE_ADD_LIQUIDITY,
                )
            ) {
                throw new Revert('Liquidity value is too low in satoshis.');
            }
        }

        // transfer tokens
        const u256AmountIn = amountIn.toU256();
        TransferHelper.safeTransferFrom(
            this.token,
            Blockchain.tx.sender,
            Blockchain.contractAddress,
            u256AmountIn,
        );

        // net if priority
        const newLiquidityNet: u128 = usePriorityQueue
            ? this.getTokensAfterTax(amountIn)
            : amountIn;

        const newTax: u128 = SafeMath.sub128(amountIn, newLiquidityNet);

        // handle normal->priority
        let oldTax: u128 = u128.Zero;
        const wasNormal = !provider.isPriority() && provider.isActive() && usePriorityQueue;
        if (wasNormal) {
            oldTax = this.computePriorityTax(oldLiquidity.toU256()).toU128();
            provider.setActive(true, true);
            this._priorityQueue.push(providerId);
        } else if (!provider.isActive()) {
            provider.setActive(true, usePriorityQueue);
            if (!initialLiquidity) {
                if (usePriorityQueue) {
                    this._priorityQueue.push(providerId);
                } else {
                    this._queue.push(providerId);
                }
            }
        }

        // add to provider
        provider.liquidity = SafeMath.add128(oldLiquidity, amountIn);

        // check receiver
        if (!provider.reserved.isZero() && provider.btcReceiver !== receiver) {
            throw new Revert('Cannot change receiver address while reserved.');
        } else if (provider.reserved.isZero()) {
            provider.btcReceiver = receiver;
        }

        // update total reserves
        this.updateTotalReserve(this.tokenId, u256AmountIn, true);

        // if priority => remove tax
        if (usePriorityQueue) {
            const feesCollected: u64 = getTotalFeeCollected();
            const costPriorityQueue: u64 = this.getCostPriorityFee();
            if (feesCollected < costPriorityQueue) {
                throw new Revert('Not enough fees for priority queue.');
            }
            const totalTax: u128 = SafeMath.add128(oldTax, newTax);
            if (!totalTax.isZero()) {
                provider.liquidity = SafeMath.sub128(provider.liquidity, totalTax);
                this.updateTotalReserve(this.tokenId, totalTax.toU256(), false);
                TransferHelper.safeTransfer(this.token, Address.dead(), totalTax.toU256());
            }
        }

        // net tokens to add
        const netAdded: u256 = SafeMath.sub(u256AmountIn, newTax.toU256());

        // update accumulators
        if (!initialLiquidity) {
            this.sellTokens(netAdded, u256.Zero);
        }

        this.setBlockQuote();

        const ev = new LiquidityAddedEvent(provider.liquidity, receiver);
        Blockchain.emit(ev);
    }

    public getCostPriorityFee(): u64 {
        const length = this._priorityQueue.getLength();
        const startingIndex = this._priorityQueue.startingIndex();
        const realLength = length - startingIndex;

        return (
            realLength * FeeManager.PRICE_PER_USER_IN_PRIORITY_QUEUE_BTC +
            FeeManager.PRIORITY_QUEUE_BASE_FEE
        );
    }

    public swap(buyer: Address): void {
        this.updateVirtualPoolIfNeeded();

        const reservation = new Reservation(buyer, this.token);
        if (!reservation.valid()) {
            throw new Revert('No active reservation for this address.');
        }

        if (
            reservation.expirationBlock() - LiquidityQueue.RESERVATION_EXPIRE_AFTER ===
            Blockchain.block.numberU64
        ) {
            throw new Revert('Too early');
        }

        // The quote at reservation time (scaled by 10^(TOKEN_DECIMALS - BTC_DECIMALS))
        const quoteAtReservation = this._quoteHistory.get(reservation.createdAt);
        if (quoteAtReservation.isZero()) {
            throw new Revert('Quote at reservation is zero. Unexpected error.');
        }

        const outputs: TransactionOutput[] = Blockchain.tx.outputs;

        const reservedIndexes = reservation.getReservedIndexes();
        const reservedValues = reservation.getReservedValues();
        const reservedPriority = reservation.getReservedPriority();

        let totalTokensTransferred: u256 = u256.Zero;
        let totalSatoshisSpent: u256 = u256.Zero;

        for (let i = 0; i < reservedIndexes.length; i++) {
            const providerIndex: u64 = reservedIndexes[i];
            const reservedAmount = reservedValues[i]; // in token units
            const priority = reservedPriority[i];

            const isInitialLiquidity = providerIndex === u32.MAX_VALUE;
            const providerId = isInitialLiquidity
                ? this._initialLiquidityProvider.value
                : priority
                  ? this._priorityQueue.get(providerIndex)
                  : this._queue.get(providerIndex);

            if (providerId.isZero()) {
                throw new Revert(`Invalid provider at index ${providerIndex}`);
            }
            const provider = getProvider(providerId);
            provider.indexedAt = providerIndex;

            // how many satoshis actually sent
            const satoshisSent = this.findAmountForAddressInOutputUTXOs(
                outputs,
                provider.btcReceiver,
            );
            if (satoshisSent.isZero()) {
                // no BTC => restore reserved tokens
                this.restoreReservedLiquidityForProvider(provider, reservedAmount);
                continue;
            }

            let tokensDesired = this.satoshisToTokens(satoshisSent, quoteAtReservation);

            // clamp by reserved
            tokensDesired = SafeMath.min(tokensDesired, reservedAmount.toU256());

            // clamp by actual provider liquidity
            tokensDesired = SafeMath.min(tokensDesired, provider.liquidity.toU256());

            if (tokensDesired.isZero()) {
                this.restoreReservedLiquidityForProvider(provider, reservedAmount);
                continue;
            }

            const tokensToTransferU128 = tokensDesired.toU128();
            if (u128.lt(provider.liquidity, tokensToTransferU128)) {
                throw new Revert('Impossible: liquidity < tokensToTransfer');
            }
            if (u128.lt(provider.reserved, tokensToTransferU128)) {
                throw new Revert('Impossible: reserved < tokensToTransfer');
            }

            // "use" these tokens from the provider
            provider.reserved = SafeMath.sub128(provider.reserved, tokensToTransferU128);
            provider.liquidity = SafeMath.sub128(provider.liquidity, tokensToTransferU128);

            // dust check: if the provider has very few tokens left => reset
            const satLeftValue = SafeMath.div(provider.liquidity.toU256(), quoteAtReservation);
            if (u256.lt(satLeftValue, LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT)) {
                this.resetProvider(provider);
            }

            // track aggregates
            totalTokensTransferred = SafeMath.add(totalTokensTransferred, tokensDesired);
            totalSatoshisSpent = SafeMath.add(totalSatoshisSpent, satoshisSent);
        }

        if (totalTokensTransferred.isZero()) {
            throw new Revert('No tokens were transferred. Check BTC outputs.');
        }

        // transfer tokens to buyer
        TransferHelper.safeTransfer(this.token, buyer, totalTokensTransferred);

        // update total reserves
        this.updateTotalReserved(this.tokenId, totalTokensTransferred, false);
        this.updateTotalReserve(this.tokenId, totalTokensTransferred, false);

        // update accumulators
        this.buyTokens(totalTokensTransferred, totalSatoshisSpent);

        // end of swap => remove reservation
        reservation.delete();

        // cleanup
        this.cleanUpQueues();

        const ev = new SwapExecutedEvent(buyer, totalSatoshisSpent, totalTokensTransferred);
        Blockchain.emit(ev);
    }

    public reserveLiquidity(buyer: Address, maximumAmountIn: u256, minimumAmountOut: u256): u256 {
        this.updateVirtualPoolIfNeeded();

        const reservation = new Reservation(buyer, this.token);
        if (reservation.valid()) {
            throw new Revert('Reservation already active');
        }

        // currentQuote is scaled by 10^(TOKEN_DECIMALS - BTC_DECIMALS)
        const currentQuote = this.quote();
        if (currentQuote.isZero()) {
            throw new Revert('Impossible state: Token is worth infinity');
        }

        let tokensRemaining: u256 = this.satoshisToTokens(maximumAmountIn, currentQuote);

        // anti-bot
        if (Blockchain.block.numberU64 <= this.antiBotExpirationBlock) {
            if (u256.gt(maximumAmountIn, this.maxTokensPerReservation)) {
                throw new Revert('Cannot exceed anti-bot max tokens/reservation');
            }
        }

        if (u256.lt(this.liquidity, this.reservedLiquidity)) {
            throw new Revert('Impossible: liquidity < reservedLiquidity');
        }

        const totalAvailableLiquidity = SafeMath.sub(this.liquidity, this.reservedLiquidity);
        if (u256.lt(totalAvailableLiquidity, tokensRemaining)) {
            tokensRemaining = totalAvailableLiquidity;
        }

        const maxTokensLeftBeforeCap = this.getMaximumTokensLeftBeforeCap();
        tokensRemaining = SafeMath.min(tokensRemaining, maxTokensLeftBeforeCap);

        if (tokensRemaining.isZero()) {
            throw new Revert('Not enough liquidity available');
        }

        const satCostTokenRemaining = this.tokensToSatoshis(tokensRemaining, currentQuote);
        if (
            u256.lt(satCostTokenRemaining, maximumAmountIn) ||
            u256.lt(tokensRemaining, LiquidityQueue.MINIMUM_LIQUIDITY_IN_SAT_VALUE_ADD_LIQUIDITY)
        ) {
            throw new Revert(`Too little liquidity available ${satCostTokenRemaining}`);
        }

        let tokensReserved: u256 = u256.Zero;
        let satSpent: u256 = u256.Zero;
        let lastId: u64 = 0;

        let i: u32 = 0;
        while (!tokensRemaining.isZero()) {
            i++;

            const provider = this.getNextProviderWithLiquidity();
            if (provider === null) {
                if (i === 1) {
                    throw new Revert(
                        `Impossible state: no providers with liquidity even if totalAvailableLiquidity > 0`,
                    );
                }

                //Blockchain.log(`No more providers with liquidity`);
                break;
            }

            if (provider.indexedAt === u32.MAX_VALUE && lastId === u32.MAX_VALUE) {
                break;
            }

            lastId = provider.indexedAt;

            const providerLiquidity = SafeMath.sub128(
                provider.liquidity,
                provider.reserved,
            ).toU256();

            const maxCostInSatoshis = this.tokensToSatoshis(providerLiquidity, currentQuote);
            //Blockchain.log(
            //    `maxCostInSatoshis: ${maxCostInSatoshis}, providerLiquidity: ${providerLiquidity}, reserved: ${provider.reserved}, currentQuoteScaled: ${currentQuote}`,
            //);
            if (
                u256.lt(
                    maxCostInSatoshis,
                    LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
                )
            ) {
                if (provider.reserved.isZero()) {
                    this.resetProvider(provider);
                }
                continue;
            }

            // We'll try to reserve up to 'tokensRemaining' from this provider
            let reserveAmount = SafeMath.min(
                SafeMath.min(providerLiquidity, tokensRemaining),
                MAX_RESERVATION_AMOUNT_PROVIDER.toU256(),
            );

            let costInSatoshis = this.tokensToSatoshis(reserveAmount, currentQuote);
            const leftoverSats = SafeMath.sub(maxCostInSatoshis, costInSatoshis);

            // If leftover satoshis < MINIMUM_PROVIDER_RESERVATION_AMOUNT => just take everything
            if (u256.lt(leftoverSats, LiquidityQueue.MINIMUM_PROVIDER_RESERVATION_AMOUNT)) {
                costInSatoshis = maxCostInSatoshis;
            }

            // Recompute how many tokens that cost can buy
            reserveAmount = this.satoshisToTokens(costInSatoshis, currentQuote);
            if (reserveAmount.isZero()) {
                continue;
            }

            // Mark them as reserved
            const reserveAmountU128 = reserveAmount.toU128();
            provider.reserved = SafeMath.add128(provider.reserved, reserveAmountU128);

            tokensReserved = SafeMath.add(tokensReserved, reserveAmount);
            satSpent = SafeMath.add(satSpent, costInSatoshis);

            // reduce tokensRemaining
            if (u256.gt(tokensRemaining, reserveAmount)) {
                tokensRemaining = SafeMath.sub(tokensRemaining, reserveAmount);
            } else {
                tokensRemaining = u256.Zero;
            }

            reservation.reserveAtIndex(
                <u32>provider.indexedAt,
                reserveAmountU128,
                provider.isPriority(),
            );

            const ev = new LiquidityReserved(provider.btcReceiver, costInSatoshis.toU128());
            Blockchain.emit(ev);
        }

        // If we didn't reserve enough
        if (u256.lt(tokensReserved, minimumAmountOut)) {
            throw new Revert(
                `Not enough liquidity reserved want ${minimumAmountOut} got ${tokensReserved}, spent ${satSpent}, remaining ${tokensRemaining}, quote ${currentQuote}`,
            );
        }

        // update global reserved
        this.updateTotalReserved(this.tokenId, tokensReserved, true);

        // track the reservation
        reservation.setExpirationBlock(
            Blockchain.block.numberU64 + LiquidityQueue.RESERVATION_EXPIRE_AFTER,
        );
        reservation.save();

        const reservationList = this.getReservationListForBlock(Blockchain.block.numberU64);
        reservationList.push(reservation.reservationId);
        reservationList.save();

        this.setBlockQuote();

        const ev2 = new ReservationCreatedEvent(tokensReserved, satSpent);
        Blockchain.emit(ev2);

        return tokensReserved;
    }

    public buyTokens(tokensOut: u256, satoshisIn: u256): void {
        // accumulate
        this.deltaBTCBuy = SafeMath.add(this.deltaBTCBuy, satoshisIn);
        this.deltaTokensBuy = SafeMath.add(this.deltaTokensBuy, tokensOut);
    }

    public sellTokens(tokensIn: u256, satoshisOut: u256): void {
        // accumulate
        this.deltaBTCSell = SafeMath.add(this.deltaBTCSell, satoshisOut);
        this.deltaTokensSell = SafeMath.add(this.deltaTokensSell, tokensIn);
    }

    public updateVirtualPoolIfNeeded(): void {
        const currentBlock = Blockchain.block.numberU64;
        if (currentBlock <= this.lastVirtualUpdateBlock) {
            return;
        }

        let B = this.virtualBTCReserve;
        let T = this.virtualTokenReserve;

        // Step A: add tokens from deltaTokensAdd
        const dT_add = this.deltaTokensAdd;
        if (!dT_add.isZero()) {
            T = SafeMath.add(T, dT_add);
        }

        // Step B: apply net "buys" => (B + incB)*(T - dT_buy) = B*T
        const dB_buy = this.deltaBTCBuy;
        const dT_buy = this.deltaTokensBuy;

        let adjustedTokensBuy = dT_buy;
        if (!dT_buy.isZero()) {
            // Tprime = T - dT_buy
            let Tprime = SafeMath.sub(T, adjustedTokensBuy);
            if (u256.lt(Tprime, u256.One)) {
                // clamp
                Tprime = u256.One;
            }

            // B' = B*T / Tprime
            const numerator = SafeMath.mul(B, T);
            let Bprime = SafeMath.div(numerator, Tprime);

            // incB = B' - B
            let incB = SafeMath.sub(Bprime, B);

            if (u256.gt(incB, dB_buy)) {
                // MODIFIED CODE:
                // If users didn't provide enough BTC, do a partial fill.
                // We'll use all the BTC we actually have: dB_buy
                // => B' = B + dB_buy
                Bprime = SafeMath.add(B, dB_buy);

                // => T' = (B * T) / B'
                let newTprime = SafeMath.div(numerator, Bprime);
                if (u256.lt(newTprime, u256.One)) {
                    newTprime = u256.One;
                }

                // => actual tokens bought = T - T'
                // Now reduce the "dT_buy" in memory to reflect partial fill
                adjustedTokensBuy = SafeMath.sub(T, newTprime);

                // finalize
                Tprime = newTprime;
                incB = dB_buy; // effectively used up all dB_buy
            }

            // finalize these values
            B = Bprime;
            T = Tprime;
        }

        // Step C: apply net "sells" => (B - x)*(T + dT_sell)= B*T
        const dT_sell = this.deltaTokensSell;
        if (!dT_sell.isZero()) {
            const T2 = SafeMath.add(T, dT_sell);
            const numerator = SafeMath.mul(B, T);
            B = SafeMath.div(numerator, T2);
            T = T2;
        }

        // clamp T
        if (u256.lt(T, u256.One)) {
            T = u256.One;
        }

        // store
        this.virtualBTCReserve = B;
        this.virtualTokenReserve = T;

        // reset accumulators
        // NB: If we want to track partial fill for reference, we could store
        // the leftover in a new variable, normally just zero them out:
        this.deltaTokensAdd = u256.Zero;
        this.deltaBTCBuy = u256.Zero;

        // We specifically store back the updated buy amount, if you need it:
        this.deltaTokensBuy = u256.Zero;
        this.deltaBTCSell = u256.Zero;
        this.deltaTokensSell = u256.Zero;

        this.lastVirtualUpdateBlock = currentBlock;
    }

    private getMaximumTokensLeftBeforeCap(): u256 {
        // how many tokens are currently liquid vs. reserved
        const reservedAmount: u256 = this.reservedLiquidity;
        const totalLiquidity: u256 = this.liquidity;
        const a: u256 = u256.fromU64(10_000);

        // if totalLiquidity == 0, then nothing is available
        if (totalLiquidity.isZero()) {
            return u256.Zero;
        }

        // 1) percentReserved = (reservedAmount * 10000) / totalLiquidity
        //    in base 10000
        const reservedRatio: u256 = SafeMath.div(SafeMath.mul(reservedAmount, a), totalLiquidity);

        // 2) leftoverRatio = maxReserves5BlockPercent - reservedRatio
        //    Make sure it doesn't go negative => clamp at zero
        let leftoverRatio: u256 = SafeMath.sub(
            u256.fromU64(this.maxReserves5BlockPercent),
            reservedRatio,
        );

        if (leftoverRatio.toI64() < 0) {
            leftoverRatio = u256.Zero;
        }

        // 3) leftoverTokens = (leftoverRatio * totalLiquidity) / 10000
        //    this is how many tokens can still be reserved
        //    before we exceed the 5-block cap
        return SafeMath.div(SafeMath.mul(totalLiquidity, leftoverRatio), a);
    }

    private tokensToSatoshis(tokenAmount: u256, scaledPrice: u256): u256 {
        return SafeMath.div(tokenAmount, scaledPrice);
    }

    private satoshisToTokens(satoshis: u256, scaledPrice: u256): u256 {
        return SafeMath.mul(satoshis, scaledPrice);
    }

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
        if (!u256.eq(provider.providerId, this._initialLiquidityProvider.value)) {
            if (provider.isPriority()) {
                this._priorityQueue.delete(provider.indexedAt);
            } else {
                this._queue.delete(provider.indexedAt);
            }
        }
        provider.reset();
    }

    private restoreReservedLiquidityForProvider(provider: Provider, reserved: u128): void {
        provider.reserved = SafeMath.sub128(provider.reserved, reserved);
        provider.liquidity = SafeMath.add128(provider.liquidity, reserved);
        this.updateTotalReserved(this.tokenId, reserved.toU256(), false);
    }

    private cleanUpQueues(): void {
        // standard queue
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

        // priority
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
        const lastPurgedBlock: u64 = this.lastPurgedBlock;
        const currentBlockNumber: u64 = Blockchain.block.numberU64;
        const expireAfter: u64 = LiquidityQueue.RESERVATION_EXPIRE_AFTER;

        let maxBlockToPurge: u64 = lastPurgedBlock + expireAfter;
        if (currentBlockNumber > expireAfter) {
            const maxPossibleBlock = currentBlockNumber - expireAfter;
            if (maxBlockToPurge > maxPossibleBlock) {
                maxBlockToPurge = maxPossibleBlock;
            }
        } else {
            this.onNoPurge();
            return;
        }

        if (lastPurgedBlock >= maxBlockToPurge) {
            this.onNoPurge();
            return;
        }

        let totalReservedAmount: u256 = u256.Zero;
        let updatedOne = false;

        for (let blockNumber = lastPurgedBlock; blockNumber < maxBlockToPurge; blockNumber++) {
            const reservationList = this.getReservationListForBlock(blockNumber);
            const reservationIds = reservationList.getAll(0, reservationList.getLength() as u32);

            for (let i = 0; i < reservationIds.length; i++) {
                const reservationId = reservationIds[i];
                const reservation = Reservation.load(reservationId);

                if (!reservation.isActive()) {
                    continue;
                }

                const reservedIndexes = reservation.getReservedIndexes();
                const reservedValues = reservation.getReservedValues();
                const reservedPriority = reservation.getReservedPriority();

                for (let j = 0; j < reservedIndexes.length; j++) {
                    const providerIndex: u64 = reservedIndexes[j];
                    const reservedAmount: u128 = reservedValues[j];
                    const priority: bool = reservedPriority[j];

                    const isInitialLiquidity = providerIndex === u32.MAX_VALUE;
                    const providerId = isInitialLiquidity
                        ? this._initialLiquidityProvider.value
                        : priority
                          ? this._priorityQueue.get(providerIndex)
                          : this._queue.get(providerIndex);

                    const provider = getProvider(providerId);
                    provider.indexedAt = providerIndex;

                    if (u128.lt(provider.reserved, reservedAmount)) {
                        throw new Revert(
                            'Impossible: reserved amount bigger than provider reserve',
                        );
                    }

                    provider.reserved = SafeMath.sub128(provider.reserved, reservedAmount);

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
                        if (!isInitialLiquidity) {
                            if (provider.isPriority()) {
                                this._priorityQueue.delete(providerIndex);
                            } else {
                                this._queue.delete(providerIndex);
                            }
                        }
                        provider.reset();
                    }
                    provider.save();
                    updatedOne = true;
                }

                totalReservedAmount = SafeMath.add(
                    totalReservedAmount,
                    reservedValues.reduce<u256>(
                        (acc, val) => SafeMath.add(acc, val.toU256()),
                        u256.Zero,
                    ),
                );
                reservation.delete();
            }

            reservationList.deleteAll();
            reservationList.save();
        }

        if (updatedOne) {
            this.updateTotalReserved(this.tokenId, totalReservedAmount, false);
            this.updateVirtualPoolIfNeeded();
            this.previousReservationStartingIndex = 0;
            this.previousReservationStandardStartingIndex = 0;
        } else {
            this.onNoPurge();
        }

        this.lastPurgedBlock = currentBlockNumber;
    }

    private onNoPurge(): void {
        this.currentIndex = this.previousReservationStandardStartingIndex;
        this.currentIndexPriority = this.previousReservationStartingIndex;
    }

    private getReservationListForBlock(blockNumber: u64): StoredU128Array {
        const writer = new BytesWriter(8 + this.tokenIdUint8Array.length);
        writer.writeU64(blockNumber);
        writer.writeBytes(this.tokenIdUint8Array);

        const keyBytes = writer.getBuffer();
        return new StoredU128Array(RESERVATION_IDS_BY_BLOCK_POINTER, keyBytes, u256.Zero);
    }

    private setBlockQuote(): void {
        if (<u64>u32.MAX_VALUE < Blockchain.block.numberU64) {
            throw new Revert('Block number too large');
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

    private getNextPriorityListProvider(): Provider | null {
        let provider: Potential<Provider> = null;
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
                return provider;
            }
            if (this.currentIndexPriority == u64.MAX_VALUE) {
                throw new Revert('Index increment overflow');
            }
            this.currentIndexPriority++;
        }

        return null;
    }

    private getNextProviderWithLiquidity(): Provider | null {
        const priorityProvider = this.getNextPriorityListProvider();
        if (priorityProvider !== null) {
            return priorityProvider;
        }

        let provider: Potential<Provider> = null;
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
}
