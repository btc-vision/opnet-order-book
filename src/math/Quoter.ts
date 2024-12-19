import { u256 } from '@btc-vision/as-bignum/assembly';
import { SafeMath } from '@btc-vision/btc-runtime/runtime';

export class Quoter {
    public static readonly SCALING_FACTOR: u256 = u256.fromU64(100_000_000);
    public static readonly BLOCK_RATE: u256 = u256.fromU64(4);

    // Constants a and k as percentages scaled by SCALING_FACTOR
    public get a(): u256 {
        return u256.fromU64(12_000_000);
    }

    public get k(): u256 {
        return u256.fromU64(80_000_000);
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
        const ratio: u256 = SafeMath.div(
            SafeMath.mul(EWMA_V, Quoter.SCALING_FACTOR),
            adjustedEWMA_L,
        );

        // Ensure ratio doesn't become zero
        const adjustedRatio = u256.gt(ratio, u256.Zero) ? ratio : u256.One;
        const factor = SafeMath.div(SafeMath.mul(this.k, adjustedRatio), Quoter.SCALING_FACTOR);

        let scaledAdjustment: u256;
        if (u256.gt(factor, Quoter.SCALING_FACTOR)) {
            // TODO: Handle this case correctly. This is a temporary fix.
            const mod = SafeMath.mod(factor, Quoter.SCALING_FACTOR);
            scaledAdjustment = SafeMath.sub(Quoter.SCALING_FACTOR, mod); //u256.fromU64(30_000_000));
        } else {
            scaledAdjustment = SafeMath.sub(Quoter.SCALING_FACTOR, factor);
        }

        // Calculate the adjusted price
        return SafeMath.div(
            SafeMath.div(SafeMath.mul(P0, scaledAdjustment), Quoter.SCALING_FACTOR),
            Quoter.SCALING_FACTOR,
        );
    }

    public updateEWMA(currentValue: u256, previousEWMA: u256, blocksElapsed: u256): u256 {
        if (blocksElapsed.isZero()) {
            return previousEWMA;
        }

        const oneMinusAlpha: u256 = SafeMath.sub(Quoter.SCALING_FACTOR, this.a);
        const b: u256 = blocksElapsed.isZero()
            ? blocksElapsed
            : SafeMath.add(SafeMath.div(blocksElapsed, Quoter.BLOCK_RATE), u256.One);

        const decayFactor: u256 = SafeMath.min(Quoter.pow(oneMinusAlpha, b), Quoter.SCALING_FACTOR);
        const weightedPrevEWMA: u256 = SafeMath.div(
            SafeMath.mul(decayFactor, previousEWMA),
            Quoter.SCALING_FACTOR,
        );

        const weightedCurrentValue: u256 = SafeMath.div(
            SafeMath.mul(SafeMath.sub(Quoter.SCALING_FACTOR, decayFactor), currentValue),
            Quoter.SCALING_FACTOR,
        );

        return SafeMath.add(weightedPrevEWMA, weightedCurrentValue);
    }
}

export const quoter = new Quoter();
