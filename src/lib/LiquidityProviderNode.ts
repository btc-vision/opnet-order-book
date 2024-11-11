import { u256 } from 'as-bignum/assembly';
import { BytesWriter, encodePointer, StoredU256 } from '@btc-vision/btc-runtime/runtime';
import { AdvancedStoredString } from '../stored/AdvancedStoredString';
import {
    LIQUIDITY_PROVIDER_AMOUNT_POINTER,
    LIQUIDITY_PROVIDER_NEXT_POINTER,
    PROVIDER_ADDRESS_POINTER,
} from './StoredPointers';

export class LiquidityProviderNode {
    public providerId: u256;
    public amount: u256;
    public btcReceiver: string;

    nextProviderId: u256;

    constructor(providerId: u256) {
        this.providerId = providerId;
        this.amount = u256.Zero;
        this.btcReceiver = '';
        this.nextProviderId = u256.Zero;
    }

    public load(tickId: u256): bool {
        // Load provider data from storage
        const amountStorage = new StoredU256(
            LIQUIDITY_PROVIDER_AMOUNT_POINTER,
            this.getSubPointer(tickId),
            u256.Zero,
        );

        const btcReceiverStorage = new AdvancedStoredString(
            PROVIDER_ADDRESS_POINTER,
            this.providerId,
        );

        const nextProviderIdStorage = new StoredU256(
            LIQUIDITY_PROVIDER_NEXT_POINTER,
            this.getSubPointer(tickId),
            u256.Zero,
        );

        const amount = amountStorage.value;
        if (amount.isZero()) {
            return false; // Provider does not exist
        }

        this.amount = amount;
        this.btcReceiver = btcReceiverStorage.value || '';
        this.nextProviderId = nextProviderIdStorage.value || u256.Zero;

        return true;
    }

    public save(tickId: u256): void {
        const amountStorage = new StoredU256(
            LIQUIDITY_PROVIDER_AMOUNT_POINTER,
            this.getSubPointer(tickId),
            u256.Zero,
        );

        const btcReceiverStorage = new AdvancedStoredString(
            PROVIDER_ADDRESS_POINTER,
            this.providerId,
        );

        const nextProviderIdStorage = new StoredU256(
            LIQUIDITY_PROVIDER_NEXT_POINTER,
            this.getSubPointer(tickId),
            u256.Zero,
        );

        amountStorage.value = this.amount;
        btcReceiverStorage.value = this.btcReceiver;
        nextProviderIdStorage.value = this.nextProviderId;
    }

    public getNextProvider(tickId: u256): LiquidityProviderNode | null {
        if (this.nextProviderId.isZero()) {
            return null;
        }

        const nextProvider = new LiquidityProviderNode(this.nextProviderId);
        if (nextProvider.load(tickId)) {
            return nextProvider;
        } else {
            return null;
        }
    }

    public setNextProvider(nextProviderId: u256, tickId: u256): void {
        this.nextProviderId = nextProviderId;

        // Save the updated nextProviderId
        const nextProviderIdStorage = new StoredU256(
            LIQUIDITY_PROVIDER_NEXT_POINTER,
            this.getSubPointer(tickId),
            u256.Zero,
        );

        nextProviderIdStorage.value = this.nextProviderId;
    }

    private getSubPointer(tickId: u256): u256 {
        // Generate a unique storage pointer based on tickId and providerId
        const writer = new BytesWriter(64);
        writer.writeU256(tickId);
        writer.writeU256(this.providerId);

        return encodePointer(writer.getBuffer());
    }
}
