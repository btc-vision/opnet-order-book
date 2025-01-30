import { LiquidityQueue2 } from '../LiquidityQueue2';

export class BaseOperation2 {
    protected liquidityQueue: LiquidityQueue2;

    constructor(liquidityQueue: LiquidityQueue2) {
        this.liquidityQueue = liquidityQueue;
    }

    public execute(): void {}
}
