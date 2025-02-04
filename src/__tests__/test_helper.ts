import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
} from '@btc-vision/btc-runtime/runtime';
import { ripemd160, sha256 } from '@btc-vision/btc-runtime/runtime/env/global';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';
import { getProvider, Provider } from '../lib/Provider';
import { Reservation } from '../lib/Reservation';

export const providerAddress1: Address = new Address([
    68, 153, 66, 199, 127, 168, 221, 199, 156, 120, 43, 34, 88, 0, 29, 93, 123, 133, 101, 220, 185,
    192, 64, 105, 97, 112, 200, 3, 234, 133, 60, 241,
]);

export const providerAddress2: Address = new Address([
    196, 73, 104, 227, 216, 12, 216, 134, 87, 166, 168, 44, 5, 101, 71, 69, 204, 213, 154, 86, 76,
    124, 186, 77, 90, 216, 39, 6, 239, 122, 100, 1,
]);

export const providerAddress3: Address = new Address([
    84, 79, 41, 213, 125, 76, 182, 184, 94, 85, 157, 217, 19, 45, 4, 70, 179, 164, 179, 31, 71, 53,
    209, 126, 10, 49, 77, 37, 107, 101, 113, 216,
]);

export const msgSender1: Address = new Address([
    56, 172, 228, 82, 23, 145, 109, 98, 102, 186, 35, 65, 115, 253, 83, 104, 64, 71, 143, 47, 250,
    36, 107, 117, 250, 119, 149, 253, 56, 102, 51, 108,
]);

export const txOrigin1: Address = new Address([
    113, 221, 31, 226, 33, 248, 28, 254, 8, 16, 106, 44, 26, 240, 107, 94, 38, 154, 85, 230, 151,
    248, 2, 44, 146, 20, 195, 28, 32, 155, 140, 210,
]);

export const contractDeployer1: Address = new Address([
    204, 190, 163, 95, 110, 134, 1, 4, 104, 204, 197, 231, 62, 122, 115, 178, 237, 191, 201, 77,
    105, 55, 36, 40, 108, 255, 168, 146, 19, 124, 126, 173,
]);

export const contractAddress1: Address = new Address([
    88, 191, 35, 122, 155, 141, 248, 53, 37, 62, 101, 60, 10, 84, 39, 102, 23, 187, 180, 182, 82,
    28, 17, 107, 182, 139, 162, 187, 102, 146, 120, 99,
]);

export const txId1: Uint8Array = new Uint8Array(32);
txId1.set([
    233, 46, 113, 133, 187, 115, 218, 211, 63, 34, 178, 231, 36, 25, 22, 110, 165, 124, 122, 201,
    247, 233, 124, 41, 254, 64, 210, 16, 98, 89, 139, 181,
]);

export const txId2: Uint8Array = new Uint8Array(32);
txId2.set([
    189, 155, 208, 203, 149, 250, 116, 136, 30, 209, 224, 135, 201, 167, 123, 33, 172, 230, 39, 99,
    88, 244, 46, 38, 51, 187, 34, 141, 149, 4, 181, 150,
]);

export const tokenAddress1: Address = new Address([
    229, 26, 76, 180, 38, 124, 121, 223, 102, 39, 240, 138, 176, 156, 20, 68, 31, 90, 205, 152, 6,
    72, 189, 57, 202, 110, 217, 180, 106, 177, 172, 45,
]);

export const tokenIdUint8Array1: Uint8Array = ripemd160(tokenAddress1);
export const tokenId1: u256 = u256.fromBytes(tokenAddress1, true);

export const tokenAddress2: Address = new Address([
    222, 40, 197, 58, 44, 174, 172, 146, 11, 2, 236, 98, 173, 123, 172, 221, 45, 8, 99, 251, 190,
    151, 230, 90, 170, 2, 198, 68, 224, 254, 129, 245,
]);

