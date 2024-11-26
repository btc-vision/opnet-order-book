import { BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';
import { u256 } from 'as-bignum/assembly';

@final
export class LiquidityReserved extends NetEvent {
    constructor(amount: u256) {
        const data: BytesWriter = new BytesWriter(32);
        data.writeU256(amount);

        super('LiquidityReserved', data);
    }
}
