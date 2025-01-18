import { LiquidityQueue } from '../LiquidityQueue';

export class BaseOperation {
    protected liquidityQueue: LiquidityQueue;

    constructor(liquidityQueue: LiquidityQueue) {
        this.liquidityQueue = liquidityQueue;
    }

    public execute(): void {
    }
}