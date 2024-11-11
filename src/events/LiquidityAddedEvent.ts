import { BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';
import { u256 } from 'as-bignum/assembly';

@final
export class LiquidityAddedEvent extends NetEvent {
    constructor(
        tickId: u256,
        level: u256,
        liquidityAmount: u256,
        amountOut: u256,
        provider: string,
    ) {
        const data: BytesWriter = new BytesWriter(32 + 32 + 32 + 32 + 2 + provider.length);
        data.writeU256(tickId);
        data.writeU256(level);
        data.writeU256(liquidityAmount);
        data.writeU256(amountOut);
        data.writeStringWithLength(provider); // Write provider as string

        super('LiquidityAdded', data);
    }
}
