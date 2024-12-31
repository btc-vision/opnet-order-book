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
    DELTA_TOKENS_ADD,
    DELTA_TOKENS_BUY,
    DELTA_TOKENS_SELL,
    INITIAL_LIQUIDITY,
    LAST_VIRTUAL_BLOCK_UPDATE_POINTER,
    LIQUIDITY_LAST_UPDATE_BLOCK_POINTER,
    LIQUIDITY_P0_POINTER,
    LIQUIDITY_PRIORITY_QUEUE_POINTER,
    LIQUIDITY_QUEUE_POINTER,
    LIQUIDITY_QUOTE_HISTORY_POINTER,
    LIQUIDITY_RESERVED_POINTER,
    LIQUIDITY_VIRTUAL_BTC_POINTER,
    LIQUIDITY_VIRTUAL_T_POINTER,
    LP_BTC_OWED_POINTER,
    LP_BTC_OWED_RESERVED_POINTER,
    REMOVAL_QUEUE_POINTER,
    RESERVATION_IDS_BY_BLOCK_POINTER,
    RESERVATION_SETTINGS_POINTER,
    TOTAL_RESERVES_POINTER,
} from './StoredPointers';

import { StoredMapU256 } from '../stored/StoredMapU256';
import { getProvider, Provider } from './Provider';
import { LiquidityListedEvent } from '../events/LiquidityListedEvent';
import { LiquidityReservedEvent } from '../events/LiquidityReservedEvent';
import { LIQUIDITY_REMOVAL_TYPE, NORMAL_TYPE, PRIORITY_TYPE, Reservation } from './Reservation';
import { MAX_RESERVATION_AMOUNT_PROVIDER } from '../data-types/UserLiquidity';
import { ReservationCreatedEvent } from '../events/ReservationCreatedEvent';
import { SwapExecutedEvent } from '../events/SwapExecutedEvent';
import { getTotalFeeCollected } from '../utils/OrderBookUtils';
import { FeeManager } from './FeeManager';
import { LiquidityAddedEvent } from '../events/LiquidityAddedEvent';
import { CompletedTrade } from './CompletedTrade';
import { LiquidityRemovedEvent } from '../events/LiquidityRemovedEvent';
import { DynamicFee } from './DynamicFee';

const ENABLE_TIMEOUT: bool = false;
const ENABLE_FEES: bool = false;

export class LiquidityQueue {
    // Reservation settings
    public static RESERVATION_EXPIRE_AFTER: u64 = 5;
    public static VOLATILITY_WINDOW_BLOCKS: u32 = 5;
    public static STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT: u256 = u256.fromU32(600);

    public static MINIMUM_PROVIDER_RESERVATION_AMOUNT: u256 = u256.fromU32(1000);
    public static MINIMUM_LIQUIDITY_IN_SAT_VALUE_ADD_LIQUIDITY: u256 = u256.fromU32(10_000);
    public static PERCENT_TOKENS_FOR_PRIORITY_QUEUE: u128 = u128.fromU32(30);
    public static PERCENT_TOKENS_FOR_PRIORITY_FACTOR: u128 = u128.fromU32(1000);
    public static TIMEOUT_AFTER_EXPIRATION: u8 = 5; // 5 blocks timeout

    public readonly tokenId: u256;

    // "virtual" reserves
    private readonly _virtualBTCReserve: StoredU256;
    private readonly _virtualTokenReserve: StoredU256;

    // Queues
    private readonly _queue: StoredU256Array;
    private readonly _priorityQueue: StoredU256Array;
    private readonly _removalQueue: StoredU256Array;

    // We'll keep p0 in a pointer
    private readonly _p0: StoredU256;
    private readonly _initialLiquidityProvider: StoredU256;

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
    private currentIndexRemoval: u64 = 0;

    // "delta" accumulators - used in updated stepwise logic
    private readonly _deltaTokensAdd: StoredU256;
    private readonly _deltaBTCBuy: StoredU256;
    private readonly _deltaTokensBuy: StoredU256;
    private readonly _deltaTokensSell: StoredU256;

    // Map: providerId -> satoshis owed
    private readonly _lpBTCowed: StoredMapU256;
    private readonly _lpBTCowedReserved: StoredMapU256;

    private consumedOutputsFromUTXOs: Map<string, u64> = new Map<string, u64>();

    private readonly _dynamicFee: DynamicFee;

    constructor(
        public readonly token: Address,
        public readonly tokenIdUint8Array: Uint8Array,
    ) {
        const tokenId = u256.fromBytes(token, true);
        this.tokenId = tokenId;

        this._dynamicFee = new DynamicFee(tokenId);

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

        this._quoteHistory = new StoredU256Array(
            LIQUIDITY_QUOTE_HISTORY_POINTER,
            tokenIdUint8Array,
            u256.Zero,
        );

        // virtual reserves
        this._virtualBTCReserve = new StoredU256(LIQUIDITY_VIRTUAL_BTC_POINTER, tokenId, u256.Zero);
        this._virtualTokenReserve = new StoredU256(LIQUIDITY_VIRTUAL_T_POINTER, tokenId, u256.Zero);
        this._p0 = new StoredU256(LIQUIDITY_P0_POINTER, tokenId, u256.Zero);

        // accumulators
        this._deltaTokensAdd = new StoredU256(DELTA_TOKENS_ADD, tokenId, u256.Zero);
        this._deltaBTCBuy = new StoredU256(DELTA_BTC_BUY, tokenId, u256.Zero);
        this._deltaTokensBuy = new StoredU256(DELTA_TOKENS_BUY, tokenId, u256.Zero);
        this._deltaTokensSell = new StoredU256(DELTA_TOKENS_SELL, tokenId, u256.Zero);

        // last block
        this._lastVirtualUpdateBlock = new StoredU64(
            LAST_VIRTUAL_BLOCK_UPDATE_POINTER,
            tokenId,
            u256.Zero,
        );

        this._maxTokenPerSwap = new StoredU256(
            ANTI_BOT_MAX_TOKENS_PER_RESERVATION,
            tokenId,
            u256.Zero,
        );

        this._totalReserves = new StoredMapU256(TOTAL_RESERVES_POINTER);
        this._totalReserved = new StoredMapU256(LIQUIDITY_RESERVED_POINTER);

        this._initialLiquidityProvider = new StoredU256(INITIAL_LIQUIDITY, tokenId, u256.Zero);

        this._settingPurge = new StoredU64(LIQUIDITY_LAST_UPDATE_BLOCK_POINTER, tokenId, u256.Zero);
        this._settings = new StoredU64(RESERVATION_SETTINGS_POINTER, tokenId, u256.Zero);

        this._lpBTCowed = new StoredMapU256(LP_BTC_OWED_POINTER);
        this._lpBTCowedReserved = new StoredMapU256(LP_BTC_OWED_RESERVED_POINTER);

        // Purge old reservations
        this.purgeReservationsAndRestoreProviders();
    }

