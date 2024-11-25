import {
    Address,
    Blockchain,
    Potential,
    Revert,
    SafeMath,
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
    LIQUIDITY_QUEUE_POINTER,
    LIQUIDITY_QUOTE_HISTORY_POINTER,
    LIQUIDITY_RESERVED_POINTER,
    TOTAL_RESERVES_POINTER,
} from './StoredPointers';
import { StoredMapU256 } from '../stored/StoredMapU256';
import { getProvider, Provider } from './Provider';
import { LiquidityAddedEvent } from '../events/LiquidityAddedEvent';
import { quoter, Quoter } from '../math/Quoter';
import { LiquidityReserved } from '../events/LiquidityReserved';
import { Reservation } from './Reservation';
import { MAX_RESERVATION_AMOUNT_PROVIDER } from '../data-types/UserLiquidity';

export class LiquidityQueue {
    public static RESERVATION_EXPIRE_AFTER: u64 = 5;

    public readonly tokenId: u256;
    private readonly _p0: StoredU256;
    private readonly _ewmaL: StoredU256;
    private readonly _ewmaV: StoredU256;

    private readonly _queue: StoredU256Array;
    private readonly _totalReserves: StoredMapU256;
    private readonly _totalReserved: StoredMapU256;

    private readonly _lastUpdatedBlockEWMA: StoredU64;
    private readonly _quoteHistory: StoredU256Array;

    private currentIndex: u64 = 0;

    constructor(
        public readonly token: Address,
        public readonly tokenIdUint8Array: Uint8Array,
    ) {
        const tokenId = u256.fromBytes(token, true);
        this.tokenId = tokenId;

        this._queue = new StoredU256Array(LIQUIDITY_QUEUE_POINTER, tokenIdUint8Array, u256.Zero);
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

        this._lastUpdatedBlockEWMA = new StoredU64(
            LIQUIDITY_EWMA_LAST_UPDATE_BLOCK_POINTER,
            tokenId,
            u256.Zero,
        );
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
        return this._lastUpdatedBlockEWMA.get(0);
    }

    public set lastUpdateBlockEWMA_V(value: u64) {
        this._lastUpdatedBlockEWMA.set(0, value);
    }

    public get lastUpdateBlockEWMA_L(): u64 {
        return this._lastUpdatedBlockEWMA.get(1);
    }

    public set lastUpdateBlockEWMA_L(value: u64) {
        this._lastUpdatedBlockEWMA.set(1, value);
    }

    public save(): void {
        this._lastUpdatedBlockEWMA.save();
        this._queue.save();
        this._quoteHistory.save();
    }

    public quote(): u256 {
        return quoter.calculatePrice(this.p0, this.ewmaV, this.ewmaL);
    }

    public addLiquidity(providerId: u256, amountIn: u128, receiver: string): void {
        const amountInU256: u256 = amountIn.toU256();
        TransferHelper.safeTransferFrom(
            this.token,
            Blockchain.tx.sender,
            Blockchain.contractAddress,
            amountInU256,
        );

        this.updateTotalReserve(this.tokenId, amountInU256, true);

        const provider: Provider = getProvider(providerId);
        const liquidity: u128 = provider.liquidity;
        if (!u128.lt(liquidity, SafeMath.sub128(u128.Max, amountIn))) {
            throw new Revert('Liquidity overflow. Please add a smaller amount.');
        }

        provider.liquidity = SafeMath.add128(liquidity, amountIn);
        provider.btcReceiver = receiver;

        if (!provider.isActive()) {
            provider.setActive(true);
            this._queue.push(providerId);
        }

        // Update the EWMA of liquidity after adding liquidity
        this.updateEWMA_L();

        this.setBlockQuote();

        const liquidityEvent = new LiquidityAddedEvent(provider.liquidity, receiver);
        Blockchain.emit(liquidityEvent);
    }

