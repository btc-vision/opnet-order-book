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
    LIQUIDITY_RESERVED_POINTER,
    TOTAL_RESERVES_POINTER,
} from './StoredPointers';
import { StoredMapU256 } from '../stored/StoredMapU256';
import { getProvider, Provider } from './Provider';
import { LiquidityAddedEvent } from '../events/LiquidityAddedEvent';
import { quoter, Quoter } from '../math/Quoter';
import { LiquidityReserved } from '../events/LiquidityReserved';

export class LiquidityQueue {
    public readonly tokenId: u256;

    private readonly _p0: StoredU256;
    private readonly _ewmaL: StoredU256;
    private readonly _ewmaV: StoredU256;

    private readonly _queue: StoredU256Array;
    private readonly _totalReserves: StoredMapU256;
    private readonly _totalReserved: StoredMapU256;

    private readonly ALPHA: u256 = Quoter.a;

    private readonly _lastUpdatedBlockEWMA: StoredU64;

    constructor(
        public readonly token: Address,
        public readonly tokenIdUint8Array: Uint8Array,
    ) {
        const tokenId = u256.fromBytes(token, true);
        this.tokenId = tokenId;

        this._queue = new StoredU256Array(LIQUIDITY_QUEUE_POINTER, tokenIdUint8Array, u256.Zero);

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
        this._p0.value = value;
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
    }

    public quote(): u256 {
        return quoter.calculatePrice(this.p0, Quoter.k, this.ewmaV, this.ewmaL);
    }

    public estimateOutputTokens(satoshis: u256, currentPrice: u256): u256 {
        return SafeMath.mul(satoshis, currentPrice);
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

        this._queue.save();

        this.updateEWMA_L();

        const liquidityEvent = new LiquidityAddedEvent(provider.liquidity, receiver);
        Blockchain.emit(liquidityEvent);
    }

    public reserveLiquidity(buyer: Address, maximumAmount: u256): u256 {
        const currentPrice: u256 = this.quote();

        Blockchain.log(`currentPrice: ${currentPrice.toString()}`);

        const tokensOut: u256 = this.estimateOutputTokens(maximumAmount, currentPrice);

        let tokensReserved: u256 = u256.Zero;

        while (u256.lt(tokensReserved, tokensOut)) {
            const provider: Provider | null = this.getNextProviderWithLiquidity();
            if (provider === null) {
                break;
            }

            const providerLiquidity: u256 = provider.liquidity.toU256();

            const reserveAmount: u256 = SafeMath.min(
                providerLiquidity,
                SafeMath.sub(tokensOut, tokensReserved),
            );

            provider.liquidity = SafeMath.sub(providerLiquidity, reserveAmount).toU128();

            this.updateTotalReserve(this.tokenId, reserveAmount, false);
            this.updateTotalReserved(provider.providerId, reserveAmount, true);

            tokensReserved = SafeMath.add(tokensReserved, reserveAmount);

            if (provider.liquidity.isZero()) {
                provider.setActive(false);
            }
        }

        this.updateEWMA_V(tokensReserved);
        this.updateEWMA_L();

        const liquidityReservedEvent = new LiquidityReserved(tokensReserved);
        Blockchain.emit(liquidityReservedEvent);

        return tokensReserved;
    }

    public updateEWMA_V(currentBuyVolume: u256): void {
        const blocksElapsed: u64 = SafeMath.sub64(
            Blockchain.block.numberU64,
            this.lastUpdateBlockEWMA_V,
        );

        this.ewmaV = quoter.updateEWMA(
            currentBuyVolume,
            this.ewmaV,
            this.ALPHA,
            u256.fromU64(blocksElapsed),
        );

        this.lastUpdateBlockEWMA_V = Blockchain.block.numberU64;
    }

    private updateEWMA_L(): void {
        const blocksElapsed: u64 = SafeMath.sub64(
            Blockchain.block.numberU64,
            this.lastUpdateBlockEWMA_L,
        );

        const currentLiquidityU256: u256 = this.liquidity;

        this.ewmaL = quoter.updateEWMA(
            currentLiquidityU256,
            this.ewmaL,
            this.ALPHA,
            u256.fromU64(blocksElapsed),
        );

        this.lastUpdateBlockEWMA_L = Blockchain.block.numberU64;
    }

    private updateTotalReserve(token: u256, amount: u256, increase: bool): void {
        const currentReserve = this._totalReserves.get(token) || u256.Zero;
        const newReserve = increase
            ? SafeMath.add(currentReserve, amount)
            : SafeMath.sub(currentReserve, amount);

        this._totalReserves.set(token, newReserve);
    }

    private updateTotalReserved(providerId: u256, amount: u256, increase: bool): void {
        const currentReserved = this._totalReserved.get(providerId) || u256.Zero;
        const newReserved = increase
            ? SafeMath.add(currentReserved, amount)
            : SafeMath.sub(currentReserved, amount);

        this._totalReserved.set(providerId, newReserved);
    }

    private getNextProviderWithLiquidity(): Provider | null {
        let provider: Potential<Provider> = null;
        let providerId: u256;

        const length: u64 = this._queue.getLength();
        const index: u64 = this._queue.startingIndex();

        let i: u64 = index;

        while (i < length) {
            providerId = this._queue.get((i - index) as u32);
            provider = getProvider(providerId);

            if (!provider.liquidity.isZero()) {
                return provider;
            }

            i++;
        }

        return null;
    }
}
