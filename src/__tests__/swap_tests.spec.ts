import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
    SafeMath,
    TransactionOutput,
} from '@btc-vision/btc-runtime/runtime';
import { ripemd160, sha256 } from '@btc-vision/btc-runtime/runtime/env/global';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { clearCachedProviders, saveAllProviders } from '../lib/Provider2';
import { CreatePoolOperation2 } from '../lib/Liquidity/operations/CreatePoolOperation2';
import { LiquidityQueue2 } from '../lib/Liquidity/LiquidityQueue2';
import { ReserveLiquidityOperation2 } from '../lib/Liquidity/operations/ReserveLiquidityOperation2';
import { SwapOperation2 } from '../lib/Liquidity/operations/SwapOperation2';
import { ListTokensForSaleOperation2 } from '../lib/Liquidity/operations/ListTokensForSaleOperation2';
import { AddLiquidityOperation2 } from '../lib/Liquidity/operations/AddLiquidityOperation2';

const providerAddress1: Address = new Address([
    68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101, 220, 185,
    192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
]);

const providerAddress2: Address = new Address([
    196, 73, 104, 227, 216, 12, 216, 134, 87, 166, 168, 44, 5, 101, 71, 69, 204, 213, 154, 86, 76,
    124, 186, 77, 90, 216, 39, 6, 239, 122, 100, 1,
]);

const providerAddress3: Address = new Address([
    84, 79, 41, 213, 125, 76, 182, 184, 94, 85, 157, 217, 19, 45, 4, 70, 179, 164, 179, 31, 71, 53,
    209, 126, 10, 49, 77, 37, 107, 101, 113, 216,
]);

const msgSender1: Address = new Address([
    56, 172, 228, 82, 23, 145, 109, 98, 102, 186, 35, 65, 115, 253, 83, 104, 64, 71, 143, 47, 250,
    36, 107, 117, 250, 119, 149, 253, 56, 102, 51, 108,
]);

const msgSender2: Address = new Address([
    220, 11, 198, 33, 187, 6, 231, 40, 174, 165, 186, 169, 5, 108, 5, 211, 94, 23, 64, 162, 45, 199,
    82, 175, 147, 117, 30, 10, 108, 174, 211, 147,
]);

const txOrigin1: Address = new Address([
    113, 221, 31, 226, 33, 248, 28, 254, 8, 16, 106, 44, 26, 240, 107, 94, 38, 154, 85, 230, 151,
    248, 2, 44, 146, 20, 195, 28, 32, 155, 140, 210,
]);
const txOrigin2: Address = new Address([
    227, 185, 130, 207, 92, 89, 62, 145, 15, 240, 69, 14, 174, 179, 55, 177, 194, 1, 216, 210, 179,
    131, 230, 233, 106, 183, 138, 42, 10, 179, 2, 153,
]);
const contractDeployer1: Address = new Address([
    204, 190, 163, 95, 110, 134, 1, 4, 104, 204, 197, 231, 62, 122, 115, 178, 237, 191, 201, 77,
    105, 55, 36, 40, 108, 255, 168, 146, 19, 124, 126, 173,
]);
const contractDeployer2: Address = new Address([
    245, 67, 231, 181, 243, 123, 8, 242, 179, 109, 140, 31, 10, 151, 248, 188, 68, 244, 160, 246,
    223, 87, 42, 225, 39, 108, 34, 130, 163, 235, 24, 163,
]);
const contractAddress1: Address = new Address([
    88, 191, 35, 122, 155, 141, 248, 53, 37, 62, 101, 60, 10, 84, 39, 102, 23, 187, 180, 182, 82,
    28, 17, 107, 182, 139, 162, 187, 102, 146, 120, 99,
]);
const contractAddress2: Address = new Address([
    94, 205, 124, 93, 174, 4, 230, 77, 227, 188, 102, 175, 46, 92, 219, 212, 103, 214, 153, 217,
    151, 178, 174, 203, 41, 209, 89, 123, 188, 113, 72, 105,
]);
const txId1: Uint8Array = new Uint8Array(32);
txId1.set([
    233, 46, 113, 133, 187, 115, 218, 211, 63, 34, 178, 231, 36, 25, 22, 110, 165, 124, 122, 201,
    247, 233, 124, 41, 254, 64, 210, 16, 98, 89, 139, 181,
]);
const txId2: Uint8Array = new Uint8Array(32);
txId2.set([
    189, 155, 208, 203, 149, 250, 116, 136, 30, 209, 224, 135, 201, 167, 123, 33, 172, 230, 39, 99,
    88, 244, 46, 38, 51, 187, 34, 141, 149, 4, 181, 150,
]);

