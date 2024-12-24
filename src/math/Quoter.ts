import { u256 } from '@btc-vision/as-bignum/assembly';
import { Blockchain, SafeMath } from '@btc-vision/btc-runtime/runtime';

export class Quoter {
    public static readonly SCALING_FACTOR: u256 = u256.fromU64(100_000_000);
    public static readonly BLOCK_RATE: u256 = u256.fromU64(4);

    // Weighted smoothing params
    public get a(): u256 {
        return u256.fromU64(12_000_000);
    }

    // "k" controls how strongly netFlow changes price
    public get k(): u256 {
        return u256.fromU64(80_000_000);
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
     *   This is your same EWMA decay function for any data series
     *   (buy volume, sell volume, or liquidity).
     *   Over time, old values shrink according to (1 - alpha).
     *   If blocksElapsed is large, we do extra decay.
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
        // i.e. never exceed "1.0"
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
     *   and liquidity L.
     *   If netFlow > 0 => high buy pressure => fewer tokens/sat.
     *   If netFlow < 0 => high sells => more tokens/sat.
     *
     *   finalPrice = P0 / (1 + k * netFlow/ L)
     *
     *   All done in integer math with SCALING_FACTOR.
     *
     * @param {u256} P0   Reference or baseline “tokens per sat”
     * @param {u256} EWMA_B  Smoothed buy volume
     * @param {u256} EWMA_S  Smoothed sell volume
     * @param {u256} EWMA_L  Smoothed liquidity/reserve
     */
    public calculatePrice(P0: u256, EWMA_B: u256, EWMA_S: u256, EWMA_L: u256): u256 {
        if (EWMA_B.isZero()) {
            return SafeMath.div(P0, Quoter.SCALING_FACTOR);
        }

        // 1) netFlow = B - S
        let netFlow: u256 = u256.Zero;
        // If S > B in a naive sub, you'd get underflow in u256,
        // so do a conditional:
        if (u256.gt(EWMA_B, EWMA_S)) {
            netFlow = SafeMath.sub(EWMA_B, EWMA_S);
        } else {
            // netFlow remains 0 if sells exceed buys
            // (We’ll handle negative effect below by flipping logic.)
            // Or do netFlow = -(S - B) in a signed sense. We'll handle that.
        }

        // 2) Adjusted L to avoid div by zero
        const L: u256 = u256.gt(EWMA_L, u256.Zero) ? EWMA_L : u256.One;

        // 3) ratio = netFlow / L, scaled
        //    ratio is in [0, huge], but we want a "signed" notion
        //    if netFlow < 0 => "price goes up"
        //    We'll do a split path below for "B > S" vs "S >= B."
        const ratioScaled: u256 = SafeMath.div(SafeMath.mul(netFlow, Quoter.SCALING_FACTOR), L);

        // If netFlow == 0 => ratioScaled = 0 => price = P0 * big factor => token cheaper
        // We'll handle that in "sell side" path.

        ///////////////////////////////////////
        // BUY SIDE: netFlow > 0
        ///////////////////////////////////////
        let rawPrice: u256;
        if (u256.gt(EWMA_B, EWMA_S)) {
            // finalPrice = P0 / (1 + k * ratio)
            // We'll do it carefully in integer form:

            // factor = k * ratioScaled / SCALING_FACTOR
            const factor = SafeMath.div(SafeMath.mul(this.k, ratioScaled), Quoter.SCALING_FACTOR);

            // denominator = SCALING_FACTOR + factor
            const denominator = SafeMath.add(Quoter.SCALING_FACTOR, factor);

            // rawPrice = (P0 * SCALING_FACTOR) / denominator
            // Because we want P0 / (1 + x) in scaled integer math:
            rawPrice = SafeMath.div(SafeMath.mul(P0, Quoter.SCALING_FACTOR), denominator);

            // clamp to 1 if extremely small
            if (u256.lt(rawPrice, u256.One)) {
                rawPrice = u256.One;
            }
        } else {
            ///////////////////////////////////////
            // SELL SIDE: netFlow <= 0 (S >= B)
            ///////////////////////////////////////
            // In that case, we want "tokens per sat" to go up
            // if sells exceed buys. The simplest:
            // finalPrice = P0 * (1 + k * ratioSells)
            // where ratioSells = (S-B) / L
            // We'll define ratioSells analogously:

            const sellFlow = SafeMath.sub(EWMA_S, EWMA_B); // guaranteed >= 0
            const ratioScaledSells: u256 = SafeMath.div(
                SafeMath.mul(sellFlow, Quoter.SCALING_FACTOR),
                L,
            );

            // factor = k * ratioScaledSells / SCALING_FACTOR
            const factorSells = SafeMath.div(
                SafeMath.mul(this.k, ratioScaledSells),
                Quoter.SCALING_FACTOR,
            );

            // scaledFactor = SCALING_FACTOR + factorSells
            const scaledFactor = SafeMath.add(Quoter.SCALING_FACTOR, factorSells);

            // rawPrice = (P0 * scaledFactor) / SCALING_FACTOR
            // Because we want P0*(1 + something).
            rawPrice = SafeMath.div(SafeMath.mul(P0, scaledFactor), Quoter.SCALING_FACTOR);

            // Avoid overflow if factor is huge.
            // Also clamp to at least 1
            if (u256.lt(rawPrice, u256.One)) {
                rawPrice = u256.One;
            }
        }

        return SafeMath.div(rawPrice, Quoter.SCALING_FACTOR);
    }
}

export const quoter = new Quoter();
