import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import {
    clearCachedProviders,
    getProvider,
    getProviderCacheLength,
    Provider,
    saveAllProviders,
} from '../lib/Provider';
import {
    addressToPointerU256,
    providerAddress1,
    providerAddress2,
    providerAddress3,
    tokenAddress1,
} from './test_helper';

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
        const provider: Provider = getProvider(providerId);

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
        const provider: Provider = getProvider(providerId);
        provider.pendingRemoval = true;

        expect(provider.pendingRemoval).toStrictEqual(true);
    });

    it('should correctly set provider liquidity provider state', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.isLp = true;

        expect(provider.isLp).toStrictEqual(true);
    });

    it('should correctly set provider liquidityProvided value', () => {
        const liquidityProvided: u256 = u256.fromU64(983736);
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.liquidityProvided = liquidityProvided;

        expect(provider.liquidityProvided).toStrictEqual(liquidityProvided);
    });

    it('should correctly set provider liquidity value', () => {
        const liquidity: u128 = u128.fromU64(1827272);
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.liquidity = liquidity;

        expect(provider.liquidity).toStrictEqual(liquidity);
    });

    it('should correctly set provider reserved value', () => {
        const reserved: u128 = u128.fromU64(4434534);
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.reserved = reserved;

        expect(provider.reserved).toStrictEqual(reserved);
    });

    it('should correctly set provider btcReceiver value', () => {
        const btcReceiver: string = '0d1121291209u09hs282';
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.btcReceiver = btcReceiver;

        expect(provider.btcReceiver).toStrictEqual(btcReceiver);
    });

    it('should correctly set provider enableLiquidityProvision state', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.enableLiquidityProvision();

        expect(provider.canProvideLiquidity()).toStrictEqual(true);
    });

    it('should correctly set provider active and priority state to true', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.setActive(true, true);

        expect(provider.isActive()).toStrictEqual(true);
        expect(provider.isPriority()).toStrictEqual(true);
    });

    it('should correctly set provider active state to true and priority state to false', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.setActive(true, false);

        expect(provider.isActive()).toStrictEqual(true);
        expect(provider.isPriority()).toStrictEqual(false);
    });

    it('should correctly set provider active state to false and priority state to true', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.setActive(false, true);

        expect(provider.isActive()).toStrictEqual(false);
        expect(provider.isPriority()).toStrictEqual(true);
    });

    it('should correctly set provider active state to false and priority state to false', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
        provider.setActive(false, false);

        expect(provider.isActive()).toStrictEqual(false);
        expect(provider.isPriority()).toStrictEqual(false);
    });

    it('should reset a provider to default value', () => {
        const providerId: u256 = addressToPointerU256(providerAddress1, tokenAddress1);
        const provider: Provider = getProvider(providerId);
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
        const provider: Provider = getProvider(providerId);
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

        const provider2: Provider = getProvider(providerId);

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
        const provider: Provider = getProvider(providerId);
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

        const provider2: Provider = getProvider(providerId);

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
        const provider1: Provider = getProvider(providerId1);
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
        const provider2: Provider = getProvider(providerId2);
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
        const provider3: Provider = getProvider(providerId3);
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

        const loadedProvider1: Provider = getProvider(providerId1);

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

        const loadedProvider3: Provider = getProvider(providerId3);

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

        const loadedProvider: Provider = getProvider(providerId2);

        expect(loadedProvider).not.toStrictEqual(provider2);
        expect(loadedProvider.pendingRemoval).toStrictEqual(false);
        expect(loadedProvider.isLp).toStrictEqual(true);
        expect(loadedProvider.liquidityProvided).toStrictEqual(liquidityProvided2);
        expect(loadedProvider.liquidity).toStrictEqual(liquidity2);
        expect(loadedProvider.reserved).toStrictEqual(reserved2);
        expect(loadedProvider.btcReceiver).toStrictEqual(btcReceiver2);
        expect(loadedProvider.canProvideLiquidity()).toStrictEqual(true);
        expect(loadedProvider.isActive()).toStrictEqual(true);
        expect(loadedProvider.isPriority()).toStrictEqual(false);
    });
});
