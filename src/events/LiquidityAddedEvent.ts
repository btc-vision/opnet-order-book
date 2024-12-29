import { BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

@final
export class LiquidityAddedEvent extends NetEvent {
    constructor(T: u256, B: u256) {
        const data: BytesWriter = new BytesWriter(32 + 32);
        data.writeU256(T);
        data.writeU256(B);

        super('LiquidityAdded', data);
    }
}
