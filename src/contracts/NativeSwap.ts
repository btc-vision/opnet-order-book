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
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { OP_NET } from '@btc-vision/btc-runtime/runtime/contracts/OP_NET';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { LiquidityQueue } from '../lib/LiquidityQueue';
import { ripemd160, sha256 } from '@btc-vision/btc-runtime/runtime/env/global';
import { quoter, Quoter } from '../math/Quoter';
import { getProvider, saveAllProviders } from '../lib/Provider';
import { getTotalFeeCollected } from '../utils/OrderBookUtils';
import { FeeManager } from '../lib/FeeManager';

/**
 * OrderBook contract for the OP_NET order book system.
 */
@final
export class NativeSwap extends OP_NET {
    private readonly minimumTradeSize: u256 = u256.fromU32(10_000); // The minimum trade size in satoshis.

    public constructor() {
        super();
    }

    private static get OWNER_SELECTOR(): Selector {
        return encodeSelector('owner');
    }

    public override onDeployment(_calldata: Calldata): void {
        FeeManager.onDeploy();

        Blockchain.log(`On deployment`);
    }

    public override onExecutionCompleted(): void {
        saveAllProviders();
    }

    public override execute(method: Selector, calldata: Calldata): BytesWriter {
        switch (method) {
            case encodeSelector('reserve'):
                return this.reserve(calldata);
            case encodeSelector('swap'):
                return this.swap(calldata);
            case encodeSelector('addLiquidity'):
                return this.addLiquidity(calldata);
            case encodeSelector('removeLiquidity'):
                return this.removeLiquidity(calldata);
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
            case encodeSelector('getEWMA'):
                return this.getEWMA(calldata);
            case encodeSelector('priorityQueueCost'): // aka enable trading
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
            throw new Revert('Anti-bot maximum tokens per reservation cannot be zero');
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
        );

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

        return this._swap(token);
    }

    private getReserve(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();

        return this._getReserve(token);
    }

