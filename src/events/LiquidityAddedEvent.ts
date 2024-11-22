import { BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from 'as-bignum/assembly';

@final
export class LiquidityAddedEvent extends NetEvent {
    constructor(tickId: u256, level: u128, amountIn: u256, provider: string) {
        const data: BytesWriter = new BytesWriter(32 + 16 + 32 + 2 + provider.length);
        data.writeU256(tickId);
        data.writeU128(level);
        data.writeU256(amountIn);
        data.writeStringWithLength(provider); // Write provider as string

        super('LiquidityAdded', data);
    }
}
