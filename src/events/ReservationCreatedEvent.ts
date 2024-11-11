import {
    Address,
    ADDRESS_BYTE_LENGTH,
    BytesWriter,
    NetEvent,
} from '@btc-vision/btc-runtime/runtime';
import { u256 } from 'as-bignum/assembly';

@final
export class ReservationCreatedEvent extends NetEvent {
    constructor(reservationId: u256, totalReserved: u256, expectedAmountOut: u256, buyer: Address) {
        const data: BytesWriter = new BytesWriter(32 + 32 + 32 + ADDRESS_BYTE_LENGTH);
        data.writeU256(reservationId);
        data.writeU256(totalReserved);
        data.writeU256(expectedAmountOut);
        data.writeAddress(buyer);

        super('ReservationCreated', data);
    }
}
