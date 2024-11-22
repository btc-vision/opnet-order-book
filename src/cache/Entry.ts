import { u256 } from 'as-bignum/assembly';
import { Provider } from '../lib/Provider';

/**
 * @class Entry
 * @description Represents a key-provider pair.
 */
export class Entry {
    constructor(
        public key: u256,
        public provider: Provider,
    ) {}
}