export function addressToPointerU256(address: Address, token: Address): u256 {
    const writer = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
    writer.writeAddress(address);
    writer.writeAddress(token);
    return u256.fromBytes(sha256(writer.getBuffer()), true);
}

export function createProvider(
    providerAddress: Address,
    tokenAddress: Address,
    pendingRemoval: boolean = false,
    isLP: boolean = true,
    canProvideLiquidity: boolean = true,
    btcReceiver: string = 'e123e2d23d233',
    liquidityProvided: u256 = u256.fromU64(1000),
    liquidity: u128 = u128.fromU64(1000),
    reserved: u128 = u128.fromU64(0),
    isActive: bool = true,
    isPriority: bool = false,
): Provider {
    const providerId: u256 = addressToPointerU256(providerAddress, tokenAddress);
    const provider: Provider = getProvider(providerId);

    provider.setActive(isActive, isPriority);
    provider.pendingRemoval = pendingRemoval;
    provider.isLp = isLP;
    provider.liquidityProvided = liquidityProvided;
    provider.liquidity = liquidity;
    provider.reserved = reserved;
    provider.btcReceiver = btcReceiver;

    if (canProvideLiquidity) {
        provider.enableLiquidityProvision();
    }

    return provider;
}

export function createProviders(
    nbProviderToAdd: u8,
    startIndex: u8 = 0,
    pendingRemoval: boolean = false,
    isLP: boolean = true,
    canProvideLiquidity: boolean = true,
    btcReceiver: string = 'e123e2d23d233',
    liquidityProvided: u256 = u256.fromU64(1000),
    liquidity: u128 = u128.fromU64(1000),
    reserved: u128 = u128.fromU64(0),
    isActive: bool = true,
    isPriority: bool = false,
): Provider[] {
    const providers: Provider[] = [];

    for (let i: u8 = startIndex; i < nbProviderToAdd + startIndex; i++) {
        let address: Address = new Address([
            68,
            153,
            66,
            199,
            127,
            168,
            221,
            199,
            156,
            120,
            43,
            34,
            88,
            0,
            29,
            93,
            123,
            133,
            101,
            220,
            185,
            192,
            64,
            105,
            97,
            112,
            200,
            3,
            234,
            133,
            61,
            i,
        ]);

        const provider = createProvider(
            address,
            tokenAddress1,
            pendingRemoval,
            isLP,
            canProvideLiquidity,
            btcReceiver,
            liquidityProvided,
            liquidity,
            reserved,
            isActive,
            isPriority,
        );

        providers.push(provider);
    }

    return providers;
}

export function createReservationId(tokenAddress: Address, providerAddress: Address): u128 {
    const reservationArrayId: Uint8Array = Reservation.generateId(tokenAddress, providerAddress);

    return u128.fromBytes(reservationArrayId, true);
}

export function setBlockchainEnvironment(currentBlock: u64): void {
    const currentBlockValue: u256 = u256.fromU64(currentBlock);
    const medianTimestamp: u64 = 87129871;
    const safeRnd64: u64 = 3723476278;

    const writer: BytesWriter = new BytesWriter(255);

    writer.writeAddress(msgSender1);
    writer.writeAddress(txOrigin1);
    writer.writeBytes(txId1);
    writer.writeU256(currentBlockValue);
    writer.writeAddress(contractDeployer1);
    writer.writeAddress(contractAddress1);
    writer.writeU64(medianTimestamp);
    writer.writeU64(safeRnd64);

    Blockchain.setEnvironment(writer.getBuffer());
}

export function generateReservationId(token: Address, owner: Address): u256 {
    const writer = new BytesWriter(ADDRESS_BYTE_LENGTH * 2);
    writer.writeAddress(token);
    writer.writeAddress(owner);
    const hash = ripemd160(writer.getBuffer());
    const hash2 = hash.slice(0, 16);

    return u128.fromBytes(hash2, true).toU256();
}

export const STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT: u256 = u256.fromU32(600);
