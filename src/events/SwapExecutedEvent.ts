import {
    Address,
    ADDRESS_BYTE_LENGTH,
    BytesWriter,
    NetEvent,
} from '@btc-vision/btc-runtime/runtime';
import { u256 } from 'as-bignum/assembly';

@final
export class SwapExecutedEvent extends NetEvent {
    constructor(buyer: Address, amountIn: u256, amountOut: u256, ticksFilled: u256[]) {
        const data: BytesWriter = new BytesWriter(
            ADDRESS_BYTE_LENGTH + 32 + 32 + 4 + ticksFilled.length * 32,
        );
        data.writeAddress(buyer);
        data.writeU256(amountIn);
        data.writeU256(amountOut);
        data.writeTuple(ticksFilled);

        super('SwapExecuted', data);
    }
}
