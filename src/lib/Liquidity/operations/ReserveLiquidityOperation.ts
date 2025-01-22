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
            //Blockchain.log('Revert: Cannot reserve initial liquidity provider');
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

        // We'll loop over providers while tokensRemaining > 0
        //Blockchain.log('Starting reservation loop');
        while (!tokensRemaining.isZero()) {
            // TODO: Fix issue inside of getNextProviderWithLiquidity.
            const provider = this.liquidityQueue.getNextProviderWithLiquidity();
            if (provider === null) {
                //Blockchain.log(
                //    'No more providers in queue but tokensRemaining > 0. Breaking loop.',
                //);
                break;
            }

            // If we see repeated MAX_VALUE => break
            if (provider.indexedAt === u32.MAX_VALUE && lastId === u32.MAX_VALUE) {
                //Blockchain.log('Provider indexedAt = MAX_VALUE was repeated => break loop.');
                break;
            }

            // THIS THROWS BECAUSE OF THE ISSUE IN getNextProviderWithLiquidity, we need to investigate
            if (provider.indexedAt === lastId) {
                //Blockchain.log('Revert: Impossible state: repeated provider');
                throw new Revert('Impossible state: repeated provider');
            }

            lastId = provider.indexedAt;

            // CASE A: REMOVAL-QUEUE PROVIDER
            if (provider.pendingRemoval && provider.isLp && provider.fromRemovalQueue) {
                //Blockchain.log('Handling provider from removal queue');
                const owed = this.liquidityQueue.getBTCowed(provider.providerId);
                if (
                    owed.isZero() ||
                    u256.lt(owed, LiquidityQueue.STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT)
                ) {
                    //Blockchain.log(
                    //    'This removal provider not owed or is dust, removing and continuing',
                    //);
                    this.liquidityQueue.removePendingLiquidityProviderFromRemovalQueue(
                        provider,
                        provider.indexedAt,
                    );
                    continue;
                }

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
                    //Blockchain.log('Sat needed to spend is below the strict minimum => break');
                    break;
                }

                const currentReserved = this.liquidityQueue.getBTCowedReserved(provider.providerId);
                satWouldSpend = SafeMath.min(satWouldSpend, SafeMath.sub(owed, currentReserved));

                let reserveAmount = this.liquidityQueue.satoshisToTokens(
                    satWouldSpend,
                    currentQuote,
                );
                if (reserveAmount.isZero()) {
                    //Blockchain.log('Reserve amount is zero after conversion => continue');
                    continue;
                }

                reserveAmount = SafeMath.min(reserveAmount, tokensRemaining);

                tokensReserved = SafeMath.add(tokensReserved, reserveAmount);
                satSpent = SafeMath.add(satSpent, satWouldSpend);
                tokensRemaining = SafeMath.sub(tokensRemaining, reserveAmount);

                // Move owed to owedReserved
                const newReserved = SafeMath.add(currentReserved, satWouldSpend);
                this.liquidityQueue.setBTCowedReserved(provider.providerId, newReserved);

                // Record the reservation
                /*Blockchain.log(
                    'Reserving ' +
                        reserveAmount.toString() +
                        ' tokens for removal-queue provider at index: ' +
                        provider.indexedAt.toString(),
                );*/
                reservation.reserveAtIndex(
                    <u32>provider.indexedAt,
                    reserveAmount.toU128(),
                    LIQUIDITY_REMOVAL_TYPE,
                );

                this.emitLiquidityReservedEvent(provider.btcReceiver, satWouldSpend.toU128());
            } else {
                // CASE B: NORMAL / PRIORITY PROVIDER
                //Blockchain.log(
                //    'Handling normal/priority provider: ' + provider.indexedAt.toString(),
                //);
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
                    //Blockchain.log(
                    //    'Provider liquidity is effectively dust => reset if not reserved',
                    //);
                    if (provider.reserved.isZero()) {
                        this.liquidityQueue.resetProvider(provider);
                    }
                    continue;
                }

                let reserveAmount = SafeMath.min(
                    SafeMath.min(providerLiquidity, tokensRemaining),
                    MAX_RESERVATION_AMOUNT_PROVIDER.toU256(),
                );

                let costInSatoshis = this.liquidityQueue.tokensToSatoshis(
                    reserveAmount,
                    currentQuote,
                );
                const leftoverSats = SafeMath.sub(maxCostInSatoshis, costInSatoshis);

                if (u256.lt(leftoverSats, LiquidityQueue.MINIMUM_PROVIDER_RESERVATION_AMOUNT)) {
                    //Blockchain.log(
                    //    'Leftover satoshis < MINIMUM_PROVIDER_RESERVATION_AMOUNT => take all',
                    //);
                    costInSatoshis = maxCostInSatoshis;
                }

                reserveAmount = this.liquidityQueue.satoshisToTokens(costInSatoshis, currentQuote);
                if (reserveAmount.isZero()) {
                    //Blockchain.log('Recomputed reserveAmount is zero => continue');
                    continue;
                }

                const reserveAmountU128 = reserveAmount.toU128();
                provider.reserved = SafeMath.add128(provider.reserved, reserveAmountU128);

                /*Blockchain.log(
                    'Reserving ' +
                        reserveAmount.toString() +
                        ' tokens from provider ' +
                        provider.indexedAt.toString() +
                        ' costing ' +
                        costInSatoshis.toString() +
                        ' satoshis',
                );*/

                tokensReserved = SafeMath.add(tokensReserved, reserveAmount);
                satSpent = SafeMath.add(satSpent, costInSatoshis);

                // Reduce tokensRemaining
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
            //Blockchain.log('tokensRemaining after iteration: ' + tokensRemaining.toString());
        }

        /*Blockchain.log(
            'Finished reservation loop. tokensReserved=' +
                tokensReserved.toString() +
                ', satSpent=' +
                satSpent.toString() +
                ', minimumAmountOut=' +
                this.minimumAmountOut.toString(),
        );*/

        // If we didn't reserve enough
        if (u256.lt(tokensReserved, this.minimumAmountOut)) {
            /*Blockchain.log(
                'Revert: Not enough liquidity reserved. Wanted=' +
                    this.minimumAmountOut.toString() +
                    ', got=' +
                    tokensReserved.toString(),
            );*/
            throw new Revert(
                `Not enough liquidity reserved; wanted ${this.minimumAmountOut}, got ${tokensReserved}, spent ${satSpent}, leftover tokens: ${tokensRemaining}, quote: ${currentQuote}`,
            );
        }

        //Blockchain.log('Updating global reserved with tokensReserved=' + tokensReserved.toString());
        this.liquidityQueue.updateTotalReserved(tokensReserved, true);

        reservation.reservedLP = this.forLP;
        reservation.setExpirationBlock(
            Blockchain.block.numberU64 + LiquidityQueue.RESERVATION_EXPIRE_AFTER,
        );
        reservation.save();

        //Blockchain.log(`Adding reservation ID to reservationList: ${reservation.reservationId}`);
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
            //Blockchain.log('Revert: Existing active reservation detected');
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
            //Blockchain.log('Revert: User is timed out');
            throw new Revert('User is timed out');
        }
    }

    private ensureCurrentQuoteIsValid(currentQuote: u256): void {
        if (currentQuote.isZero()) {
            //Blockchain.log('Revert: currentQuote is zero => Token is worth infinity');
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
