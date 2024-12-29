import { BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

@final
export class LiquidityAddedEvent extends NetEvent {
    constructor(
        totalTokensContributed: u256,
        virtualTokenExchanged: u256,
        totalSatoshisSpent: u256,
    ) {
        const data: BytesWriter = new BytesWriter(32 + 32 + 32);
        data.writeU256(totalTokensContributed);
        data.writeU256(virtualTokenExchanged);
        data.writeU256(totalSatoshisSpent);

        super('LiquidityAdded', data);
    }
}
