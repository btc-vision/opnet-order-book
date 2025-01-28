import { Address, ADDRESS_BYTE_LENGTH, BytesWriter } from '@btc-vision/btc-runtime/runtime';
import { ripemd160, sha256 } from '../../../btc-runtime/runtime/env/global';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    clearCachedProviders,
    getProvider,
    getProviderCacheLength,
    Provider2,
    saveAllProviders,
} from '../lib/Provider2';

/*
const providerAddress: Address = new Address([
            68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101,
            220, 185, 192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
        ]);

        const msgSender: Address = new Address([
            3, 244, 212, 41, 110, 239, 129, 80, 36, 74, 11, 231, 250, 138, 254, 198, 81, 233, 14,
            76, 61, 225, 154, 20, 11, 100, 124, 206, 71, 252, 80, 75,
        ]);

        const txOrigin: Address = new Address([
            2, 161, 199, 183, 84, 134, 60, 87, 88, 208, 64, 19, 135, 230, 223, 88, 188, 17, 244, 18,
            69, 148, 147, 240, 132, 234, 175, 59, 108, 183, 238, 204,
        ]);

        const contractDeployer: Address = new Address([
            2, 161, 199, 183, 84, 134, 60, 87, 88, 208, 64, 19, 135, 230, 223, 88, 188, 17, 244, 18,
            69, 148, 147, 240, 132, 234, 175, 59, 108, 183, 238, 204,
        ]);

        const contractAddress: Address = new Address([
            2, 63, 107, 231, 39, 227, 213, 207, 25, 237, 243, 104, 95, 193, 11, 53, 60, 167, 2, 154,
            147, 164, 164, 91, 2, 186, 95, 255, 120, 187, 168, 183,
        ]);

        const id: Uint8Array = new Uint8Array(32);
        id.set([
            169, 2, 83, 120, 75, 203, 42, 176, 0, 30, 125, 31, 199, 208, 212, 135, 198, 17, 231,
            103, 96, 145, 37, 13, 219, 77, 63, 12, 11, 69, 101, 223,
        ]);

        const currentBlock: u256 = u256.fromU64(10);
        const medianTimestamp: u64 = 87129871;
        const safeRnd64: u64 = 3723476278;

        const writer: BytesWriter = new BytesWriter(255);

        writer.writeAddress(msgSender);
        writer.writeAddress(txOrigin);
        writer.writeBytes(id);
        writer.writeU256(currentBlock);
        writer.writeAddress(contractDeployer);
        writer.writeAddress(contractAddress);
        writer.writeU64(medianTimestamp);
        writer.writeU64(safeRnd64);

        Blockchain.setEnvironment(writer.getBuffer());

 */

const tokenAddress: Address = new Address([
    229, 26, 76, 180, 38, 124, 121, 223, 102, 39, 240, 138, 176, 156, 20, 68, 31, 90, 205, 152, 6,
    72, 189, 57, 202, 110, 217, 180, 106, 177, 172, 45,
]);
const tokenIdUint8Array: Uint8Array = ripemd160(tokenAddress);
const tokenId: u256 = u256.fromBytes(tokenAddress, true);
const strictMinimumProviderReservationAmount: u256 = u256.fromU32(600);

function addressToPointerU256(address: Address, token: Address): u256 {
    const writer = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
    writer.writeAddress(address);
    writer.writeAddress(token);
    return u256.fromBytes(sha256(writer.getBuffer()), true);
}

