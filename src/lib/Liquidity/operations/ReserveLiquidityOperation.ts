import { BaseOperation } from './BaseOperation';
import { LiquidityQueue } from '../LiquidityQueue';
import { Address, Blockchain, Revert, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { LIQUIDITY_REMOVAL_TYPE, NORMAL_TYPE, PRIORITY_TYPE, Reservation } from '../../Reservation';
import { LiquidityReservedEvent } from '../../../events/LiquidityReservedEvent';
import { MAX_RESERVATION_AMOUNT_PROVIDER } from '../../../data-types/UserLiquidity';
import { ReservationCreatedEvent } from '../../../events/ReservationCreatedEvent';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

export class ReserveLiquidityOperation extends BaseOperation {
    private readonly buyer: Address;
    private readonly maximumAmountIn: u256;
    private readonly minimumAmountOut: u256;
    private readonly providerId: u256;
    private readonly forLP: bool;

    constructor(
        liquidityQueue: LiquidityQueue,
        providerId: u256,
        buyer: Address,
        maximumAmountIn: u256,
        minimumAmountOut: u256,
        forLP: bool,
    ) {
        super(liquidityQueue);

        this.buyer = buyer;
        this.providerId = providerId;
        this.maximumAmountIn = maximumAmountIn;
        this.minimumAmountOut = minimumAmountOut;
        this.forLP = forLP;
    }

    public execute(): void {
        if (u256.eq(this.providerId, this.liquidityQueue.initialLiquidityProvider)) {
            throw new Revert('Cannot reserve initial liquidity provider');
        }

        const reservation = new Reservation(this.buyer, this.liquidityQueue.token);
        this.ensureReservationValid(reservation);
        this.ensureUserNotTimedOut(reservation);

        const currentQuote = this.liquidityQueue.quote();
        this.ensureCurrentQuoteIsValid(currentQuote);
        this.ensureNoBots();
        this.ensureEnoughLiquidity();

        let tokensRemaining: u256 = this.computeTokenRemaining(currentQuote);

        let tokensReserved: u256 = u256.Zero;
        let satSpent: u256 = u256.Zero;
        let lastId: u64 = 0;

        //let i: u32 = 0;
        while (!tokensRemaining.isZero()) {
            //i++;

            // 1) We call getNextProviderWithLiquidity(), which may return a removal-queue provider
            //    or a normal/priority-queue provider.
            const provider = this.liquidityQueue.getNextProviderWithLiquidity();
            if (provider === null) {
                /*if (i === 1) {
                    throw new Revert(
                        `Impossible state: no providers even though totalAvailableLiquidity > 0`,
                    );
                }*/
                break;
            }

            // If we see repeated MAX_VALUE => break
            if (provider.indexedAt === u32.MAX_VALUE && lastId === u32.MAX_VALUE) {
                break;
            }
            lastId = provider.indexedAt;

            // CASE A: REMOVAL-QUEUE PROVIDER
            if (provider.pendingRemoval && provider.isLp && provider.fromRemovalQueue) {
                // current actual owed
                const owed = this.liquidityQueue.getBTCowed(provider.providerId);
                if (
                    owed.isZero() ||
                    u256.lt(owed, LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT)
                ) {
                    // If they're in removal queue but not actually owed anything => skip
                    this.liquidityQueue.removePendingLiquidityProviderFromRemovalQueue(
                        provider,
                        provider.indexedAt,
                    );
                    continue;
                }

                // We break if any provider in the removal queue has less than the minimum owed
                // DUST. We don't want to reserve liquidity for them.
                let satWouldSpend = this.liquidityQueue.tokensToSatoshis(
                    tokensRemaining,
                    currentQuote,
                );
                if (
                    u256.lt(
                        satWouldSpend,
                        LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
                    )
                ) {
                    break;
                }

                const currentReserved = this.liquidityQueue.getBTCowedReserved(provider.providerId);

                // clamp by how much is actually owed
                satWouldSpend = SafeMath.min(satWouldSpend, SafeMath.sub(owed, currentReserved));

                // now convert that sat amount back to tokens
                let reserveAmount = this.liquidityQueue.satoshisToTokens(
                    satWouldSpend,
                    currentQuote,
                );
                if (reserveAmount.isZero()) {
                    continue;
                }

                reserveAmount = SafeMath.min(reserveAmount, tokensRemaining);

                // Reserve these tokens (conceptually from the pool)
                tokensReserved = SafeMath.add(tokensReserved, reserveAmount);
                satSpent = SafeMath.add(satSpent, satWouldSpend);
                tokensRemaining = SafeMath.sub(tokensRemaining, reserveAmount);

                // Instead of directly reducing `owed`, we move it to `_lpBTCowedReserved`.
                const newReserved = SafeMath.add(currentReserved, satWouldSpend);
                this.liquidityQueue.setBTCowedReserved(provider.providerId, newReserved);

                // Note: We do NOT call setBTCowed(providerId, newOwed) here.
                // That happens only if the trade is actually executed in `executeTrade`.

                // Record the reservation
                reservation.reserveAtIndex(
                    <u32>provider.indexedAt,
                    reserveAmount.toU128(),
                    LIQUIDITY_REMOVAL_TYPE,
                );

                this.emitLiquidityReservedEvent(provider.btcReceiver, satWouldSpend.toU128());
            } else {
                // CASE B: NORMAL / PRIORITY PROVIDER
                // They do have actual tokens in provider.liquidity
                const providerLiquidity = SafeMath.sub128(
                    provider.liquidity,
                    provider.reserved,
                ).toU256();

                const maxCostInSatoshis = this.liquidityQueue.tokensToSatoshis(
                    providerLiquidity,
                    currentQuote,
                );
                if (
                    u256.lt(
                        maxCostInSatoshis,
                        LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT,
                    )
                ) {
                    // dust => reset if no reserved
                    if (provider.reserved.isZero()) {
                        this.liquidityQueue.resetProvider(provider);
                    }
                    continue;
                }

                // Try to reserve up to 'tokensRemaining' from this provider
                let reserveAmount = SafeMath.min(
                    SafeMath.min(providerLiquidity, tokensRemaining),
                    MAX_RESERVATION_AMOUNT_PROVIDER.toU256(),
                );

                let costInSatoshis = this.liquidityQueue.tokensToSatoshis(
                    reserveAmount,
                    currentQuote,
                );
                const leftoverSats = SafeMath.sub(maxCostInSatoshis, costInSatoshis);

                // If leftover satoshis < MINIMUM_PROVIDER_RESERVATION_AMOUNT => we take everything
                if (u256.lt(leftoverSats, LiquidityQueue.MINIMUM_PROVIDER_RESERVATION_AMOUNT)) {
                    costInSatoshis = maxCostInSatoshis;
                }

                // Recompute how many tokens that cost can buy
                reserveAmount = this.liquidityQueue.satoshisToTokens(costInSatoshis, currentQuote);
                if (reserveAmount.isZero()) {
                    continue;
                }

                const reserveAmountU128 = reserveAmount.toU128();
                provider.reserved = SafeMath.add128(provider.reserved, reserveAmountU128);

                tokensReserved = SafeMath.add(tokensReserved, reserveAmount);
                satSpent = SafeMath.add(satSpent, costInSatoshis);

                // reduce tokensRemaining
                if (u256.gt(tokensRemaining, reserveAmount)) {
                    tokensRemaining = SafeMath.sub(tokensRemaining, reserveAmount);
                } else {
                    tokensRemaining = u256.Zero;
                }

                reservation.reserveAtIndex(
                    <u32>provider.indexedAt,
                    reserveAmountU128,
                    provider.isPriority() ? PRIORITY_TYPE : NORMAL_TYPE,
                );

                this.emitLiquidityReservedEvent(provider.btcReceiver, costInSatoshis.toU128());
            }
        }

        // If we didn't reserve enough
        if (u256.lt(tokensReserved, this.minimumAmountOut)) {
            throw new Revert(
                `Not enough liquidity reserved; wanted ${this.minimumAmountOut}, got ${tokensReserved}, spent ${satSpent}, leftover tokens: ${tokensRemaining}, quote: ${currentQuote}`,
            );
        }

        // update global reserved
        this.liquidityQueue.updateTotalReserved(tokensReserved, true);

        reservation.reservedLP = this.forLP;

        // track the reservation
        reservation.setExpirationBlock(
            Blockchain.block.numberU64 + LiquidityQueue.RESERVATION_EXPIRE_AFTER,
        );
        reservation.save();

        const reservationList = this.liquidityQueue.getReservationListForBlock(
            Blockchain.block.numberU64,
        );
        reservationList.push(reservation.reservationId);
        reservationList.save();

        this.liquidityQueue.setBlockQuote();

        this.emitReservationCreatedEvent(tokensReserved, satSpent);
    }

    private emitReservationCreatedEvent(tokensReserved: u256, satSpent: u256): void {
        Blockchain.emit(new ReservationCreatedEvent(tokensReserved, satSpent));
    }

    private emitLiquidityReservedEvent(btcReceiver: string, costInSatoshis: u128): void {
        Blockchain.emit(new LiquidityReservedEvent(btcReceiver, costInSatoshis));
    }

    private ensureReservationValid(reservation: Reservation): void {
        if (reservation.valid()) {
            throw new Revert(
                'You already have an active reservation. Swap or wait for expiration before creating another',
            );
        }
    }

    private ensureUserNotTimedOut(reservation: Reservation): void {
        const userTimeoutUntilBlock: u64 = reservation.userTimeoutBlockExpiration;
        if (
            Blockchain.block.numberU64 <= userTimeoutUntilBlock &&
            this.liquidityQueue.timeOutEnabled
        ) {
            throw new Revert('User is timed out');
        }
    }

    private ensureCurrentQuoteIsValid(currentQuote: u256): void {
        if (currentQuote.isZero()) {
            throw new Revert('Impossible state: Token is worth infinity');
        }
    }

    private ensureNoBots(): void {
        if (Blockchain.block.numberU64 <= this.liquidityQueue.antiBotExpirationBlock) {
            if (u256.gt(this.maximumAmountIn, this.liquidityQueue.maxTokensPerReservation)) {
                throw new Revert('Cannot exceed anti-bot max tokens/reservation');
            }
        }
    }

    private ensureEnoughLiquidity(): void {
        if (u256.lt(this.liquidityQueue.liquidity, this.liquidityQueue.reservedLiquidity)) {
            throw new Revert('Impossible: liquidity < reservedLiquidity');
        }
    }

    private computeTokenRemaining(currentQuote: u256): u256 {
        // The buyer wants to effectively spend up to `maximumAmountIn` satoshis
        // in order to reserve tokens. We'll convert that to a "max token" value
        // at the current quote.
        let tokensRemaining: u256 = this.liquidityQueue.satoshisToTokens(
            this.maximumAmountIn,
            currentQuote,
        );

        const totalAvailableLiquidity = SafeMath.sub(
            this.liquidityQueue.liquidity,
            this.liquidityQueue.reservedLiquidity,
        );
        if (u256.lt(totalAvailableLiquidity, tokensRemaining)) {
            tokensRemaining = totalAvailableLiquidity;
        }

        const maxTokensLeftBeforeCap = this.liquidityQueue.getMaximumTokensLeftBeforeCap();
        tokensRemaining = SafeMath.min(tokensRemaining, maxTokensLeftBeforeCap);

        if (tokensRemaining.isZero()) {
            throw new Revert('Not enough liquidity available');
        }

        // We'll see how many satoshis that "tokensRemaining" would cost at the current quote.
        // This is to ensure we aren't in a weird mismatch state.
        //
        //if (u256.lt(satCostTokenRemaining, maximumAmountIn)) {
        //    throw new Revert(`Too little liquidity available ${satCostTokenRemaining}`);
        //}

        const satCostTokenRemaining = this.liquidityQueue.tokensToSatoshis(
            tokensRemaining,
            currentQuote,
        );
        if (
            u256.lt(
                satCostTokenRemaining,
                LiquidityQueue.MINIMUM_LIQUIDITY_IN_SAT_VALUE_ADD_LIQUIDITY,
            )
        ) {
            throw new Revert('Minimum liquidity not met');
        }

        return tokensRemaining;
    }
}
