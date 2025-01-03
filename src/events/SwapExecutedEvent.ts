import {
    Address,
    ADDRESS_BYTE_LENGTH,
    BytesWriter,
    NetEvent,
} from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

@final
export class SwapExecutedEvent extends NetEvent {
    constructor(buyer: Address, amountIn: u256, amountOut: u256) {
        const data: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH + 32 + 32);

        data.writeAddress(buyer);
        data.writeU256(amountIn);
        data.writeU256(amountOut);

        super('SwapExecuted', data);
    }
}
