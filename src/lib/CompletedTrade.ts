import { u256 } from '@btc-vision/as-bignum/assembly';

export class CompletedTrade {
    constructor(public readonly totalTokensPurchased: u256, public readonly totalSatoshisSpent: u256) {
    }
}
