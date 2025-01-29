import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
} from '@btc-vision/btc-runtime/runtime';
import { ripemd160, sha256 } from '@btc-vision/btc-runtime/runtime/env/global';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    clearCachedProviders,
    getProvider,
    getProviderCacheLength,
    Provider2,
    saveAllProviders,
} from '../lib/Provider2';

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

/*

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

const strictMinimumProviderReservationAmount: u256 = u256.fromU32(600);

function addressToPointerU256(address: Address, token: Address): u256 {
    const writer = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
    writer.writeAddress(address);
    writer.writeAddress(token);
    return u256.fromBytes(sha256(writer.getBuffer()), true);
}

describe('Provider tests', () => {
    beforeEach(() => {
        clearCachedProviders();
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should create a new provider when provider id does not exists', () => {
        //const t: LiquidityQueue = new LiquidityQueue(tokenAddress, tokenIdUint8Array, false);
    });

    it('should create a new provider when provider id does not exists', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
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
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider2 = getProvider(providerId);
        provider.pendingRemoval = true;

        expect(provider.pendingRemoval).toStrictEqual(true);
    });

    it('should correctly set provider liquidity provider state', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider2 = getProvider(providerId);
        provider.isLp = true;

        expect(provider.isLp).toStrictEqual(true);
    });

    it('should correctly set provider liquidityProvided value', () => {
        const liquidityProvided: u256 = u256.fromU64(983736);
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider2 = getProvider(providerId);
        provider.liquidityProvided = liquidityProvided;

        expect(provider.liquidityProvided).toStrictEqual(liquidityProvided);
    });

    it('should correctly set provider liquidity value', () => {
        const liquidity: u128 = u128.fromU64(1827272);
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider2 = getProvider(providerId);
        provider.liquidity = liquidity;

        expect(provider.liquidity).toStrictEqual(liquidity);
    });

    it('should correctly set provider reserved value', () => {
        const reserved: u128 = u128.fromU64(4434534);
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider2 = getProvider(providerId);
        provider.reserved = reserved;

        expect(provider.reserved).toStrictEqual(reserved);
    });

    it('should correctly set provider btcReceiver value', () => {
        const btcReceiver: string = '0d1121291209u09hs282';
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider2 = getProvider(providerId);
        provider.btcReceiver = btcReceiver;

        expect(provider.btcReceiver).toStrictEqual(btcReceiver);
    });

    it('should correctly set provider enableLiquidityProvision state', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider2 = getProvider(providerId);
        provider.enableLiquidityProvision();

        expect(provider.canProvideLiquidity()).toStrictEqual(true);
    });

    it('should correctly set provider active and priority state to true', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider2 = getProvider(providerId);
        provider.setActive(true, true);

        expect(provider.isActive()).toStrictEqual(true);
        expect(provider.isPriority()).toStrictEqual(true);
    });

    it('should correctly set provider active state to true and priority state to false', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider2 = getProvider(providerId);
        provider.setActive(true, false);

        expect(provider.isActive()).toStrictEqual(true);
        expect(provider.isPriority()).toStrictEqual(false);
    });

    it('should correctly set provider active state to false and priority state to true', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider2 = getProvider(providerId);
        provider.setActive(false, true);

        expect(provider.isActive()).toStrictEqual(false);
        expect(provider.isPriority()).toStrictEqual(true);
    });

    it('should correctly set provider active state to false and priority state to false', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider2 = getProvider(providerId);
        provider.setActive(false, false);

        expect(provider.isActive()).toStrictEqual(false);
        expect(provider.isPriority()).toStrictEqual(false);
    });

    it('should reset a provider to default value', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider2 = getProvider(providerId);
        const btcReceiver: string = 'e123e2d23d233';
        const liquidityProvided: u256 = u256.fromU64(129292);
        const liquidity: u128 = u128.fromU64(131292);
        const reserved: u128 = u128.fromU64(12918);

        provider.setActive(true, true);
        provider.pendingRemoval = true;
        provider.isLp = true;
        provider.liquidityProvided = liquidityProvided;
        provider.liquidity = liquidity;
        provider.reserved = reserved;
        provider.btcReceiver = btcReceiver;
        provider.enableLiquidityProvision();
        provider.reset();

        expect(provider.pendingRemoval).toStrictEqual(false);
        expect(provider.isLp).toStrictEqual(false);
        expect(provider.liquidityProvided).toStrictEqual(u256.Zero);
        expect(provider.liquidity).toStrictEqual(u128.Zero);
        expect(provider.reserved).toStrictEqual(u128.Zero);
        expect(provider.btcReceiver).toStrictEqual(btcReceiver);
        expect(provider.canProvideLiquidity()).toStrictEqual(false);
        expect(provider.isActive()).toStrictEqual(false);
        expect(provider.isPriority()).toStrictEqual(false);
    });

    it('should get a cached provider when provider id exists', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider2 = getProvider(providerId);
        const btcReceiver: string = 'e123e2d23d233';
        const liquidityProvided: u256 = u256.fromU64(129292);
        const liquidity: u128 = u128.fromU64(131292);
        const reserved: u128 = u128.fromU64(12918);

        provider.setActive(true, true);
        provider.pendingRemoval = true;
        provider.isLp = true;
        provider.liquidityProvided = liquidityProvided;
        provider.liquidity = liquidity;
        provider.reserved = reserved;
        provider.btcReceiver = btcReceiver;
        provider.enableLiquidityProvision();

        const provider2: Provider2 = getProvider(providerId);

        expect(provider2).toStrictEqual(provider);
        expect(provider2.pendingRemoval).toStrictEqual(true);
        expect(provider2.isLp).toStrictEqual(true);
        expect(provider2.liquidityProvided).toStrictEqual(liquidityProvided);
        expect(provider2.liquidity).toStrictEqual(liquidity);
        expect(provider2.reserved).toStrictEqual(reserved);
        expect(provider2.btcReceiver).toStrictEqual(btcReceiver);
        expect(provider2.canProvideLiquidity()).toStrictEqual(true);
        expect(provider2.isActive()).toStrictEqual(true);
        expect(provider2.isPriority()).toStrictEqual(true);
    });

    it('should load a saved provider when provider id exists but not cached', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider2 = getProvider(providerId);
        const btcReceiver: string = 'e123e2d23d233';
        const liquidityProvided: u256 = u256.fromU64(129292);
        const liquidity: u128 = u128.fromU64(131292);
        const reserved: u128 = u128.fromU64(12918);

        provider.setActive(true, true);
        provider.pendingRemoval = true;
        provider.isLp = true;
        provider.liquidityProvided = liquidityProvided;
        provider.liquidity = liquidity;
        provider.reserved = reserved;
        provider.btcReceiver = btcReceiver;
        provider.enableLiquidityProvision();

        saveAllProviders();
        clearCachedProviders();
        const cacheLength: number = getProviderCacheLength();
        expect(cacheLength).toStrictEqual(0);

        const provider2: Provider2 = getProvider(providerId);

        expect(provider2).not.toStrictEqual(provider);
        expect(provider2.pendingRemoval).toStrictEqual(true);
        expect(provider2.isLp).toStrictEqual(true);
        expect(provider2.liquidityProvided).toStrictEqual(liquidityProvided);
        expect(provider2.liquidity).toStrictEqual(liquidity);
        expect(provider2.reserved).toStrictEqual(reserved);
        expect(provider2.btcReceiver).toStrictEqual(btcReceiver);
        expect(provider2.canProvideLiquidity()).toStrictEqual(true);
        expect(provider2.isActive()).toStrictEqual(true);
        expect(provider2.isPriority()).toStrictEqual(true);
    });

    it('should load 3 different saved providers when providers id exists but not cached', () => {
        const providerId1: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider1: Provider2 = getProvider(providerId1);
        const btcReceiver1: string = 'e123e2d23d233';
        const liquidityProvided1: u256 = u256.fromU64(129292);
        const liquidity1: u128 = u128.fromU64(131292);
        const reserved1: u128 = u128.fromU64(12918);

        provider1.setActive(true, true);
        provider1.pendingRemoval = true;
        provider1.isLp = true;
        provider1.liquidityProvided = liquidityProvided1;
        provider1.liquidity = liquidity1;
        provider1.reserved = reserved1;
        provider1.btcReceiver = btcReceiver1;
        provider1.enableLiquidityProvision();

        const providerId2: u256 = addressToPointerU256(providerAddress2, tokenAddress1);
        const provider2: Provider2 = getProvider(providerId2);
        const btcReceiver2: string = 'd03kd339idjkdi';
        const liquidityProvided2: u256 = u256.fromU64(837343);
        const liquidity2: u128 = u128.fromU64(56252);
        const reserved2: u128 = u128.fromU64(32837);

        provider2.setActive(true, false);
        provider2.pendingRemoval = false;
        provider2.isLp = true;
        provider2.liquidityProvided = liquidityProvided2;
        provider2.liquidity = liquidity2;
        provider2.reserved = reserved2;
        provider2.btcReceiver = btcReceiver2;
        provider2.enableLiquidityProvision();

        const providerId3: u256 = addressToPointerU256(providerAddress3, tokenAddress1);
        const provider3: Provider2 = getProvider(providerId3);
        const btcReceiver3: string = 'peiekje0393';
        const liquidityProvided3: u256 = u256.fromU64(624262);
        const liquidity3: u128 = u128.fromU64(126367);
        const reserved3: u128 = u128.fromU64(49484);

        provider3.setActive(false, false);
        provider3.pendingRemoval = false;
        provider3.isLp = true;
        provider3.liquidityProvided = liquidityProvided3;
        provider3.liquidity = liquidity3;
        provider3.reserved = reserved3;
        provider3.btcReceiver = btcReceiver3;
        provider3.enableLiquidityProvision();

        saveAllProviders();
        clearCachedProviders();
        const cacheLength: number = getProviderCacheLength();
        expect(cacheLength).toStrictEqual(0);

        const loadedProvider1: Provider2 = getProvider(providerId1);

        expect(loadedProvider1).not.toStrictEqual(provider1);
        expect(loadedProvider1.pendingRemoval).toStrictEqual(true);
        expect(loadedProvider1.isLp).toStrictEqual(true);
        expect(loadedProvider1.liquidityProvided).toStrictEqual(liquidityProvided1);
        expect(loadedProvider1.liquidity).toStrictEqual(liquidity1);
        expect(loadedProvider1.reserved).toStrictEqual(reserved1);
        expect(loadedProvider1.btcReceiver).toStrictEqual(btcReceiver1);
        expect(loadedProvider1.canProvideLiquidity()).toStrictEqual(true);
        expect(loadedProvider1.isActive()).toStrictEqual(true);
        expect(loadedProvider1.isPriority()).toStrictEqual(true);

        const loadedProvider3: Provider2 = getProvider(providerId3);

        expect(loadedProvider3).not.toStrictEqual(provider3);
        expect(loadedProvider3.pendingRemoval).toStrictEqual(false);
        expect(loadedProvider3.isLp).toStrictEqual(true);
        expect(loadedProvider3.liquidityProvided).toStrictEqual(liquidityProvided3);
        expect(loadedProvider3.liquidity).toStrictEqual(liquidity3);
        expect(loadedProvider3.reserved).toStrictEqual(reserved3);
        expect(loadedProvider3.btcReceiver).toStrictEqual(btcReceiver3);
        expect(loadedProvider3.canProvideLiquidity()).toStrictEqual(true);
        expect(loadedProvider3.isActive()).toStrictEqual(false);
        expect(loadedProvider3.isPriority()).toStrictEqual(false);

        const loadedProvider2: Provider2 = getProvider(providerId2);

        expect(loadedProvider2).not.toStrictEqual(provider2);
        expect(loadedProvider2.pendingRemoval).toStrictEqual(false);
        expect(loadedProvider2.isLp).toStrictEqual(true);
        expect(loadedProvider2.liquidityProvided).toStrictEqual(liquidityProvided2);
        expect(loadedProvider2.liquidity).toStrictEqual(liquidity2);
        expect(loadedProvider2.reserved).toStrictEqual(reserved2);
        expect(loadedProvider2.btcReceiver).toStrictEqual(btcReceiver2);
        expect(loadedProvider2.canProvideLiquidity()).toStrictEqual(true);
        expect(loadedProvider2.isActive()).toStrictEqual(true);
        expect(loadedProvider2.isPriority()).toStrictEqual(false);
    });
});
