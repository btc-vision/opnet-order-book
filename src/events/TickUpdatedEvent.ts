import { BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';
import { u256 } from 'as-bignum/assembly';

@final
export class TickUpdatedEvent extends NetEvent {
    constructor(tickId: u256, level: u256, liquidityAmount: u256, acquiredAmount: u256) {
        const data: BytesWriter = new BytesWriter(32 + 32 + 32 + 32);
        data.writeU256(tickId);
        data.writeU256(level);
        data.writeU256(liquidityAmount);
        data.writeU256(acquiredAmount);

        super('TickUpdated', data);
    }
}