    public reserveLiquidity(buyer: Address, maximumAmount: u256): u256 {
        const reservation = new Reservation(buyer, this.token);
        const currentPrice: u256 = this.quote();

        let tokensReserved: u256 = u256.Zero;
        let satSpent: u256 = u256.Zero;

        let tokensRemaining: u256 = SafeMath.mul(maximumAmount, currentPrice);

        const totalAvailableLiquidity: u256 = SafeMath.sub(this.liquidity, this.reservedLiquidity);

        if (u256.lt(totalAvailableLiquidity, tokensRemaining)) {
            tokensRemaining = totalAvailableLiquidity;
        }

        if (tokensRemaining.isZero()) {
            return u256.Zero;
        }

        while (!tokensRemaining.isZero()) {
            const provider: Provider | null = this.getNextProviderWithLiquidity();
            if (provider === null) {
                break;
            }

            const providerLiquidity: u256 = SafeMath.sub128(
                provider.liquidity,
                provider.reserved,
            ).toU256();

            const reserveAmount: u256 = SafeMath.min(
                SafeMath.min(providerLiquidity, tokensRemaining),
                MAX_RESERVATION_AMOUNT_PROVIDER.toU256(),
            );

            const costInSatoshis: u256 = SafeMath.div(reserveAmount, currentPrice);
            //Blockchain.log(
            //    `Provider liquidity: ${providerLiquidity.toString()}, satCost: ${costInSatoshis.toString()}, currentPrice: ${currentPrice.toString()}, reserveAmount: ${reserveAmount.toString()}`,
            //);

            // Update provider's reserved amount
            provider.reserved = SafeMath.add128(provider.reserved, reserveAmount.toU128());

            tokensReserved = SafeMath.add(tokensReserved, reserveAmount);
            tokensRemaining = SafeMath.sub(tokensRemaining, reserveAmount);
            satSpent = SafeMath.add(satSpent, costInSatoshis);
            reservation.reserveAtIndex(provider.indexedAt, reserveAmount.toU128());
        }

        if (tokensReserved.isZero()) {
            throw new Revert('No liquidity available');
        }

        //this.updateTotalReserve(this.tokenId, tokensReserved, false);
        this.updateTotalReserved(this.tokenId, tokensReserved, true);

        // Config for the reservation
        reservation.setExpirationBlock(
            Blockchain.block.numberU64 + LiquidityQueue.RESERVATION_EXPIRE_AFTER,
            this._queue.startingIndex(),
        );

        reservation.save();

        // Update the EWMA of buy volume after the trade is executed
        this.updateEWMA_V(tokensReserved);
        this.updateEWMA_L();
        this.setBlockQuote();

        const liquidityReservedEvent = new LiquidityReserved(tokensReserved);
        Blockchain.emit(liquidityReservedEvent);

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

    private getNextProviderWithLiquidity(): Provider | null {
        let provider: Potential<Provider> = null;
        let providerId: u256;

        const length: u64 = this._queue.getLength();
        const index: u64 = this._queue.startingIndex();

        // Ensure that the starting index does not exceed the queue length to prevent underflow
        if (index > length) {
            throw new Revert('Starting index exceeds queue length');
        }

        let i: u64 = index + this.currentIndex;

        while (i < length) {
            // Check for potential underflow before subtracting
            if (i < index) {
                throw new Revert('Index underflow detected');
            }

            const difference: u64 = i - index;

            // Ensure the difference fits within a u16 to prevent overflow
            if (difference > <u64>u16.MAX_VALUE) {
                throw new Revert('Index difference exceeds u16.MAX_VALUE');
            }

            const v: u16 = <u16>difference;

            // Additional check to ensure that casting did not wrap around
            if (v === u16.MAX_VALUE && difference !== <u64>u16.MAX_VALUE) {
                throw new Revert('Index overflow detected');
            }

            providerId = this._queue.get(i);
            provider = getProvider(providerId);

            if (u128.lt(provider.liquidity, provider.reserved)) {
                throw new Revert(
                    `Impossible state: liquidity < reserved for provider ${providerId}.`,
                );
            }

            const availableLiquidity: u128 = SafeMath.sub128(provider.liquidity, provider.reserved);
            if (!availableLiquidity.isZero()) {
                provider.indexedAt = v;

                this.currentIndex = i - index;
                return provider;
            }

            // Check for potential overflow before incrementing
            if (i == u64.MAX_VALUE) {
                throw new Revert('Index increment overflow');
            }

            i++;
        }

        return null;
    }
}
