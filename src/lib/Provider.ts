import { u256 } from 'as-bignum/assembly';
import { bytes32, BytesWriter, StoredU256 } from '@btc-vision/btc-runtime/runtime';
import { AdvancedStoredString } from '../stored/AdvancedStoredString';
import {
    LIQUIDITY_PROVIDER_AVAILABLE,
    LIQUIDITY_PROVIDER_NEXT,
    LIQUIDITY_PROVIDER_PREVIOUS,
    LIQUIDITY_PROVIDER_RESERVED,
    PROVIDER_ADDRESS_POINTER,
} from './StoredPointers';
import { sha256 } from '../../../btc-runtime/runtime/env/global';

export class Provider {
    public providerId: u256;

    public readonly amount: StoredU256;
    public readonly reservedAmount: StoredU256;

    public readonly nextProviderId: StoredU256;
    public readonly previousProviderId: StoredU256;

    public readonly subPointer: u256;

    private readonly _btcReceiver: AdvancedStoredString;

    constructor(providerId: u256, tickId: u256) {
        this.providerId = providerId;

        this._btcReceiver = new AdvancedStoredString(PROVIDER_ADDRESS_POINTER, providerId);

        const subPointer: u256 = Provider.getSubPointer(tickId, providerId);
        this.subPointer = subPointer;

        this.amount = new StoredU256(LIQUIDITY_PROVIDER_AVAILABLE, subPointer, u256.Zero);
        this.reservedAmount = new StoredU256(LIQUIDITY_PROVIDER_RESERVED, subPointer, u256.Zero);
        this.nextProviderId = new StoredU256(LIQUIDITY_PROVIDER_NEXT, subPointer, u256.Zero);
        this.previousProviderId = new StoredU256(
            LIQUIDITY_PROVIDER_PREVIOUS,
            subPointer,
            u256.Zero,
        );
    }

    public get btcReceiver(): string {
        return this._btcReceiver.value;
    }

    public set btcReceiver(value: string) {
        this._btcReceiver.value = value;
    }

    private static getSubPointer(tickId: u256, providerId: u256): u256 {
        // Generate a unique storage pointer based on tickId and providerId
        const writer = new BytesWriter(64);
        writer.writeU256(tickId);
        writer.writeU256(providerId);

        return bytes32(sha256(writer.getBuffer()));
    }
}
