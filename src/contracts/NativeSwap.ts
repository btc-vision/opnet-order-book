import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
    Calldata,
    encodeSelector,
    Revert,
    SafeMath,
    Selector,
} from '@btc-vision/btc-runtime/runtime';
import { OP_NET } from '@btc-vision/btc-runtime/runtime/contracts/OP_NET';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { LiquidityQueue } from '../lib/LiquidityQueue';
import { ripemd160, sha256 } from '@btc-vision/btc-runtime/runtime/env/global';
import { getProvider, saveAllProviders } from '../lib/Provider';
import { getTotalFeeCollected } from '../utils/OrderBookUtils';
import { FeeManager } from '../lib/FeeManager';

/**
 * OrderBook contract for the OP_NET order book system,
 * now using block-based, virtual-constant-product logic
 * in the LiquidityQueue.
 */
@final
export class NativeSwap extends OP_NET {
    private readonly minimumTradeSize: u256 = u256.fromU32(10_000); // The minimum trade size in satoshis.

    public constructor() {
        super();
    }

    private static get DEPLOYER_SELECTOR(): Selector {
        return encodeSelector('deployer');
    }

    public override onDeployment(_calldata: Calldata): void {
        FeeManager.onDeploy();
    }

    public override onExecutionCompleted(): void {
        FeeManager.save();
        saveAllProviders();
    }

    public override execute(method: Selector, calldata: Calldata): BytesWriter {
        switch (method) {
            case encodeSelector('reserve'):
                return this.reserve(calldata);
            case encodeSelector('swap'):
                return this.swap(calldata);
            case encodeSelector('listLiquidity'):
                return this.listLiquidity(calldata);
            case encodeSelector('unlistLiquidity'):
                return this.unlistLiquidity(calldata);
            case encodeSelector('createPool'): // aka enable trading
                return this.createPool(calldata);
            case encodeSelector('setFees'):
                return this.setFees(calldata);

            /** Readable methods */
            case encodeSelector('getReserve'):
                return this.getReserve(calldata);
            case encodeSelector('getQuote'):
                return this.getQuote(calldata);
            case encodeSelector('getProviderDetails'):
                return this.getProviderDetails(calldata);

            // If you still want a 'getEWMA'-like function,
            // we can repurpose it to return virtual reserves:
            case encodeSelector('getEWMA'):
                return this.getVirtualReserves(calldata);

            case encodeSelector('priorityQueueCost'):
                return this.getPriorityQueueCost(calldata);

            default:
                return super.execute(method, calldata);
        }
    }

    private setFees(calldata: Calldata): BytesWriter {
        FeeManager.RESERVATION_BASE_FEE = calldata.readU64();
        FeeManager.PRIORITY_QUEUE_BASE_FEE = calldata.readU64();
        FeeManager.PRICE_PER_USER_IN_PRIORITY_QUEUE_BTC = calldata.readU64();

        return new BytesWriter(1);
    }

    private getProviderDetails(calldata: Calldata): BytesWriter {
        const token = calldata.readAddress();
        const providerId = this.addressToPointerU256(Blockchain.tx.sender, token);
        const provider = getProvider(providerId);

        const writer = new BytesWriter(32);
        writer.writeU128(provider.liquidity);
        writer.writeU128(provider.reserved);
        writer.writeStringWithLength(provider.btcReceiver);

        return writer;
    }

    private getPriorityQueueCost(calldata: Calldata): BytesWriter {
        const token = calldata.readAddress();
        const queue = this.getLiquidityQueue(token, this.addressToPointer(token));
        const cost = queue.getCostPriorityFee();

        const writer = new BytesWriter(32);
        writer.writeU64(cost);
        return writer;
    }

