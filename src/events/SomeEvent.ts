import {
    Address,
    ADDRESS_BYTE_LENGTH,
    BytesWriter,
    NetEvent,
} from '@btc-vision/btc-runtime/runtime';
import { u256 } from 'as-bignum/assembly';

@final
export class SomeEvent extends NetEvent {
    constructor(rndValue: u256, rndAddress: Address) {
        const data: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH + 32);
        data.writeU256(rndValue);
        data.writeAddress(rndAddress);

        super('SomeEvent', data);
    }
}
