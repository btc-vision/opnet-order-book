import { BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from 'as-bignum/assembly';

@final
export class TickUpdatedEvent extends NetEvent {
    constructor(tickId: u256, level: u128, remainingLiquidity: u256, acquiredAmount: u256) {
        const data: BytesWriter = new BytesWriter(32 + 16 + 32 + 32);
        data.writeU256(tickId);
        data.writeU128(level);
        data.writeU256(remainingLiquidity);
        data.writeU256(acquiredAmount);

        super('TickUpdated', data);
    }
}
