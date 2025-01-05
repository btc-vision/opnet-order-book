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
    U256_BYTE_LENGTH,
    U64_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { OP_NET } from '@btc-vision/btc-runtime/runtime/contracts/OP_NET';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { LiquidityQueue } from '../lib/Liquidity/LiquidityQueue';
import { ripemd160, sha256 } from '@btc-vision/btc-runtime/runtime/env/global';
import { getProvider, saveAllProviders } from '../lib/Provider';
import { getTotalFeeCollected } from '../utils/OrderBookUtils';
import { FeeManager } from '../lib/FeeManager';
import { AddLiquidityOperation } from '../lib/Liquidity/operations/AddLiquidityOperation';
import { RemoveLiquidityOperation } from '../lib/Liquidity/operations/RemoveLiquidityOperation';
import { CreatePoolOperation } from '../lib/Liquidity/operations/CreatePoolOperation';
import { ListTokensForSaleOperation } from '../lib/Liquidity/operations/ListTokensForSaleOperation';
import { ReserveLiquidityOperation } from '../lib/Liquidity/operations/ReserveLiquidityOperation';
import { CancelListingOperation } from '../lib/Liquidity/operations/CancelListingOperation';
import { SwapOperation } from '../lib/Liquidity/operations/SwapOperation';

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

    private static get APPROVE_FROM_SELECTOR(): Selector {
        return encodeSelector('approveFrom');
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
            case encodeSelector('cancelListing'):
                return this.cancelListing(calldata);
            case encodeSelector('addLiquidity'):
                return this.addLiquidity(calldata);
            case encodeSelector('removeLiquidity'):
                return this.removeLiquidity(calldata);
            case encodeSelector('createPool'): {
                // aka enable trading
                const token: Address = calldata.readAddress();
                return this.createPool(calldata, token);
            }
            case encodeSelector('createPoolWithSignature'):
                return this.createPoolWithSignature(calldata);
            case encodeSelector('setFees'):
                return this.setFees(calldata);

            /** Readable methods */
            case encodeSelector('getReserve'):
                return this.getReserve(calldata);
            case encodeSelector('getQuote'):
                return this.getQuote(calldata);
            case encodeSelector('getProviderDetails'):
                return this.getProviderDetails(calldata);
            case encodeSelector('getPriorityQueueCost'):
                return this.getPriorityQueueCost(calldata);
            case encodeSelector('getFees'):
                return this.getFees(calldata);
            default:
                return super.execute(method, calldata);
        }
    }

    private getFees(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(3 * U64_BYTE_LENGTH);

        writer.writeU64(FeeManager.RESERVATION_BASE_FEE);
        writer.writeU64(FeeManager.PRIORITY_QUEUE_BASE_FEE);
        writer.writeU64(FeeManager.PRICE_PER_USER_IN_PRIORITY_QUEUE_BTC);

        return writer;
    }

    private setFees(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        FeeManager.RESERVATION_BASE_FEE = calldata.readU64();
        FeeManager.PRIORITY_QUEUE_BASE_FEE = calldata.readU64();
        FeeManager.PRICE_PER_USER_IN_PRIORITY_QUEUE_BTC = calldata.readU64();

        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
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

    private addLiquidity(calldata: Calldata): BytesWriter {
        const token = calldata.readAddress();
        const receiver = calldata.readStringWithLength();
        const providerId = this.addressToPointerU256(Blockchain.tx.sender, token);
        const queue = this.getLiquidityQueue(token, this.addressToPointer(token));
        const operation = new AddLiquidityOperation(queue, providerId, receiver);

        operation.execute();
        queue.save();

        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

    private removeLiquidity(calldata: Calldata): BytesWriter {
        const token = calldata.readAddress();
        const amount = calldata.readU256();
        const providerId = this.addressToPointerU256(Blockchain.tx.sender, token);
        const queue = this.getLiquidityQueue(token, this.addressToPointer(token));

        const operation = new RemoveLiquidityOperation(queue, providerId, amount);
        operation.execute();

        queue.save();

        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

    private createPoolWithSignature(calldata: Calldata): BytesWriter {
        const signature = calldata.readBytesWithLength();
        if (signature.length !== 64) {
            throw new Revert('NATIVE_SWAP: Invalid signature length');
        }

        const amount = calldata.readU256();
        const token: Address = calldata.readAddress();

        const calldataSend = new BytesWriter(64 + ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH + 4);
        calldataSend.writeSelector(NativeSwap.APPROVE_FROM_SELECTOR);
        calldataSend.writeAddress(this.address);
        calldataSend.writeU256(amount);
        calldataSend.writeBytes(signature);

        Blockchain.call(token, calldataSend);

        return this.createPool(calldata, token);
    }

    private createPool(calldata: Calldata, token: Address): BytesWriter {
        const tokenOwner = this.getDeployer(token);

        this.ensureContractDeployer(tokenOwner);

        const floorPrice: u256 = calldata.readU256();
        const initialLiquidity: u128 = calldata.readU128();
        const receiver: string = calldata.readStringWithLength();
        const antiBotEnabledFor: u16 = calldata.readU16();
        const antiBotMaximumTokensPerReservation: u256 = calldata.readU256();
        const maxReservesIn5BlocksPercent: u16 = calldata.readU16();

        this.ensureValidReceiverAddress(receiver);
        this.ensureFloorPriceNotZero(floorPrice);
        this.ensureInitialLiquidityNotZero(initialLiquidity);
        this.ensureAntibotSettingsValid(antiBotEnabledFor, antiBotMaximumTokensPerReservation);

        const queue = this.getLiquidityQueue(token, this.addressToPointer(token));
        if (!queue.p0.isZero()) {
            throw new Revert('Base quote already set');
        }

        const providerId = this.addressToPointerU256(Blockchain.tx.sender, token);
        const operation = new CreatePoolOperation(
            queue,
            floorPrice,
            providerId,
            initialLiquidity,
            receiver,
            antiBotEnabledFor,
            antiBotMaximumTokensPerReservation,
            maxReservesIn5BlocksPercent,
        );

        operation.execute();
        queue.save();

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    private listLiquidity(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const receiver: string = calldata.readStringWithLength();

        this.ensureValidReceiverAddress(receiver);

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
        this.ensureValidTokenAddress(token);
        this.ensureAmountInNotZero(amountIn);

        const providerId = this.addressToPointerU256(Blockchain.tx.sender, token);
        const tokenId = this.addressToPointer(token);

        const queue = this.getLiquidityQueue(token, tokenId);
        const operation = new ListTokensForSaleOperation(
            queue,
            providerId,
            amountIn,
            receiver,
            priority,
        );

        operation.execute();

        queue.save();

        // Return success
        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

    private reserve(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const maximumAmountIn: u256 = calldata.readU256();
        const minimumAmountOut: u256 = calldata.readU256();
        const forLP: bool = calldata.readBoolean();

        return this._reserve(token, maximumAmountIn, minimumAmountOut, forLP);
    }

    private _reserve(
        token: Address,
        maximumAmountIn: u256,
        minimumAmountOut: u256,
        forLP: bool,
    ): BytesWriter {
        this.ensureValidTokenAddress(token);
        this.ensureMaximumAmountInNotZero(maximumAmountIn);
        this.ensureMaximumAmountInNotBelowTradeSize(maximumAmountIn);

        const totalFee = getTotalFeeCollected();
        this.ensureSufficientFeesCollected(totalFee);

        const buyer: Address = Blockchain.tx.sender;
        const queue = this.getLiquidityQueue(token, this.addressToPointer(token));
        const operation = new ReserveLiquidityOperation(
            queue,
            buyer,
            maximumAmountIn,
            minimumAmountOut,
            forLP,
        );

        operation.execute();

        queue.save();

        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

    private cancelListing(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        return this._cancelListing(token);
    }

    private _cancelListing(token: Address): BytesWriter {
        this.ensureValidTokenAddress(token);

        const providerId = this.addressToPointerU256(Blockchain.tx.sender, token);
        const tokenId = this.addressToPointer(token);

        const queue = this.getLiquidityQueue(token, tokenId);

        const operation = new CancelListingOperation(queue, providerId);
        operation.execute();

        queue.save();

        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

    private swap(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        return this._swap(token);
    }

    private _swap(token: Address): BytesWriter {
        this.ensureValidTokenAddress(token);

        const queue: LiquidityQueue = this.getLiquidityQueue(token, this.addressToPointer(token));

        const operation = new SwapOperation(queue);
        operation.execute();

        queue.save();

        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

    private getReserve(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        return this._getReserve(token);
    }

    private _getReserve(token: Address): BytesWriter {
        this.ensureValidTokenAddress(token);

        const queue = this.getLiquidityQueue(token, this.addressToPointer(token));

        const result = new BytesWriter(128);
        result.writeU256(queue.liquidity);
        result.writeU256(queue.reservedLiquidity);
        result.writeU256(queue.virtualBTCReserve);
        result.writeU256(queue.virtualTokenReserve);
        return result;
    }

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
        this.ensureValidTokenAddress(token);
        this.ensureMaximumAmountInNotZero(satoshisIn);

        const queue: LiquidityQueue = this.getLiquidityQueue(token, this.addressToPointer(token));

        const price: u256 = queue.quote();
        this.ensurePriceNotZeroAndLiquidity(price);

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

    private getDeployer(token: Address): Address {
        const calldata = new BytesWriter(4);
        calldata.writeSelector(NativeSwap.DEPLOYER_SELECTOR);

        const response = Blockchain.call(token, calldata);
        return response.readAddress();
    }

    private ensureAntibotSettingsValid(
        antiBotEnabledFor: u16,
        antiBotMaximumTokensPerReservation: u256,
    ): void {
        if (antiBotEnabledFor !== 0 && antiBotMaximumTokensPerReservation.isZero()) {
            throw new Revert('NATIVE_SWAP: Anti-bot max tokens per reservation cannot be zero');
        }
    }

    private ensureInitialLiquidityNotZero(initialLiquidity: u128): void {
        if (initialLiquidity.isZero()) {
            throw new Revert('NATIVE_SWAP: Initial liquidity cannot be zero');
        }
    }

    private ensureFloorPriceNotZero(floorPrice: u256): void {
        if (floorPrice.isZero()) {
            throw new Revert('NATIVE_SWAP: Floor price cannot be zero');
        }
    }

    private ensureValidReceiverAddress(receiver: string): void {
        if (Blockchain.validateBitcoinAddress(receiver) == false) {
            throw new Revert('NATIVE_SWAP: Invalid receiver address');
        }
    }

    private ensureContractDeployer(tokenOwner: Address): void {
        if (Blockchain.tx.origin.equals(tokenOwner) == false) {
            throw new Revert('NATIVE_SWAP: Only token owner can set quote');
        }
    }

    private ensureValidTokenAddress(token: Address): void {
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('NATIVE_SWAP: Invalid token address');
        }
    }

    private ensureAmountInNotZero(amountIn: u128): void {
        if (amountIn.isZero()) {
            throw new Revert('NATIVE_SWAP: Amount in cannot be zero');
        }
    }

    private ensureSufficientFeesCollected(totalFee: u64): void {
        if (totalFee < FeeManager.RESERVATION_BASE_FEE) {
            throw new Revert('NATIVE_SWAP: Insufficient fees collected');
        }
    }

    private ensureMaximumAmountInNotBelowTradeSize(maximumAmountIn: u256): void {
        if (u256.lt(maximumAmountIn, this.minimumTradeSize)) {
            throw new Revert(
                `NATIVE_SWAP: Requested amount is below minimum trade size ${maximumAmountIn} < ${this.minimumTradeSize}`,
            );
        }
    }

    private ensureMaximumAmountInNotZero(maximumAmountIn: u256): void {
        if (maximumAmountIn.isZero()) {
            throw new Revert('NATIVE_SWAP: Maximum amount in cannot be zero');
        }
    }

    private ensurePriceNotZeroAndLiquidity(price: u256): void {
        if (price.isZero()) {
            throw new Revert('NATIVE_SWAP: Price is zero or no liquidity');
        }
    }
}
