import { u128, u256 } from 'as-bignum/assembly';
import { Potential } from '@btc-vision/btc-runtime/runtime';
import { AdvancedStoredString } from '../stored/AdvancedStoredString';
import { Entry } from '../cache/Entry';
import { findProvider, insertProvider } from '../cache/ProviderCache';
import { UserLiquidity } from '../data-types/UserLiquidity';
import { PROVIDER_ADDRESS_POINTER, PROVIDER_LIQUIDITY_POINTER } from './StoredPointers';

export class Provider {
    public providerId: u256;

    private userLiquidity: UserLiquidity;

    constructor(providerId: u256) {
        this.providerId = providerId;

        this.userLiquidity = new UserLiquidity(PROVIDER_LIQUIDITY_POINTER, providerId);
    }

    public get liquidity(): u128 {
        return this.userLiquidity.getLiquidityAmount();
    }

    public set liquidity(value: u128) {
        this.userLiquidity.setLiquidityAmount(value);
    }

    private _btcReceiver: Potential<AdvancedStoredString> = null;

    public get btcReceiver(): string {
        return this.loaderReceiver.value;
    }

    public set btcReceiver(value: string) {
        this.loaderReceiver.value = value;
    }

    public get hasReservations(): bool {
        return this.userLiquidity.getPendingReservationsFlag() === 1;
    }

    public set hasReservations(value: bool) {
        this.userLiquidity.setPendingReservationsFlag(value ? 1 : 0);
    }

    private get loaderReceiver(): AdvancedStoredString {
        if (this._btcReceiver === null) {
            const loader = new AdvancedStoredString(PROVIDER_ADDRESS_POINTER, this.providerId);
            this._btcReceiver = loader;

            return loader;
        }

        return this._btcReceiver as AdvancedStoredString;
    }

    public isActive(): bool {
        return this.userLiquidity.getActiveFlag() === 1;
    }

    public setActive(value: bool): void {
        this.userLiquidity.setActiveFlag(value ? 1 : 0);
    }

    public save(): void {
        this.userLiquidity.save();
    }
}

/**
 * @function getProvider
 * @description Retrieves a Provider using the u256 key. Creates and caches a new Provider if not found.
 * @param {u256} providerId - The provider's u256 identifier.
 * @returns {Provider} - The retrieved or newly created Provider.
 */
export function getProvider(providerId: u256): Provider {
    const existingProvider = findProvider(providerId);
    if (existingProvider) {
        return existingProvider;
    }

    const newProvider = new Provider(providerId);

    // Insert the new Provider into the sorted array
    insertProvider(new Entry(providerId, newProvider));

    return newProvider;
}