describe('Test provider creation', () => {
    it('should create a new provider when provider id does not exists', () => {
        //const t: LiquidityQueue = new LiquidityQueue(tokenAddress, tokenIdUint8Array, false);
    });

    it('should create a new provider when provider id does not exists', () => {
        const providerAddress: Address = new Address([
            68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101,
            220, 185, 192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
        ]);

        const providerId: u256 = addressToPointerU256(providerAddress, tokenAddress);
        const provider: Provider2 = getProvider(providerId);

        expect(provider.providerId).toStrictEqual(providerId);
        expect(provider.pendingRemoval).toStrictEqual(false);
        expect(provider.isLp).toStrictEqual(false);
        expect(provider.liquidityProvided).toStrictEqual(u256.Zero);
        expect(provider.liquidity).toStrictEqual(u128.Zero);
        expect(provider.reserved).toStrictEqual(u128.Zero);
        expect(provider.btcReceiver).toStrictEqual('');
        expect(provider.canProvideLiquidity()).toStrictEqual(false);
        expect(provider.isActive()).toStrictEqual(false);
        expect(provider.isPriority()).toStrictEqual(false);
    });

    it('should correctly set provider pending state', () => {
        const providerAddress: Address = new Address([
            68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101,
            220, 185, 192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
        ]);

        const providerId: u256 = addressToPointerU256(providerAddress, tokenAddress);
        const provider: Provider2 = getProvider(providerId);
        provider.pendingRemoval = true;

        expect(provider.pendingRemoval).toStrictEqual(true);
    });

    it('should correctly set provider liquidity provider state', () => {
        const providerAddress: Address = new Address([
            68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101,
            220, 185, 192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
        ]);

        const providerId: u256 = addressToPointerU256(providerAddress, tokenAddress);
        const provider: Provider2 = getProvider(providerId);
        provider.isLp = true;

        expect(provider.isLp).toStrictEqual(true);
    });

    it('should correctly set provider liquidityProvided value', () => {
        const providerAddress: Address = new Address([
            68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101,
            220, 185, 192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
        ]);

        const liquidityProvided: u256 = u256.fromU64(983736);
        const providerId: u256 = addressToPointerU256(providerAddress, tokenAddress);
        const provider: Provider2 = getProvider(providerId);
        provider.liquidityProvided = liquidityProvided;

        expect(provider.liquidityProvided).toStrictEqual(liquidityProvided);
    });

    it('should correctly set provider liquidity value', () => {
        const providerAddress: Address = new Address([
            68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101,
            220, 185, 192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
        ]);

        const liquidity: u128 = u128.fromU64(1827272);
        const providerId: u256 = addressToPointerU256(providerAddress, tokenAddress);
        const provider: Provider2 = getProvider(providerId);
        provider.liquidity = liquidity;

        expect(provider.liquidity).toStrictEqual(liquidity);
    });

    it('should correctly set provider reserved value', () => {
        const providerAddress: Address = new Address([
            68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101,
            220, 185, 192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
        ]);

        const reserved: u128 = u128.fromU64(4434534);
        const providerId: u256 = addressToPointerU256(providerAddress, tokenAddress);
        const provider: Provider2 = getProvider(providerId);
        provider.reserved = reserved;

        expect(provider.reserved).toStrictEqual(reserved);
    });

    it('should correctly set provider btcReceiver value', () => {
        const providerAddress: Address = new Address([
            68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101,
            220, 185, 192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
        ]);

        const btcReceiver: string = '0d1121291209u09hs282';
        const providerId: u256 = addressToPointerU256(providerAddress, tokenAddress);
        const provider: Provider2 = getProvider(providerId);
        provider.btcReceiver = btcReceiver;

        expect(provider.btcReceiver).toStrictEqual(btcReceiver);
    });

    it('should correctly set provider enableLiquidityProvision state', () => {
        const providerAddress: Address = new Address([
            68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101,
            220, 185, 192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
        ]);

        const providerId: u256 = addressToPointerU256(providerAddress, tokenAddress);
        const provider: Provider2 = getProvider(providerId);
        provider.enableLiquidityProvision();

        expect(provider.canProvideLiquidity()).toStrictEqual(true);
    });

    it('should correctly set provider active and priority state to true', () => {
        const providerAddress: Address = new Address([
            68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101,
            220, 185, 192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
        ]);

        const providerId: u256 = addressToPointerU256(providerAddress, tokenAddress);
        const provider: Provider2 = getProvider(providerId);
        provider.setActive(true, true);

        expect(provider.isActive()).toStrictEqual(true);
        expect(provider.isPriority()).toStrictEqual(true);
    });

    it('should correctly set provider active state to true and priority state to false', () => {
        const providerAddress: Address = new Address([
            68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101,
            220, 185, 192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
        ]);

        const providerId: u256 = addressToPointerU256(providerAddress, tokenAddress);
        const provider: Provider2 = getProvider(providerId);
        provider.setActive(true, false);

        expect(provider.isActive()).toStrictEqual(true);
        expect(provider.isPriority()).toStrictEqual(false);
    });

    it('should correctly set provider active state to false and priority state to true', () => {
        const providerAddress: Address = new Address([
            68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101,
            220, 185, 192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
        ]);

        const providerId: u256 = addressToPointerU256(providerAddress, tokenAddress);
        const provider: Provider2 = getProvider(providerId);
        provider.setActive(false, true);

        expect(provider.isActive()).toStrictEqual(false);
        expect(provider.isPriority()).toStrictEqual(true);
    });

    it('should correctly set provider active state to false and priority state to false', () => {
        const providerAddress: Address = new Address([
            68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101,
            220, 185, 192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
        ]);

        const providerId: u256 = addressToPointerU256(providerAddress, tokenAddress);
        const provider: Provider2 = getProvider(providerId);
        provider.setActive(false, false);

        expect(provider.isActive()).toStrictEqual(false);
        expect(provider.isPriority()).toStrictEqual(false);
    });

    it('should reset a provider to default value', () => {
        const providerAddress: Address = new Address([
            68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101,
            220, 185, 192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
        ]);

        const providerId: u256 = addressToPointerU256(providerAddress, tokenAddress);
        const provider: Provider2 = getProvider(providerId);
        provider.setActive(true, true);
        provider.pendingRemoval = true;
        provider.isLp = true;
        provider.liquidityProvided = u256.fromU64(129292);
        provider.liquidity = u128.fromU64(131292);
        provider.reserved = u128.fromU64(12918);
        provider.btcReceiver = 'e123e2d23d233';
        provider.enableLiquidityProvision();
        provider.reset();

        expect(provider.pendingRemoval).toStrictEqual(false);
        expect(provider.isLp).toStrictEqual(false);
        expect(provider.liquidityProvided).toStrictEqual(u256.Zero);
        expect(provider.liquidity).toStrictEqual(u128.Zero);
        expect(provider.reserved).toStrictEqual(u128.Zero);
        expect(provider.btcReceiver).toStrictEqual('e123e2d23d233');
        expect(provider.canProvideLiquidity()).toStrictEqual(false);
        expect(provider.isActive()).toStrictEqual(false);
        expect(provider.isPriority()).toStrictEqual(false);
    });

    it('should get a cached provider when provider id exists', () => {
        const providerAddress: Address = new Address([
            68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101,
            220, 185, 192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
        ]);

        const providerId: u256 = addressToPointerU256(providerAddress, tokenAddress);
        const provider: Provider2 = getProvider(providerId);
        provider.setActive(true, true);
        provider.pendingRemoval = true;
        provider.isLp = true;
        provider.liquidityProvided = u256.fromU64(129292);
        provider.liquidity = u128.fromU64(131292);
        provider.reserved = u128.fromU64(12918);
        provider.btcReceiver = 'e123e2d23d233';
        provider.enableLiquidityProvision();

        const provider2: Provider2 = getProvider(providerId);

        expect(provider2).toStrictEqual(provider);
        expect(provider2.pendingRemoval).toStrictEqual(true);
        expect(provider.isLp).toStrictEqual(true);
        expect(provider.liquidityProvided).toStrictEqual(u256.fromU64(129292));
        expect(provider.liquidity).toStrictEqual(u128.fromU64(131292));
        expect(provider.reserved).toStrictEqual(u128.fromU64(12918));
        expect(provider.btcReceiver).toStrictEqual('e123e2d23d233');
        expect(provider.canProvideLiquidity()).toStrictEqual(true);
        expect(provider.isActive()).toStrictEqual(true);
        expect(provider.isPriority()).toStrictEqual(true);
    });

    it('should load a saved provider when provider id exists but not cached', () => {
        const providerAddress: Address = new Address([
            68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101,
            220, 185, 192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
        ]);

        const providerId: u256 = addressToPointerU256(providerAddress, tokenAddress);
        const provider: Provider2 = getProvider(providerId);
        provider.setActive(true, true);
        provider.pendingRemoval = true;
        provider.isLp = true;
        provider.liquidityProvided = u256.fromU64(129292);
        provider.liquidity = u128.fromU64(131292);
        provider.reserved = u128.fromU64(12918);
        provider.btcReceiver = 'e123e2d23d233';
        provider.enableLiquidityProvision();

        saveAllProviders();
        clearCachedProviders();
        const cacheLength: number = getProviderCacheLength();
        expect(cacheLength).toStrictEqual(0);

        const provider2: Provider2 = getProvider(providerId);

        expect(provider2).not.toStrictEqual(provider);
        expect(provider2.pendingRemoval).toStrictEqual(true);
        expect(provider.isLp).toStrictEqual(true);
        expect(provider.liquidityProvided).toStrictEqual(u256.fromU64(129292));
        expect(provider.liquidity).toStrictEqual(u128.fromU64(131292));
        expect(provider.reserved).toStrictEqual(u128.fromU64(12918));
        expect(provider.btcReceiver).toStrictEqual('e123e2d23d233');
        expect(provider.canProvideLiquidity()).toStrictEqual(true);
        expect(provider.isActive()).toStrictEqual(true);
        expect(provider.isPriority()).toStrictEqual(true);
    });
});
