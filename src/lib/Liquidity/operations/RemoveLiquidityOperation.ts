import { BaseOperation } from './BaseOperation';
import { LiquidityQueue } from '../LiquidityQueue';
import { u256 } from '@btc-vision/as-bignum/assembly';
import { getProvider, Provider } from '../../Provider';
import { Blockchain, Revert, SafeMath, TransferHelper } from '@btc-vision/btc-runtime/runtime';
import { LiquidityRemovedEvent } from '../../../events/LiquidityRemovedEvent';

export class RemoveLiquidityOperation extends BaseOperation {
    private readonly providerId: u256;
    private readonly amount: u256;
    private readonly provider: Provider;

    constructor(liquidityQueue: LiquidityQueue, providerId: u256, amount: u256) {
        // Call the BaseOperation constructor
        super(liquidityQueue);

        this.providerId = providerId;
        this.amount = amount;
        this.provider = getProvider(providerId);
    }

    public execute(): void {
        // 1. Check that this provider is actually an LP
        this.ensureLiquidityProvider();
        this.ensureNotInitialProvider();

        // 2. Figure out how much BTC they are "owed" (the virtual side),
        //    and how many tokens they currently have "locked in" the pool.
        const btcOwed = this.liquidityQueue.getBTCowed(this.providerId);
        this.ensureBTCOwed(btcOwed);
        this.ensureNotInPendingRemoval();

        // 3. Return the token portion immediately to the user
        const tokenAmount: u256 = this.provider.liquidityProvided;
        this.ensureTokenAmountNotZero(tokenAmount);
        TransferHelper.safeTransfer(this.liquidityQueue.token, Blockchain.tx.sender, tokenAmount);

        // 4. Decrease total reserves
        this.liquidityQueue.updateTotalReserve(tokenAmount, false);
        this.provider.liquidityProvided = u256.Zero;

        // 5. Also reduce the virtual reserves so the ratio is consistent
        //    but do NOT update deltaTokensSell or deltaTokensBuy.
        this.liquidityQueue.virtualTokenReserve = SafeMath.sub(
            this.liquidityQueue.virtualTokenReserve,
            tokenAmount,
        );
        this.liquidityQueue.virtualBTCReserve = SafeMath.sub(
            this.liquidityQueue.virtualBTCReserve,
            btcOwed,
        );

        // 6. Finally, queue them up to receive owed BTC from future inflows
        this.provider.pendingRemoval = true;
        this.liquidityQueue.addToRemovalQueue(this.providerId);

        this.emitLiquidityRemovedEvent(btcOwed, tokenAmount);
    }

    private ensureLiquidityProvider(): void {
        if (!this.provider.isLp) {
            throw new Revert('Not a liquidity provider');
        }
    }

    private ensureNotInitialProvider(): void {
        if (u256.eq(this.providerId, this.liquidityQueue.initialLiquidityProvider)) {
            throw new Revert('Initial provider cannot remove liquidity');
        }
    }

    private ensureBTCOwed(btcOwed: u256): void {
        if (btcOwed.isZero()) {
            throw new Revert('You have no BTC owed. Did you already remove everything?');
        }
    }

    private ensureNotInPendingRemoval(): void {
        if (this.provider.pendingRemoval) {
            throw new Revert('You are already in the removal queue.');
        }
    }

    private ensureTokenAmountNotZero(tokenAmount: u256): void {
        if (tokenAmount.isZero()) {
            throw new Revert('You have no tokens to remove.');
        }
    }

    private emitLiquidityRemovedEvent(btcOwed: u256, tokenAmount: u256): void {
        Blockchain.emit(new LiquidityRemovedEvent(this.providerId, btcOwed, tokenAmount));
    }
}
