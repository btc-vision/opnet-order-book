import {
    Address,
    ADDRESS_BYTE_LENGTH,
    BytesWriter,
    Calldata,
    encodeSelector,
    NetEvent,
    Selector,
} from '@btc-vision/btc-runtime/runtime';
import { OP_NET } from '@btc-vision/btc-runtime/runtime/contracts/OP_NET';
import { u256 } from 'as-bignum/assembly';

/**
 * Event example. Note that each event you create will be specified under the folder events/EventName.ts
 */

@final
export class RndSomeEvent extends NetEvent {
    constructor(rndValue: u256, rndAddress: Address) {
        const data: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH + 32);
        data.writeU256(rndValue);
        data.writeAddress(rndAddress);

        super('SomeEvent', data);
    }
}

/**
 * Just like some principle of uniswap v4, the opnet order book works relatively the same way. The only key difference is that, there is only a reserve for the token being traded. The inputs token will always be bitcoin (which the contract does not hold any liquidity for) and the output token will always be the target token.
 *
 * This means, we must create a contract like uniswap v4 where the user who want to sell tokens basically adds liquidity and the buyer basically "swaps" his bitcoin for tokens.
 *
 * This must be done using "ticks" aka price positions just like any trading platform work offchain. The key difference here is that this is on-chain!
 */
@final
export class OPNetOrderBook extends OP_NET {
    private readonly tickSpacing: u64 = 1000; // The minimum spacing between each tick in satoshis. This is the minimum price difference between each tick.

    public constructor() {
        super();
    }

    public override onDeployment(_calldata: Calldata): void {
        // Logic to run on deployment
    }

    public override execute(method: Selector, calldata: Calldata): BytesWriter {
        switch (method) {
            case encodeSelector('getQuote'):
                return this.getQuote(calldata);
            case encodeSelector('reserveTicks'):
                return this.reserveTicks(calldata);
            case encodeSelector('addLiquidity'):
                return this.addLiquidity(calldata);
            case encodeSelector('removeLiquidity'):
                return this.removeLiquidity(calldata);
            case encodeSelector('swap'):
                return this.swap(calldata);
            case encodeSelector('getTicksForToken'):
                return this.getTicksForToken(calldata);
            case encodeSelector('getReserve'):
                return this.getReserve(calldata); // A pointer should be used to track each reserve. This method should not recompute the reserve each time it is called.
            default:
                return super.execute(method, calldata);
        }
    }

    private getQuote(calldata: Calldata): BytesWriter {
        // Parameters required to be defined here...

        const token: Address = calldata.readAddress();
        const satoshisIn: u256 = calldata.readU256();

        return this._getQuote(token, satoshisIn);
    }

    private reserveTicks(calldata: Calldata): BytesWriter {
        // Parameters required to be defined here...
        const token: Address = calldata.readAddress();
        const maximumAmount: u256 = calldata.readU256();
        const targetPricePoint: u256 = calldata.readU256();
        const slippage: u16 = calldata.readU16();

        return this._reserveTicks(token, maximumAmount, targetPricePoint, slippage);
    }

    private addLiquidity(calldata: Calldata): BytesWriter {
        // Parameters required to be defined here...
        const token: Address = calldata.readAddress();
        const maximumAmountIn: u256 = calldata.readU256();
        const maximumPriceLevel: u256 = calldata.readU256();
        const slippage: u16 = calldata.readU16();
        const invalidityPeriod: u16 = calldata.readU16();

        return this._addLiquidity(
            token,
            maximumAmountIn,
            maximumPriceLevel,
            slippage,
            invalidityPeriod,
        );
    }

    private removeLiquidity(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const tickPositions: u256[] = calldata.readTuple();

        return this._removeLiquidity(token, tickPositions);
    }

    private swap(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const reservationIds: u256[] = calldata.readTuple();
        const isSimulation: bool = calldata.readBoolean();

        return this._swap(token, reservationIds, isSimulation);
    }

    private getTicksForToken(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const maximumTicks: u16 = calldata.readU16();
        const offset: u32 = calldata.readU32();
        const isAscending: bool = calldata.readBoolean();

        return this._getTicksForToken(token, maximumTicks, offset, isAscending);
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
     * @param {u256} maximumAmountIn - The maximum amount of tokens to be added as liquidity.
     * @param {u256} maximumPriceLevel - The maximum price level at which the liquidity is being added.
     * @param {u16} slippage - The maximum slippage percentage allowed for the trade. Note that this is a percentage value. (10000 = 100%)
     * @param {u16} invalidityPeriod - The number of blocks after which the liquidity will be considered invalid.
     *
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
        maximumAmountIn: u256,
        maximumPriceLevel: u256,
        slippage: u16,
        invalidityPeriod: u16,
    ): BytesWriter {
        // Logic for adding liquidity must be implemented here and the response must be returned as a BytesWriter

        throw new Error('Not implemented');
    }

