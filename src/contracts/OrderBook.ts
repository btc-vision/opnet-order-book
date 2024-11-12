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
import { u256 } from 'as-bignum/assembly';
import { StoredMapU256 } from '../stored/StoredMapU256';
import { TOTAL_RESERVES_POINTER } from '../lib/StoredPointers';
import { sha256 } from '@btc-vision/btc-runtime/runtime/env/BlockchainEnvironment';
import { LiquidityAddedEvent } from '../events/LiquidityAddedEvent';
import { Tick } from '../tick/Tick';
import { Reservation } from '../lib/Reservation';
import { ReservationCreatedEvent } from '../events/ReservationCreatedEvent';
import { LiquidityRemovedEvent } from '../events/LiquidityRemovedEvent';
import { LiquidityRemovalBlockedEvent } from '../events/LiquidityRemovalBlockedEvent';
import { SwapExecutedEvent } from '../events/SwapExecutedEvent';
import { TickFilledDetail } from '../lib/TickFilledDetail';
import { TickUpdatedEvent } from '../events/TickUpdatedEvent';
import { TickBitmap } from '../tick/TickBitmap';

/**
 * Just like some principle of uniswap v4, the opnet order book works relatively the same way. The only key difference is that, there is only a reserve for the token being traded. The inputs token will always be bitcoin (which the contract does not hold any liquidity for) and the output token will always be the target token.
 *
 * This means, we must create a contract like uniswap v4 where the user who want to sell tokens basically adds liquidity and the buyer basically "swaps" his bitcoin for tokens.
 *
 * This must be done using "ticks" aka price positions just like any trading platform work offchain. The key difference here is that this is on-chain!
 */
@final
export class OrderBook extends OP_NET {
    private readonly tickSpacing: u64 = 10; // The minimum spacing between each tick in satoshis. This is the minimum price difference between each tick.
    private readonly minimumTradeSize: u256 = u256.fromU64(5_000); // The minimum trade size in satoshis. This is the minimum amount of satoshis that can be traded for a token.
    private readonly minimumAddLiquidityAmount: u256 = u256.fromU64(10_000); // The minimum amount of tokens that can be added as liquidity.

    // Storage for ticks and reservations
    private totalReserves: StoredMapU256; // token address (as u256) => total reserve

    public constructor() {
        super();

        this.totalReserves = new StoredMapU256(TOTAL_RESERVES_POINTER);
    }

    public override onDeployment(_calldata: Calldata): void {
        // Logic to run on deployment
    }

    public override execute(method: Selector, calldata: Calldata): BytesWriter {
        switch (method) {
            case encodeSelector('reserveTicks'):
                return this.reserveTicks(calldata);
            case encodeSelector('addLiquidity'):
                return this.addLiquidity(calldata);
            case encodeSelector('removeLiquidity'):
                return this.removeLiquidity(calldata);
            case encodeSelector('swap'):
                return this.swap(calldata);
            case encodeSelector('getReserveForTick'):
                return this.getReserveForTick(calldata);
            case encodeSelector('getReserve'):
                return this.getReserve(calldata); // A pointer should be used to track each reserve. This method should not recompute the reserve each time it is called.
            case encodeSelector('getQuote'):
                return this.getQuote(calldata);
            default:
                return super.execute(method, calldata);
        }
    }

    private calculateTickIndex(priceLevel: u256): u64 {
        return SafeMath.div(priceLevel, u256.fromU64(this.tickSpacing)).toU64();
    }

    private getTickBitmap(token: Address): TickBitmap {
        // Create a TickBitmap instance as needed
        return new TickBitmap(token);
    }

    // Helper methods for ID generation and tick calculation

    /**
     * Generates a unique tick ID based on token address and price level.
     * @param token - The token Address.
     * @param level - The price level as u256.
     * @returns The unique tick ID as u256.
     */
    private generateTickId(token: Address, level: u256): u256 {
        const data = new BytesWriter(ADDRESS_BYTE_LENGTH + 32);
        data.writeAddress(token);
        data.writeU256(level);

        return u256.fromBytes(sha256(data.getBuffer()));
    }

