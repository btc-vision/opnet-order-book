import { u128, u256 } from 'as-bignum/assembly';
import { Blockchain, Revert, SafeMath, StoredU16Array } from '@btc-vision/btc-runtime/runtime';
import { StoredMapU256 } from '../stored/StoredMapU256';
import {
    RESERVATION_DURATION_U64,
    RESERVATION_EXPIRATION_BLOCK_POINTER,
    RESERVATION_PROVIDERS_LIST_POINTER,
    RESERVATION_PROVIDERS_POINTER,
} from './StoredPointers';
import { getProvider, Provider } from './Provider';
import { Tick } from '../tick/Tick';
import { TickUpdatedEvent } from '../events/TickUpdatedEvent';
import { StoredMapU64 } from '../stored/StoredMapU64';

const EXPIRATION_BLOCK_POS: u8 = 0;

/**
 * Reservation class representing a buyer's reservation.
 */
@final
export class Reservation {
    public reservationId: u256;
    public expirationBlock: u64;

    private storageExpirationBlock: StoredMapU64;
    private providers: StoredMapU256;

    private currentProviderIndex: u32 = 1;

    private readonly numProviders: StoredU16Array;
    private readonly providerList: StoredMapU256;

    constructor(reservationId: u256) {
        this.reservationId = reservationId;
        this.expirationBlock = 0;

        this.storageExpirationBlock = new StoredMapU64(
            RESERVATION_EXPIRATION_BLOCK_POINTER,
            reservationId,
        );

        this.providers = new StoredMapU256(RESERVATION_PROVIDERS_POINTER, reservationId);
        this.numProviders = new StoredU16Array(
            RESERVATION_PROVIDERS_LIST_POINTER,
            reservationId,
            u256.Zero,
        );

        this.providerList = new StoredMapU256(RESERVATION_PROVIDERS_LIST_POINTER, reservationId);
    }

    public get createdAt(): u64 {
        return this.expirationBlock > RESERVATION_DURATION_U64
            ? this.expirationBlock - RESERVATION_DURATION_U64
            : 0;
    }

    /**
     * Checks if the reservation exists in storage.
     */
    public exist(): bool {
        this.load();

        if (this.expirationBlock === 0 || this.numProviders.get(0) === 0) {
            return false;
        }

        return !this.hasExpired();
    }

    public increaseCounterIndex(): void {
        this.currentProviderIndex++;
    }

    public addProviderReservation(provider: Provider, amount: u256): void {
        const providerAmount: u256 = this.providers.get(provider.subPointer);
        if (providerAmount.isZero()) {
            // Efficient.
            this.providerList.set(this.getNextProviderId(), provider.providerId);

            // Efficient.
            this.increaseProviderCountAtIndex();
        }

        this.providers.set(provider.subPointer, SafeMath.add(providerAmount, amount));
    }

    public fulfillReservation(tokenDecimals: u128, ticks: Tick[]): u256 {
        this.load();

        const totalProviders = this.numProviders.get(0);

        // Efficient.
        let acquired: u256 = u256.Zero;
        let providerCounter: u16 = 0;
        do {
            const amountOfProvidersAtIndex: u16 = this.getProviderCountAtIndex();
            if (amountOfProvidersAtIndex === 0) {
                throw new Revert('No providers at index');
            }

            const tick: Tick = ticks[this.currentProviderIndex - 1];
            acquired = SafeMath.add(
                acquired,
                this.fulfillTick(tick, providerCounter, tokenDecimals),
            );

            this.increaseCounterIndex();

            providerCounter += amountOfProvidersAtIndex;
        } while (providerCounter < totalProviders);

        return acquired;
    }

    /**
     * Saves the current state of the reservation to storage.
     */
    public save(): void {
        this.storageExpirationBlock.set(
            this.reservationId,
            EXPIRATION_BLOCK_POS,
            SafeMath.add64(Blockchain.block.numberU64, RESERVATION_DURATION_U64),
        );

        this.numProviders.save();
    }

    /**
     * Deletes the reservation from storage.
     */
    public delete(): void {
        this.storageExpirationBlock.delete(this.reservationId);
        this.numProviders.delete();
    }

    /**
     * Loads the reservation data from storage.
     */
    public load(): void {
        this.expirationBlock = this.storageExpirationBlock.get(
            this.reservationId,
            EXPIRATION_BLOCK_POS,
        );

        if (this.createdAt === Blockchain.block.numberU64 && this.expirationBlock !== 0) {
            throw new Error('Reservation not active yet.');
        }
    }

    /**
     * Checks if the reservation has expired.
     */
    public hasExpired(): bool {
        return this.expirationBlock < Blockchain.block.numberU64;
    }

    private getNextProviderId(): u256 {
        return u256.fromU32(this.numProviders.get(0) as u32);
    }

    private getProviderCountAtIndex(): u16 {
        return this.numProviders.get(this.currentProviderIndex);
    }

    private increaseProviderCountAtIndex(): void {
        const currentCount: u16 = this.numProviders.get(0);
        if (currentCount >= U16.MAX_VALUE - 1) {
            throw new Error('Maximum number of providers reached');
        }

        this.numProviders.set(0, currentCount + 1);
        this.numProviders.set(this.currentProviderIndex, this.getProviderCountAtIndex() + 1);
    }

    private fulfillTick(tick: Tick, providerCounter: u16, decimals: u128): u256 {
        const tickId = tick.tickId;
        const numProviders = this.getProviderCountAtIndex();

        let acquired: u256 = u256.Zero;
        for (let i: u32 = 0; i < numProviders; i++) {
            const idInList: u256 = u256.fromU32(providerCounter + i);
            const providerId: u256 = this.providerList.get(idInList);

            const provider = getProvider(providerId, tickId);
            const reservedAmount: u128 = this.providers.get(provider.subPointer).toU128();
            if (reservedAmount.isZero()) {
                throw new Error('Provider has no reservation');
            }

            const consumed: u128 = reservedAmount;
            acquired = SafeMath.add(acquired, consumed.toU256());

            // Process the fulfillment
            tick.consumeLiquidity(provider, consumed, reservedAmount, decimals, this.createdAt);

            // There is no advantage to call this atm. It doesn't refund gas.
            //this.removeProviderReservation(provider);
        }

        // Emit TickUpdatedEvent for each tick
        const tickUpdatedEvent = new TickUpdatedEvent(
            tickId,
            tick.level,
            tick.getTotalLiquidity(),
            acquired,
        );

        Blockchain.emit(tickUpdatedEvent);

        return acquired;
    }
}
