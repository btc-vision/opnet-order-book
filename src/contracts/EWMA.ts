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
    TransactionOutput,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import {OP_NET} from '@btc-vision/btc-runtime/runtime/contracts/OP_NET';
import {u128, u256} from 'as-bignum/assembly';
import {FEE_COLLECT_SCRIPT_PUBKEY} from '../utils/OrderBookUtils';
import {LiquidityQueue} from '../lib/LiquidityQueue';
import {ripemd160, sha256} from '@btc-vision/btc-runtime/runtime/env/global';
import {quoter, Quoter} from '../math/Quoter';
import {getProvider, saveAllProviders} from '../lib/Provider';

/**
 * OrderBook contract for the OP_NET order book system.
 */
@final
export class EWMA extends OP_NET {
    private readonly minimumTradeSize: u256 = u256.fromU32(10_000); // The minimum trade size in satoshis.
    private readonly RESERVATION_BASE_FEE: u64 = 10_000; // The base fee for reservations in satoshis.

    public constructor() {
        super();
    }

    private static get DECIMAL_SELECTOR(): Selector {
        return encodeSelector('decimals');
    }

    private static get OWNER_SELECTOR(): Selector {
        return encodeSelector('owner');
    }

    public override onDeployment(_calldata: Calldata): void {
        // Logic to run on deployment
    }

    public override onExecutionCompleted(): void {
        saveAllProviders();
    }

    public override execute(method: Selector, calldata: Calldata): BytesWriter {
        switch (method) {
            case encodeSelector('reserve'):
                return this.reserve(calldata);
            case encodeSelector('addLiquidity'):
                return this.addLiquidity(calldata);
            case encodeSelector('removeLiquidity'):
                return this.removeLiquidity(calldata);
            case encodeSelector('swap'):
                return this.swap(calldata);
            case encodeSelector('getReserve'):
                return this.getReserve(calldata);
            case encodeSelector('getQuote'):
                return this.getQuote(calldata);
            case encodeSelector('setQuote'): // aka enable trading
                return this.setQuote(calldata);
            case encodeSelector('priorityQueueCost'): // aka enable trading
                return this.getPriorityQueueCost(calldata);
            case encodeSelector('getProviderDetails'):
                return this.getProviderDetails(calldata);
            case encodeSelector('getEWMA'):
                return this.getEWMA(calldata);
            default:
                return super.execute(method, calldata);
        }
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
        writer.writeU128(cost);

        return writer;
    }

    private setQuote(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const quote: u256 = calldata.readU256();

        const tokenOwner = this.getOwner(token);
        if (Blockchain.tx.origin.equals(tokenOwner) == false) {
            throw new Revert('Only token owner can set quote');
        }

        const queue = this.getLiquidityQueue(token, this.addressToPointer(token));
        if (!queue.p0.isZero()) {
            throw new Revert('Base quote already set');
        }

        queue.p0 = quote;
        queue.save();

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);

