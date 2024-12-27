import { BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';
import { u128 } from '@btc-vision/as-bignum/assembly';

@final
export class LiquidityAddedEvent extends NetEvent {
    constructor(totalLiquidity: u128, provider: string) {
        const data: BytesWriter = new BytesWriter(16 + 2 + provider.length);
        data.writeU128(totalLiquidity);
        data.writeStringWithLength(provider); // Write provider as string

        super('LiquidityAdded', data);
    }
}