    /**
     * @function _addLiquidity
     * @description
     * Adds liquidity to the native swap system for a specified token. This liquidity is what
     * buyers will swap their BTC for, and the user who provides the liquidity will receive the BTC in return.
     *
     * The user must provide:
     * - The token address (`token`)
     * - A valid BTC receiver address (`receiver`) to which future BTC will be delivered
     * - The token amount (`amountIn`) to contribute as liquidity
     * - A `priority` flag indicating whether this liquidity goes to the priority queue or the normal queue
     *
     * Internally, this method:
     * 1. Validates inputs (token address, `amountIn`).
     * 2. Determines a unique provider ID based on the sender's address plus the token address.
     * 3. Calls `LiquidityQueue.addLiquidity(...)` to handle the logic of:
     *    - Transferring tokens from the user to the contract
     *    - Possibly taxing the liquidity if `priority` is true
     *    - Updating storage, total reserves, etc.
     * 4. Saves the updated queue state.
     *
     * Note that if multiple users add liquidity, each user is tracked as a separate provider. The
     * liquidity from all providers is aggregated in the contract’s internal structures.
     *
     * @param {Address} token - The address of the token to which liquidity is being added.
     * @param {string} receiver - The BTC receiver address (must be a valid Bitcoin address).
     * @param {u128} amountIn - The amount of tokens to add as liquidity.
     * @param {boolean} priority - If `true`, liquidity goes to the priority queue (with a tax). Otherwise, normal queue.
     *
     * @returns {BytesWriter} -
     * Returns a `BytesWriter` containing a single boolean (`true` on success). Reverts on failure.
     *
     * @throws {Revert} If the token address is invalid or empty.
     * @throws {Revert} If `amountIn` is zero.
     * @throws {Revert} If the user does not have enough approved tokens.
     * @throws {Revert} If any internal checks fail (e.g., anti-bot checks or queue logic).
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

    /**
     * @function _reserve
     * @description
     * Reserves liquidity positions in the native swap, allowing a user to lock in a certain
     * amount of tokens for a few blocks, preventing front-running. The user is effectively signaling
     * an intention to buy those tokens with BTC within the reservation window.
     *
     * Key steps:
     * 1. Validate input parameters (token, `maximumAmountIn`, `minimumAmountOut`).
     * 2. Check for a minimum trade size.
     * 3. Ensure enough fees (`FeeManager.RESERVATION_BASE_FEE`) are paid by the user (in satoshis).
     * 4. Call `queue.reserveLiquidity(...)`, which:
     *    - Possibly triggers anti-bot checks inside `LiquidityQueue`
     *    - Reserves tokens across priority or normal queues
     *    - Returns the total tokens reserved
     * 5. Save the updated queue state.
     *
     * Reservations are valid for only 5 blocks. If a user fails to execute a swap within
     * that window, the tokens return to the providers. The system automatically purges
     * expired reservations.
     *
     * @param {Address} token - The token address for which liquidity is being reserved.
     * @param {u256} maximumAmountIn - The quantity of satoshis the user is willing to spend.
     * @param {u256} minimumAmountOut - The minimum number of tokens the user expects to receive.
     *
     * @returns {BytesWriter} -
     * A `BytesWriter` containing the total number of tokens reserved (u256).
     *
     * @event
     * - Reservation event: Emitted inside `LiquidityQueue` with details about the total reserved tokens.
     * - Each reserved position triggers an event with specific queue details, the amount reserved, etc.
     *
     * @throws {Revert} If the token address is invalid or empty.
     * @throws {Revert} If `maximumAmountIn` is zero or below `minimumTradeSize`.
     * @throws {Revert} If `minimumAmountOut` is zero.
     * @throws {Revert} If insufficient fees were provided.
     * @throws {Revert} If anti-bot restrictions block the reservation.
     * @throws {Revert} If the user already has an active reservation.
     * @throws {Revert} If there is no liquidity available.
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

    /**
     * @function _getQuote
     * @description
     * Fetches the estimated number of tokens a user can purchase for a given BTC amount (`satoshisIn`)
     * in the native swap. It simulates the Exponential Weighted Moving Average (EWMA)
     * updates for both volume (ewmaV) and liquidity (ewmaL), without actually storing the results,
     * to produce an *up-to-date quote* as if the contract had just performed an update.
     *
     * Steps:
     * 1. Validates the token address and `satoshisIn`.
     * 2. Performs ephemeral EWMA updates to see how the price would adjust given the elapsed blocks.
     * 3. Calculates `tokensOut` = `satoshisIn` * `currentPrice`.
     * 4. Checks if `tokensOut` exceeds available liquidity; if so, caps `tokensOut` and adjusts the
     *    required `satoshisIn`.
     * 5. Returns `(tokensOut, requiredSatoshis, currentPrice)` so callers know how many tokens
     *    they’d receive, how many satoshis are required, and what the price was.
     *
     * @param {Address} token - The token address for which to obtain a quote.
     * @param {u256} satoshisIn - The amount of BTC (in satoshis) the user plans to spend.
     *
     * @returns {BytesWriter} -
     * A `BytesWriter` containing:
     *  - `tokensOut` (u256)
     *  - `requiredSatoshis` (u256)
     *  - `currentPrice` (u256, the contract’s approximate exchange rate)
     *
     * @throws {Revert} If `token` is invalid, `satoshisIn` < `this.minimumTradeSize`, or the price is zero.
     * @throws {Revert} If no liquidity is available and thus `tokensOut` would be zero.
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
            // const oneMinusAlpha: u256 = SafeMath.sub(Quoter.SCALING_FACTOR, quoter.a);
            // const decayFactor: u256 = Quoter.pow(oneMinusAlpha, u256.fromU64(blocksElapsed_L));
            // Adjust simulatedEWMA_L by applying the decay
            //simulatedEWMA_L = SafeMath.div(
            //SafeMath.mul(simulatedEWMA_L, decayFactor),
            //   Quoter.SCALING_FACTOR,
            //);
            //simulatedEWMA_L = u256.One;
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

        // TODO: Implement logic to remove liquidity

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
     * Executes a swap for a user who has previously reserved tokens.
     * The user is expected to pay BTC to the appropriate addresses.
     *
     * Process Flow:
     * 1. Validate the token address.
     * 2. Retrieve the user’s existing reservation (if any).
     * 3. Check if the reservation is within its valid block range.
     *    - If expired, revert or re-release tokens to providers.
     * 4. Call `queue.swap(...)`, which:
     *    - Finds each provider with reserved tokens for this user
     *    - Transfers out the correct amount of tokens to the user
     *    - Updates each provider’s liquidity
     *    - Emits a SwapExecutedEvent
     * 5. Save the updated queue state.
     *
     * @param {Address} token - The token the user wants to swap for their BTC.
     *
     * @returns {BytesWriter} -
     * A `BytesWriter` with a boolean (true) on success.
     *
     * @event
     * - SwapExecutedEvent: Emitted from `LiquidityQueue`, detailing the buyer, how many satoshis were spent,
     *   how many tokens were purchased, etc.
     *
     * @throws {Revert} If the user has no active reservation.
     * @throws {Revert} If the buyer does not provide enough BTC (implementation TBD).
     */
    private _swap(token: Address): BytesWriter {
        // Validate inputs
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('Invalid token address');
        }

        const queue: LiquidityQueue = this.getLiquidityQueue(token, this.addressToPointer(token));
        queue.swap(Blockchain.tx.sender);
        queue.save();

        // Return success
        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

    /**
     * @function _getReserve
     * @description
     * Retrieves the total liquidity (`queue.liquidity`) and total reserved liquidity (`queue.reservedLiquidity`) for
     * the specified token. This helps callers understand how many tokens are present in the contract and how many are
     * currently locked in reservations.
     *
     * @param {Address} token - The address of the token for which to retrieve total liquidity.
     *
     * @returns {BytesWriter} -
     * A `BytesWriter` containing two u256 values:
     *  1. The total liquidity in the contract
     *  2. The total reserved liquidity
     *
     * @throws {Revert} If the token address is invalid.
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

    private getOwner(token: Address): Address {
        const calldata = new BytesWriter(4);
        calldata.writeSelector(NativeSwap.OWNER_SELECTOR);

        const response = Blockchain.call(token, calldata);
        return response.readAddress();
    }
}