        return writer;
    }

    /**
     * Adds liquidity to the order book.
     * @param calldata - The calldata containing parameters.
     * @returns A BytesWriter containing the success status.
     */
    private addLiquidity(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const receiver: string = calldata.readStringWithLength();

        if (Blockchain.validateBitcoinAddress(receiver) == false) {
            throw new Revert('Invalid receiver address');
        }

        const amountIn: u128 = calldata.readU128();
        const priority: boolean = calldata.readBoolean();
        return this._addLiquidity(token, receiver, amountIn, priority);
    }

    private getEWMA(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const ewma = this.getLiquidityQueue(token, this.addressToPointer(token));

        const writer = new BytesWriter(64);
        writer.writeU256(ewma.ewmaV);
        writer.writeU256(ewma.ewmaL);

        return writer;
    }

    private getQuote(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const satoshisIn: u256 = calldata.readU256();

        return this._getQuote(token, satoshisIn);
    }

    private reserve(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const maximumAmountIn: u256 = calldata.readU256();
        const minimumAmountOut: u256 = calldata.readU256();

        return this._reserve(token, maximumAmountIn, minimumAmountOut);
    }

    private removeLiquidity(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();

        return this._removeLiquidity(token);
    }

    private swap(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const isSimulation: bool = calldata.readBoolean();

        return this._swap(token, isSimulation);
    }

    private getReserve(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();

        return this._getReserve(token);
    }

    /**
     * @function _addLiquidity
     * @description
     * Adds liquidity to the OP_NET order book system for a specified token. Similar to how Uniswap v4 operates, users can
     * provide liquidity so buyers can swap their BTC for the token being traded. The liquidity is what buyers will be swapping
     * their BTC for, and the user who provides the liquidity will receive the BTC in return.
     *
     * Each position in the order book system is represented by a "tick" (price position). The user can add liquidity to a specific
     * price position (tick) in the order book system. The user must provide the token amount and the BTC amount to be added as liquidity.
     * An approval of the token amount must be done before calling this method. This method will transfer the token amount from the user to the contract using transferFrom.
     *
     * The system must use the correct mathematical formulas to provide the smoothest trading experience for users.
     * In other words, we want to avoid having to manage of a bunch of liquidity positions that are close to each other.
     * The system must be able to handle the addition of liquidity to the order book system in a way that is efficient and cost-effective.
     *
     * Note that multiple user may add liquidity to the same price position. If a user tries to add liquidity to a very close price position, the system must merge the liquidity positions.
     * The range of price positions that can be merged is determined by the system. The "level" is determined by a variable called "tickSpacing".
     *
     * @param {Address} token - The address of the token to which liquidity is being added.
     * @param {Address} receiver - The address to which the bitcoins will be sent.
     * @param {u128} amountIn - The maximum amount of tokens to be added as liquidity.
     *
     * @param priority
     * @returns {BytesWriter} -
     * Return true on success, revert on failure.
     *
     * @event - An event containing the liquidity details must be emitted. The event must contain the following fields:
     * - tickId: The unique identifier for the liquidity position.
     * - level: The price level at which the liquidity is available.
     * - liquidityAmount: The amount of tokens added as liquidity.
     * - amountOut: The amount of tokens that can be bought for the specified amount at the given price point.
     *
     * @throws {Error} If the token address is invalid or if the liquidity addition fails.
     * @throws {Error} If the user does not have enough tokens to add liquidity.
     */
    private _addLiquidity(
        token: Address,
        receiver: string,
        amountIn: u128,
        priority: boolean,
    ): BytesWriter {
        // Validate inputs
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('Invalid token address');
        }

        if (amountIn.isZero()) {
            throw new Revert('Amount in cannot be zero');
        }

        const providerId = this.addressToPointerU256(Blockchain.tx.sender, token);
        const tokenId = this.addressToPointer(token);

        const queue = this.getLiquidityQueue(token, tokenId);
        queue.addLiquidity(providerId, amountIn, receiver, priority);
        queue.save();

        // Return success
        const result = new BytesWriter(1);
        result.writeBoolean(true);
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

    /** Get total fees collected */
    private getTotalFeeCollected(): u64 {
        const outputs = Blockchain.tx.outputs;

        let totalFee: u64 = 0;

        // We are certain it's not the first output.
        for (let i = 1; i < outputs.length; i++) {
            const output: TransactionOutput = outputs[i];
            if (output.to !== FEE_COLLECT_SCRIPT_PUBKEY) {
                continue;
            }

            if (u64.MAX_VALUE - totalFee < output.value) {
                break;
            }

            totalFee += output.value;
        }

        return totalFee;
    }

    /**
     * @function _reserve
     * @description
     * Reserves ticks (price positions) in the OP_NET order book system, similar to how Uniswap v4 handles liquidity ticks.
     * The OP_NET system allows users to reserve specific price levels for tokens being traded, with BTC as the input currency.
     * This method effectively reserves tokens for a given price point, ensuring the tokens are available for the user to buy at the specified price in his next transaction.
     *
     * For now, the order-book will only support reservations for the output token (i.e., the token being traded),
     * with BTC being the input that is swapped for the output token. This ensures a seamless swap process where the user
     * "swaps" BTC for tokens at a reserved price position on-chain.
     *
     * Note that a reserved position will only be valid for 5 blocks. If the user fails to execute the swap within this time frame, the reserved ticks are released.
     * Note that for each reserved ticks, the user must pay 10,000 satoshis as a fee to the order book. For now, put TODO: Implement fee logic where it should be verified.
     *
     * @param {Address} token - The token address for which the ticks are being reserved.
     * @param {u256} maximumAmountIn - The quantity of satoshis to be traded for the specified token.
     * @param {u256} minimumAmountOut - The minimum amount of tokens to receive for the trade.
     *
     * @returns {BytesWriter} -
     * This method must return the reservation id for the reserved ticks. The reservation id is a unique identifier for the reserved ticks.
     *
     * @event
     * An event containing the reservation details must be emitted. The event must contain the following fields:
     * - reservationId: The unique identifier for the reservation.
     * - totalReserved: The total number of tokens reserved for the trade.
     * - expectedAmountOut: The expected number of tokens that can be bought for the specified amount at the given price point.
     *
     * @event
     * Multiple events containing the reserved ticks must be emitted. Each event must contain the following fields:
     *  * tickId (u256): A unique identifier for the liquidity position.
     *  * level (u64): The price level at which the liquidity is available.
     *  * maximumQuantity (u256): The maximum number of token reserved for the trade at this price level.
     *
     * @throws {Error} If reservation fails due to insufficient liquidity.
     * @throws {Error} If invalid parameters are provided.
     * @throws {Error} If the requested quantity is less than the minimum trade size.
     * @throws {Error} If the user already has a pending reservation for the same token.
     */
    private _reserve(token: Address, maximumAmountIn: u256, minimumAmountOut: u256): BytesWriter {
        // Validate inputs
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('ORDER_BOOK: Invalid token address');
        }

        if (maximumAmountIn.isZero()) {
            throw new Revert('ORDER_BOOK: Maximum amount in cannot be zero');
        }

        if (u256.lt(maximumAmountIn, this.minimumTradeSize)) {
            throw new Revert('ORDER_BOOK: Requested amount is below minimum trade size');
        }

        if (minimumAmountOut.isZero()) {
            throw new Revert('ORDER_BOOK: Minimum amount out cannot be zero');
        }

        const totalFee = this.getTotalFeeCollected();
        if (totalFee < this.RESERVATION_BASE_FEE) {
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

    /**
     * @function _getQuote
     * @description
     * Retrieves a quote for a specified bitcoin amount to be traded for a given token.
     * This method simulates EWMA decay based on the number of blocks elapsed since the last update,
     * providing an accurate estimate of the number of tokens that can be bought for a specified amount of BTC.
     *
     * @param {Address} token - The unique identifier of the token for which the quote is requested.
     * @param {u256} satoshisIn - The quantity of satoshis to be traded for the specified token. Minimum value is 1000 satoshis.
     *
     * @returns {BytesWriter} -
     * This method returns a receipt containing the following fields:
     * - estimatedQuantity (u256): The number of tokens that can be bought for the specified quantity at the given price point.
     * - requiredSatoshis (u256): The amount of satoshis required to achieve the estimated quantity.
     *
     * @throws {Revert} If the token is not found in the order book.
     * @throws {Revert} If the requested quantity exceeds available liquidity in the order book.
     * @throws {Revert} If invalid parameters are provided (e.g., negative quantity, zero price).
     * @throws {Revert} If the requested quantity is less than the minimum trade size.
     */
    private _getQuote(token: Address, satoshisIn: u256): BytesWriter {
        // Validate inputs
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('Invalid token address');
        }

        if (u256.lt(satoshisIn, this.minimumTradeSize)) {
            throw new Revert('Requested amount is below minimum trade size');
        }

        // Retrieve the liquidity queue for the token
        const queue: LiquidityQueue = this.getLiquidityQueue(token, this.addressToPointer(token));

        // Simulate updating ewmaV and ewmaL to the current block without modifying the stored values
        const blocksElapsed_V: u64 = SafeMath.sub64(
            Blockchain.block.numberU64,
            queue.lastUpdateBlockEWMA_V,
        );

        const blocksElapsed_L: u64 = SafeMath.sub64(
            Blockchain.block.numberU64,
            queue.lastUpdateBlockEWMA_L,
        );

        // Simulate ewmaV update with currentBuyVolume as zero (since no buy has occurred yet)
        let simulatedEWMA_V: u256 = queue.ewmaV;
        simulatedEWMA_V = quoter.updateEWMA(
            u256.Zero, // currentBuyVolume is zero
            simulatedEWMA_V,
            u256.fromU64(blocksElapsed_V),
        );

        // Simulate ewmaL update
        let simulatedEWMA_L: u256 = queue.ewmaL;

        const currentLiquidityU256: u256 = SafeMath.sub(queue.liquidity, queue.reservedLiquidity);
        if (currentLiquidityU256.isZero()) {
            // Compute the decay over the elapsed blocks
            const oneMinusAlpha: u256 = SafeMath.sub(Quoter.SCALING_FACTOR, quoter.a);
            const decayFactor: u256 = Quoter.pow(oneMinusAlpha, u256.fromU64(blocksElapsed_L));

            // Adjust simulatedEWMA_L by applying the decay
            simulatedEWMA_L = SafeMath.div(
                SafeMath.mul(simulatedEWMA_L, decayFactor),
                Quoter.SCALING_FACTOR,
            );
        } else {
            // Update ewmaL normally when liquidity is available
            simulatedEWMA_L = quoter.updateEWMA(
                currentLiquidityU256,
                simulatedEWMA_L,
                u256.fromU64(blocksElapsed_L),
            );
        }

        // Calculate the current price using the simulated EWMA values
        const currentPrice: u256 = quoter.calculatePrice(
            queue.p0,
            simulatedEWMA_V,
            simulatedEWMA_L,
        );

        // Ensure currentPrice is not zero
        if (u256.eq(currentPrice, u256.Zero)) {
            throw new Revert('Price is zero');
        }

        // Correct tokensOut calculation
        let tokensOut: u256 = SafeMath.mul(satoshisIn, currentPrice);

        // Retrieve available liquidity (total liquidity minus reserved liquidity)
        const availableLiquidity: u256 = SafeMath.sub(queue.liquidity, queue.reservedLiquidity);

        // If tokensOut > availableLiquidity, adjust tokensOut and recompute requiredSatoshis
        let requiredSatoshis: u256 = satoshisIn;

        if (u256.gt(tokensOut, availableLiquidity)) {
            tokensOut = availableLiquidity;

            // Recalculate requiredSatoshis = (tokensOut * SCALING_FACTOR) / currentPrice
            requiredSatoshis = SafeMath.div(
                SafeMath.mul(tokensOut, Quoter.SCALING_FACTOR),
                currentPrice,
            );

            // Ensure requiredSatoshis does not exceed satoshisIn
            if (u256.gt(requiredSatoshis, satoshisIn)) {
                requiredSatoshis = satoshisIn;
            }
        }

        // Serialize the estimated quantity and required satoshis
        const result = new BytesWriter(96);
        result.writeU256(tokensOut); // Tokens in smallest units
        result.writeU256(requiredSatoshis); // Satoshis required
        result.writeU256(currentPrice); // Current price
        return result;
    }

    /**
     * @function _removeLiquidity
     * @description
     * Removes liquidity from the OP_NET order book system for a specified token.
     * This function allows a seller to cancel their active positions (sell orders) for a given token.
     * Upon calling this function, the contract will release the seller's tokens that are not reserved by any buyer
     * and return them to the seller's address.
     *
     * Note that if there are active reservations on the positions, the seller can reclaim their tokens only after
     * all active reservations expire (e.g., after a defined number of blocks). This ensures that ongoing trades are not disrupted.
     *
     * Note, if the liquidity tick has no more token, the tick should be removed from the order book.
     *
     * If there are active reservations that prevent immediate liquidity removal.
     * The system must emit an event to notify the user that it is not possible to remove the liquidity at this tick level.
     * This should not revert and the user should be able to remove liquidity from other tick levels, if available.
     *
     * @param {Address} token - The address of the token from which liquidity is being removed.
     *
     * @returns {BytesWriter} -
     * Returns a receipt confirming the removal of liquidity on success, reverts on failure.
     * The receipt may contain details such as the amount of tokens returned to the seller.
     *
     * @event
     * An event containing the details of the liquidity removal must be emitted. The event must contain the following fields:
     * - token: The address of the token from which liquidity was removed.
     * - amount: The amount of tokens that were returned to the seller.
     *
     * @event
     * An event containing the details of the updated ticks must be emitted. The event must contain the following fields:
     * - tickId: The unique identifier for each tick.
     * - level: The price level (in satoshis per token) of each tick.
     * - liquidityAmount: The new amount of tokens available at each price level.
     *
     * @event
     * If there are active reservations that prevent immediate liquidity removal.
     * An event must be emitted to notify the user that it is not possible to remove the liquidity at this tick level.
     * The event must contain the following fields:
     * - tickId: The unique identifier for each tick.
     * - expirationBlock: The block number at which the reservations will expire.
     *
     * @throws {Error} If the token address is invalid or if the removal of liquidity fails.
     * @throws {Error} If the user does not have enough liquidity to remove.
     */
    private _removeLiquidity(token: Address): BytesWriter {
        // Validate input
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('Invalid token address');
        }

        const totalTokensReturned = u256.Zero;

        // Return tokens to the seller
        if (u256.gt(totalTokensReturned, u256.Zero)) {
            TransferHelper.safeTransfer(token, Blockchain.tx.sender, totalTokensReturned);
        }

        // Serialize the total tokens returned
        const result = new BytesWriter(32); // u256 is 32 bytes
        result.writeU128(totalTokensReturned.toU128());
        return result;
    }

    /**
     * @function _swap
     * @description
     * Executes a swap of BTC for a specified token in the OP_NET order book system.
     * This function allows a buyer to purchase the reserved ticks (price positions) for a given token using BTC.
     * The swap will fulfill the buyer's reservation and return the tokens to the buyer's address.
     *
     * The function ensures that the amount of tokens returned to the buyer matches the amount of BTC provided, taking into account
     * the current price levels (ticks) and any applicable slippage. It must handle partial fills if full liquidity is not available
     * at the desired price points. It must also handle partial fills if the buyer's provided BTC amount is not sufficient to fill all reserved ticks.
     *
     * Note that for now, you must not implement the logic that check if the buyer have provided the correct amount of BTC to the correct address. You must put a TODO: Implement logic to check if the buyer has provided the correct amount of BTC to the correct address and revert if not.
     *
     * The system must check that the reservations are not expired and still valid. If the a reservation is expired, the system must release the reservations and revert the swap.
     *
     * If the isSimulation flag is set to true, the system must know that this is a simulation and if the reservation are close from being expired, the system must revert the swap with a message that the reservation are close to be expired. (1 blocks before the expiration)
     *
     * @param {Address} token - The address of the token to swap for BTC.
     * @param {bool} isSimulation - A flag indicating whether the swap is a simulation.
     *
     * @returns {BytesWriter} -
     * Returns a receipt containing a boolean value indicating the success of the swap.
     *
     * @event
     * An event containing the swap details must be emitted. The event must contain the following fields:
     * - buyer: The address of the buyer executing the swap.
     * - amountIn: The amount of BTC provided by the buyer.
     * - amountOut: The amount of tokens received by the buyer.
     * - ticksFilled: Details of the ticks that were filled during the swap.
     *
     * @event
     * An event containing the updated ticks must be emitted. The event must contain the following fields:
     * - tickId: The unique identifier for each tick.
     * - level: The price level (in satoshis per token) of each tick.
     * - liquidityAmount: The new amount of tokens available at each price level.
     * - acquiredAmount: The amount of tokens acquired by the buyer at each price level.
     *
     * @throws {Error} If the token is not available in the order book.
     * @throws {Error} If the swap cannot be fulfilled due to insufficient liquidity.
     * @throws {Error} If invalid parameters are provided.
     * @throws {Error} If the reservation is expired.
     * @throws {Error} If the reservation is close to be expired and the swap is a simulation.
     * @throws {Error} If the buyer does not have enough BTC to complete the swap.
     */
    private _swap(token: Address, isSimulation: bool): BytesWriter {
        // Validate inputs
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('Invalid token address');
        }

        const queue: LiquidityQueue = this.getLiquidityQueue(token, this.addressToPointer(token));
        queue.swap(Blockchain.tx.sender);
        queue.save();

        // Emit SwapExecutedEvent
        //const swapEvent = new SwapExecutedEvent(buyer, totalBtcRequired, totalTokensAcquired);
        //this.emitEvent(swapEvent);

        // Return success
        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

    /**
     * @function _getReserve
     * @description
     * Retrieves the total reserve (available liquidity) for a specified token in the OP_NET order book system.
     * This function allows users to check the total amount of tokens currently available for trading (sell pressure) in the order book.
     * The reserve should be maintained via a stored value to avoid recomputing it each time this function is called.
     *
     * @param {Address} token - The address of the token for which to retrieve the reserve.
     *
     * @returns {BytesWriter} -
     * Returns the total reserve amount (u256) of the specified token available in the order book.
     *
     * @throws {Error} If the token is not found in the order book.
     * @private
     */
    private _getReserve(token: Address): BytesWriter {
        // Validate input
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('Invalid token address');
        }

        const queue = this.getLiquidityQueue(token, this.addressToPointer(token));

        const result = new BytesWriter(64); // u256 is 32 bytes
        result.writeU256(queue.liquidity);
        result.writeU256(queue.reservedLiquidity);
        return result;
    }

    private getDecimals(token: Address): u8 {
        const calldata = new BytesWriter(4);
        calldata.writeSelector(EWMA.DECIMAL_SELECTOR);

        const response = Blockchain.call(token, calldata);
        return response.readU8();
    }

    private getOwner(token: Address): Address {
        const calldata = new BytesWriter(4);
        calldata.writeSelector(EWMA.OWNER_SELECTOR);

        const response = Blockchain.call(token, calldata);
        return response.readAddress();
    }
}
