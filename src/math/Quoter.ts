import { u256 } from '@btc-vision/as-bignum/assembly';
import { SafeMath } from '@btc-vision/btc-runtime/runtime';

export class Quoter {
    public static readonly SCALING_FACTOR: u256 = u256.fromU64(100_000_000);
    public static readonly BLOCK_RATE: u256 = u256.fromU64(4);

    // 1) Make alpha ~0.30 instead of ~0.12 (was 12_000_000 => now 30_000_000).
    //    This means new data has ~30% weight each block interval (or aggregated intervals).
    public get a(): u256 {
        // ~0.30 in scaled integer => 30,000,000
        return u256.fromU64(30_000_000);
    }

    // 2) Make k bigger (e.g. 150_000_000 => 1.50 in decimal),
    //    so netFlow changes cause bigger price swings.
    public get k(): u256 {
        // ~1.50 in scaled integer => 150,000,000
        return u256.fromU64(150_000_000);
    }

    /**
     * Helper exponent function
     */
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

    /**
     * @function updateEWMA
     * @description
     *   Over time, old values shrink according to (1 - alpha).
     *   Larger alpha => faster reaction to new data.
     */
    public updateEWMA(currentValue: u256, previousEWMA: u256, blocksElapsed: u256): u256 {
        if (blocksElapsed.isZero()) {
            return previousEWMA;
        }

        // oneMinusAlpha = SCALING_FACTOR - a
        const oneMinusAlpha: u256 = SafeMath.sub(Quoter.SCALING_FACTOR, this.a);

        // b = (blocksElapsed / BLOCK_RATE) + 1
        const b: u256 = SafeMath.add(SafeMath.div(blocksElapsed, Quoter.BLOCK_RATE), u256.One);

        // decayFactor = min(pow(1 - alpha, b), SCALING_FACTOR)
        const decayFactor: u256 = SafeMath.min(Quoter.pow(oneMinusAlpha, b), Quoter.SCALING_FACTOR);

        // Weighted old
        const weightedPrevEWMA: u256 = SafeMath.div(
            SafeMath.mul(decayFactor, previousEWMA),
            Quoter.SCALING_FACTOR,
        );

        // Weighted new
        const weightedCurrent: u256 = SafeMath.div(
            SafeMath.mul(SafeMath.sub(Quoter.SCALING_FACTOR, decayFactor), currentValue),
            Quoter.SCALING_FACTOR,
        );

        return SafeMath.add(weightedPrevEWMA, weightedCurrent);
    }

    /**
     * @function calculatePrice
     * @description
     *   "token per sat" formula that depends on netFlow = (B - S)
     *   and liquidity L. If netFlow > 0 => fewer tokens/sat (more expensive).
     *   If netFlow < 0 => more tokens/sat (cheaper).
     *
     *   finalPrice =
     *      if (B > S):   P0 / (1 + k * (B-S)/L)
     *      else:         P0 * (1 + k * (S-B)/L)
     *
     *   We do integer math with SCALING_FACTOR.
     */
    public calculatePrice(P0: u256, EWMA_B: u256, EWMA_S: u256, EWMA_L: u256): u256 {
        // If no sell volume, fallback to a minimal price:
        if (EWMA_S.isZero()) {
            return SafeMath.div(P0, Quoter.SCALING_FACTOR);
        }

        // netFlow = B - S
        let netFlow: u256 = u256.Zero;
        if (u256.gt(EWMA_B, EWMA_S)) {
            netFlow = SafeMath.sub(EWMA_B, EWMA_S);
        }
        // else netFlow = 0 in u256 => we handle negative side separately.

        // Avoid divide-by-zero for L
        const L: u256 = u256.gt(EWMA_L, u256.Zero) ? EWMA_L : u256.One;

        let rawPrice: u256;

        // (B > S) => price goes down
        if (u256.gt(EWMA_B, EWMA_S)) {
            // ratio = (k * netFlow / L)
            const ratio = SafeMath.div(SafeMath.mul(this.k, netFlow), L);

            // denominator = SCALING_FACTOR + ratio
            const denominator = SafeMath.add(Quoter.SCALING_FACTOR, ratio);

            // rawPrice = (P0 * SCALING_FACTOR) / denominator
            rawPrice = SafeMath.div(SafeMath.mul(P0, Quoter.SCALING_FACTOR), denominator);

            if (u256.lt(rawPrice, u256.One)) {
                rawPrice = u256.One;
            }
        } else {
            // (S >= B) => price goes up (more tokens/sat)
            const sellFlow = SafeMath.sub(EWMA_S, EWMA_B);
            const ratioSells = SafeMath.div(SafeMath.mul(this.k, sellFlow), L);

            const scaledFactor = SafeMath.add(Quoter.SCALING_FACTOR, ratioSells);

            // rawPrice = (P0 * scaledFactor) / SCALING_FACTOR
            rawPrice = SafeMath.div(SafeMath.mul(P0, scaledFactor), Quoter.SCALING_FACTOR);

            if (u256.lt(rawPrice, u256.One)) {
                rawPrice = u256.One;
            }
        }

        // Return tokens/sat, dividing out one SCALING_FACTOR
        // so final is "token per sat" in scaled units
        return SafeMath.div(rawPrice, Quoter.SCALING_FACTOR);
    }
}

export const quoter = new Quoter();
