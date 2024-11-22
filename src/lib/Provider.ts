import { u128, u256 } from 'as-bignum/assembly';
import {
    bytes32,
    BytesWriter,
    Potential,
    StoredU128Array,
    StoredU256,
} from '@btc-vision/btc-runtime/runtime';
import { AdvancedStoredString } from '../stored/AdvancedStoredString';
import {
    LIQUIDITY_PROVIDER_AVAILABLE,
    LIQUIDITY_PROVIDER_NEXT,
    LIQUIDITY_PROVIDER_PREVIOUS,
    PROVIDER_ADDRESS_POINTER,
} from './StoredPointers';
import { sha256 } from '@btc-vision/btc-runtime/runtime/env/global';
import { Entry } from '../cache/Entry';
import { findProvider, insertProvider } from '../cache/ProviderCache';

export class Provider {
    public providerId: u256;

    public readonly nextProviderId: StoredU256;
    public readonly previousProviderId: StoredU256;

    public readonly subPointer: u256;

    private providerAmountArray: StoredU128Array;

    constructor(providerId: u256, subPointer: u256) {
        this.providerId = providerId;
        this.subPointer = subPointer;

        this.providerAmountArray = new StoredU128Array(
            LIQUIDITY_PROVIDER_AVAILABLE,
            subPointer,
            u256.Zero,
        );

        this.nextProviderId = new StoredU256(LIQUIDITY_PROVIDER_NEXT, subPointer, u256.Zero);
        this.previousProviderId = new StoredU256(
            LIQUIDITY_PROVIDER_PREVIOUS,
            subPointer,
            u256.Zero,
        );
    }

    public get amount(): u128 {
        return this.providerAmountArray.get(0);
    }

    public set amount(value: u128) {
        this.providerAmountArray.set(0, value);
    }

    public get reservedAmount(): u128 {
        return this.providerAmountArray.get(1);
    }

    public set reservedAmount(value: u128) {
        this.providerAmountArray.set(1, value);
    }

    private _btcReceiver: Potential<AdvancedStoredString> = null;

    public get btcReceiver(): string {
        return this.loaderReceiver.value;
    }

    public set btcReceiver(value: string) {
        this.loaderReceiver.value = value;
    }

    private get loaderReceiver(): AdvancedStoredString {
        if (this._btcReceiver === null) {
            const loader = new AdvancedStoredString(PROVIDER_ADDRESS_POINTER, this.providerId);
            this._btcReceiver = loader;

            return loader;
        }

        return this._btcReceiver as AdvancedStoredString;
    }

    public static getSubPointer(tickId: u256, providerId: u256): u256 {
        // Generate a unique storage pointer based on tickId and providerId
        const writer = new BytesWriter(64);
        writer.writeU256(tickId);
        writer.writeU256(providerId);

        return bytes32(sha256(writer.getBuffer()));
    }

    public save(): void {
        this.providerAmountArray.save();
    }
}

/**
 * @function getProvider
 * @description Retrieves a Provider using the u256 key. Creates and caches a new Provider if not found.
 * @param {u256} providerId - The provider's u256 identifier.
 * @param {u256} tickId - The tick's u256 identifier.
 * @returns {Provider} - The retrieved or newly created Provider.
 */
export function getProvider(providerId: u256, tickId: u256): Provider {
    const subPointer: u256 = Provider.getSubPointer(tickId, providerId);
    const existingProvider = findProvider(subPointer);
    if (existingProvider) {
        return existingProvider;
    }

    const newProvider = new Provider(providerId, subPointer);

    // Insert the new Provider into the sorted array
    insertProvider(new Entry(subPointer, newProvider));

    return newProvider;
}
