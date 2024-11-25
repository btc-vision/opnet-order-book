import { u256 } from 'as-bignum/assembly';
import { Blockchain, SafeMath } from '@btc-vision/btc-runtime/runtime';

export class Quoter {
    public static readonly SCALING_FACTOR: u256 = u256.fromU64(100_000_000);
    public static readonly SCALING_FACTOR_BTC: u256 = u256.fromU64(100_000_000);
    public static readonly DECAY_RATE_PER_BLOCK: u256 = u256.fromU64(100_000_000);

    // Constants a and k as percentages scaled by SCALING_FACTOR
    public get a(): u256 {
        return u256.fromU64(5_000_000); // Represents 5.00%
    }

    public get k(): u256 {
        return u256.fromU64(5_000_000); // Represents 30.00%
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

    public calculatePrice(P0: u256, EWMA_V: u256, EWMA_L: u256): u256 {
        if (EWMA_V.isZero()) {
            return SafeMath.div(P0, Quoter.SCALING_FACTOR);
        }

        const adjustedEWMA_L = u256.gt(EWMA_L, u256.Zero) ? EWMA_L : u256.One;

        // Calculate the ratio using the existing SCALING_FACTOR
        const ratio: u256 = //SafeMath.div(
            SafeMath.div(SafeMath.mul(EWMA_V, Quoter.SCALING_FACTOR), adjustedEWMA_L);
        //Quoter.SCALING_FACTOR_BTC,
        //);

        // Ensure ratio doesn't become zero
        const adjustedRatio = u256.gt(ratio, u256.Zero) ? ratio : u256.One;

        Blockchain.log(`Ratio: ${adjustedRatio}`);

        // Calculate the scaled adjustment
        const scaledAdjustment: u256 = SafeMath.add(
            Quoter.SCALING_FACTOR,
            SafeMath.div(SafeMath.mul(this.k, adjustedRatio), Quoter.SCALING_FACTOR),
        );

        // Calculate the adjusted price
        const adjustedPrice: u256 = SafeMath.div(
            SafeMath.mul(P0, scaledAdjustment),
            Quoter.SCALING_FACTOR,
        );

        Blockchain.log(
            `Price: ${adjustedPrice} - scaledAdjustment: ${scaledAdjustment} (Ratio: ${ratio}, EWMA_V: ${EWMA_V}, EWMA_L: ${EWMA_L})`,
        );

        return SafeMath.div(adjustedPrice, Quoter.SCALING_FACTOR);
    }

    public updateEWMA(currentValue: u256, previousEWMA: u256, blocksElapsed: u256): u256 {
        if (blocksElapsed.isZero()) {
            return previousEWMA;
        }

        const oneMinusAlpha: u256 = SafeMath.sub(Quoter.SCALING_FACTOR, this.a);

        // Compute the decay factor with proper scaling
        const decayFactor: u256 = Quoter.pow(oneMinusAlpha, blocksElapsed);

        // Weighted previous EWMA with scaling
        const weightedPrevEWMA: u256 = SafeMath.div(
            SafeMath.mul(decayFactor, previousEWMA),
            Quoter.SCALING_FACTOR,
        );

        // Weighted current value with scaling
        const weightedCurrentValue: u256 = SafeMath.div(
            SafeMath.mul(SafeMath.sub(Quoter.SCALING_FACTOR, decayFactor), currentValue),
            Quoter.SCALING_FACTOR,
        );

        return SafeMath.add(weightedPrevEWMA, weightedCurrentValue);
    }
}

export const quoter = new Quoter();
