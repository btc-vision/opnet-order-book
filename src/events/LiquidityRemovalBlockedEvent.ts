import { BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';
import { u256 } from 'as-bignum/assembly';

@final
export class LiquidityRemovalBlockedEvent extends NetEvent {
    constructor(tickId: u256) {
        const data = new BytesWriter(32);
        data.writeU256(tickId);

        super('LiquidityRemovalBlocked', data);
    }
}
