import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    ADDRESS_BYTE_LENGTH,
    BytesWriter,
    NetEvent,
    U256_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';

@final
export class LiquidityRemovedEvent extends NetEvent {
    constructor(token: Address, amount: u256, remainingLiquidity: u256) {
        const data = new BytesWriter(ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH * 2);
        data.writeAddress(token);
        data.writeU256(amount);
        data.writeU256(remainingLiquidity);

        super('LiquidityRemoved', data);
    }
}
