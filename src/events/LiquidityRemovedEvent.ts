import { BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

@final
export class LiquidityRemovedEvent extends NetEvent {
    constructor(providerId: u256, btcOwed: u256, tokenAmount: u256) {
        const data: BytesWriter = new BytesWriter(32 + 32 + 32);
        data.writeU256(providerId);
        data.writeU256(btcOwed);
        data.writeU256(tokenAmount);

        super('LiquidityRemoved', data);
    }
}
