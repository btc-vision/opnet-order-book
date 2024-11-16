import { BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';
import { u256 } from 'as-bignum/assembly';

@final
export class LiquidityReserved extends NetEvent {
    constructor(tickId: u256, level: u256, amount: u256) {
        const data: BytesWriter = new BytesWriter(96);
        data.writeU256(tickId);
        data.writeU256(level);
        data.writeU256(amount);

        super('LiquidityReserved', data);
    }
}
