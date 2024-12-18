import { u128 } from '@btc-vision/as-bignum/assembly';
import { BytesWriter, NetEvent, U128_BYTE_LENGTH } from '@btc-vision/btc-runtime/runtime';

@final
export class LiquidityReserved extends NetEvent {
    constructor(depositAddress: string, amount: u128) {
        const data: BytesWriter = new BytesWriter(U128_BYTE_LENGTH + depositAddress.length + 2);
        data.writeStringWithLength(depositAddress);
        data.writeU128(amount);

        super('LiquidityReserved', data);
    }
}
