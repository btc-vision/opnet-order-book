import {
    Address,
    ADDRESS_BYTE_LENGTH,
    BytesWriter,
    NetEvent,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from 'as-bignum/assembly';

@final
export class LiquidityRemovedEvent extends NetEvent {
    constructor(token: Address, amount: u256, tickId: u256, level: u128, remainingLiquidity: u256) {
        const data = new BytesWriter(ADDRESS_BYTE_LENGTH + 32 + 32 + 16 + 32);
        data.writeAddress(token);
        data.writeU256(amount);
        data.writeU256(tickId);
        data.writeU128(level);
        data.writeU256(remainingLiquidity);

        super('LiquidityRemoved', data);
    }
}
