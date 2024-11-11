import { u256 } from 'as-bignum/assembly';

export class TickFilledDetail {
    constructor(
        public readonly tickId: u256,
        public readonly amount: u256,
        public readonly level: u256,
        public readonly remainingLiquidity: u256,
    ) {}
}