    /**
     * Generates a unique reservation ID based on buyer address and current block number.
     * @param buyer - The buyer Address.
     * @param token - The token Address.
     * @returns The unique reservation ID as u256.
     */
    private generateReservationId(buyer: Address, token: Address): u256 {
        const data = new BytesWriter(ADDRESS_BYTE_LENGTH + 32);
        data.writeAddress(buyer);
        data.writeAddress(token);

        return u256.fromBytes(sha256(data.getBuffer()));
    }

    /**
     * Calculates the tick level based on the given price level and tick spacing.
     * @param priceLevel - The price level as u256.
     * @returns The calculated tick level as u256.
     */
    private calculateTickLevel(priceLevel: u256): u256 {
        const tickSpacing = u256.fromU64(this.tickSpacing);
        const divided = SafeMath.div(priceLevel, tickSpacing);

        return SafeMath.mul(divided, tickSpacing);
    }

    /**
     * Updates the total reserve for a given token.
     * @param token - The token address as u256.
     * @param amount - The amount to add or subtract.
     * @param increase - Boolean indicating whether to add or subtract.
     */
    private updateTotalReserve(token: u256, amount: u256, increase: bool): void {
        const currentReserve = this.totalReserves.get(token) || u256.Zero;
        const newReserve = increase
            ? SafeMath.add(currentReserve, amount)
            : SafeMath.sub(currentReserve, amount);

        this.totalReserves.set(token, newReserve);
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

        const maximumAmountIn: u256 = calldata.readU256();
        const targetPriceLevel: u256 = calldata.readU256();
        const slippage: u16 = calldata.readU16();
        const invalidityPeriod: u16 = calldata.readU16();

        return this._addLiquidity(
            token,
            receiver,
            maximumAmountIn,
            targetPriceLevel,
            slippage,
            invalidityPeriod,
        );
    }

