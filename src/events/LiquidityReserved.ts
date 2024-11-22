import { BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from 'as-bignum/assembly';

@final
export class LiquidityReserved extends NetEvent {
    constructor(tickId: u256, level: u128, amount: u256) {
        const data: BytesWriter = new BytesWriter(32 + 32 + 16);
        data.writeU256(tickId);
        data.writeU128(level);
        data.writeU256(amount);

        super('LiquidityReserved', data);
    }
}