    /**
     * @function reserveTicks
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
     * @param {u256} maximumAmountIn - The maximum amount to spend on the trade.
     * @param {u256} minimumAmountOut - The minimum amount of tokens to receive for the trade.
     * @param {u16} slippage - The maximum slippage percentage allowed for the trade. Note that this is a percentage value. (10000 = 100%)
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
    private _reserveTicks(
        token: Address,
        maximumAmountIn: u256,
        minimumAmountOut: u256,
        slippage: u16,
    ): BytesWriter {
        // Logic for reserving ticks must be implemented here and the response must be returned as a BytesWriter

        throw new Error('Not implemented');
    }

    /**
     * @function _getQuote
     * @description
     * Retrieves a quote for a specified bitcoin amount to be traded for a given token.
     * This method allows users to get an estimate of the number of tokens they can buy for a specified amount of BTC.
     *
     * @param {Address} token - The unique identifier of the token for which the quote is requested.
     * @param {u256} satoshisIn - The quantity of satoshis to be traded for the specified token. Minimum value is 1000 satoshis.
     *
     * @returns {BytesWriter} -
     * This method must return a receipt containing the following fields:
     * - estimatedQuantity (u256): The number of tokens that can be bought for the specified quantity at the given price point.
     *
     * @throws {Error} If the token is not found in the order book.
     * @throws {Error} If the requested quantity exceeds available liquidity in the order book.
     * @throws {Error} If invalid parameters are provided (e.g., negative quantity, zero price).
     * @throws {Error} If the requested quantity is less than the minimum trade size.
     */
    private _getQuote(token: Address, satoshisIn: u256): BytesWriter {
        // Logic for getting a quote must be implemented here and the response must be returned as a BytesWriter

        throw new Error('Not implemented');
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
     * @param {u256[]} tickPositions - An array of tick positions (price levels) from which liquidity is being removed.
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
    private _removeLiquidity(token: Address, tickPositions: u256[]): BytesWriter {
        // Logic for removing liquidity must be implemented here and the response must be returned as a BytesWriter

        throw new Error('Not implemented');
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
     * @param {u256} reservationIds - The reservations to be filled.
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
    private _swap(token: Address, reservationIds: u256[], isSimulation: bool): BytesWriter {
        // Logic for executing swap must be implemented here and the response must be returned as a BytesWriter

        throw new Error('Not implemented');
    }

    /**
     * @function _getTicksForToken
     * @description
     * Retrieves the current ticks (price positions) available in the OP_NET order book system for a specified token.
     * This function allows users to view the active price levels and the liquidity available at each level for the given token.
     * It provides insight into the order book's depth and helps users make informed trading decisions.
     *
     * @param {Address} token - The address of the token for which to retrieve ticks.
     * @param {u16} maximumTicks - The maximum number of ticks to retrieve.
     * @param {u32} offset - The offset from which to start retrieving ticks.
     * @param {bool} isAscending - A flag indicating whether to retrieve ticks in ascending order.
     *
     * @returns {BytesWriter} -
     * Returns a data structure containing the ticks information, including:
     * - An array of objects, each containing:
     *   - tickId (u256): The unique identifier for each tick.
     *   - level (u64): The price level (in satoshis per token) of each tick.
     *   - liquidityAmount (u256): The amount of tokens available at each price level.
     *
     * @throws {Error} If the token is not found in the order book.
     * @throws {Error} If there are issues retrieving the tick data.
     */
    private _getTicksForToken(
        token: Address,
        maximumTicks: u16,
        offset: u32,
        isAscending: bool,
    ): BytesWriter {
        // Logic for retrieving ticks must be implemented here and the response must be returned as a BytesWriter

        throw new Error('Not implemented');
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
     * @throws {Error} If there are issues retrieving the reserve data.
     */
    private _getReserve(token: Address): BytesWriter {
        // Logic for retrieving reserve must be implemented here and the response must be returned as a BytesWriter

        throw new Error('Not implemented');
    }

    /** This is just a logical example of code that you can use to implement methods. */
    private _example(calldata: Calldata): BytesWriter {
        const someRandomValue: u256 = calldata.readU256();
        const someRandomTokenAddress: Address = calldata.readAddress();
        const someRandomString: string = calldata.readStringWithLength();
        const someRandomBoolean: bool = calldata.readBoolean();
        const someRandomBytes: Uint8Array = calldata.readBytesWithLength();

        // and so on...

        // Emit events if needed
        const someEvent: RndSomeEvent = new RndSomeEvent(someRandomValue, someRandomTokenAddress);
        this.emitEvent(someEvent);

        // Response returned (receipt)
        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }
}
