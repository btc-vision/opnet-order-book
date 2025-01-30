import { getProvider, Provider2 } from '../../Provider2';
import { Blockchain, Revert, SafeMath } from '@btc-vision/btc-runtime/runtime';
import { LiquidityAddedEvent } from '../../../events/LiquidityAddedEvent';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { Reservation2 } from '../../Reservation2';
import { BaseOperation2 } from './BaseOperation2';
import { LiquidityQueue2 } from '../LiquidityQueue2';

export class AddLiquidityOperation2 extends BaseOperation2 {
    private readonly providerId: u256;
    private readonly receiver: string;
    private providerSelf: Provider2;

    constructor(liquidityQueue: LiquidityQueue2, providerId: u256, receiver: string) {
        super(liquidityQueue);

        this.providerId = providerId;
        this.receiver = receiver;
        this.providerSelf = getProvider(providerId);
    }

    public execute(): void {
        this.ensureNotInRemovalQueue();

        // 1. Make sure there's an active reservation for LP
        const reservation = this.liquidityQueue.getReservationWithExpirationChecks();
        this.ensureReservedLiquidityFirst(reservation);

        // 2. First, execute the trade to see how many tokens were purchased (T)
        //    and how much BTC was used (B).
        const trade = this.liquidityQueue.executeTrade(reservation);
        const tokensBoughtFromQueue = SafeMath.add(
            trade.totalTokensPurchased,
            trade.totalTokensRefunded,
        ); // T

        const btcSpent = SafeMath.add(trade.totalSatoshisSpent, trade.totalRefundedBTC); // B
        this.ensurePurchaseMade(tokensBoughtFromQueue, btcSpent);

        // 3. Enforce 50/50 => The user must deposit exactly `tokensBoughtFromQueue` more tokens
        //    from their wallet. This ensures that in total, they've contributed equal "value"
        //    in BTC and in tokens.
        //    So we do a safeTransferFrom of that exact token amount:
        //!!!TransferHelper.safeTransferFrom(
        //    this.liquidityQueue.token,
        //    Blockchain.tx.sender,
        //    Blockchain.contractAddress,
        //    tokensBoughtFromQueue,
        //);

        // 4. Because the purchase from the queue effectively "used BTC to buy tokens,"
        //    update our totalReserved to un-reserve those tokens.
        this.liquidityQueue.updateTotalReserved(tokensBoughtFromQueue, false);

        // 5. Combine the user’s newly deposited tokens (the "other 50%" side)
        //    into the pool’s total reserves.
        this.liquidityQueue.updateTotalReserve(tokensBoughtFromQueue, true);

        this.liquidityQueue.virtualBTCReserve = SafeMath.add(
            this.liquidityQueue.virtualBTCReserve,
            btcSpent,
        );
        this.liquidityQueue.virtualTokenReserve = SafeMath.add(
            this.liquidityQueue.virtualTokenReserve,
            tokensBoughtFromQueue,
        );

        // 7. Credit the user’s "virtual BTC" so they can withdraw it later in removeLiquidity.
        const owedBefore = this.liquidityQueue.getBTCowed(this.providerId);
        const owedAfter = SafeMath.add(owedBefore, btcSpent);
        this.liquidityQueue.setBTCowed(this.providerId, owedAfter);

        // 8. Mark the provider as an LP
        this.markProviderAsLPProvider(tokensBoughtFromQueue);

        // 9. Clean up providers, recalc block quote
        this.liquidityQueue.cleanUpQueues();

        this.emitLiquidityAddedEvent(tokensBoughtFromQueue, btcSpent);
    }

    private ensureNotInRemovalQueue(): void {
        if (this.providerSelf.pendingRemoval) {
            throw new Revert(
                'You are in the removal queue. Wait for removal of your liquidity first.',
            );
        }
    }

    private ensureReservedLiquidityFirst(reservation: Reservation2): void {
        if (!reservation.reservedLP) {
            throw new Revert('You must reserve liquidity for LP first.');
        }
    }

    private ensurePurchaseMade(tokensBoughtFromQueue: u256, btcSpent: u256): void {
        if (tokensBoughtFromQueue.isZero() || btcSpent.isZero()) {
            throw new Revert('No effective purchase made. Check your BTC outputs.');
        }
    }

    private markProviderAsLPProvider(tokensBoughtFromQueue: u256): void {
        this.providerSelf.isLp = true;

        // Prevent exploits where someone add liquidity then change receiving address, get free BTC from people swapping their listed tokens.
        if (this.providerSelf.reserved.isZero()) {
            this.providerSelf.btcReceiver = this.receiver;
        }

        this.providerSelf.liquidityProvided = SafeMath.add(
            this.providerSelf.liquidityProvided,
            tokensBoughtFromQueue,
        );
    }

    private emitLiquidityAddedEvent(tokensBoughtFromQueue: u256, btcSpent: u256): void {
        Blockchain.emit(
            new LiquidityAddedEvent(
                SafeMath.add(tokensBoughtFromQueue, tokensBoughtFromQueue), // The tokens from the user wallet
                tokensBoughtFromQueue, // The tokens purchased from queue (if you want to track them separately)
                btcSpent,
            ),
        );
    }
}
