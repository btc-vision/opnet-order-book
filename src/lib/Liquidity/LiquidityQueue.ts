import {
    Address,
    Blockchain,
    BytesWriter,
    Revert,
    SafeMath,
    StoredAddress,
    StoredBooleanArray,
    StoredU128Array,
    StoredU256,
    StoredU256Array,
    StoredU64,
    TransactionOutput,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

import {
    ACTIVE_RESERVATION_IDS_BY_BLOCK_POINTER,
    ANTI_BOT_MAX_TOKENS_PER_RESERVATION,
    DELTA_BTC_BUY,
    DELTA_TOKENS_ADD,
    DELTA_TOKENS_BUY,
    DELTA_TOKENS_SELL,
    LAST_VIRTUAL_BLOCK_UPDATE_POINTER,
    LIQUIDITY_LAST_UPDATE_BLOCK_POINTER,
    LIQUIDITY_P0_POINTER,
    LIQUIDITY_QUOTE_HISTORY_POINTER,
    LIQUIDITY_RESERVED_POINTER,
    LIQUIDITY_VIRTUAL_BTC_POINTER,
    LIQUIDITY_VIRTUAL_T_POINTER,
    RESERVATION_IDS_BY_BLOCK_POINTER,
    RESERVATION_SETTINGS_POINTER,
    STAKING_CA_POINTER,
    TOTAL_RESERVES_POINTER,
} from '../StoredPointers';

import { StoredMapU256 } from '../../stored/StoredMapU256';
import { getProvider, Provider } from '../Provider';
import { LIQUIDITY_REMOVAL_TYPE, NORMAL_TYPE, PRIORITY_TYPE, Reservation } from '../Reservation';
import { FeeManager } from '../FeeManager';
import { CompletedTrade } from '../CompletedTrade';
import { DynamicFee } from '../DynamicFee';
import { ProviderManager } from './ProviderManager';

const ENABLE_TIMEOUT: bool = false;
const ENABLE_FEES: bool = true;

export class LiquidityQueue {
    public static QUOTE_SCALE: u256 = u256.fromU64(100_000_000); // 1e8

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

    // We'll keep p0 in a pointer
    private readonly _p0: StoredU256;

    private readonly _quoteHistory: StoredU256Array;
    private readonly _totalReserves: StoredMapU256;
    private readonly _totalReserved: StoredMapU256;

    // We'll store the last block updated
    private readonly _lastVirtualUpdateBlock: StoredU64;
    private readonly _settingPurge: StoredU64;
    private readonly _settings: StoredU64;
    private readonly _maxTokenPerSwap: StoredU256;

    // "delta" accumulators - used in updated stepwise logic
    private readonly _deltaTokensAdd: StoredU256;
    private readonly _deltaBTCBuy: StoredU256;
    private readonly _deltaTokensBuy: StoredU256;
    private readonly _deltaTokensSell: StoredU256;

    // Staking contract details
    private readonly stakingContractAddress: StoredAddress;

    private consumedOutputsFromUTXOs: Map<string, u64> = new Map<string, u64>();

    private readonly _dynamicFee: DynamicFee;
    private _providerManager: ProviderManager;

    constructor(
        public readonly token: Address,
        public readonly tokenIdUint8Array: Uint8Array,
        purgeOldReservations: boolean,
    ) {
        const tokenId = u256.fromBytes(token, true);
        this.tokenId = tokenId;

        this._dynamicFee = new DynamicFee(tokenId);
        this._providerManager = new ProviderManager(
            token,
            tokenIdUint8Array,
            tokenId,
            LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
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

        this._settingPurge = new StoredU64(LIQUIDITY_LAST_UPDATE_BLOCK_POINTER, tokenId, u256.Zero);
        this._settings = new StoredU64(RESERVATION_SETTINGS_POINTER, tokenId, u256.Zero);

        // Staking
        this.stakingContractAddress = new StoredAddress(STAKING_CA_POINTER, Address.dead());

        if (purgeOldReservations) {
            this.purgeReservationsAndRestoreProviders();
        }

        this.updateVirtualPoolIfNeeded();
    }

    public get p0(): u256 {
        return this._p0.value;
    }

    public set p0(value: u256) {
        this._p0.value = value;
    }

    public get initialLiquidityProvider(): u256 {
        return this._providerManager.initialLiquidityProvider;
    }

    public set initialLiquidityProvider(value: u256) {
        this._providerManager.initialLiquidityProvider = value;
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

    public get maxReserves5BlockPercent(): u64 {
        return this._settings.get(0);
    }

    public set maxReserves5BlockPercent(value: u64) {
        this._settings.set(0, value);
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

    public get feesEnabled(): bool {
        return ENABLE_FEES;
    }

    public get timeOutEnabled(): bool {
        return ENABLE_TIMEOUT;
    }

    public cleanUpQueues(): void {
        this._providerManager.cleanUpQueues();
    }

    public resetProvider(provider: Provider, burnRemainingFunds: boolean = true): void {
        this._providerManager.resetProvider(provider, burnRemainingFunds);
    }

    public computeFees(totalTokensPurchased: u256, totalSatoshisSpent: u256): u256 {
        const utilizationRatio = this.getUtilizationRatio();
        const feeBP = this._dynamicFee.getDynamicFeeBP(totalSatoshisSpent, utilizationRatio);
        return this._dynamicFee.computeFeeAmount(totalTokensPurchased, feeBP);
    }

    /*public computePriorityTax(amount: u256): u256 {
        const numerator = SafeMath.mul(
            amount,
            LiquidityQueue.PERCENT_TOKENS_FOR_PRIORITY_QUEUE.toU256(),
        );

        return SafeMath.div(numerator, LiquidityQueue.PERCENT_TOKENS_FOR_PRIORITY_FACTOR.toU256());
    }*/

    public getCostPriorityFee(): u64 {
        const length = this._providerManager.priorityQueueLength;
        const startingIndex = this._providerManager.priorityQueueStartingIndex;
        const realLength = length - startingIndex;

        return (
            realLength * FeeManager.PRICE_PER_USER_IN_PRIORITY_QUEUE_BTC +
            FeeManager.PRIORITY_QUEUE_BASE_FEE
        );
    }

    public getNextProviderWithLiquidity(): Provider | null {
        return this._providerManager.getNextProviderWithLiquidity();
    }

    public removePendingLiquidityProviderFromRemovalQueue(provider: Provider, i: u64): void {
        this._providerManager.removePendingLiquidityProviderFromRemovalQueue(provider, i);
    }

    public getTokensAfterTax(amountIn: u128): u128 {
        const tokensForPriorityQueue: u128 = SafeMath.div128(
            SafeMath.mul128(amountIn, LiquidityQueue.PERCENT_TOKENS_FOR_PRIORITY_QUEUE),
            LiquidityQueue.PERCENT_TOKENS_FOR_PRIORITY_FACTOR,
        );
        return SafeMath.sub128(amountIn, tokensForPriorityQueue);
    }

    // Return number of token per satoshi
    public quote(): u256 {
        const T: u256 = this.virtualTokenReserve;
        if (T.isZero()) {
            return u256.Zero;
        }

        if (this.virtualBTCReserve.isZero()) {
            throw new Revert(`NOT_ENOUGH_LIQUIDITY`);
        }

        // scaledQuote = T * QUOTE_SCALE / B
        const scaled = SafeMath.mul(T, LiquidityQueue.QUOTE_SCALE);
        return SafeMath.div(scaled, this.virtualBTCReserve);
    }

    public addToPriorityQueue(providerId: u256): void {
        this._providerManager.addToPriorityQueue(providerId);
    }

    public addToStandardQueue(providerId: u256): void {
        this._providerManager.addToStandardQueue(providerId);
    }

    public addToRemovalQueue(providerId: u256): void {
        this._providerManager.addToRemovalQueue(providerId);
    }

    public initializeInitialLiquidity(
        floorPrice: u256,
        providerId: u256,
        initialLiquidity: u256,
        maxReserves5BlockPercent: u64,
    ): void {
        this.p0 = floorPrice;
        this.initialLiquidityProvider = providerId;

        // The contract simulates BTC side:
        this.virtualBTCReserve = SafeMath.div(initialLiquidity, floorPrice);
        this.virtualTokenReserve = initialLiquidity;

        // set max reserves in 5 blocks
        this.maxReserves5BlockPercent = maxReserves5BlockPercent;
    }

    public save(): void {
        this._providerManager.save();
        this._settingPurge.save();
        this._quoteHistory.save();
        this._settings.save();
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

        /*Blockchain.log(`##############`);
        Blockchain.log(`update pool`);
        Blockchain.log(`Initial B: ${B}`);
        Blockchain.log(`Initial T: ${T}`);
        Blockchain.log(`deltaTokensAdd: ${this.deltaTokensAdd}`);
        Blockchain.log(`deltaBTCBuy: ${this.deltaBTCBuy}`);
        Blockchain.log(`deltaTokensBuy: ${this.deltaTokensBuy}`);
        Blockchain.log(`deltaTokensSell: ${this.deltaTokensSell}`);
        */

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

            /*Blockchain.log(`T prime: ${Tprime}`);*/

            const numerator = SafeMath.mul(B, T);
            let Bprime = SafeMath.div(numerator, Tprime);
            const incB = SafeMath.sub(Bprime, B);

            /*Blockchain.log(`B prime: ${Bprime}`);
            Blockchain.log(`incB prime: ${incB}`);*/

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

                /*Blockchain.log(`new B prime: ${Bprime}`);
                Blockchain.log(`new T prime: ${newTprime}`);*/
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

        /*Blockchain.log(`New B: ${B}`);
        Blockchain.log(`New T: ${T}`);*/

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
        /*Blockchain.log(`##############`);*/
    }

    public getUtilizationRatio(): u256 {
        const reserved = this.reservedLiquidity;
        const total = this.liquidity;

        if (total.isZero()) {
            return u256.Zero;
        }

        return SafeMath.div(SafeMath.mul(reserved, u256.fromU64(100)), total);
    }

    public executeTrade(reservation: Reservation): CompletedTrade {
        // 1) We gather the tx outputs to see how much BTC was actually sent to each provider's address.
        const outputs: TransactionOutput[] = Blockchain.tx.outputs;

        // 2) The quoted price at the time of reservation
        const blockNumber: u64 = reservation.createdAt % <u64>(u32.MAX_VALUE - 1);
        const quoteAtReservation = this._quoteHistory.get(blockNumber);
        if (quoteAtReservation.isZero()) {
            throw new Revert(
                `Quote at reservation is zero. (createdAt: ${blockNumber}, quoteAtReservation: ${quoteAtReservation})`,
            );
        }

        // 3) Retrieve arrays (provider indexes, amounts, queue types)
        const reservedIndexes: u32[] = reservation.getReservedIndexes();
        const reservedValues: u128[] = reservation.getReservedValues();
        const queueTypes: u8[] = reservation.getQueueTypes();
        const reservationForLP = reservation.reservedLP;

        if (reservation.valid() === false) {
            throw new Revert('Impossible state: Reservation is invalid but went thru executeTrade');
        }

        // **Important**: we delete the reservation record now
        // (since we have all needed info in local variables)
        reservation.delete(false);

        if (reservation.valid() === true) {
            throw new Revert('Impossible state: Reservation is still valid');
        }

        // Track totals
        let totalTokensPurchased = u256.Zero;
        let totalSatoshisSpent = u256.Zero;
        let totalRefundedBTC = u256.Zero;
        let totalTokensRefunded = u256.Zero;

        // 4) Iterate over each "provider" we had reserved
        for (let i = 0; i < reservedIndexes.length; i++) {
            const providerIndex: u64 = reservedIndexes[i];
            const reservedAmount: u128 = reservedValues[i];
            const queueType: u8 = queueTypes[i];

            // 4a) Retrieve the correct provider from the queue
            const provider: Provider = this.getProviderFromQueue(providerIndex, queueType);

            // 4b) How many satoshis did the buyer actually send to this provider?
            let satoshisSent = this.findAmountForAddressInOutputUTXOs(
                outputs,
                provider.btcReceiver,
            );

            if (queueType === LIQUIDITY_REMOVAL_TYPE && !provider.pendingRemoval) {
                throw new Revert(
                    'Impossible state: removal queue when provider is not flagged pendingRemoval.',
                );
            }

            // If no BTC was sent at all, revert the chunk from the reservation
            if (satoshisSent.isZero()) {
                this.noStatsSendToProvider(queueType, reservedAmount, quoteAtReservation, provider);
                continue;
            }

            // Convert satoshis -> tokens
            let tokensDesired = this.satoshisToTokens(satoshisSent, quoteAtReservation);

            // 5) Distinguish removal queue from normal/priority
            if (queueType === LIQUIDITY_REMOVAL_TYPE) {
                // ---------------------------------------------------
                // REMOVAL-PROVIDER LOGIC
                // ---------------------------------------------------
                // (These tokens are not in provider.liquidity.)
                // We clamp satoshisSent by how much is actually in _lpBTCowedReserved
                const owedReserved = this.getBTCowedReserved(provider.providerId);
                let actualSpent = SafeMath.min(satoshisSent, owedReserved);

                // Also clamp by oldOwed if provider has partially switched from removal
                const oldOwed = this.getBTCowed(provider.providerId);
                if (u256.lt(oldOwed, actualSpent)) {
                    const difference = SafeMath.sub(actualSpent, oldOwed);
                    actualSpent = SafeMath.sub(actualSpent, difference);
                }

                // Convert that spent amount to tokens
                let tokensDesiredRem = this.satoshisToTokens(actualSpent, quoteAtReservation);
                tokensDesiredRem = SafeMath.min(tokensDesiredRem, reservedAmount.toU256());

                if (tokensDesiredRem.isZero()) {
                    // If zero => revert the entire chunk from _lpBTCowedReserved
                    const costInSats = this.tokensToSatoshis(
                        reservedAmount.toU256(),
                        quoteAtReservation,
                    );

                    const revertSats = SafeMath.min(costInSats, owedReserved);
                    const newReserved = SafeMath.sub(owedReserved, revertSats);
                    this.setBTCowedReserved(provider.providerId, newReserved);
                    continue;
                } else {
                    // partial leftover
                    const leftover = SafeMath.sub128(reservedAmount, tokensDesiredRem.toU128());
                    if (!leftover.isZero()) {
                        const costInSatsLeftover = this.tokensToSatoshis(
                            leftover.toU256(),
                            quoteAtReservation,
                        );

                        const owedReservedNow = this.getBTCowedReserved(provider.providerId);
                        const revertSats = SafeMath.min(costInSatsLeftover, owedReservedNow);
                        const newOwedReserved = SafeMath.sub(owedReservedNow, revertSats);
                        this.setBTCowedReserved(provider.providerId, newOwedReserved);
                    }
                }

                // final: remove from _lpBTCowedReserved
                const newOwedReserved = SafeMath.sub(owedReserved, actualSpent);
                this.setBTCowedReserved(provider.providerId, newOwedReserved);

                const newOwed = SafeMath.sub(oldOwed, actualSpent);
                this.setBTCowed(provider.providerId, newOwed);

                // If fully (or almost) paid => remove from removal queue
                if (u256.lt(newOwed, LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT)) {
                    this._providerManager.removePendingLiquidityProviderFromRemovalQueue(
                        provider,
                        provider.indexedAt,
                    );
                }

                // The user "receives" tokensDesiredRem from the removal queue
                totalRefundedBTC = SafeMath.add(totalRefundedBTC, actualSpent);
                totalTokensRefunded = SafeMath.add(totalTokensRefunded, tokensDesiredRem);

                this.reportUTXOUsed(provider.btcReceiver, actualSpent.toU64());
            } else {
                // ---------------------------------------------------
                // NORMAL / PRIORITY LOGIC
                // ---------------------------------------------------
                tokensDesired = SafeMath.min(tokensDesired, reservedAmount.toU256());
                tokensDesired = SafeMath.min(tokensDesired, provider.liquidity.toU256());
                if (tokensDesired.isZero()) {
                    // if zero => revert entire chunk
                    this.restoreReservedLiquidityForProvider(provider, reservedAmount);
                    continue;
                }

                // (A) Subtract the entire chunk from provider.reserved in one step
                //     This ensures we never double-sub leftover + tokensDesired.
                if (u128.lt(provider.reserved, reservedAmount)) {
                    throw new Revert(
                        `Impossible: provider.reserved < reservedAmount (${provider.reserved} < ${reservedAmount})`,
                    );
                }
                provider.reserved = SafeMath.sub128(provider.reserved, reservedAmount);

                // (B) leftover is the portion not actually purchased
                const tokensDesiredU128 = tokensDesired.toU128();
                const leftover = SafeMath.sub128(reservedAmount, tokensDesiredU128);

                // (C) Remove leftover from global totalReserved
                if (!leftover.isZero()) {
                    this.updateTotalReserved(leftover.toU256(), /*increase=*/ false);
                }

                // Convert the purchased portion to satoshis
                satoshisSent = this.tokensToSatoshis(tokensDesired, quoteAtReservation);

                // (D) Actually consume tokens from provider.liquidity
                if (u128.lt(provider.liquidity, tokensDesiredU128)) {
                    throw new Revert('Impossible: liquidity < tokensDesired');
                }

                // Enable provider liquidity, must be done before the subtraction
                if (
                    !reservationForLP &&
                    !provider.canProvideLiquidity() &&
                    provider.indexedAt !== u32.MAX_VALUE
                ) {
                    provider.enableLiquidityProvision();
                    // track that we effectively "added" them to the virtual pool
                    this.deltaTokensAdd = SafeMath.add(
                        this.deltaTokensAdd,
                        provider.liquidity.toU256(), // updated before the subtraction
                    );
                }

                provider.liquidity = SafeMath.sub128(provider.liquidity, tokensDesiredU128);

                // If leftover dust => reset
                const satLeftValue = this.tokensToSatoshis(
                    provider.liquidity.toU256(),
                    quoteAtReservation,
                );

                if (
                    u256.lt(satLeftValue, LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT)
                ) {
                    this._providerManager.resetProvider(provider, false);
                }

                // (F) Accumulate user stats
                totalTokensPurchased = SafeMath.add(totalTokensPurchased, tokensDesired);
                totalSatoshisSpent = SafeMath.add(totalSatoshisSpent, satoshisSent);

                this.reportUTXOUsed(provider.btcReceiver, satoshisSent.toU64());
            }
        }

        // 7) If we ended up not buying or refunding anything at all, revert
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

    public getReservationWithExpirationChecks(): Reservation {
        const reservation = new Reservation(this.token, Blockchain.tx.sender);
        if (!reservation.valid()) {
            throw new Revert('No active reservation for this address.');
        }

        // TODO: !!!! Add block threshold. to prevent mev attack, user must set number of block to wait
        if (
            reservation.expirationBlock() - LiquidityQueue.RESERVATION_EXPIRE_AFTER ===
            Blockchain.block.numberU64
        ) {
            throw new Revert('Too early');
        }

        return reservation;
    }

    public getBTCowed(providerId: u256): u256 {
        return this._providerManager.getBTCowed(providerId);
    }

    public setBTCowed(providerId: u256, amount: u256): void {
        this._providerManager.setBTCowed(providerId, amount);
    }

    public getBTCowedReserved(providerId: u256): u256 {
        return this._providerManager.getBTCowedReserved(providerId);
    }

    public setBTCowedReserved(providerId: u256, amount: u256): void {
        this._providerManager.setBTCowedReserved(providerId, amount);
    }

    /*public getMaximumTokensLeftBeforeCap(): u256 {
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
    }*/

    public getMaximumTokensLeftBeforeCap(): u256 {
        // how many tokens are currently liquid vs. reserved
        const reservedAmount: u256 = this.reservedLiquidity;
        const totalLiquidity: u256 = this.liquidity;
        const maxPercentage: u256 = u256.fromU64(this.maxReserves5BlockPercent);

        if (totalLiquidity.isZero()) {
            return u256.Zero;
        }

        // Compute reserved ratio in scaled form:
        // ratioScaled = (reserved * QUOTE_SCALE) / totalLiquidity
        let ratioScaled: u256 = SafeMath.mul(reservedAmount, LiquidityQueue.QUOTE_SCALE);
        ratioScaled = SafeMath.div(ratioScaled, totalLiquidity);

        // Convert your maxReserves5BlockPercent (like 5 => 5%)
        //    into the same QUOTE_SCALE domain:
        //    maxPercentScaled = (maxPercentage * QUOTE_SCALE) / 100
        const hundred = u256.fromU64(100);
        let maxPercentScaled = SafeMath.mul(maxPercentage, LiquidityQueue.QUOTE_SCALE);
        maxPercentScaled = SafeMath.div(maxPercentScaled, hundred);

        // leftoverRatioScaled = maxPercentScaled - ratioScaled
        //    if leftoverRatioScaled < 0 => clamp to 0
        let leftoverRatioScaled: u256;
        if (u256.gt(ratioScaled, maxPercentScaled)) {
            leftoverRatioScaled = u256.Zero;
        } else {
            leftoverRatioScaled = SafeMath.sub(maxPercentScaled, ratioScaled);
        }

        // leftoverTokens = (totalLiquidity * leftoverRatioScaled) / QUOTE_SCALE
        return SafeMath.div(
            SafeMath.mul(totalLiquidity, leftoverRatioScaled),
            LiquidityQueue.QUOTE_SCALE,
        );
    }

    /**
     * tokensToSatoshis(tokenAmount, scaledPrice):
     *   = tokenAmount * QUOTE_SCALE / scaledPrice
     * because scaledPrice = (T * QUOTE_SCALE) / B
     */
    public tokensToSatoshis(tokenAmount: u256, scaledPrice: u256): u256 {
        // (tokenAmount / (T/B)) but we have scaledPrice = T*QUOTE_SCALE/B
        // => tokensToSats = tokenAmount * QUOTE_SCALE / scaledPrice

        // ROUND DOWN
        return SafeMath.div(SafeMath.mul(tokenAmount, LiquidityQueue.QUOTE_SCALE), scaledPrice);
    }

    /**
     * satoshisToTokens(satoshis, scaledPrice):
     *   = (satoshis * scaledPrice) / QUOTE_SCALE
     * because scaledPrice = (T * QUOTE_SCALE) / B
     */
    public satoshisToTokens(satoshis: u256, scaledPrice: u256): u256 {
        // tokens = satoshis * (T/B)
        // but scaledPrice = T*QUOTE_SCALE / B
        // => tokens = (satoshis * scaledPrice) / QUOTE_SCALE

        // ROUND DOWN
        return SafeMath.div(SafeMath.mul(satoshis, scaledPrice), LiquidityQueue.QUOTE_SCALE);
    }

    public getReservationListForBlock(blockNumber: u64): StoredU128Array {
        const writer = new BytesWriter(8 + this.tokenIdUint8Array.length);
        writer.writeU64(blockNumber);
        writer.writeBytes(this.tokenIdUint8Array);

        const keyBytes = writer.getBuffer();
        return new StoredU128Array(RESERVATION_IDS_BY_BLOCK_POINTER, keyBytes, u256.Zero);
    }

    public getActiveReservationListForBlock(blockNumber: u64): StoredBooleanArray {
        const writer = new BytesWriter(8 + this.tokenIdUint8Array.length);
        writer.writeU64(blockNumber);
        writer.writeBytes(this.tokenIdUint8Array);

        const keyBytes = writer.getBuffer();
        return new StoredBooleanArray(ACTIVE_RESERVATION_IDS_BY_BLOCK_POINTER, keyBytes, u256.Zero);
    }

    public setBlockQuote(): void {
        if (<u64>u32.MAX_VALUE - 1 < Blockchain.block.numberU64) {
            throw new Revert('Block number too large, max array size.');
        }

        const blockNumberU32: u64 = Blockchain.block.numberU64 % <u64>(u32.MAX_VALUE - 1);
        this._quoteHistory.set(blockNumberU32, this.quote());
    }

    public updateTotalReserve(amount: u256, increase: bool): void {
        const currentReserve = this._totalReserves.get(this.tokenId) || u256.Zero;
        const newReserve = increase
            ? SafeMath.add(currentReserve, amount)
            : SafeMath.sub(currentReserve, amount);
        this._totalReserves.set(this.tokenId, newReserve);
    }

    public updateTotalReserved(amount: u256, increase: bool): void {
        const currentReserved = this._totalReserved.get(this.tokenId) || u256.Zero;
        const newReserved = increase
            ? SafeMath.add(currentReserved, amount)
            : SafeMath.sub(currentReserved, amount);
        this._totalReserved.set(this.tokenId, newReserved);
    }

    public distributeFee(totalFee: u256): void {
        const feeLP = SafeMath.div(SafeMath.mul(totalFee, u256.fromU64(50)), u256.fromU64(100));
        const feeMoto = SafeMath.sub(totalFee, feeLP);
        // Do nothing with half the fee
        this.virtualTokenReserve = SafeMath.add(this.virtualTokenReserve, feeLP);

        // Only transfer if the fee is non-zero
        if (feeMoto > u256.Zero) {
            // Send other half of fee to staking contract
            TransferHelper.safeTransfer(this.token, this.stakingContractAddress.value, feeMoto);
            this.updateTotalReserve(feeMoto, false);
        }
    }

    private computeVolatility(
        currentBlock: u64,
        windowSize: u32 = LiquidityQueue.VOLATILITY_WINDOW_BLOCKS,
    ): u256 {
        // current quote
        const blockNumber: u64 = currentBlock % <u64>(u32.MAX_VALUE - 1);
        const currentQuote = this._quoteHistory.get(blockNumber);

        // older quote from (currentBlock - windowSize)
        const oldBlock = (currentBlock - windowSize) % <u64>(u32.MAX_VALUE - 1);
        const oldQuote = this._quoteHistory.get(oldBlock);

        if (oldQuote.isZero() || currentQuote.isZero()) {
            // fallback if no data
            return u256.Zero;
        }

        // WE WANT UNDERFLOW HERE.
        let diff = u256.sub(currentQuote, oldQuote);
        if (diff.toI64() < 0) {
            diff = u256.mul(diff, u256.fromI64(-1));
        }

        //Blockchain.log(
        //    `diff: ${diff.toString()}, oldQuote: ${oldQuote.toString()}, currentQuote: ${currentQuote.toString()}`,
        //);

        // ratio = (|current - old| / old) * 10000 (for basis point)
        return SafeMath.div(SafeMath.mul(diff, u256.fromU64(10000)), oldQuote);
    }

    private restoreReservedLiquidityForProvider(provider: Provider, reserved: u128): void {
        provider.reserved = SafeMath.sub128(provider.reserved, reserved);
        provider.liquidity = SafeMath.add128(provider.liquidity, reserved);

        this.updateTotalReserved(reserved.toU256(), false);
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
            this._providerManager.restoreCurrentIndex();
            return;
        }

        if (lastPurgedBlock >= maxBlockToPurge) {
            this._providerManager.restoreCurrentIndex();
            return;
        }

        let totalReservedAmount: u256 = u256.Zero;
        let updatedOne = false;

        for (let blockNumber = lastPurgedBlock; blockNumber < maxBlockToPurge; blockNumber++) {
            const reservationList = this.getReservationListForBlock(blockNumber);
            const length: u32 = reservationList.getLength() as u32;
            const activeIds: StoredBooleanArray =
                this.getActiveReservationListForBlock(blockNumber);

            for (let i: u32 = 0; i < length; i++) {
                const isActive = activeIds.get(i);
                if (!isActive) {
                    continue;
                }

                const reservationId = reservationList.get(i);
                const reservation = Reservation.load(reservationId);

                if (reservation.getPurgeIndex() !== i) {
                    throw new Revert(
                        `Impossible: reservation purge index mismatch (expected: ${i}, actual: ${reservation.getPurgeIndex()})`,
                    );
                }

                if (!reservation.expired()) {
                    throw new Revert(`Impossible: reservation is not active, was in active list`);
                }

                reservation.timeout();

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

                    //Blockchain.log(`Purging provider: ${provider.providerId} - ${providerIndex} - ${queueType} - ${reservedAmount}`);

                    if (provider.pendingRemoval && queueType === LIQUIDITY_REMOVAL_TYPE) {
                        const providerId = provider.providerId;

                        const blockNumber: u64 = reservation.createdAt % <u64>(u32.MAX_VALUE - 1);
                        const currentQuoteAtThatTime = this._quoteHistory.get(blockNumber);

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
                            this._providerManager.resetProvider(provider, false);
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
                reservation.delete(true);
            }

            reservationList.deleteAll();
            reservationList.save();
        }

        if (updatedOne) {
            this.updateTotalReserved(totalReservedAmount, false);
            this._providerManager.resetStartingIndex();
        } else {
            this._providerManager.restoreCurrentIndex();
        }

        this.lastPurgedBlock = currentBlockNumber;
    }

    private getProviderIfFromQueue(providerIndex: u64, type: u8): u256 {
        switch (type) {
            case NORMAL_TYPE: {
                return this._providerManager.getFromStandardQueue(providerIndex);
            }
            case PRIORITY_TYPE: {
                return this._providerManager.getFromPriorityQueue(providerIndex);
            }
            // !!! TEST MAYBE BROKEN
            case LIQUIDITY_REMOVAL_TYPE: {
                return this._providerManager.getFromRemovalQueue(providerIndex);
            }
            default: {
                throw new Revert('Invalid reservation type');
            }
        }
    }

    private getProviderFromQueue(providerIndex: u64, type: u8): Provider {
        const isInitialLiquidity = providerIndex === u32.MAX_VALUE;
        const providerId: u256 = isInitialLiquidity
            ? this._providerManager.initialLiquidityProvider
            : this.getProviderIfFromQueue(providerIndex, type);

        if (providerId.isZero()) {
            throw new Revert(
                `Impossible: Critical problem in provider state updates. Pool corrupted.`,
            );
        }

        const provider = getProvider(providerId);
        provider.indexedAt = providerIndex;

        return provider;
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

    private noStatsSendToProvider(
        queueType: u8,
        reservedAmount: u128,
        quoteAtReservation: u256,
        provider: Provider,
    ): void {
        // If this is a removal provider, we also revert that portion
        //         from _lpBTCowedReserved (since it never got paid).
        if (queueType === LIQUIDITY_REMOVAL_TYPE) {
            // Convert 'reservedAmount' back to sat (approx) using the original quote
            const costInSats = this.tokensToSatoshis(reservedAmount.toU256(), quoteAtReservation);

            // clamp by actual owedReserved
            const owedReserved = this.getBTCowedReserved(provider.providerId);
            const revertSats = SafeMath.min(costInSats, owedReserved);

            // reduce the owedReserved by revertSats
            const newReserved = SafeMath.sub(owedReserved, revertSats);
            this.setBTCowedReserved(provider.providerId, newReserved);
        } else {
            this.restoreReservedLiquidityForProvider(provider, reservedAmount);
        }
    }
}
