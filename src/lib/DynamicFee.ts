import { u256 } from '@btc-vision/as-bignum/assembly';
import { SafeMath, StoredU256 } from '@btc-vision/btc-runtime/runtime';
import { VOLATILITY_POINTER } from './StoredPointers';

const REF_TRADE_SIZE: u256 = u256.fromU64(1_000_000);

export class DynamicFee {
    public baseFeeBP: u64; // 30 => 0.30%
    public minFeeBP: u64; // 10 => 0.10%
    public maxFeeBP: u64; // 200 => 2.00%

    public alpha: u64; // used for ln(tradeSize/reference)
    public beta: u64; // used for volatility
    public gamma: u64; // used for utilization

    // store volatility in scaled form
    private readonly _volatility: StoredU256;

    constructor(tokenId: u256) {
        // defaults - you can adjust or read from storage
        this.baseFeeBP = 20; // 0.20%
        this.minFeeBP = 10; // 0.10%
        this.maxFeeBP = 300; // 3.00%

        this.alpha = 20; // bigger => stronger log effect
        this.beta = 25;
        this.gamma = 1;

        this._volatility = new StoredU256(VOLATILITY_POINTER, tokenId, u256.Zero);
    }

    public get volatility(): u256 {
        return this._volatility.value;
    }

    public set volatility(vol: u256) {
        this._volatility.value = vol;
    }

    /**
     * The "log-based" dynamic fee formula:
     * Fee% = clamp(
     *   baseFeeBP
     *   + alpha * ln( tradeSize / REF_TRADE_SIZE )
     *   + beta * volatility
     *   + gamma * utilization,
     *   minFeeBP,
     *   maxFeeBP
     * )
     *
     * We'll do everything in integer BPS, so final is e.g. 30 => 0.30%.
     *
     * Because SafeMath.log256(...) returns a scaled ln (1e6 => ln * 1,000,000),
     * we must decode that carefully to keep it consistent with alpha.
     */
    public getDynamicFeeBP(tradeSize: u256, utilizationRatio: u256): u64 {
        // 1) Start with base
        let feeBP = this.baseFeeBP;

        // 2) ratio = tradeSize / REF_TRADE_SIZE
        let ratio = SafeMath.div(tradeSize, REF_TRADE_SIZE);
        if (ratio.isZero()) {
            // if tradeSize < REF_TRADE_SIZE, ratio = 0 => ln(0) => negative
            // we might just let feeBP = baseFee here, or do fallback
            ratio = u256.One; // fallback => ln(1)=0 => no effect
        }

        // 3) lnVal: we get a scaled ln => logScaled = lnVal * 1e6 (as from log256)
        const logScaled: u256 = SafeMath.approxLog(ratio);

        // interpret logScaled in your alpha factor
        // if alpha = 100, we do => alpha * (logScaled / 1e6)
        // We'll keep everything in i64 or 64 for the final addition
        const alphaComponent: u64 = (this.alpha * logScaled.toU64()) / 1_000_000;

        feeBP += alphaComponent;

        // 4) Add beta * volatility
        // Suppose volatility is stored in e.g. 0..1e4 scale
        // Then if volatility=500 => that's "0.05" => multiply by beta => 25 => 1250 => scale out
        const volBP: u64 = this.volatility.toU64();
        feeBP += (this.beta * volBP) / 10000;

        // 5) Add gamma * utilization
        // If utilization is 0..100 scale, then gamma * utilization => up to some hundreds of BPS
        const utilBP: u64 = utilizationRatio.toU64();
        feeBP += this.gamma * utilBP;

        // 6) clamp
        if (feeBP < this.minFeeBP) {
            feeBP = this.minFeeBP;
        }

        if (feeBP > this.maxFeeBP) {
            feeBP = this.maxFeeBP;
        }

        return feeBP;
    }

    /**
     * Convert basis points to an actual token or satoshi fee
     * e.g. fee = (amount * feeBP) / 10000
     */
    public computeFeeAmount(amount: u256, feeBP: u64): u256 {
        return SafeMath.div(SafeMath.mul(amount, u256.fromU64(feeBP)), u256.fromU64(10000));
    }
}
