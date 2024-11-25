import { u128, u256 } from 'as-bignum/assembly';
import { Blockchain, SafeMath } from '@btc-vision/btc-runtime/runtime';

export class Quoter {
    public static readonly SCALING_FACTOR: u256 = u256.fromU64(1000000000000000000); //u256.from(scale);

    public static readonly MIN_EWMA_L: u256 = u256.One;
    public static readonly PRICE_CAP: u256 = u128.Max.toU256();
    public static readonly DECAY_RATE_PER_BLOCK: u256 = Quoter.SCALING_FACTOR;

    public get a(): u256 {
        return SafeMath.div(
            SafeMath.mul(u256.fromU64(5), Quoter.SCALING_FACTOR),
            u256.fromU64(100),
        );
    }

    public get k(): u256 {
        return SafeMath.div(
            SafeMath.mul(u256.fromU64(30), Quoter.SCALING_FACTOR),
            u256.fromU64(100),
        );
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
        const adjustedEWMA_L = u256.lt(EWMA_L, Quoter.MIN_EWMA_L) ? Quoter.MIN_EWMA_L : EWMA_L;

        // Compute ratio using the common scaling factor
        const ratio: u256 = SafeMath.div(
            SafeMath.mul(EWMA_V, Quoter.SCALING_FACTOR),
            adjustedEWMA_L,
        );

        // Now that 'k' is scaled, adjust the calculation accordingly
        const scaledAdjustment: u256 = SafeMath.div(
            SafeMath.mul(this.k, ratio),
            Quoter.SCALING_FACTOR,
        );

        // Compute adjusted price
        const adjustedPrice: u256 = SafeMath.div(
            SafeMath.mul(P0, SafeMath.add(Quoter.SCALING_FACTOR, scaledAdjustment)),
            Quoter.SCALING_FACTOR,
        );

        // Compute inverse price
        const priceInverse = SafeMath.div(
            SafeMath.mul(Quoter.SCALING_FACTOR, Quoter.SCALING_FACTOR),
            adjustedPrice,
        );

        Blockchain.log(
            `Adjusted price: ${adjustedPrice} - Inverse price: ${priceInverse} (EWMA_V: ${EWMA_V}, EWMA_L: ${EWMA_L})`,
        );

        return priceInverse;
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

        const oneMinusAlpha: u256 = SafeMath.sub(Quoter.SCALING_FACTOR, alpha);
        const decayFactor: u256 = Quoter.pow(oneMinusAlpha, blocksElapsed);

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