    private getQuote(calldata: Calldata): BytesWriter {
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

    private removeLiquidity(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const tickPositions: u256[] = calldata.readTuple();

        return this._removeLiquidity(token, tickPositions);
    }

    private swap(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const isSimulation: bool = calldata.readBoolean();
        const reservations: u16 = calldata.readU16();

        return this._swap(token, isSimulation, reservations, calldata);
    }

    private getReserve(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();

        return this._getReserve(token);
    }

    private getReserveForTick(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const rawLevel: u256 = calldata.readU256();

        const level: u256 = this.calculateTickLevel(rawLevel);
        const tickId: u256 = this.generateTickId(token, level);

        return this._getReserveForTick(tickId);
    }

    /**
     * @function _getReserve
     * @description
     * Retrieves the total reserve for a given token.
     * @param {u256} tickId - The unique identifier for the tick.
     * @private
     */
    private _getReserveForTick(tickId: u256): BytesWriter {
        const tick = new Tick(tickId, u256.Zero);
        if (!tick.load()) {
            throw new Revert('Tick not found');
        }

        const totalLiquidity: u256 = tick.getTotalLiquidity();
        const reservedLiquidity: u256 = tick.getReservedLiquidity();
        const availableLiquidity: u256 = tick.getAvailableLiquidity(false);

        const result = new BytesWriter(96);
        result.writeU256(totalLiquidity);
        result.writeU256(reservedLiquidity);
        result.writeU256(availableLiquidity);
        return result;
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
     * @param {u256} maximumAmountIn - The maximum amount of tokens to be added as liquidity.
     * @param {u256} targetPriceLevel - The target price level at which the liquidity is being added.
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
        receiver: string,
        maximumAmountIn: u256,
        targetPriceLevel: u256,
        slippage: u16,
        invalidityPeriod: u16,
    ): BytesWriter {
        // Validate inputs
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('Invalid token address');
        }

        if (maximumAmountIn.isZero()) {
            throw new Revert('Amount in cannot be zero');
        }

        if (targetPriceLevel.isZero()) {
            throw new Revert('Price level cannot be zero');
        }

        if (slippage > 10000) {
            throw new Revert('Slippage cannot exceed 100%');
        }

        if (invalidityPeriod == 0) {
            throw new Revert('Invalidity period cannot be zero');
        }

        // Verify that the price is minimum the tickSpacing
        if (u256.lt(targetPriceLevel, u256.fromU64(this.tickSpacing))) {
            throw new Revert(
                `Price level is less than the tick spacing of ${this.tickSpacing}, ${targetPriceLevel} is invalid`,
            );
        }

        if (u256.lt(maximumAmountIn, this.minimumAddLiquidityAmount)) {
            throw new Revert('Amount in is less than the minimum add liquidity amount');
        }

        // Provider identifier as u256 derived from sender's address
        const providerId: u256 = this.u256FromAddress(Blockchain.tx.sender);

        const level: u256 = this.calculateTickLevel(targetPriceLevel);
        const tickId: u256 = this.generateTickId(token, level);
        const tickBitmap = this.getTickBitmap(token);

        // Retrieve or create the tick
        const tick: Tick = new Tick(tickId, level);
        const exist: bool = tick.load();

        if (!exist) {
            const tickIndex: u64 = this.calculateTickIndex(level);

            // Initialize the tick
            tickBitmap.flipTick(tickIndex, true);
        }

        // Transfer tokens from provider to contract
        TransferHelper.safeTransferFrom(
            token,
            Blockchain.tx.sender,
            Blockchain.contractAddress,
            maximumAmountIn,
        );

        // Update tick liquidity
        tick.addLiquidity(providerId, maximumAmountIn, receiver);

        // Save tick
        tick.save();

        // Update total reserve
        const tokenUint = this.u256FromAddress(token);
        this.updateTotalReserve(tokenUint, maximumAmountIn, true);

        // Emit LiquidityAdded event
        const liquidityEvent = new LiquidityAddedEvent(
            tickId,
            level,
            maximumAmountIn,
            maximumAmountIn, // amountOut is the same as amountIn for simplicity
            receiver,
        );

        this.emitEvent(liquidityEvent);

        // Return success
        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

    private u256FromAddress(address: Address): u256 {
        return u256.fromBytes(address);
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
        // Validate inputs
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('Invalid token address');
        }

        if (maximumAmountIn.isZero()) {
            throw new Revert('Maximum amount in cannot be zero');
        }

        if (minimumAmountOut.isZero()) {
            throw new Revert('Minimum amount out cannot be zero');
        }

        if (slippage > 10000) {
            throw new Revert('Slippage cannot exceed 100%');
        }

        if (u256.lt(minimumAmountOut, this.minimumTradeSize)) {
            throw new Revert('Minimum amount out is below minimum trade size');
        }

        const buyer: Address = Blockchain.tx.sender;
        const reservationId: u256 = this.generateReservationId(buyer, token);

        // Create the reservation
        const reservation = new Reservation(
            reservationId,
            buyer,
            token,
            SafeMath.add(Blockchain.block.number, u256.fromU64(5)),
        );

        if (reservation.exist()) {
            throw new Revert('User already has a pending reservation for the same token');
        }

        let totalReserved: u256 = u256.Zero;
        let expectedAmountOut: u256 = u256.Zero;

        // Get the tick bitmap for the token
        const tickBitmap = this.getTickBitmap(token);

        // Start from the lowest possible tick index
        let tickIndex: u64 = tickBitmap.nextInitializedTick(1, false, true);

        // Traverse ticks using the tick bitmap
        while (u256.lt(totalReserved, minimumAmountOut)) {
            // Calculate the tick level from the tick index
            const level: u256 = SafeMath.mul(
                u256.fromU64(tickIndex),
                u256.fromU64(this.tickSpacing),
            );

            const tickId: u256 = this.generateTickId(token, level);

            // Load the tick
            const tick = new Tick(tickId, level);
            if (!tick.load()) {
                // Should not happen if tick is initialized in tick bitmap
                tickIndex = tickBitmap.nextInitializedTick(tickIndex, false, true);
                continue;
            }

            const availableLiquidity: u256 = tick.getAvailableLiquidity(true);
            if (availableLiquidity.isZero()) {
                tickIndex = tickBitmap.nextInitializedTick(tickIndex, false, true);
                continue;
            }

            const price: u256 = tick.level;
            const maxAmountPossible: u256 = SafeMath.div(maximumAmountIn, price);
            const amountToReserve: u256 = u256.lt(maxAmountPossible, availableLiquidity)
                ? maxAmountPossible
                : availableLiquidity;

            if (amountToReserve.isZero()) {
                tickIndex = tickBitmap.nextInitializedTick(tickIndex, false, true);
                continue;
            }

            // Reserve tokens and update totals
            reservation.addReservation(tick.tickId, amountToReserve);
            totalReserved = SafeMath.add(totalReserved, amountToReserve);
            expectedAmountOut = SafeMath.add(expectedAmountOut, amountToReserve);

            // Increase reserved amount in tick
            tick.addReservation(amountToReserve);
            tick.save();

            // Move to the next initialized tick
            tickIndex = tickBitmap.nextInitializedTick(tickIndex, false, false);
            if (tickIndex == 0) {
                break;
            }
        }

        if (u256.lt(totalReserved, minimumAmountOut)) {
            throw new Revert('Insufficient liquidity to fulfill reservation');
        }

        // Save reservation
        reservation.save();

        const reservationEvent = new ReservationCreatedEvent(
            reservationId,
            totalReserved,
            expectedAmountOut,
            buyer,
        );

        this.emitEvent(reservationEvent);

        const result = new BytesWriter(32);
        result.writeU256(reservationId);
        return result;
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
        // Validate inputs
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('Invalid token address');
        }

