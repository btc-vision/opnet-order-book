import { u128, u256 } from 'as-bignum/assembly';
import { SafeMath } from '@btc-vision/btc-runtime/runtime';

export class Quoter {
    public static readonly a: u256 = u256.fromU64(30_000_000);
    public static readonly k: u256 = u256.fromU64(5_000_000);

    public static readonly SCALING_FACTOR: u256 = u256.fromU64(100_000_000); // 1 BTC
    public static readonly MIN_EWMA_L: u256 = u256.fromU64(1);
    public static readonly PRICE_CAP: u256 = u128.Max.toU256();
    public static readonly DECAY_RATE_PER_BLOCK: u256 = u256.fromU64(99_900_000);

    public static getScalingFactor(): u256 {
        return Quoter.SCALING_FACTOR;
    }

    public static pow(base: u256, exponent: u256): u256 {
        let result: u256 = Quoter.SCALING_FACTOR;
        let b: u256 = base;
        let e: u256 = exponent;

        while (u256.gt(e, u256.Zero)) {
            if (u256.eq(u256.and(e, u256.One), u256.One)) {
                result = SafeMath.div(SafeMath.mul(result, b), Quoter.SCALING_FACTOR);
            }
            e = u256.shr(e, 1);
            b = SafeMath.div(SafeMath.mul(b, b), Quoter.SCALING_FACTOR);
        }

        return result;
    }

    public calculatePrice(P0: u256, k: u256, EWMA_V: u256, EWMA_L: u256): u256 {
        // Prevent division by zero or extremely small values
        const adjustedEWMA_L = u256.lt(EWMA_L, Quoter.MIN_EWMA_L) ? Quoter.MIN_EWMA_L : EWMA_L;
        const ratio: u256 = SafeMath.div(
            SafeMath.mul(EWMA_V, Quoter.SCALING_FACTOR),
            adjustedEWMA_L,
        );

        const scaledAdjustment: u256 = SafeMath.div(SafeMath.mul(k, ratio), Quoter.SCALING_FACTOR);

        const adjustedPrice: u256 = SafeMath.div(
            SafeMath.mul(P0, SafeMath.add(Quoter.SCALING_FACTOR, scaledAdjustment)),
            Quoter.SCALING_FACTOR,
        );

        return u256.gt(adjustedPrice, Quoter.PRICE_CAP) ? Quoter.PRICE_CAP : adjustedPrice;
    }

    public updateEWMA(
        currentValue: u256,
        previousEWMA: u256,
        alpha: u256,
        blocksElapsed: u256,
    ): u256 {
        if (blocksElapsed.isZero()) {
            return previousEWMA;
        }

        const scalingFactor = Quoter.SCALING_FACTOR;

        const oneMinusAlpha: u256 = SafeMath.sub(scalingFactor, alpha);
        const decayFactor: u256 = Quoter.pow(oneMinusAlpha, blocksElapsed);

        const weightedPrevEWMA: u256 = SafeMath.div(
            SafeMath.mul(decayFactor, previousEWMA),
            scalingFactor,
        );

        const weightedCurrentValue: u256 = SafeMath.div(
            SafeMath.mul(SafeMath.sub(scalingFactor, decayFactor), currentValue),
            scalingFactor,
        );

        return SafeMath.add(weightedPrevEWMA, weightedCurrentValue);
    }
}

export const quoter = new Quoter();