const tokenAddress1: Address = new Address([
    229, 26, 76, 180, 38, 124, 121, 223, 102, 39, 240, 138, 176, 156, 20, 68, 31, 90, 205, 152, 6,
    72, 189, 57, 202, 110, 217, 180, 106, 177, 172, 45,
]);
const tokenIdUint8Array1: Uint8Array = ripemd160(tokenAddress1);
const tokenId1: u256 = u256.fromBytes(tokenAddress1, true);

const tokenAddress2: Address = new Address([
    222, 40, 197, 58, 44, 174, 172, 146, 11, 2, 236, 98, 173, 123, 172, 221, 45, 8, 99, 251, 190,
    151, 230, 90, 170, 2, 198, 68, 224, 254, 129, 245,
]);
const tokenIdUint8Array2: Uint8Array = ripemd160(tokenAddress2);
const tokenId2: u256 = u256.fromBytes(tokenAddress2, true);

let addressCount: u32 = 0;

function getNextAddress(): Address {
    addressCount = addressCount + 1;

    const bytes: u8[] = [
        u8(addressCount & 255),
        u8((addressCount >> 8) & 255),
        u8((addressCount >> 16) & 255),
        u8((addressCount >> 24) & 255),
    ];

    for (let i = 0; i < 28; i++) {
        bytes.push(0);
    }

    return new Address(bytes);
}

function setBlockchainEnvironment(
    currentBlock: u64,
    sender: Address,
    txOrigin: Address,
    txId: Uint8Array,
): void {
    const currentBlockValue: u256 = u256.fromU64(currentBlock);
    const medianTimestamp: u64 = 87129871;
    const safeRnd64: u64 = 3723476278;

    const writer: BytesWriter = new BytesWriter(255);

    writer.writeAddress(sender);
    writer.writeAddress(txOrigin);
    writer.writeBytes(txId);
    writer.writeU256(currentBlockValue);
    writer.writeAddress(contractDeployer1);
    writer.writeAddress(contractAddress1);
    writer.writeU64(medianTimestamp);
    writer.writeU64(safeRnd64);

    Blockchain.setEnvironment(writer.getBuffer());
}

const strictMinimumProviderReservationAmount: u256 = u256.fromU32(600);

function addressToPointerU256(address: Address, token: Address): u256 {
    const writer = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
    writer.writeAddress(address);
    writer.writeAddress(token);
    return u256.fromBytes(sha256(writer.getBuffer()), true);
}

function addressToPointer(address: Address): Uint8Array {
    return ripemd160(address);
}

function dumpQueue(queue: LiquidityQueue2): void {
    log(`initial provider: ${queue.initialLiquidityProvider.toString()}`);
    log(`p0: ${queue.p0.toString()}`);
    log(`virtualBTCReserve: ${queue.virtualBTCReserve.toString()}`);
    log(`virtualTokenReserve: ${queue.virtualTokenReserve.toString()}`);
    log(`lastVirtualUpdateBlock: ${queue.lastVirtualUpdateBlock.toString()}`);
    log(`reservedLiquidity: ${queue.reservedLiquidity.toString()}`);
    log(`liquidity: ${queue.liquidity.toString()}`);
    log(`maxTokensPerReservation: ${queue.maxTokensPerReservation.toString()}`);
    log(`quote: ${queue.quote().toString()}`);
}

function getMinimumTokenAmount(floorPrice: u256, scale: u256 = u256.fromU32(1)): u256 {
    return SafeMath.div(SafeMath.mul(floorPrice, u256.fromU32(10000)), scale); // need to send 1 sats more than the result
}

