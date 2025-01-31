import { Address, Blockchain, Revert, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { BaseOperation2 } from './BaseOperation2';
import { LiquidityQueue2 } from '../LiquidityQueue2';
import {
    LIQUIDITY_REMOVAL_TYPE,
    NORMAL_TYPE,
    PRIORITY_TYPE,
    Reservation2,
} from '../../Reservation2';
import { LiquidityReservedEvent } from '../../../events/LiquidityReservedEvent';
import { ReservationCreatedEvent } from '../../../events/ReservationCreatedEvent';
import { MAX_RESERVATION_AMOUNT_PROVIDER } from '../../../data-types/UserLiquidity2';

//const MAX_RESERVATION_AMOUNT_PROVIDER: u128 = u128.fromString(
///   '0x00ffffffffffffffffffffffffffff',
//   16,
//);

export class ReserveLiquidityOperation2 extends BaseOperation2 {
    private readonly buyer: Address;
    private readonly maximumAmountIn: u256;
    private readonly minimumAmountOut: u256;
    private readonly providerId: u256;
    private readonly forLP: bool;

    constructor(
        liquidityQueue: LiquidityQueue2,
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
            throw new Revert('You may not reserve your own liquidity');
        }

        const reservation = new Reservation2(this.liquidityQueue.token, this.buyer);
        this.ensureReservationValid(reservation);
        this.ensureUserNotTimedOut(reservation);

        const currentQuote = this.liquidityQueue.quote();

        this.ensureCurrentQuoteIsValid(currentQuote);
        this.ensureNoBots();
        this.ensureEnoughLiquidity();

        let tokensRemaining: u256 = this.computeTokenRemaining(currentQuote);
        let tokensReserved: u256 = u256.Zero;
        let satSpent: u256 = u256.Zero;
        let lastId: u64 = <u64>u32.MAX_VALUE + <u64>1; // Impossible value

        // We'll loop over providers while tokensRemaining > 0
        let i: u32 = 0;
        while (!tokensRemaining.isZero()) {
            const provider = this.liquidityQueue.getNextProviderWithLiquidity();
            if (provider === null) {
                break;
            }

            // If we see repeated MAX_VALUE => break
            if (provider.indexedAt === u32.MAX_VALUE && lastId === u32.MAX_VALUE) {
                break;
            }

            if (provider.indexedAt === lastId) {
                throw new Revert(
                    `Impossible state: repeated provider, ${provider.indexedAt} === ${lastId}, i=${i}`,
                );
            }

            lastId = provider.indexedAt;
            i++;

            // CASE A: REMOVAL-QUEUE PROVIDER
            if (provider.pendingRemoval && provider.isLp && provider.fromRemovalQueue) {
                const owed = this.liquidityQueue.getBTCowed(provider.providerId);
                if (owed.isZero() || u256.lt(owed, u256.fromU32(600))) {
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
                if (u256.lt(satWouldSpend, u256.fromU32(600))) {
                    break;
                }

                const currentReserved = this.liquidityQueue.getBTCowedReserved(provider.providerId);
                satWouldSpend = SafeMath.min(satWouldSpend, SafeMath.sub(owed, currentReserved));

                let reserveAmount = this.liquidityQueue.satoshisToTokens(
                    satWouldSpend,
                    currentQuote,
                );
                if (reserveAmount.isZero()) {
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
                reservation.reserveAtIndex(
                    <u32>provider.indexedAt,
                    reserveAmount.toU128(),
                    LIQUIDITY_REMOVAL_TYPE,
                );

                this.emitLiquidityReservedEvent(provider.btcReceiver, satWouldSpend.toU128());
            } else {
                // CASE B: NORMAL / PRIORITY PROVIDER
                const providerLiquidity = SafeMath.sub128(
                    provider.liquidity,
                    provider.reserved,
                ).toU256();

                const maxCostInSatoshis = this.liquidityQueue.tokensToSatoshis(
                    providerLiquidity,
                    currentQuote,
                );

                if (u256.lt(maxCostInSatoshis, u256.fromU32(600))) {
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
                if (u256.lt(leftoverSats, u256.fromU32(1000))) {
                    costInSatoshis = maxCostInSatoshis;
                }

                reserveAmount = this.liquidityQueue.satoshisToTokens(costInSatoshis, currentQuote);
                if (reserveAmount.isZero()) {
                    continue;
                }

                const reserveAmountU128 = reserveAmount.toU128();
                provider.reserved = SafeMath.add128(provider.reserved, reserveAmountU128);

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
        }

        // If we didn't reserve enough
        if (u256.lt(tokensReserved, this.minimumAmountOut)) {
            throw new Revert(
                `Not enough liquidity reserved; wanted ${this.minimumAmountOut}, got ${tokensReserved}, spent ${satSpent}, leftover tokens: ${tokensRemaining}, quote: ${currentQuote}`,
            );
        }

        this.liquidityQueue.updateTotalReserved(tokensReserved, true);

        reservation.reservedLP = this.forLP;
        reservation.setExpirationBlock(Blockchain.block.numberU64 + 5);
        reservation.save();

        const reservationList = this.liquidityQueue.getReservationListForBlock(
            Blockchain.block.numberU64,
        );

        const reservationActiveList = this.liquidityQueue.getActiveReservationListForBlock(
            Blockchain.block.numberU64,
        );

        reservationList.push(reservation.reservationId);
        const index: u32 = <u32>(reservationList.getLength() - 1);
        reservation.setPurgeIndex(index);
        reservationList.save();

        reservationActiveList.set(index, true);
        reservationActiveList.save();

        reservation.save();

        this.liquidityQueue.setBlockQuote();
        this.emitReservationCreatedEvent(tokensReserved, satSpent);
    }

    private emitReservationCreatedEvent(tokensReserved: u256, satSpent: u256): void {
        Blockchain.emit(new ReservationCreatedEvent(tokensReserved, satSpent));
    }

    private emitLiquidityReservedEvent(btcReceiver: string, costInSatoshis: u128): void {
        Blockchain.emit(new LiquidityReservedEvent(btcReceiver, costInSatoshis));
    }

    private ensureReservationValid(reservation: Reservation2): void {
        if (reservation.valid()) {
            //Blockchain.log('Revert: Existing active reservation detected');
            throw new Revert(
                'You already have an active reservation. Swap or wait for expiration before creating another',
            );
        }
    }

    private ensureUserNotTimedOut(reservation: Reservation2): void {
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

        if (u256.lt(satCostTokenRemaining, u256.fromU32(1000))) {
            throw new Revert(`Minimum liquidity not met (${satCostTokenRemaining} sat)`);
        }

        return tokensRemaining;
    }
}
