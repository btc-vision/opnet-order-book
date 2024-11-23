import {
    Address,
    Blockchain,
    Revert,
    SafeMath,
    StoredU256Array,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from 'as-bignum/assembly';
import {
    LIQUIDITY_QUEUE_POINTER,
    LIQUIDITY_RESERVED_POINTER,
    TOTAL_RESERVES_POINTER,
} from './StoredPointers';
import { StoredMapU256 } from '../stored/StoredMapU256';
import { getProvider, Provider } from './Provider';

function convertTo32Bytes(input: Uint8Array): Uint8Array {
    const result = new Uint8Array(32);
    result.set(input);

    return result;
}

export class LiquidityQueue {
    public readonly tokenId: u256;

    private readonly _queue: StoredU256Array;
    private readonly _totalReserves: StoredMapU256; // token address (as u256) => total reserve
    private readonly _totalReserved: StoredMapU256; // provider id (as u256) => total reserved

    constructor(
        public readonly token: Address,
        public readonly tokenIdUint8Array: Uint8Array,
    ) {
        this.tokenId = u256.fromBytes(convertTo32Bytes(tokenIdUint8Array), true);

        // Remove the 8 last bytes (max length.)
        this._queue = new StoredU256Array(LIQUIDITY_QUEUE_POINTER, tokenIdUint8Array, u256.Zero);

        this._totalReserves = new StoredMapU256(TOTAL_RESERVES_POINTER);
        this._totalReserved = new StoredMapU256(LIQUIDITY_RESERVED_POINTER);
    }

    public addLiquidity(providerId: u256, amountIn: u128, receiver: string): void {
        // Transfer the tokens from the sender to the contract
        const amountInU256: u256 = amountIn.toU256();
        TransferHelper.safeTransferFrom(
            this.token,
            Blockchain.tx.sender,
            Blockchain.contractAddress,
            amountInU256,
        );

        Blockchain.log(
            `Updating total reserve for token ${this.tokenId} with amount ${amountInU256}`,
        );

        // Add the liquidity to the queue
        this.updateTotalReserve(this.tokenId, amountInU256, true);

        // Get the provider
        const provider: Provider = getProvider(providerId);

        // Verify that liquidity won't overflow u128
        const liquidity: u128 = provider.liquidity;

        if (!u128.lt(liquidity, SafeMath.sub128(u128.Max, amountIn))) {
            throw new Revert('Liquidity overflow. Please add a smaller amount.');
        }

        provider.liquidity = u128.add(liquidity, amountIn);
        provider.btcReceiver = receiver;

        // Add the provider to the queue if it's not already there
        if (!provider.isActive()) {
            provider.setActive(true);

            this._queue.push(providerId);
        }

        this._queue.save();
    }

    /**
     * Updates the total reserve for a given token.
     * @param token - The token address as u256.
     * @param amount - The amount to add or subtract.
     * @param increase - Boolean indicating whether to add or subtract.
     */
    private updateTotalReserve(token: u256, amount: u256, increase: bool): void {
        const currentReserve = this._totalReserves.get(token) || u256.Zero;
        const newReserve = increase
            ? SafeMath.add(currentReserve, amount)
            : SafeMath.sub(currentReserve, amount);

        this._totalReserves.set(token, newReserve);
    }

    private updateTotalReserved(token: u256, amount: u256, increase: bool): void {
        const currentReserved = this._totalReserved.get(token) || u256.Zero;
        const newReserved = increase
            ? SafeMath.add(currentReserved, amount)
            : SafeMath.sub(currentReserved, amount);

        this._totalReserved.set(token, newReserved);
    }
}