function createPool(statsPerToken: u32 = 1000, receiver: string = 'initialprovideraddress'): u256 {
    const exp: u256 = SafeMath.pow(u256.fromU32(10), u256.fromU32(18));
    const floorPrice: u256 = SafeMath.div(exp, u256.fromU32(statsPerToken)); // 1 token = 1000 sats
    const tokenCount: u256 = u256.fromU32(999); // 100000 tokens @ 18 decimals
    const initialLiquidity: u128 = SafeMath.mul(exp, tokenCount).toU128();

    const antiBotEnabledFor: u16 = 0;
    const antiBotMaximumTokensPerReservation: u256 = u256.Zero;
    const maxReservesIn5BlocksPercent: u16 = 4000;

    const queue = new LiquidityQueue2(tokenAddress1, addressToPointer(tokenAddress1), true);

    const providerId = addressToPointerU256(Blockchain.tx.sender, tokenAddress1);
    const operation = new CreatePoolOperation2(
        queue,
        floorPrice,
        providerId,
        initialLiquidity,
        receiver,
        antiBotEnabledFor,
        antiBotMaximumTokensPerReservation,
        maxReservesIn5BlocksPercent,
    );

    operation.execute();
    queue.save();
    saveAllProviders();
    return floorPrice;
}

function reserveLiquidity(maximumAmountIn: u256, minimumAmountOut: u256, forLP: bool): void {
    const providerId = addressToPointerU256(Blockchain.tx.sender, tokenAddress1);
    const queue = new LiquidityQueue2(tokenAddress1, addressToPointer(tokenAddress1), true);

    const operation = new ReserveLiquidityOperation2(
        queue,
        providerId,
        Blockchain.tx.sender,
        maximumAmountIn,
        minimumAmountOut,
        forLP,
    );

    operation.execute();
    queue.save();
}

function listLiquidity(token: Address, receiver: string, amountIn: u128, priority: boolean): void {
    const providerId = addressToPointerU256(Blockchain.tx.sender, token);
    const tokenId = addressToPointer(token);

    const queue = new LiquidityQueue2(tokenAddress1, tokenId, true);

    const operation = new ListTokensForSaleOperation2(
        queue,
        providerId,
        amountIn,
        receiver,
        priority,
    );

    operation.execute();
    queue.save();
    dumpQueue(queue);
}

function addLiquidity(token: Address, receiver: string): void {
    const providerId = addressToPointerU256(Blockchain.tx.sender, token);
    const tokenId = addressToPointer(token);
    const queue = new LiquidityQueue2(tokenAddress1, tokenId, false);
    const operation = new AddLiquidityOperation2(queue, providerId, receiver);

    operation.execute();
    queue.save();
    dumpQueue(queue);
}

function swap(): void {
    const queue = new LiquidityQueue2(tokenAddress1, addressToPointer(tokenAddress1), false);

    const operation = new SwapOperation2(queue);

    operation.execute();
    queue.save();
    //dumpQueue(queue);
}

function test(a: Address): void {
    //expect(() => {
    clearCachedProviders();

    setBlockchainEnvironment(12, a, a, txId2);
    const outputs: TransactionOutput[] = [
        new TransactionOutput(0, '', 0),
        new TransactionOutput(1, 'initialprovideraddress', 10001),
    ];

    Blockchain.mockTransactionOutput(outputs);

    swap();
    saveAllProviders();
    //}).toThrow('No active reservation for this address.');
}

describe('Swap tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should not allow to swap 2 times on the same reservation', () => {
        setBlockchainEnvironment(10, contractDeployer1, contractDeployer1, txId1);
        const floorPrice = createPool();

        let addr: Address[] = [];

        for (let i = 0; i < 100; i++) {
            clearCachedProviders();

            /*const provider2: Provider2 = getProvider(queue.initialLiquidityProvider);

            log(
                `${provider2.providerId}, ${provider2.reserved}, ${provider2.liquidity}, ${provider2.btcReceiver}`,
            );*/

            const a = getNextAddress();
            addr.push(a);
            setBlockchainEnvironment(11, a, a, txId2);
            reserveLiquidity(
                u256.fromU64(10001),
                /*getMinimumTokenAmount(floorPrice)*/ u256.Zero,
                false,
            );

            saveAllProviders();
        }

        const queue = new LiquidityQueue2(tokenAddress1, addressToPointer(tokenAddress1), true);
        //log(`${queue.reservedLiquidity} ${queue.liquidity}`);

        for (let i = 0; i < 100; i++) {
            clearCachedProviders();
            const a = addr[i];

            setBlockchainEnvironment(12, a, a, txId2);
            const outputs: TransactionOutput[] = [
                new TransactionOutput(0, '', 0),
                new TransactionOutput(1, 'initialprovideraddress', 10001),
            ];

            Blockchain.mockTransactionOutput(outputs);

            swap();
            saveAllProviders();
        }

        for (let i = 0; i < 100; i++) {
            test(addr[i]);
        }
    });
});
