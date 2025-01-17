import { BaseOperation } from './BaseOperation';
import { LiquidityQueue } from '../LiquidityQueue';
import {
    Address,
    Blockchain,
    BytesWriter,
    encodeSelector,
    Revert,
    SafeMath,
    TransferHelper,
    SELECTOR_BYTE_LENGTH,
    ADDRESS_BYTE_LENGTH,
    U256_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { SwapExecutedEvent } from '../../../events/SwapExecutedEvent';
import { Reservation } from '../../Reservation';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { depositStakingRewards } from '../../../utils/OrderBookUtils';

export class SwapOperation extends BaseOperation {
    constructor(
        liquidityQueue: LiquidityQueue,
        private readonly stakingContractAddress: Address,
        private readonly stakingFeeBips: u256,
    ) {
        super(liquidityQueue);
    }

    public execute(): void {
        const reservation = this.liquidityQueue.getReservationWithExpirationChecks();
        this.ensureReservation(reservation);

        const trade = this.liquidityQueue.executeTrade(reservation);

        let totalTokensPurchased = SafeMath.add(
            trade.totalTokensPurchased,
            trade.totalTokensRefunded,
        );

        const totalSatoshisSpent = SafeMath.add(trade.totalSatoshisSpent, trade.totalRefundedBTC);
        if (this.liquidityQueue.feesEnabled) {
            const totalFeeTokens = this.liquidityQueue.computeFees(
                totalTokensPurchased,
                totalSatoshisSpent,
            );
            totalTokensPurchased = SafeMath.sub(totalTokensPurchased, totalFeeTokens);
            this.liquidityQueue.distributeFee(totalFeeTokens);
        }

        const buyer: Address = Blockchain.tx.sender;

        const stakingFee = SafeMath.div(
            SafeMath.mul(totalTokensPurchased, this.stakingFeeBips),
            u256.from(1000),
        );
        const withdrawalAmount = SafeMath.sub(totalTokensPurchased, stakingFee);
        // transfer tokens to buyer
        TransferHelper.safeTransfer(this.liquidityQueue.token, buyer, withdrawalAmount);
        // transfer fee to staking contract
        depositStakingRewards(this.liquidityQueue.token, this.stakingContractAddress, stakingFee);

        this.liquidityQueue.updateTotalReserved(totalTokensPurchased, false);
        this.liquidityQueue.updateTotalReserve(totalTokensPurchased, false);

        this.liquidityQueue.buyTokens(totalTokensPurchased, totalSatoshisSpent);

        // finalize
        reservation.delete();
        this.liquidityQueue.cleanUpQueues();

        this.emitSwapExecutedEvent(buyer, totalSatoshisSpent, totalTokensPurchased);
    }

    private ensureReservation(reservation: Reservation): void {
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
