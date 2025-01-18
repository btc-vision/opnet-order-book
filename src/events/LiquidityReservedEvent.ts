import { BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';
import { u128 } from '@btc-vision/as-bignum/assembly';

@final
export class LiquidityReservedEvent extends NetEvent {
    constructor(depositAddress: string, amount: u128) {
        const data: BytesWriter = new BytesWriter(16 + depositAddress.length + 2);
        data.writeStringWithLength(depositAddress);
        data.writeU128(amount);

        super('LiquidityReserved', data);
    }
}