    private createPool(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const tokenOwner = this.getOwner(token);
        if (Blockchain.tx.origin.equals(tokenOwner) == false) {
            throw new Revert('Only token owner can set quote');
        }

        const floorPrice: u256 = calldata.readU256();
        const initialLiquidity: u128 = calldata.readU128();
        const receiver: string = calldata.readStringWithLength();
        const antiBotEnabledFor: u16 = calldata.readU16();
        const antiBotMaximumTokensPerReservation: u256 = calldata.readU256();
        const maxReservesIn5BlocksPercent: u16 = calldata.readU16();

        if (Blockchain.validateBitcoinAddress(receiver) == false) {
            throw new Revert('Invalid receiver address');
        }
        if (floorPrice.isZero()) {
            throw new Revert('Floor price cannot be zero');
        }
        if (initialLiquidity.isZero()) {
            throw new Revert('Initial liquidity cannot be zero');
        }
        if (antiBotEnabledFor !== 0 && antiBotMaximumTokensPerReservation.isZero()) {
            throw new Revert('Anti-bot max tokens per reservation cannot be zero');
        }

        const queue = this.getLiquidityQueue(token, this.addressToPointer(token));
        if (!queue.p0.isZero()) {
            throw new Revert('Base quote already set');
        }

        const providerId = this.addressToPointerU256(Blockchain.tx.sender, token);
        queue.createPool(
            floorPrice,
            providerId,
            initialLiquidity,
            receiver,
            antiBotEnabledFor,
            antiBotMaximumTokensPerReservation,
            maxReservesIn5BlocksPercent,
        );

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    //=================================================
    // ADD LIQUIDITY
    //=================================================
    private listLiquidity(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const receiver: string = calldata.readStringWithLength();

        if (Blockchain.validateBitcoinAddress(receiver) == false) {
            throw new Revert('Invalid receiver address');
        }

        const amountIn: u128 = calldata.readU128();
        const priority: boolean = calldata.readBoolean();
        return this._listLiquidity(token, receiver, amountIn, priority);
    }

    private _listLiquidity(
        token: Address,
        receiver: string,
        amountIn: u128,
        priority: boolean,
    ): BytesWriter {
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('Invalid token address');
        }
        if (amountIn.isZero()) {
            throw new Revert('Amount in cannot be zero');
        }

        const providerId = this.addressToPointerU256(Blockchain.tx.sender, token);
        const tokenId = this.addressToPointer(token);

        const queue = this.getLiquidityQueue(token, tokenId);
        queue.listLiquidity(providerId, amountIn, receiver, priority);
        queue.save();

        // Return success
        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

    //=================================================
    // RESERVE
    //=================================================
    private reserve(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const maximumAmountIn: u256 = calldata.readU256();
        const minimumAmountOut: u256 = calldata.readU256();

        return this._reserve(token, maximumAmountIn, minimumAmountOut);
    }

    private _reserve(token: Address, maximumAmountIn: u256, minimumAmountOut: u256): BytesWriter {
        // Validate
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('ORDER_BOOK: Invalid token address');
        }
        if (maximumAmountIn.isZero()) {
            throw new Revert('ORDER_BOOK: Maximum amount in cannot be zero');
        }
        if (u256.lt(maximumAmountIn, this.minimumTradeSize)) {
            throw new Revert(
                `ORDER_BOOK: Requested amount is below minimum trade size ${maximumAmountIn} < ${this.minimumTradeSize}`,
            );
        }
        if (minimumAmountOut.isZero()) {
            throw new Revert('ORDER_BOOK: Minimum amount out cannot be zero');
        }

        const totalFee = getTotalFeeCollected();
        if (totalFee < FeeManager.RESERVATION_BASE_FEE) {
            throw new Revert('ORDER_BOOK: Insufficient fees collected');
        }

        const buyer: Address = Blockchain.tx.sender;
        const queue = this.getLiquidityQueue(token, this.addressToPointer(token));
        const reserved = queue.reserveLiquidity(buyer, maximumAmountIn, minimumAmountOut);
        queue.save();

        const result = new BytesWriter(32);
        result.writeU256(reserved);
        return result;
    }

    //=================================================
    // REMOVE LIQUIDITY
    //=================================================
    private unlistLiquidity(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        return this._unlistLiquidity(token);
    }

    private _unlistLiquidity(token: Address): BytesWriter {
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('Invalid token address');
        }

        const providerId = this.addressToPointerU256(Blockchain.tx.sender, token);
        const tokenId = this.addressToPointer(token);

        const queue = this.getLiquidityQueue(token, tokenId);
        const totalTokensReturned = queue.unlistLiquidity(providerId);
        queue.save();

