import { BaseOperation } from './BaseOperation';
import { LiquidityQueue } from '../LiquidityQueue';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { ListTokensForSaleOperation } from './ListTokensForSaleOperation';

export class CreatePoolOperation extends BaseOperation {
    private readonly floorPrice: u256; // Number of token per satoshi
    private readonly providerId: u256;
    private readonly initialLiquidity: u128; // Number of token
    private readonly receiver: string;
    private readonly antiBotEnabledFor: u16;
    private readonly antiBotMaximumTokensPerReservation: u256;
    private readonly maxReservesIn5BlocksPercent: u16;

    constructor(
        liquidityQueue: LiquidityQueue,
        floorPrice: u256,
        providerId: u256,
        initialLiquidity: u128,
        receiver: string,
        antiBotEnabledFor: u16,
        antiBotMaximumTokensPerReservation: u256,
        maxReservesIn5BlocksPercent: u16,
    ) {
        super(liquidityQueue);

        this.floorPrice = floorPrice;
        this.providerId = providerId;
        this.initialLiquidity = initialLiquidity;
        this.receiver = receiver;
        this.antiBotEnabledFor = antiBotEnabledFor;
        this.antiBotMaximumTokensPerReservation = antiBotMaximumTokensPerReservation;
        this.maxReservesIn5BlocksPercent = maxReservesIn5BlocksPercent;
    }

    public execute(): void {
        this.liquidityQueue.initializeInitialLiquidity(
            this.floorPrice,
            this.providerId,
            this.initialLiquidity.toU256(),
            this.maxReservesIn5BlocksPercent,
        );

        // Instead of calling "listLiquidity", we do a direct "listTokensForSale"
        // if we want these tokens to be 'initially queued' for purchase
        const listTokenForSaleOp = new ListTokensForSaleOperation(
            this.liquidityQueue,
            this.providerId,
            this.initialLiquidity,
            this.receiver,
            false,
            true,
        );
        listTokenForSaleOp.execute();

        // If dev wants anti-bot
        if (this.antiBotEnabledFor) {
            this.liquidityQueue.antiBotExpirationBlock =
                Blockchain.block.numberU64 + u64(this.antiBotEnabledFor);
            this.liquidityQueue.maxTokensPerReservation = this.antiBotMaximumTokensPerReservation;
        }
    }
}
