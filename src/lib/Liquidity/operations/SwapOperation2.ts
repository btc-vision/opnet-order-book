import { Address, Blockchain, Potential, Revert, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { SwapExecutedEvent } from '../../../events/SwapExecutedEvent';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { BaseOperation2 } from './BaseOperation2';
import { LiquidityQueue2 } from '../LiquidityQueue2';
import { Reservation2 } from '../../Reservation2';

export class SwapOperation2 extends BaseOperation2 {
    public constructor(liquidityQueue: LiquidityQueue2) {
        super(liquidityQueue);
    }

    public execute(): void {
        const reservation: Potential<Reservation2> =
            this.liquidityQueue.getReservationWithExpirationChecks();

        if (reservation === null) {
            return;
        }

        this.ensureReservation(reservation);

        const reservationActiveList = this.liquidityQueue.getActiveReservationListForBlock(
            reservation.createdAt,
        );

        reservationActiveList.set(<u64>reservation.getPurgeIndex(), false);
        reservationActiveList.save();

        const trade = this.liquidityQueue.executeTrade(reservation);

        let totalTokensPurchased = SafeMath.add(
            trade.totalTokensPurchased,
            trade.totalTokensRefunded,
        );

        const totalTokensPurchasedBeforeFees = totalTokensPurchased.clone();

        const totalSatoshisSpent = SafeMath.add(trade.totalSatoshisSpent, trade.totalRefundedBTC);
        if (this.liquidityQueue.feesEnabled) {
            const totalFeeTokens = this.liquidityQueue.computeFees(
                totalTokensPurchased,
                totalSatoshisSpent,
            );

            totalTokensPurchased = SafeMath.sub(totalTokensPurchased, totalFeeTokens);
            this.liquidityQueue.distributeFee(totalFeeTokens);
        }

        this.liquidityQueue.updateTotalReserved(totalTokensPurchasedBeforeFees, false);
        this.liquidityQueue.updateTotalReserve(totalTokensPurchased, false);

        const buyer: Address = Blockchain.tx.sender;
        //!!!TransferHelper.safeTransfer(this.liquidityQueue.token, buyer, totalTokensPurchased);

        this.liquidityQueue.buyTokens(totalTokensPurchased, totalSatoshisSpent);

        // finalize
        this.liquidityQueue.cleanUpQueues();

        this.emitSwapExecutedEvent(buyer, totalSatoshisSpent, totalTokensPurchased);
    }

    private ensureReservation(reservation: Reservation2): void {
        if (reservation.reservedLP) {
            throw new Revert('Reserved for LP; cannot swap');
        }
    }

    private emitSwapExecutedEvent(
        buyer: Address,
        totalSatoshisSpent: u256,
        totalTokensPurchased: u256,
    ): void {
        Blockchain.emit(new SwapExecutedEvent(buyer, totalSatoshisSpent, totalTokensPurchased));
    }
}