        // Serialize the total tokens returned
        const result = new BytesWriter(32);
        result.writeU128(totalTokensReturned);
        return result;
    }

    //=================================================
    // SWAP
    //=================================================
    private swap(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        return this._swap(token);
    }

    private _swap(token: Address): BytesWriter {
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('Invalid token address');
        }

        const queue: LiquidityQueue = this.getLiquidityQueue(token, this.addressToPointer(token));
        queue.swap(Blockchain.tx.sender);
        queue.save();

        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

    //=================================================
    // GET RESERVE (liquidity + reservedLiquidity)
    //=================================================
    private getReserve(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        return this._getReserve(token);
    }

    private _getReserve(token: Address): BytesWriter {
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('Invalid token address');
        }

        const queue = this.getLiquidityQueue(token, this.addressToPointer(token));

        const result = new BytesWriter(128);
        result.writeU256(queue.liquidity);
        result.writeU256(queue.reservedLiquidity);
        result.writeU256(queue.virtualBTCReserve);
        result.writeU256(queue.virtualTokenReserve);
        return result;
    }

    //=================================================
    // GET QUOTE (Uses the new virtual-constant-product approach)
    //=================================================
    private getQuote(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const satoshisIn: u256 = calldata.readU256();
        return this._getQuote(token, satoshisIn);
    }

    /**
     * @function _getQuote
     * Fetches the estimated number of tokens for a given BTC amount
     * using the new "virtual AMM" approach:
     *
     *   1) price = queue.quote() = scaled price = (B * SHIFT) / T
     *   2) tokensOut = (satoshisIn * price) / SHIFT   // [SCALE FIX]
     *   3) If tokensOut > availableLiquidity, cap it
     *   4) requiredSatoshis = min( satoshisIn, (tokensOut * SHIFT) / price )
     */
    private _getQuote(token: Address, satoshisIn: u256): BytesWriter {
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('Invalid token address');
        }
        if (u256.lt(satoshisIn, this.minimumTradeSize)) {
            throw new Revert(
                `Requested amount is below minimum trade size ${satoshisIn} < ${this.minimumTradeSize}`,
            );
        }

        const queue: LiquidityQueue = this.getLiquidityQueue(token, this.addressToPointer(token));
        queue.updateVirtualPoolIfNeeded();

        const price: u256 = queue.quote();
        if (price.isZero()) {
            throw new Revert('Price is zero or no liquidity');
        }

        let tokensOut = SafeMath.mul(satoshisIn, price);

        // If tokensOut > availableLiquidity, cap it
        const availableLiquidity = SafeMath.sub(queue.liquidity, queue.reservedLiquidity);

        let requiredSatoshis = satoshisIn;
        if (u256.gt(tokensOut, availableLiquidity)) {
            tokensOut = availableLiquidity;
            // requiredSatoshis = (tokensOut * SHIFT) / price
            requiredSatoshis = SafeMath.div(tokensOut, price);

            // If that is bigger than satoshisIn, clamp
            if (u256.gt(requiredSatoshis, satoshisIn)) {
                requiredSatoshis = satoshisIn;
            }
        }

        // Prepare output
        const result = new BytesWriter(96); // 3 * u256
        result.writeU256(tokensOut); // how many tokens
        result.writeU256(requiredSatoshis); // how many sat needed
        result.writeU256(price); // final *scaled* price
        return result;
    }

    //=================================================
    // (Optional) GET "EWMA" REPLACEMENT -
    // Now returning the Virtual Reserves
    //=================================================
    private getVirtualReserves(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const queue = this.getLiquidityQueue(token, this.addressToPointer(token));

        // We will return: (virtualBTCReserve, virtualTokenReserve)
        const writer = new BytesWriter(64);
        writer.writeU256(queue.virtualBTCReserve);
        writer.writeU256(queue.virtualTokenReserve);
        return writer;
    }

    //=================================================
    // HELPERS
    //=================================================
    private getLiquidityQueue(token: Address, tokenId: Uint8Array): LiquidityQueue {
        return new LiquidityQueue(token, tokenId);
    }

    private addressToPointerU256(address: Address, token: Address): u256 {
        const writer = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
        writer.writeAddress(address);
        writer.writeAddress(token);
        return u256.fromBytes(sha256(writer.getBuffer()), true);
    }

    private addressToPointer(address: Address): Uint8Array {
        return ripemd160(address);
    }

    private getOwner(token: Address): Address {
        const calldata = new BytesWriter(4);
        calldata.writeSelector(NativeSwap.DEPLOYER_SELECTOR);

        const response = Blockchain.call(token, calldata);
        return response.readAddress();
    }
}