        if (u256.lt(satoshisIn, this.minimumTradeSize)) {
            // Assuming 1000 satoshis as minimum
            throw new Revert('Requested amount is below minimum trade size');
        }

        // Initialize variables for remaining BTC and estimated tokens
        let remainingSatoshis = satoshisIn;
        let estimatedQuantity = u256.Zero;
        let requiredSatoshis = u256.Zero;

        // Get the tick bitmap for the token
        const tickBitmap = this.getTickBitmap(token);

        // Start from the lowest possible tick index
        let tickIndex = tickBitmap.nextInitializedTick(0, false, true);

        // Traverse ticks using the tick bitmap
        while (u256.gt(remainingSatoshis, u256.Zero)) {
            // Calculate the tick level from the tick index
            const level = SafeMath.mul(u256.fromU64(tickIndex), u256.fromU64(this.tickSpacing));
            const tickId = this.generateTickId(token, level);

            Blockchain.log(
                `Remaining satoshis: ${remainingSatoshis} - Tick index: ${tickIndex} - Tick ID: ${tickId}`,
            );

            // Load the tick
            const tick = new Tick(tickId, level);
            if (!tick.load()) {
                Blockchain.log(`Tick not found: ${tickId}`);
                // Should not happen if tick is initialized in tick bitmap
                tickIndex = tickBitmap.nextInitializedTick(tickIndex, false, true);
                continue;
            }

            const price = tick.level; // Price in satoshis per token
            if (price.isZero()) {
                throw new Revert('Invalid price level');
            }

            // Calculate the maximum tokens that can be bought at this tick
            const tokensAtTick = SafeMath.div(remainingSatoshis, price);
            const availableLiquidity = tick.getAvailableLiquidity(false);

            // Determine the actual number of tokens to buy at this tick
            const tokensToBuy = u256.lt(tokensAtTick, availableLiquidity)
                ? tokensAtTick
                : availableLiquidity;

            if (u256.gt(tokensToBuy, u256.Zero)) {
                // Update estimated quantity and deduct the used satoshis
                estimatedQuantity = SafeMath.add(estimatedQuantity, tokensToBuy);

                const satoshisUsed = SafeMath.mul(tokensToBuy, price);
                remainingSatoshis = SafeMath.sub(remainingSatoshis, satoshisUsed);
            }

            if (u256.eq(remainingSatoshis, u256.Zero)) {
                break;
            }

            // Update required satoshis
            requiredSatoshis = SafeMath.add(requiredSatoshis, remainingSatoshis);

            // Move to the next initialized tick
            tickIndex = tickBitmap.nextInitializedTick(tickIndex, false, false);
            if (tickIndex == 0) {
                // Partial fill
                break;
            }
        }

        if (estimatedQuantity.isZero()) {
            throw new Revert('Insufficient liquidity to provide a quote');
        }