    public get p0(): u256 {
        return this._p0.value;
    }

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
        return this._settings.get(2);
    }

    public set maxReserves5BlockPercent(value: u64) {
        this._settings.set(2, value);
    }

    public get previousRemovalStartingIndex(): u64 {
        return this._settings.get(3);
    }

    public set previousRemovalStartingIndex(value: u64) {
        this._settings.set(3, value);
    }

    public get lastPurgedBlock(): u64 {
        return this._settingPurge.get(0);
    }

    public set lastPurgedBlock(value: u64) {
        this._settingPurge.set(0, value);
    }

    public get antiBotExpirationBlock(): u64 {
        return this._settingPurge.get(1);
    }

    public set antiBotExpirationBlock(value: u64) {
        this._settingPurge.set(1, value);
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
        // The contract simulates BTC side:
        this.virtualBTCReserve = SafeMath.div(initialLiquidityU256, floorPrice);
        this.virtualTokenReserve = initialLiquidityU256;

        // set max reserves in 5 blocks
        this.maxReserves5BlockPercent = <u64>maxReservesIn5BlocksPercent;

        // Instead of calling "listLiquidity", we do a direct "listTokensForSale"
        // if we want these tokens to be 'initially queued' for purchase
        this.listTokensForSale(providerId, initialLiquidity, receiver, false, true);

        // If dev wants anti-bot
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

        this.previousRemovalStartingIndex =
            this.currentIndexRemoval === 0
                ? this.currentIndexRemoval
                : this.currentIndexRemoval - 1;

        this._settingPurge.save();
        this._queue.save();
        this._priorityQueue.save();
        this._quoteHistory.save();
        this._settings.save();
        this._removalQueue.save();
    }

    public quote(): u256 {
        this.updateVirtualPoolIfNeeded();
        const T: u256 = this.virtualTokenReserve;
        if (T.isZero()) {
            return u256.Zero;
        }

        if (this.virtualBTCReserve.isZero()) {
            throw new Revert(`NOT_ENOUGH_LIQUIDITY`);
        }

        return SafeMath.div(T, this.virtualBTCReserve);
    }

    public reserveLiquidity(
        buyer: Address,
        maximumAmountIn: u256,
        minimumAmountOut: u256,
        forLP: bool,
    ): u256 {
        this.updateVirtualPoolIfNeeded();

        const reservation = new Reservation(buyer, this.token);
        if (reservation.valid()) {
            throw new Revert('Reservation already active');
        }

        const userTimeoutUntilBlock: u64 = reservation.userTimeoutBlockExpiration;
        if (Blockchain.block.numberU64 <= userTimeoutUntilBlock && ENABLE_TIMEOUT) {
            throw new Revert('User is timed out');
        }

        // currentQuote is scaled by 10^(TOKEN_DECIMALS - BTC_DECIMALS)
        const currentQuote = this.quote();
        if (currentQuote.isZero()) {
            throw new Revert('Impossible state: Token is worth infinity');
        }

        // The buyer wants to effectively spend up to `maximumAmountIn` satoshis
        // in order to reserve tokens. We'll convert that to a "max token" value
        // at the current quote.
        let tokensRemaining: u256 = this.satoshisToTokens(maximumAmountIn, currentQuote);

        // anti-bot checks
        if (Blockchain.block.numberU64 <= this.antiBotExpirationBlock) {
            if (u256.gt(maximumAmountIn, this.maxTokensPerReservation)) {
                throw new Revert('Cannot exceed anti-bot max tokens/reservation');
            }
        }

        // Confirm we have enough unreserved "liquidity"
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

        // We'll see how many satoshis that "tokensRemaining" would cost at the current quote.
        // This is to ensure we aren't in a weird mismatch state.
        //
        //if (u256.lt(satCostTokenRemaining, maximumAmountIn)) {
        //    throw new Revert(`Too little liquidity available ${satCostTokenRemaining}`);
        //}

        const satCostTokenRemaining = this.tokensToSatoshis(tokensRemaining, currentQuote);
        if (
            u256.lt(
                satCostTokenRemaining,
                LiquidityQueue.MINIMUM_LIQUIDITY_IN_SAT_VALUE_ADD_LIQUIDITY,
            )
        ) {
            throw new Revert('Minimum liquidity not met');
        }

        let tokensReserved: u256 = u256.Zero;
        let satSpent: u256 = u256.Zero;
        let lastId: u64 = 0;

        //let i: u32 = 0;
        while (!tokensRemaining.isZero()) {
            //i++;

            // 1) We call getNextProviderWithLiquidity(), which may return a removal-queue provider
            //    or a normal/priority-queue provider.
            const provider = this.getNextProviderWithLiquidity();
            if (provider === null) {
                /*if (i === 1) {
                    throw new Revert(
                        `Impossible state: no providers even though totalAvailableLiquidity > 0`,
                    );
                }*/
                break;
            }

            // If we see repeated MAX_VALUE => break
            if (provider.indexedAt === u32.MAX_VALUE && lastId === u32.MAX_VALUE) {
                break;
            }
            lastId = provider.indexedAt;

            // CASE A: REMOVAL-QUEUE PROVIDER
            if (provider.pendingRemoval && provider.isLp && provider.fromRemovalQueue) {
                // current actual owed
                const owed = this.getBTCowed(provider.providerId);
                if (
                    owed.isZero() ||
                    u256.lt(owed, LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT)
                ) {
                    // If they're in removal queue but not actually owed anything => skip
                    this.removePendingLiquidityProviderFromRemovalQueue(
                        provider,
                        provider.indexedAt,
                    );
                    continue;
                }

                // We break if any provider in the removal queue has less than the minimum owed
                // DUST. We don't want to reserve liquidity for them.
                let satWouldSpend = this.tokensToSatoshis(tokensRemaining, currentQuote);
                if (
                    u256.lt(
                        satWouldSpend,
                        LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
                    )
                ) {
                    break;
                }

                const currentReserved = this.getBTCowedReserved(provider.providerId);

                // clamp by how much is actually owed
                satWouldSpend = SafeMath.min(satWouldSpend, SafeMath.sub(owed, currentReserved));

                // now convert that sat amount back to tokens
                let reserveAmount = this.satoshisToTokens(satWouldSpend, currentQuote);
                if (reserveAmount.isZero()) {
                    continue;
                }

                reserveAmount = SafeMath.min(reserveAmount, tokensRemaining);

                // Reserve these tokens (conceptually from the pool)
                tokensReserved = SafeMath.add(tokensReserved, reserveAmount);
                satSpent = SafeMath.add(satSpent, satWouldSpend);
                tokensRemaining = SafeMath.sub(tokensRemaining, reserveAmount);

                // Instead of directly reducing `owed`, we move it to `_lpBTCowedReserved`.
                const newReserved = SafeMath.add(currentReserved, satWouldSpend);
                this.setBTCowedReserved(provider.providerId, newReserved);

                // Note: We do NOT call setBTCowed(providerId, newOwed) here.
                // That happens only if the trade is actually executed in `executeTrade`.

                // Record the reservation
                reservation.reserveAtIndex(
                    <u32>provider.indexedAt,
                    reserveAmount.toU128(),
                    LIQUIDITY_REMOVAL_TYPE,
                );

                const ev = new LiquidityReservedEvent(provider.btcReceiver, satWouldSpend.toU128());
                Blockchain.emit(ev);
            } else {
                // CASE B: NORMAL / PRIORITY PROVIDER
                // They do have actual tokens in provider.liquidity
                const providerLiquidity = SafeMath.sub128(
                    provider.liquidity,
                    provider.reserved,
                ).toU256();

                const maxCostInSatoshis = this.tokensToSatoshis(providerLiquidity, currentQuote);
                if (
                    u256.lt(
                        maxCostInSatoshis,
                        LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
                    )
                ) {
                    // dust => reset if no reserved
                    if (provider.reserved.isZero()) {
                        this.resetProvider(provider);
                    }
                    continue;
                }

                // Try to reserve up to 'tokensRemaining' from this provider
                let reserveAmount = SafeMath.min(
                    SafeMath.min(providerLiquidity, tokensRemaining),
                    MAX_RESERVATION_AMOUNT_PROVIDER.toU256(),
                );

                let costInSatoshis = this.tokensToSatoshis(reserveAmount, currentQuote);
                const leftoverSats = SafeMath.sub(maxCostInSatoshis, costInSatoshis);

                // If leftover satoshis < MINIMUM_PROVIDER_RESERVATION_AMOUNT => we take everything
                if (u256.lt(leftoverSats, LiquidityQueue.MINIMUM_PROVIDER_RESERVATION_AMOUNT)) {
                    costInSatoshis = maxCostInSatoshis;
                }

                // Recompute how many tokens that cost can buy
                reserveAmount = this.satoshisToTokens(costInSatoshis, currentQuote);
                if (reserveAmount.isZero()) {
                    continue;
                }

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
                    provider.isPriority() ? PRIORITY_TYPE : NORMAL_TYPE,
                );

                const ev = new LiquidityReservedEvent(provider.btcReceiver, costInSatoshis.toU128());
                Blockchain.emit(ev);
            }
        }

        // If we didn't reserve enough
        if (u256.lt(tokensReserved, minimumAmountOut)) {
            throw new Revert(
                `Not enough liquidity reserved; wanted ${minimumAmountOut}, got ${tokensReserved}, spent ${satSpent}, leftover tokens: ${tokensRemaining}, quote: ${currentQuote}`,
            );
        }

        // update global reserved
        this.updateTotalReserved(this.tokenId, tokensReserved, true);

        reservation.reservedLP = forLP;

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

    public addLiquidity(providerId: u256, receiver: string): void {
        this.updateVirtualPoolIfNeeded();

        const providerSelf = getProvider(providerId);
        if (providerSelf.pendingRemoval) {
            throw new Revert(
                'You are in the removal queue. Wait for removal of your liquidity first.',
            );
        }

        // 1. Make sure there's an active reservation for LP
        const reservation = this.getReservationWithExpirationChecks();
        if (!reservation.reservedLP) {
            throw new Revert('You must reserve liquidity for LP first.');
        }

        // 2. First, execute the trade to see how many tokens were purchased (T)
        //    and how much BTC was used (B).
        const trade = this.executeTrade(reservation);
        const tokensBoughtFromQueue = SafeMath.add(
            trade.totalTokensPurchased,
            trade.totalTokensRefunded,
        ); // T

        const btcSpent = SafeMath.add(trade.totalSatoshisSpent, trade.totalRefundedBTC); // B

        if (tokensBoughtFromQueue.isZero() || btcSpent.isZero()) {
            throw new Revert('No effective purchase made. Check your BTC outputs.');
        }

        // 3. Enforce 50/50 => The user must deposit exactly `tokensBoughtFromQueue` more tokens
        //    from their wallet. This ensures that in total, they've contributed equal "value"
        //    in BTC and in tokens.
        //    So we do a safeTransferFrom of that exact token amount:
        TransferHelper.safeTransferFrom(
            this.token,
            Blockchain.tx.sender,
            Blockchain.contractAddress,
            tokensBoughtFromQueue,
        );

        // 4. Because the purchase from the queue effectively "used BTC to buy tokens,"
        //    update our totalReserved to un-reserve those tokens.
        this.updateTotalReserved(this.tokenId, tokensBoughtFromQueue, false);

        // 5. Combine the user’s newly deposited tokens (the "other 50%" side)
        //    into the pool’s total reserves.
        this.updateTotalReserve(this.tokenId, tokensBoughtFromQueue, true);

        // 5a. Also register these newly deposited tokens in the "deltaTokensAdd"
        //     so the next block can adjust the pool formula.
        //this.deltaTokensAdd = SafeMath.add(this.deltaTokensAdd, tokensBoughtFromQueue);

        //const vBTC = this.tokensToSatoshis(tokensBoughtFromQueue, this.quote());
        //this.deltaTokensBuy = SafeMath.add(this.deltaTokensBuy, tokensBoughtFromQueue);
        //this.deltaTokensSell = SafeMath.add(this.deltaTokensSell, tokensBoughtFromQueue);

        //this.deltaBTCBuy = SafeMath.add(this.deltaTokensSell, btcSpent);

        this.virtualBTCReserve = SafeMath.add(this.virtualBTCReserve, btcSpent);
        this.virtualTokenReserve = SafeMath.add(this.virtualTokenReserve, tokensBoughtFromQueue);

        // 6. Because from the pool’s perspective, we had a "net buy" of tokens
        //    with `btcSpent` BTC. That is captured in buyTokens(...).
        //this.buyTokens(tokensBoughtFromQueue, btcSpent);

        // 7. Credit the user’s "virtual BTC" so they can withdraw it later in removeLiquidity.
        const owedBefore = this.getBTCowed(providerId);
        const owedAfter = SafeMath.add(owedBefore, btcSpent);
        this.setBTCowed(providerId, owedAfter);

        // 8. Mark the provider as an LP
        providerSelf.isLp = true;

        // Prevent exploits where someone add liquidity then change receiving address, get free BTC from people swapping their listed tokens.
        if (providerSelf.reserved.isZero()) {
            providerSelf.btcReceiver = receiver;
        }

        providerSelf.liquidityProvided = SafeMath.add(
            providerSelf.liquidityProvided,
            tokensBoughtFromQueue,
        );

        // 9. Reservation no longer needed
        reservation.delete();

        // 10. Clean up providers, recalc block quote
        this.cleanUpQueues();
        this.setBlockQuote();

        Blockchain.emit(
            new LiquidityAddedEvent(
                SafeMath.add(tokensBoughtFromQueue, tokensBoughtFromQueue), // The tokens from the user wallet
                tokensBoughtFromQueue, // The tokens purchased from queue (if you want to track them separately)
                btcSpent,
            ),
        );
    }

    public removeLiquidity(providerId: u256): void {
        // 1. Check that this provider is actually an LP
        const provider = getProvider(providerId);
        if (!provider.isLp) {
            throw new Revert('Not a liquidity provider');
        }

        if (u256.eq(providerId, this._initialLiquidityProvider.value)) {
            throw new Revert('Initial provider cannot remove liquidity');
        }

        // 2. Figure out how much BTC they are "owed" (the virtual side),
        //    and how many tokens they currently have "locked in" the pool.
        const btcOwed = this.getBTCowed(providerId);
        if (btcOwed.isZero()) {
            throw new Revert('You have no BTC owed. Did you already remove everything?');
        }

        if (provider.pendingRemoval) {
            throw new Revert('You are already in the removal queue.');
        }

        // 3. Return the token portion immediately to the user
        const tokenAmount: u256 = provider.liquidityProvided;
        if (tokenAmount.isZero()) {
            throw new Revert('You have no tokens to remove.');
        }
        TransferHelper.safeTransfer(this.token, Blockchain.tx.sender, tokenAmount);

        // 4. Decrease total reserves
        this.updateTotalReserve(this.tokenId, tokenAmount, false);
        provider.liquidityProvided = u256.Zero;

        // 5. Also reduce the virtual reserves so the ratio is consistent
        //    but do NOT update deltaTokensSell or deltaTokensBuy.
        this.virtualTokenReserve = SafeMath.sub(this.virtualTokenReserve, tokenAmount);
        this.virtualBTCReserve = SafeMath.sub(this.virtualBTCReserve, btcOwed);

        // 6. Finally, queue them up to receive owed BTC from future inflows
        provider.pendingRemoval = true;
        this._removalQueue.push(providerId);

        Blockchain.emit(new LiquidityRemovedEvent(providerId, btcOwed, tokenAmount));
    }

    public listTokensForSale(
        providerId: u256,
        amountIn: u128,
        receiver: string,
        usePriorityQueue: boolean,
        initialLiquidity: boolean = false,
    ): void {
        // Once-per-block update
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

        if (!initialLiquidity) {
            const currentPrice: u256 = this.quote();
            if (currentPrice.isZero()) {
                throw new Revert('Quote is zero. Please set P0 if you are the owner of the token.');
            }

            if (u256.eq(providerId, this._initialLiquidityProvider.value)) {
                throw new Revert(`Initial provider can only add once, if not initialLiquidity.`);
            }

            const liquidityInSatoshis: u256 = this.tokensToSatoshis(
                amountIn.toU256(),
                currentPrice,
            );

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

                this.buyTokens(totalTax.toU256(), u256.Zero);

                this.updateTotalReserve(this.tokenId, totalTax.toU256(), false);
                TransferHelper.safeTransfer(this.token, Address.dead(), totalTax.toU256());
            }
        }

        this.setBlockQuote();

        const ev = new LiquidityListedEvent(provider.liquidity, receiver);
        Blockchain.emit(ev);
    }

    public cancelListing(providerId: u256): u128 {
        // Validate provider
        const provider = getProvider(providerId);
        if (!provider.isActive()) {
            throw new Revert("Provider is not active or doesn't exist.");
        }

        // Check if user has enough unreserved tokens
        if (!provider.reserved.isZero()) {
            throw new Revert('Someone have active reservations on your liquidity.');
        }

        const amount: u256 = provider.liquidity.toU256();
        if (amount.isZero()) {
            throw new Revert('Provider has no liquidity.');
        }

        if (provider.canProvideLiquidity()) {
            throw new Revert(
                'You can no longer cancel this listing. Provider is providing liquidity.',
            );
        }

        if (u256.eq(providerId, this._initialLiquidityProvider.value)) {
            throw new Revert('Initial provider cannot cancel listing.');
        }

        // Update provider's liquidity
        provider.liquidity = u128.Zero;

        this.resetProvider(provider, false);

        // Transfer tokens back to the provider
        TransferHelper.safeTransfer(this.token, Blockchain.tx.sender, amount);

        // Decrease the total reserves
        this.updateTotalReserve(this.tokenId, amount, false);
        this.deltaTokensSell = SafeMath.add(this.deltaTokensSell, amount);
        this.cleanUpQueues();

        return amount.toU128();
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

    public swap(): void {
        this.updateVirtualPoolIfNeeded();

        const buyer: Address = Blockchain.tx.sender;
        const reservation = this.getReservationWithExpirationChecks();
        if (reservation.reservedLP) {
            throw new Revert('Reserved for LP; cannot swap');
        }

        const trade = this.executeTrade(reservation);
        let totalTokensPurchased = SafeMath.add(
            trade.totalTokensPurchased,
            trade.totalTokensRefunded,
        );

        const totalSatoshisSpent = SafeMath.add(trade.totalSatoshisSpent, trade.totalRefundedBTC);
        if (ENABLE_FEES) {
            const utilizationRatio = this.getUtilizationRatio();
            const feeBP = this._dynamicFee.getDynamicFeeBP(totalSatoshisSpent, utilizationRatio);
            const totalFeeTokens = this._dynamicFee.computeFeeAmount(totalTokensPurchased, feeBP);

            totalTokensPurchased = SafeMath.sub(totalTokensPurchased, totalFeeTokens);

            this.distributeFee(totalFeeTokens);
        }

        TransferHelper.safeTransfer(this.token, buyer, totalTokensPurchased);

        this.updateTotalReserved(this.tokenId, totalTokensPurchased, false);
        this.updateTotalReserve(this.tokenId, totalTokensPurchased, false);

        this.buyTokens(totalTokensPurchased, totalSatoshisSpent);

        // finalize
        reservation.delete();
        this.cleanUpQueues();

        const ev = new SwapExecutedEvent(buyer, totalSatoshisSpent, totalTokensPurchased);
        Blockchain.emit(ev);
    }

    public buyTokens(tokensOut: u256, satoshisIn: u256): void {
        // accumulate
        this.deltaBTCBuy = SafeMath.add(this.deltaBTCBuy, satoshisIn);
        this.deltaTokensBuy = SafeMath.add(this.deltaTokensBuy, tokensOut);
    }

    public updateVirtualPoolIfNeeded(): void {
        const currentBlock = Blockchain.block.numberU64;
        if (currentBlock <= this.lastVirtualUpdateBlock) {
            return;
        }

        let B = this.virtualBTCReserve;
        let T = this.virtualTokenReserve;

        // Add tokens from deltaTokensAdd
        const dT_add = this.deltaTokensAdd;
        if (!dT_add.isZero()) {
            T = SafeMath.add(T, dT_add);
        }

        // apply net "buys"
        const dB_buy = this.deltaBTCBuy;
        const dT_buy = this.deltaTokensBuy;

        if (!dT_buy.isZero()) {
            let Tprime: u256;
            if (u256.ge(dT_buy, T)) {
                Tprime = u256.One;
            } else {
                Tprime = SafeMath.sub(T, dT_buy);
            }

            const numerator = SafeMath.mul(B, T);
            let Bprime = SafeMath.div(numerator, Tprime);
            const incB = SafeMath.sub(Bprime, B);

            if (u256.gt(incB, dB_buy)) {
                Bprime = SafeMath.add(B, dB_buy);

                if (Bprime.isZero()) {
                    throw new Revert('Bprime is zero');
                }

                let newTprime = SafeMath.div(numerator, Bprime);
                if (u256.lt(newTprime, u256.One)) {
                    newTprime = u256.One;
                }
                Tprime = newTprime;
            }
            B = Bprime;
            T = Tprime;
        }

        // apply net "sells"
        const dT_sell = this.deltaTokensSell;
        if (!dT_sell.isZero()) {
            const T2 = SafeMath.add(T, dT_sell);
            const numerator = SafeMath.mul(B, T);
            if (T2.isZero()) {
                throw new Revert('T2 is zero');
            }

            B = SafeMath.div(numerator, T2);
            T = T2;
        }

        if (u256.lt(T, u256.One)) {
            T = u256.One;
        }

        this.virtualBTCReserve = B;
        this.virtualTokenReserve = T;

        // Reset accumulators
        this.deltaTokensAdd = u256.Zero;
        this.deltaBTCBuy = u256.Zero;
        this.deltaTokensBuy = u256.Zero;
        this.deltaTokensSell = u256.Zero;

        // Compute volatility
        this._dynamicFee.volatility = this.computeVolatility(
            currentBlock,
            LiquidityQueue.VOLATILITY_WINDOW_BLOCKS,
        );

        this.lastVirtualUpdateBlock = currentBlock;
    }

    private getUtilizationRatio(): u256 {
        const reserved = this.reservedLiquidity;
        const total = this.liquidity;

        if (total.isZero()) {
            return u256.Zero;
        }

        return SafeMath.div(SafeMath.mul(reserved, u256.fromU64(100)), total);
    }

    private getProviderIfFromQueue(providerIndex: u64, type: u8): u256 {
        switch (type) {
            case NORMAL_TYPE: {
                return this._queue.get(providerIndex);
            }
            case PRIORITY_TYPE: {
                return this._priorityQueue.get(providerIndex);
            }
            case LIQUIDITY_REMOVAL_TYPE: {
                return this._removalQueue.get(providerIndex);
            }
            default: {
                throw new Revert('Invalid reservation type');
            }
        }
    }

    private getProviderFromQueue(providerIndex: u64, type: u8): Provider {
        const isInitialLiquidity = providerIndex === u32.MAX_VALUE;
        const providerId: u256 = isInitialLiquidity
            ? this._initialLiquidityProvider.value
            : this.getProviderIfFromQueue(providerIndex, type);

        if (providerId.isZero()) {
            throw new Revert(`Invalid provider at index ${providerIndex}`);
        }

        const provider = getProvider(providerId);
        provider.indexedAt = providerIndex;

        return provider;
    }

    private reportUTXOUsed(addy: string, amount: u64): void {
        const consumedAlready = this.consumedOutputsFromUTXOs.has(addy)
            ? this.consumedOutputsFromUTXOs.get(addy)
            : 0;

        if (consumedAlready === 0) {
            this.consumedOutputsFromUTXOs.set(addy, amount);
        } else {
            this.consumedOutputsFromUTXOs.set(addy, SafeMath.add64(amount, consumedAlready));
        }
    }

    private executeTrade(reservation: Reservation): CompletedTrade {
        // 1) We gather the tx outputs to see how much BTC was actually sent to each provider's address.
        const outputs: TransactionOutput[] = Blockchain.tx.outputs;

        // 2) The quoted price at the time of reservation
        const quoteAtReservation = this._quoteHistory.get(reservation.createdAt);
        if (quoteAtReservation.isZero()) {
            throw new Revert('Quote at reservation is zero. Unexpected error.');
        }

        // 3) We retrieve the reservation's arrays
        const reservedIndexes: u32[] = reservation.getReservedIndexes();
        const reservedValues: u128[] = reservation.getReservedValues();
        const queueTypes: u8[] = reservation.getQueueTypes();

        let totalTokensPurchased = u256.Zero; // total tokens the buyer actually ends up with
        let totalSatoshisSpent = u256.Zero; // total BTC actually paid out by the buyer
        let totalRefundedBTC = u256.Zero; // total BTC refunded to the buyer
        let totalTokensRefunded = u256.Zero; // total tokens refunded to the buyer

        // 4) Iterate over each "provider" we had reserved in the queue
        for (let i = 0; i < reservedIndexes.length; i++) {
            const providerIndex: u64 = reservedIndexes[i];
            const reservedAmount: u128 = reservedValues[i]; // how many tokens we reserved
            const queueType: u8 = queueTypes[i]; // NORMAL, PRIORITY, or LIQUIDITY_REMOVAL

            // 4a. Retrieve the correct provider from the queue
            const provider: Provider = this.getProviderFromQueue(providerIndex, queueType);

            // 4b. How many satoshis did the buyer actually send to `provider.btcReceiver`?
            let satoshisSent = this.findAmountForAddressInOutputUTXOs(
                outputs,
                provider.btcReceiver,
            );

            // If no BTC is sent to this provider
            if (satoshisSent.isZero()) {
                // If this is a removal provider, we also revert that portion
                //         from _lpBTCowedReserved (since it never got paid).
                if (queueType === LIQUIDITY_REMOVAL_TYPE && provider.pendingRemoval) {
                    // Convert 'reservedAmount' back to sat (approx) using the original quote
                    const costInSats = this.tokensToSatoshis(
                        reservedAmount.toU256(),
                        quoteAtReservation,
                    );

                    // clamp by actual owedReserved
                    const owedReserved = this.getBTCowedReserved(provider.providerId);
                    const revertSats = SafeMath.min(costInSats, owedReserved);

                    // reduce the owedReserved by revertSats
                    const newReserved = SafeMath.sub(owedReserved, revertSats);
                    this.setBTCowedReserved(provider.providerId, newReserved);
                } else if (queueType !== LIQUIDITY_REMOVAL_TYPE) {
                    this.restoreReservedLiquidityForProvider(provider, reservedAmount);
                }

                // Nothing more for this provider, continue
                continue;
            }

            // 4c. Convert the satoshisSent to how many tokens the buyer *wants* to buy
            let tokensDesired = this.satoshisToTokens(satoshisSent, quoteAtReservation);

            // 5) Distinguish removal-queue from normal/priority
            if (queueType === LIQUIDITY_REMOVAL_TYPE && provider.pendingRemoval) {
                // ========== REMOVAL PROVIDER LOGIC ==========
                // The "reservedAmount" is the "token side" the buyer expects to get
                // at the current ratio, but physically there's no tokens in provider.liquidity.

                // clamp satoshisSent by how much is in _lpBTCowedReserved
                const owedReserved = this.getBTCowedReserved(provider.providerId);
                let actualSpent = SafeMath.min(satoshisSent, owedReserved);

                // remove from real owed as well => they are "paid"
                const oldOwed = this.getBTCowed(provider.providerId);

                // handle cases where provider have liquidity + removal
                if (u256.lt(oldOwed, actualSpent)) {
                    const difference = SafeMath.sub(actualSpent, oldOwed);
                    actualSpent = SafeMath.sub(actualSpent, difference);
                }

                // Convert that sat amount to "token units" for the buyer
                let tokensDesired = this.satoshisToTokens(actualSpent, quoteAtReservation);
                // clamp by 'reservedAmount'
                tokensDesired = SafeMath.min(tokensDesired, reservedAmount.toU256());

                if (tokensDesired.isZero()) {
                    // if zero => revert reservation from _lpBTCowedReserved
                    const costInSats = this.tokensToSatoshis(
                        reservedAmount.toU256(),
                        quoteAtReservation,
                    );

                    const revertSats = SafeMath.min(costInSats, owedReserved);
                    const newReserved = SafeMath.sub(owedReserved, revertSats);

                    this.setBTCowedReserved(provider.providerId, newReserved);
                    continue;
                }

                // final: remove from _lpBTCowedReserved
                const newOwedReserved = SafeMath.sub(owedReserved, actualSpent);
                this.setBTCowedReserved(provider.providerId, newOwedReserved);

                const newOwed = SafeMath.sub(oldOwed, actualSpent);
                this.setBTCowed(provider.providerId, newOwed);

                Blockchain.log(`newOwed: ${newOwed.toString()}`);

                // If they are fully or (almost) fully paid => remove from removal queue
                if (u256.lt(newOwed, LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT)) {
                    this.removePendingLiquidityProviderFromRemovalQueue(
                        provider,
                        provider.indexedAt,
                    );
                }

                // The buyer "receives" tokensDesired
                //totalTokensPurchased = SafeMath.add(totalTokensPurchased, tokensDesired);
                //totalSatoshisSpent = SafeMath.add(totalSatoshisSpent, actualSpent);
                totalRefundedBTC = SafeMath.add(totalRefundedBTC, actualSpent);
                totalTokensRefunded = SafeMath.add(totalTokensRefunded, tokensDesired);

                this.reportUTXOUsed(provider.btcReceiver, actualSpent.toU64());
            } else {
                // ========== NORMAL / PRIORITY PROVIDER LOGIC ==========
                // 6a. clamp by what we actually reserved and what’s in liquidity
                tokensDesired = SafeMath.min(tokensDesired, reservedAmount.toU256());
                tokensDesired = SafeMath.min(tokensDesired, provider.liquidity.toU256());

                satoshisSent = this.tokensToSatoshis(tokensDesired, quoteAtReservation);

                if (tokensDesired.isZero()) {
                    // If mismatch or too little => restore
                    this.restoreReservedLiquidityForProvider(provider, reservedAmount);
                    continue;
                }

                // 6b. Deduct from the provider
                const tokensDesiredU128 = tokensDesired.toU128();
                if (u128.lt(provider.liquidity, tokensDesiredU128)) {
                    throw new Revert('Impossible: liquidity < tokensDesired');
                }

                if (u128.lt(provider.reserved, tokensDesiredU128)) {
                    throw new Revert('Impossible: reserved < tokensDesired');
                }

                if (
                    !reservation.reservedLP &&
                    !provider.canProvideLiquidity() &&
                    provider.indexedAt !== u32.MAX_VALUE
                ) {
                    provider.enableLiquidityProvision();
                    this.deltaTokensAdd = SafeMath.add(
                        this.deltaTokensAdd,
                        provider.liquidity.toU256(),
                    );
                }

                provider.reserved = SafeMath.sub128(provider.reserved, tokensDesiredU128);
                provider.liquidity = SafeMath.sub128(provider.liquidity, tokensDesiredU128);

                // 6c. If leftover dust => reset
                const satLeftValue = SafeMath.div(provider.liquidity.toU256(), quoteAtReservation);
                if (
                    u256.lt(satLeftValue, LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT)
                ) {
                    this.resetProvider(provider, false); // or pass `true` if you want to burn leftover
                }

                // 6d. Accumulate
                totalTokensPurchased = SafeMath.add(totalTokensPurchased, tokensDesired);
                totalSatoshisSpent = SafeMath.add(totalSatoshisSpent, satoshisSent);

                this.reportUTXOUsed(provider.btcReceiver, satoshisSent.toU64());
            }
        }

        // 7) If we ended up not buying anything at all, revert
        if (
            totalTokensPurchased.isZero() &&
            totalSatoshisSpent.isZero() &&
            totalRefundedBTC.isZero() &&
            totalTokensRefunded.isZero()
        ) {
            throw new Revert('No tokens purchased. Did you send BTC to the provider addresses?');
        }

        // 8) Return summary
        return new CompletedTrade(
            totalTokensPurchased,
            totalSatoshisSpent,
            totalRefundedBTC,
            totalTokensRefunded,
        );
    }

    private getReservationWithExpirationChecks(): Reservation {
        const reservation = new Reservation(Blockchain.tx.sender, this.token);
        if (!reservation.valid()) {
            throw new Revert('No active reservation for this address.');
        }

        if (
            reservation.expirationBlock() - LiquidityQueue.RESERVATION_EXPIRE_AFTER ===
            Blockchain.block.numberU64
        ) {
            throw new Revert('Too early');
        }

        return reservation;
    }

    private getBTCowed(providerId: u256): u256 {
        return this._lpBTCowed.get(providerId) || u256.Zero;
    }

    private setBTCowed(providerId: u256, amount: u256): void {
        this._lpBTCowed.set(providerId, amount);
    }

    private getBTCowedReserved(providerId: u256): u256 {
        return this._lpBTCowedReserved.get(providerId) || u256.Zero;
    }

    private setBTCowedReserved(providerId: u256, amount: u256): void {
        this._lpBTCowedReserved.set(providerId, amount);
    }

    private getMaximumTokensLeftBeforeCap(): u256 {
        // how many tokens are currently liquid vs. reserved
        const reservedAmount: u256 = this.reservedLiquidity;
        const totalLiquidity: u256 = this.liquidity;
        const a: u256 = u256.fromU64(10_000);

        if (totalLiquidity.isZero()) {
            return u256.Zero;
        }

        const reservedRatio: u256 = SafeMath.div(SafeMath.mul(reservedAmount, a), totalLiquidity);
        let leftoverRatio: u256 = SafeMath.sub(
            u256.fromU64(this.maxReserves5BlockPercent),
            reservedRatio,
        );

        if (leftoverRatio.toI64() < 0) {
            leftoverRatio = u256.Zero;
        }

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

    private resetProvider(provider: Provider, burnRemainingFunds: boolean = true): void {
        if (burnRemainingFunds && !provider.liquidity.isZero()) {
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

        // removal
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

    private findAmountForAddressInOutputUTXOs(outputs: TransactionOutput[], address: string): u256 {
        let amount: u64 = 0;
        for (let i = 0; i < outputs.length; i++) {
            const output = outputs[i];
            if (output.to === address) {
                amount += output.value;
            }
        }

        const consumed: u64 = this.consumedOutputsFromUTXOs.has(address)
            ? this.consumedOutputsFromUTXOs.get(address)
            : 0;

        if (amount < consumed) {
            throw new Revert('Double spend detected');
        }

        return u256.fromU64(amount - consumed);
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

                reservation.userTimeoutBlockExpiration =
                    Blockchain.block.numberU64 + LiquidityQueue.TIMEOUT_AFTER_EXPIRATION;

                const reservedIndexes: u32[] = reservation.getReservedIndexes();
                const reservedValues: u128[] = reservation.getReservedValues();
                const queueTypes: u8[] = reservation.getQueueTypes();

                for (let j = 0; j < reservedIndexes.length; j++) {
                    const providerIndex: u64 = reservedIndexes[j];
                    const reservedAmount: u128 = reservedValues[j];
                    const queueType: u8 = queueTypes[j];
                    const provider: Provider = this.getProviderFromQueue(providerIndex, queueType);

                    if (u128.lt(provider.reserved, reservedAmount)) {
                        throw new Revert(
                            'Impossible: reserved amount bigger than provider reserve',
                        );
                    }

                    if (provider.pendingRemoval && queueType === LIQUIDITY_REMOVAL_TYPE) {
                        const providerId = provider.providerId;
                        const currentQuoteAtThatTime = this._quoteHistory.get(
                            reservation.createdAt,
                        );

                        // figure out how many sat was associated with 'reservedAmount'
                        const costInSats = this.tokensToSatoshis(
                            reservedAmount.toU256(),
                            currentQuoteAtThatTime,
                        );

                        // clamp by actual `_lpBTCowedReserved`
                        const wasReservedSats = this.getBTCowedReserved(providerId);
                        const revertSats = SafeMath.min(costInSats, wasReservedSats);

                        // remove from owedReserved
                        const newOwedReserved = SafeMath.sub(wasReservedSats, revertSats);
                        this.setBTCowedReserved(providerId, newOwedReserved);
                    } else {
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
                            this.resetProvider(provider, false);
                        }
                    }

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
            this.previousRemovalStartingIndex = 0;
        } else {
            this.onNoPurge();
        }

        this.lastPurgedBlock = currentBlockNumber;
    }

    private onNoPurge(): void {
        this.currentIndex = this.previousReservationStandardStartingIndex;
        this.currentIndexPriority = this.previousReservationStartingIndex;
        this.currentIndexRemoval = this.previousRemovalStartingIndex;
    }

    private getReservationListForBlock(blockNumber: u64): StoredU128Array {
        const writer = new BytesWriter(8 + this.tokenIdUint8Array.length);
        writer.writeU64(blockNumber);
        writer.writeBytes(this.tokenIdUint8Array);

        const keyBytes = writer.getBuffer();
        return new StoredU128Array(RESERVATION_IDS_BY_BLOCK_POINTER, keyBytes, u256.Zero);
    }

    private setBlockQuote(): void {
        if (<u64>u32.MAX_VALUE - 1 < Blockchain.block.numberU64) {
            throw new Revert('Block number too large, max array size.');
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

    private computeVolatility(
        currentBlock: u64,
        windowSize: u32 = LiquidityQueue.VOLATILITY_WINDOW_BLOCKS,
    ): u256 {
        // current quote
        const currentQuote = this._quoteHistory.get(<u32>currentBlock);

        // older quote from (currentBlock - windowSize)
        const oldQuote = this._quoteHistory.get(<u32>(currentBlock - windowSize));

        if (oldQuote.isZero()) {
            // fallback if no data
            return u256.Zero;
        }

        // WE WANT UNDERFLOW HERE.
        let diff = u256.sub(currentQuote, oldQuote);
        if (diff.toI64() < 0) {
            diff = SafeMath.mul(diff, u256.fromI64(-1));
        }

        Blockchain.log(
            `diff: ${diff.toString()}, oldQuote: ${oldQuote.toString()}, currentQuote: ${currentQuote.toString()}`,
        );

        // ratio = (|current - old| / old) * 10000 (for basis point)
        return SafeMath.div(SafeMath.mul(diff, u256.fromU64(10000)), oldQuote);
    }

    private distributeFee(totalFee: u256): void {
        this.virtualTokenReserve = SafeMath.add(this.virtualTokenReserve, totalFee);

        // If you want an 80/20 split:
        // const feeLP = SafeMath.div(SafeMath.mul(totalFee, u256.fromU64(80)), u256.fromU64(100));
        // const feeMoto = SafeMath.sub(totalFee, feeLP);
        // this.virtualTokenReserve = SafeMath.add(this.virtualTokenReserve, feeLP);
        // TransferHelper.safeTransfer(this.token, MOTOSWAP, feeMoto);
    }

    private removePendingLiquidityProviderFromRemovalQueue(provider: Provider, i: u64): void {
        this._removalQueue.delete(i);

        provider.pendingRemoval = false;
        provider.isLp = false;

        Blockchain.log(`Provider ${provider.providerId} removed from removal queue`);
    }

    private getNextRemovalQueueProvider(): Provider | null {
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
                if (
                    !left.isZero() &&
                    u256.gt(left, LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT)
                ) {
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
                    if (
                        u256.lt(owedBTC, LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT)
                    ) {
                        Blockchain.log(`Provider ${providerId} has owed BTC less than minimum`);
                        // If they don't have owed BTC, they can be removed from queue
                        this.removePendingLiquidityProviderFromRemovalQueue(provider, i);
                    }
                }
            } else {
                // If not pending removal, remove from queue
                this.removePendingLiquidityProviderFromRemovalQueue(provider, i);
            }
            this.currentIndexRemoval++;
        }

        return null;
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

    private getNextProviderWithLiquidity(): Provider | null {
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
}
