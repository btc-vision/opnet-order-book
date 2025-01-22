import {
    Address,
    Blockchain,
    BytesWriter,
    Revert,
    SafeMath,
    StoredU128Array,
    StoredU256,
    StoredU256Array,
    StoredU64,
    TransactionOutput,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

import {
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

    public cleanUpQueuesAndSetNewQuote(): void {
        this._providerManager.cleanUpQueues();
        this.setBlockQuote();
    }

    public resetProvider(provider: Provider, burnRemainingFunds: boolean = true): void {
        this._providerManager.resetProvider(provider, burnRemainingFunds);
    }

    public computeFees(totalTokensPurchased: u256, totalSatoshisSpent: u256): u256 {
        const utilizationRatio = this.getUtilizationRatio();
        const feeBP = this._dynamicFee.getDynamicFeeBP(totalSatoshisSpent, utilizationRatio);
        return this._dynamicFee.computeFeeAmount(totalTokensPurchased, feeBP);
    }

    public computePriorityTax(amount: u256): u256 {
        const numerator = SafeMath.mul(
            amount,
            LiquidityQueue.PERCENT_TOKENS_FOR_PRIORITY_QUEUE.toU256(),
        );

        return SafeMath.div(numerator, LiquidityQueue.PERCENT_TOKENS_FOR_PRIORITY_FACTOR.toU256());
    }

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

        return SafeMath.div(T, this.virtualBTCReserve);
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
        initialLiquidity: u256, //!!!! JFB Pourquoi u256 et pas u128???
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

        Blockchain.log(`##############`);
        Blockchain.log(`update pool`);
        Blockchain.log(`Initial B: ${B}`);
        Blockchain.log(`Initial T: ${T}`);
        Blockchain.log(`deltaTokensAdd: ${this.deltaTokensAdd}`);
        Blockchain.log(`deltaBTCBuy: ${this.deltaBTCBuy}`);
        Blockchain.log(`deltaTokensBuy: ${this.deltaTokensBuy}`);
        Blockchain.log(`deltaTokensSell: ${this.deltaTokensSell}`);

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
                Tprime = u256.One; //!!!! JFB Pourquoi???
            } else {
                Tprime = SafeMath.sub(T, dT_buy);
            }

            Blockchain.log(`T prime: ${Tprime}`);

            const numerator = SafeMath.mul(B, T);
            let Bprime = SafeMath.div(numerator, Tprime);
            const incB = SafeMath.sub(Bprime, B);

            Blockchain.log(`B prime: ${Bprime}`);
            Blockchain.log(`incB prime: ${incB}`);

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

                Blockchain.log(`new B prime: ${Bprime}`);
                Blockchain.log(`new T prime: ${newTprime}`);
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
            //!!!! JFB Pourquoi???
            T = u256.One;
        }

        Blockchain.log(`New B: ${B}`);
        Blockchain.log(`New T: ${T}`);

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
        Blockchain.log(`##############`);
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

            if (queueType === LIQUIDITY_REMOVAL_TYPE && !provider.pendingRemoval) {
                throw new Revert(
                    'Impossible state: Cannot be in removal queue when not set to pendingRemoval = true.',
                );
            }

            // If no BTC is sent to this provider
            if (satoshisSent.isZero()) {
                this.noStatsSendToProvider(queueType, reservedAmount, quoteAtReservation, provider);

                // Nothing more for this provider, continue
                continue;
            }

            // 4c. Convert the satoshisSent to how many tokens the buyer *wants* to buy
            let tokensDesired = this.satoshisToTokens(satoshisSent, quoteAtReservation);

            // 5) Distinguish removal-queue from normal/priority
            if (queueType === LIQUIDITY_REMOVAL_TYPE) {
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

                // If they are fully or (almost) fully paid => remove from removal queue
                if (u256.lt(newOwed, LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT)) {
                    this._providerManager.removePendingLiquidityProviderFromRemovalQueue(
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

                // Enable provider liquidity when it starts getting consumed.
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
                    this._providerManager.resetProvider(provider, false); // or pass `true` if you want to burn leftover
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

    public getReservationWithExpirationChecks(): Reservation {
        const reservation = new Reservation(Blockchain.tx.sender, this.token);
        if (!reservation.valid()) {
            throw new Revert('No active reservation for this address.');
        }

        //TODO: !!!! Add block threshold. to prevent mev attack, user must set number of block to wait
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

    public getMaximumTokensLeftBeforeCap(): u256 {
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

    public tokensToSatoshis(tokenAmount: u256, scaledPrice: u256): u256 {
        return SafeMath.div(tokenAmount, scaledPrice);
    }

    public satoshisToTokens(satoshis: u256, scaledPrice: u256): u256 {
        return SafeMath.mul(satoshis, scaledPrice);
    }

    public getReservationListForBlock(blockNumber: u64): StoredU128Array {
        const writer = new BytesWriter(8 + this.tokenIdUint8Array.length);
        writer.writeU64(blockNumber);
        writer.writeBytes(this.tokenIdUint8Array);

        const keyBytes = writer.getBuffer();
        return new StoredU128Array(RESERVATION_IDS_BY_BLOCK_POINTER, keyBytes, u256.Zero);
    }

    public setBlockQuote(): void {
        if (<u64>u32.MAX_VALUE - 1 < Blockchain.block.numberU64) {
            throw new Revert('Block number too large, max array size.');
        }

        const blockNumberU32: u32 = <u32>Blockchain.block.numberU64;
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
        // TODO: Add motoswap fee here
        this.virtualTokenReserve = SafeMath.add(this.virtualTokenReserve, totalFee);

        // If you want an 80/20 split:
        // const feeLP = SafeMath.div(SafeMath.mul(totalFee, u256.fromU64(80)), u256.fromU64(100));
        // const feeMoto = SafeMath.sub(totalFee, feeLP);
        // this.virtualTokenReserve = SafeMath.add(this.virtualTokenReserve, feeLP);
        // TransferHelper.safeTransfer(this.token, MOTOSWAP, feeMoto);
    }

    private computeVolatility(
        currentBlock: u64,
        windowSize: u32 = LiquidityQueue.VOLATILITY_WINDOW_BLOCKS,
    ): u256 {
        // current quote
        const currentQuote = this._quoteHistory.get(<u32>currentBlock);

        // older quote from (currentBlock - windowSize)
        const oldQuote = this._quoteHistory.get(<u32>(currentBlock - windowSize));

        if (oldQuote.isZero() || currentQuote.isZero()) {
            // fallback if no data
            return u256.Zero;
        }

        // WE WANT UNDERFLOW HERE.
        let diff = u256.sub(currentQuote, oldQuote);
        if (diff.toI64() < 0) {
            diff = u256.mul(diff, u256.fromI64(-1));
        }

        Blockchain.log(
            `diff: ${diff.toString()}, oldQuote: ${oldQuote.toString()}, currentQuote: ${currentQuote.toString()}`,
        );

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
                reservation.delete();
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
            throw new Revert(`Invalid provider at index ${providerIndex}`);
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