        // Serialize the estimated quantity of tokens that can be bought
        const result = new BytesWriter(64); // u256 is 32 bytes
        result.writeU256(estimatedQuantity);
        result.writeU256(requiredSatoshis);
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
        // Validate input
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('Invalid token address');
        }

        let totalTokensReturned = u256.Zero;
        const seller = Blockchain.tx.sender;
        const providerId = this.u256FromAddress(seller);
        const tokenUint = this.u256FromAddress(token);
        const tickBitmap = this.getTickBitmap(token);

        for (let i = 0; i < tickPositions.length; i++) {
            const tickId = tickPositions[i];
            const tick = new Tick(tickId, u256.Zero);

            // Check if tick is valid and load it
            if (!tick.load()) {
                continue; // Skip if tick does not exist
            }

            const providerLiquidity = tick.getOwnedLiquidity(providerId);
            if (providerLiquidity.isZero()) {
                continue; // Provider has no liquidity in this tick
            }

            const reservationsCount: u256 = tick.reservationsCount();

            // Check if there are active reservations that prevent liquidity removal
            if (reservationsCount !== u256.Zero) {
                // Emit an event notifying the user that liquidity cannot be removed
                this.emitEvent(new LiquidityRemovalBlockedEvent(tick.tickId, reservationsCount));
                continue;
            }

            // Update total reserve
            this.updateTotalReserve(tokenUint, providerLiquidity, false);

            // Update tick by removing liquidity from provider
            tick.removeLiquidity(providerId, providerLiquidity);

            // If the tick's liquidity is zero, flip the tick in the bitmap
            if (tick.liquidityAmount.isZero()) {
                const tickIndex: u64 = this.calculateTickIndex(tick.level);
                tickBitmap.flipTick(tickIndex, false);
            }

            tick.save();

            // Accumulate total tokens returned
            totalTokensReturned = SafeMath.add(totalTokensReturned, providerLiquidity);

            // Emit event for each successful liquidity removal
            this.emitEvent(
                new LiquidityRemovedEvent(
                    token,
                    providerLiquidity,
                    tick.tickId,
                    tick.level,
                    tick.liquidityAmount, // Remaining liquidity after removal
                ),
            );
        }

        // Return tokens to the seller
        if (u256.gt(totalTokensReturned, u256.Zero)) {
            TransferHelper.safeTransfer(token, seller, totalTokensReturned);
        }

        // Serialize the total tokens returned
        const result = new BytesWriter(32); // u256 is 32 bytes
        result.writeU256(totalTokensReturned);
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
     * @param {u16} reservations - The number of reservations to be swapped.
     * @param {Calldata} calldata - The calldata containing the reservation IDs.
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
    private _swap(
        token: Address,
        isSimulation: bool,
        reservations: u16,
        calldata: Calldata,
    ): BytesWriter {
        // Validate inputs
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('Invalid token address');
        }

        const buyer = Blockchain.tx.sender;
        let totalTokensAcquired = u256.Zero;
        let totalBtcRequired = u256.Zero;

        // For collecting details for events
        const ticksFilled: TickFilledDetail[] = [];
        const tickBitmap = this.getTickBitmap(token);

        for (let i: u16 = 0; i < reservations; i++) {
            const reservationId: u256 = calldata.readU256();

            // Load the reservation
            const reservation = new Reservation(reservationId, buyer, token, u256.Zero);
            reservation.load(); // Throws if reservation not found

            // Check that reservation belongs to buyer and token matches
            if (!reservation.buyer.equals(buyer)) {
                throw new Revert('Reservation does not belong to caller');
            }

            if (!reservation.token.equals(token)) {
                throw new Revert('Reservation token mismatch');
            }

            // Check if reservation is expired
            if (reservation.hasExpired()) {
                // Release the reserved amounts back to the ticks
                const tickIds: u256[] = calldata.readTuple();
                for (let j = 0; j < tickIds.length; j++) {
                    const tickId = tickIds[j];
                    const reservedAmount = reservation.getReservedAmountForTick(tickId);

                    // Load the tick
                    const tick = new Tick(tickId, u256.Zero);
                    tick.load();

                    // Decrease reserved amount in tick
                    tick.removeReservation(reservedAmount);
                    tick.save();
                }

                // Remove the reservation
                reservation.delete();

                throw new Revert(`Reservation ${reservationId} has expired`);
            }

            // If isSimulation is true and reservation is close to being expired
            if (isSimulation) {
                const blocksUntilExpiration = SafeMath.sub(
                    reservation.expirationBlock,
                    Blockchain.block.number,
                );

                if (u256.le(blocksUntilExpiration, u256.One)) {
                    throw new Revert('Reservation is close to being expired');
                }
            }

            // For each tick in the reservation
            const tickIds: u256[] = calldata.readTuple();
            for (let j = 0; j < tickIds.length; j++) {
                const tickId = tickIds[j];
                const reservedAmount = reservation.getReservedAmountForTick(tickId);

                // Load the tick
                const tick = new Tick(tickId, u256.Zero);
                tick.load(); // Assume that tick exists

                // Compute BTC required for this tick
                const price = tick.level; // Satoshis per token
                const btcRequiredForTick = SafeMath.mul(reservedAmount, price);

                // Accumulate totals
                totalBtcRequired = SafeMath.add(totalBtcRequired, btcRequiredForTick);
                totalTokensAcquired = SafeMath.add(totalTokensAcquired, reservedAmount);

                // For events
                ticksFilled.push(
                    new TickFilledDetail(tickId, price, reservedAmount, tick.liquidityAmount),
                );

                // Distribute BTC to liquidity providers proportionally
                let remainingReservedAmount = reservedAmount;
                let currentProviderId = u256.Zero;
                let providerNode = tick.getNextLiquidityProvider(currentProviderId);

                while (providerNode !== null && u256.gt(remainingReservedAmount, u256.Zero)) {
                    const providerLiquidity = providerNode.amount;

                    if (providerLiquidity.isZero()) {
                        currentProviderId = providerNode.providerId;
                        providerNode = tick.getNextLiquidityProvider(currentProviderId);
                        continue;
                    }

                    // Determine how much of the reserved amount this provider supplies
                    let providerSupplyAmount: u256 = u256.Zero;
                    if (u256.ge(providerLiquidity, remainingReservedAmount)) {
                        providerSupplyAmount = remainingReservedAmount;
                    } else {
                        providerSupplyAmount = providerLiquidity;
                    }

                    // Compute BTC owed to provider
                    const providerBtcAmount: u256 = SafeMath.mul(providerSupplyAmount, price);
                    const providerAddress: string = providerNode.btcReceiver;

                    Blockchain.log(
                        `Provider ${providerNode.providerId} will receive ${providerBtcAmount} BTC at address ${providerAddress}`,
                    );

                    // TODO: Implement logic to verify BTC transfer to provider

                    // Reduce provider's liquidity amount
                    providerNode.amount = SafeMath.sub(providerNode.amount, providerSupplyAmount);
                    providerNode.save(tick.tickId);

                    // Update remainingReservedAmount
                    remainingReservedAmount = SafeMath.sub(
                        remainingReservedAmount,
                        providerSupplyAmount,
                    );

                    currentProviderId = providerNode.providerId;
                    providerNode = tick.getNextLiquidityProvider(currentProviderId);
                }

                // Transfer tokens to buyer
                TransferHelper.safeTransfer(token, buyer, reservedAmount);

                // After distributing to providers, adjust tick's liquidityAmount
                tick.liquidityAmount = SafeMath.sub(tick.liquidityAmount, reservedAmount);
                tick.removeReservation(reservedAmount);

                // If the tick's liquidity is zero, flip the tick in the bitmap
                if (tick.liquidityAmount.isZero()) {
                    const tickIndex: u64 = this.calculateTickIndex(tick.level);
                    tickBitmap.flipTick(tickIndex, false);
                }

                // Save tick
                tick.save();
            }

            // Remove the reservation
            reservation.delete();
        }

        // Update total reserves
        const tokenUint = this.u256FromAddress(token);
        this.updateTotalReserve(tokenUint, totalTokensAcquired, false);

        // Emit SwapExecutedEvent
        const swapEvent = new SwapExecutedEvent(buyer, totalBtcRequired, totalTokensAcquired);
        this.emitEvent(swapEvent);

        // Emit TickUpdatedEvent for each tick
        for (let i = 0; i < ticksFilled.length; i++) {
            const tickDetail = ticksFilled[i];
            const tickUpdatedEvent = new TickUpdatedEvent(
                tickDetail.tickId,
                tickDetail.level,
                tickDetail.remainingLiquidity,
                tickDetail.amount,
            );
            this.emitEvent(tickUpdatedEvent);
        }

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
     */
    private _getReserve(token: Address): BytesWriter {
        // Validate input
        if (token.empty() || token.equals(Blockchain.DEAD_ADDRESS)) {
            throw new Revert('Invalid token address');
        }

        const tokenUint = this.u256FromAddress(token);
        const reserve = this.totalReserves.get(tokenUint) || u256.Zero;

        const result = new BytesWriter(32); // u256 is 32 bytes
        result.writeU256(reserve);
        return result;
    }
}
