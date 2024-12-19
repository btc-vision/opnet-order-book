import { u256 } from '@btc-vision/as-bignum/assembly';
import { BytesWriter, NetEvent, U256_BYTE_LENGTH } from '@btc-vision/btc-runtime/runtime';

@final
export class ReservationCreatedEvent extends NetEvent {
    constructor(expectedAmountOut: u256, totalSatoshis: u256) {
        const data: BytesWriter = new BytesWriter(U256_BYTE_LENGTH * 2);
        data.writeU256(expectedAmountOut);
        data.writeU256(totalSatoshis);

        super('ReservationCreated', data);
    }
}
