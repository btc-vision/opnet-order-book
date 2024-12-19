import { u128 } from '@btc-vision/as-bignum/assembly';
import { BytesWriter, NetEvent, U128_BYTE_LENGTH } from '@btc-vision/btc-runtime/runtime';

@final
export class LiquidityAddedEvent extends NetEvent {
    constructor(totalLiquidity: u128, provider: string) {
        const data: BytesWriter = new BytesWriter(U128_BYTE_LENGTH + 2 + provider.length);
        data.writeU128(totalLiquidity);
        data.writeStringWithLength(provider); // Write provider as string

        super('LiquidityAdded', data);
    }
}
