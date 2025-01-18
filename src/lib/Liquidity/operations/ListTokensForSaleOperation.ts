import { BaseOperation } from './BaseOperation';
import { LiquidityQueue } from '../LiquidityQueue';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { getProvider, Provider } from '../../Provider';
import {
    Address,
    Blockchain,
    Revert,
    SafeMath,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { getTotalFeeCollected } from '../../../utils/OrderBookUtils';
import { LiquidityListedEvent } from '../../../events/LiquidityListedEvent';

export class ListTokensForSaleOperation extends BaseOperation {
    private readonly providerId: u256;
    private readonly amountIn: u128;
    private readonly receiver: string;
    private readonly usePriorityQueue: boolean;
    private readonly initialLiquidity: boolean;
    private readonly provider: Provider;
    private readonly oldLiquidity: u128;

    constructor(
        liquidityQueue: LiquidityQueue,
        providerId: u256,
        amountIn: u128,
        receiver: string,
        usePriorityQueue: boolean,
        initialLiquidity: boolean = false,
    ) {
        super(liquidityQueue);

        this.providerId = providerId;
        this.amountIn = amountIn;
        this.receiver = receiver;
        this.usePriorityQueue = usePriorityQueue;
        this.initialLiquidity = initialLiquidity;

        const provider = getProvider(providerId);
        this.provider = provider;
        this.oldLiquidity = provider.liquidity;
    }

    public execute(): void {
        this.ensureNoLiquidityOverflow();
        this.ensureNoActivePositionInPriorityQueue();

        if (!this.initialLiquidity) {
            this.ensurePriceIsNotZero();
            this.ensureInitialProviderAddOnce();
            this.ensureLiquidityNotTooLowInSathosis();
        }

        this.transferToken();
        this.emitLiquidityListedEvent();
    }

    private ensureNoLiquidityOverflow(): void {
        if (!u128.lt(this.oldLiquidity, SafeMath.sub128(u128.Max, this.amountIn))) {
            throw new Revert('Liquidity overflow. Please add a smaller amount.');
        }
    }

    private ensureNoActivePositionInPriorityQueue(): void {
        if (this.provider.isPriority() && !this.usePriorityQueue) {
            throw new Revert(
                'You already have an active position in the priority queue. Please use the priority queue.',
            );
        }
    }

    private ensurePriceIsNotZero(): void {
        const currentPrice: u256 = this.liquidityQueue.quote();
        if (currentPrice.isZero()) {
            throw new Revert('Quote is zero. Please set P0 if you are the owner of the token.');
        }
    }

    private ensureInitialProviderAddOnce(): void {
        if (u256.eq(this.providerId, this.liquidityQueue.initialLiquidityProvider)) {
            throw new Revert(`Initial provider can only add once, if not initialLiquidity.`);
        }
    }

    private ensureLiquidityNotTooLowInSathosis(): void {
        const currentPrice: u256 = this.liquidityQueue.quote();
        const liquidityInSatoshis: u256 = this.liquidityQueue.tokensToSatoshis(
            this.amountIn.toU256(),
            currentPrice,
        );

        if (
            u256.lt(
                liquidityInSatoshis,
                LiquidityQueue.MINIMUM_LIQUIDITY_IN_SAT_VALUE_ADD_LIQUIDITY,
            )
        ) {
            throw new Revert('Liquidity value is too low in satoshis.');
        }
    }

    private ensureEnoughPriorityFees(): void {
        const feesCollected: u64 = getTotalFeeCollected();
        const costPriorityQueue: u64 = this.liquidityQueue.getCostPriorityFee();

        if (feesCollected < costPriorityQueue) {
            throw new Revert('Not enough fees for priority queue.');
        }
    }

    private transferToken(): void {
        // transfer tokens
        const u256AmountIn = this.amountIn.toU256();
        TransferHelper.safeTransferFrom(
            this.liquidityQueue.token,
            Blockchain.tx.sender,
            Blockchain.contractAddress,
            u256AmountIn,
        );

        // net if priority
        const newLiquidityNet: u128 = this.usePriorityQueue
            ? this.liquidityQueue.getTokensAfterTax(this.amountIn)
            : this.amountIn;

        const newTax: u128 = SafeMath.sub128(this.amountIn, newLiquidityNet);

        // handle normal->priority
        let oldTax: u128 = u128.Zero;
        const wasNormal =
            !this.provider.isPriority() && this.provider.isActive() && this.usePriorityQueue;
        if (wasNormal) {
            oldTax = this.liquidityQueue.computePriorityTax(this.oldLiquidity.toU256()).toU128();
            this.provider.setActive(true, true);
            this.liquidityQueue.addToPriorityQueue(this.providerId);
        } else if (!this.provider.isActive()) {
            this.provider.setActive(true, this.usePriorityQueue);
            if (!this.initialLiquidity) {
                if (this.usePriorityQueue) {
                    this.liquidityQueue.addToPriorityQueue(this.providerId);
                } else {
                    this.liquidityQueue.addToStandardQueue(this.providerId);
                }
            }
        }

        // add to provider
        this.provider.liquidity = SafeMath.add128(this.oldLiquidity, this.amountIn);

        this.setProviderReceiver(this.provider);

        // update total reserves
        this.liquidityQueue.updateTotalReserve(u256AmountIn, true);

        // if priority => remove tax
        if (this.usePriorityQueue) {
            this.removeTax(this.provider, oldTax, newTax);
        }

        this.liquidityQueue.setBlockQuote();
    }

    private removeTax(provider: Provider, oldTax: u128, newTax: u128): void {
        this.ensureEnoughPriorityFees();

        const totalTax: u128 = SafeMath.add128(oldTax, newTax);
        if (!totalTax.isZero()) {
            provider.liquidity = SafeMath.sub128(provider.liquidity, totalTax);

            this.liquidityQueue.buyTokens(totalTax.toU256(), u256.Zero);

            this.liquidityQueue.updateTotalReserve(totalTax.toU256(), false);
            // TODO: Motoswap fee collection here
            TransferHelper.safeTransfer(
                this.liquidityQueue.token,
                Address.dead(),
                totalTax.toU256(),
            );
        }
    }

    private setProviderReceiver(provider: Provider): void {
        if (!provider.reserved.isZero() && provider.btcReceiver !== this.receiver) {
            throw new Revert('Cannot change receiver address while reserved.');
        } else if (provider.reserved.isZero()) {
            provider.btcReceiver = this.receiver;
        }
    }

    private emitLiquidityListedEvent(): void {
        const ev = new LiquidityListedEvent(this.provider.liquidity, this.receiver);
        Blockchain.emit(ev);
    }
}
