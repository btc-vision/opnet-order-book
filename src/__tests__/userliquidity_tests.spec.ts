import { Blockchain, BytesReader } from '@btc-vision/btc-runtime/runtime';
import { LIQUIDITY_PROVIDER_POINTER, PROVIDER_LIQUIDITY_POINTER } from '../lib/StoredPointers';
import { UserLiquidity } from '../data-types/UserLiquidity';
import { u128, u256 } from '@btc-vision/as-bignum/assembly';

const providerId: u256 = u256.fromU32(1);

describe('UserLiquidity tests', () => {
    beforeEach(() => {
        Blockchain.clearStorage();
        Blockchain.clearMockedResults();
    });

    it('should correctly create a UserLiquidity with default value when not existing', () => {
        const userLiquidity: UserLiquidity = new UserLiquidity(
            PROVIDER_LIQUIDITY_POINTER,
            LIQUIDITY_PROVIDER_POINTER,
            providerId,
        );

        expect(userLiquidity.pendingRemoval).toBeFalsy();
        expect(userLiquidity.getActiveFlag()).toStrictEqual(0);
        expect(userLiquidity.getPriorityFlag()).toBeFalsy();
        expect(userLiquidity.canProvideLiquidity()).toBeFalsy();
        expect(userLiquidity.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(userLiquidity.getLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(userLiquidity.getLiquidityProvided()).toStrictEqual(u256.Zero);
        expect(userLiquidity.isLp()).toBeFalsy();
    });

    it('should correctly create a UserLiquidity with loaded value when existing', () => {
        const userLiquidity: UserLiquidity = new UserLiquidity(
            PROVIDER_LIQUIDITY_POINTER,
            LIQUIDITY_PROVIDER_POINTER,
            providerId,
        );

        userLiquidity.pendingRemoval = true;
        userLiquidity.setActiveFlag(1);
        userLiquidity.setPriorityFlag(1);
        userLiquidity.setCanProvideLiquidity(true);
        userLiquidity.setReservedAmount(u128.fromU32(100));
        userLiquidity.setLiquidityAmount(u128.fromU32(200));
        userLiquidity.setIsLp(true);
        userLiquidity.setLiquidityProvided(u256.fromU32(300));
        userLiquidity.save();

        const userLiquidity2: UserLiquidity = new UserLiquidity(
            PROVIDER_LIQUIDITY_POINTER,
            LIQUIDITY_PROVIDER_POINTER,
            providerId,
        );

        expect(userLiquidity2.pendingRemoval).toStrictEqual(userLiquidity.pendingRemoval);
        expect(userLiquidity2.getActiveFlag()).toStrictEqual(userLiquidity.getActiveFlag());
        expect(userLiquidity2.getPriorityFlag()).toStrictEqual(userLiquidity.getPriorityFlag());
        expect(userLiquidity2.canProvideLiquidity()).toStrictEqual(
            userLiquidity.canProvideLiquidity(),
        );
        expect(userLiquidity2.getReservedAmount()).toStrictEqual(userLiquidity.getReservedAmount());
        expect(userLiquidity2.getLiquidityAmount()).toStrictEqual(
            userLiquidity.getLiquidityAmount(),
        );
        expect(userLiquidity2.getLiquidityProvided()).toStrictEqual(
            userLiquidity.getLiquidityProvided(),
        );
        expect(userLiquidity2.isLp()).toStrictEqual(userLiquidity.isLp());
    });

    it('should correctly get/set pendingRemoval', () => {
        const userLiquidity: UserLiquidity = new UserLiquidity(
            PROVIDER_LIQUIDITY_POINTER,
            LIQUIDITY_PROVIDER_POINTER,
            providerId,
        );

        userLiquidity.pendingRemoval = true;

        expect(userLiquidity.pendingRemoval).toBeTruthy();

        userLiquidity.pendingRemoval = false;

        expect(userLiquidity.pendingRemoval).toBeFalsy();
    });

    it('should correctly get/set activeFlag', () => {
        const userLiquidity: UserLiquidity = new UserLiquidity(
            PROVIDER_LIQUIDITY_POINTER,
            LIQUIDITY_PROVIDER_POINTER,
            providerId,
        );

        userLiquidity.setActiveFlag(1);

        expect(userLiquidity.getActiveFlag()).toStrictEqual(1);

        userLiquidity.setActiveFlag(0);

        expect(userLiquidity.getActiveFlag()).toStrictEqual(0);
    });

    it('should throw when set activeFlag to other than 0 or 1', () => {
        expect(() => {
            const userLiquidity: UserLiquidity = new UserLiquidity(
                PROVIDER_LIQUIDITY_POINTER,
                LIQUIDITY_PROVIDER_POINTER,
                providerId,
            );
            userLiquidity.setActiveFlag(2);
        }).toThrow('Invalid active flag value');
    });

    it('should correctly get/set priorityFlag', () => {
        const userLiquidity: UserLiquidity = new UserLiquidity(
            PROVIDER_LIQUIDITY_POINTER,
            LIQUIDITY_PROVIDER_POINTER,
            providerId,
        );

        userLiquidity.setPriorityFlag(1);

        expect(userLiquidity.getPriorityFlag()).toBeTruthy();

        userLiquidity.setPriorityFlag(0);

        expect(userLiquidity.getPriorityFlag()).toBeFalsy();
    });

    it('should throw when set priorityFlag to other than 0 or 1', () => {
        expect(() => {
            const userLiquidity: UserLiquidity = new UserLiquidity(
                PROVIDER_LIQUIDITY_POINTER,
                LIQUIDITY_PROVIDER_POINTER,
                providerId,
            );
            userLiquidity.setPriorityFlag(2);
        }).toThrow('Invalid priority flag value');
    });

    it('should correctly get/set canProvideLiquidity', () => {
        const userLiquidity: UserLiquidity = new UserLiquidity(
            PROVIDER_LIQUIDITY_POINTER,
            LIQUIDITY_PROVIDER_POINTER,
            providerId,
        );

        userLiquidity.setCanProvideLiquidity(true);

        expect(userLiquidity.canProvideLiquidity()).toBeTruthy();

        userLiquidity.setCanProvideLiquidity(false);

        expect(userLiquidity.canProvideLiquidity()).toBeFalsy();
    });

    it('should correctly get/set reservedAmount', () => {
        const userLiquidity: UserLiquidity = new UserLiquidity(
            PROVIDER_LIQUIDITY_POINTER,
            LIQUIDITY_PROVIDER_POINTER,
            providerId,
        );

        userLiquidity.setReservedAmount(u128.from(1000));

        expect(userLiquidity.getReservedAmount()).toStrictEqual(u128.from(1000));
    });

    it('should correctly get/set liquidityAmount', () => {
        const userLiquidity: UserLiquidity = new UserLiquidity(
            PROVIDER_LIQUIDITY_POINTER,
            LIQUIDITY_PROVIDER_POINTER,
            providerId,
        );

        userLiquidity.setLiquidityAmount(u128.from(2000));

        expect(userLiquidity.getLiquidityAmount()).toStrictEqual(u128.from(2000));
    });

    it('should correctly get/set isLP', () => {
        const userLiquidity: UserLiquidity = new UserLiquidity(
            PROVIDER_LIQUIDITY_POINTER,
            LIQUIDITY_PROVIDER_POINTER,
            providerId,
        );

        userLiquidity.setIsLp(true);

        expect(userLiquidity.isLp()).toBeTruthy();

        userLiquidity.setIsLp(false);

        expect(userLiquidity.isLp()).toBeFalsy();
    });

    it('should correctly get/set liquidityProvided', () => {
        const userLiquidity: UserLiquidity = new UserLiquidity(
            PROVIDER_LIQUIDITY_POINTER,
            LIQUIDITY_PROVIDER_POINTER,
            providerId,
        );

        userLiquidity.setLiquidityProvided(u256.from(3000));

        expect(userLiquidity.getLiquidityProvided()).toStrictEqual(u256.from(3000));
    });

    it('should correctly save', () => {
        const userLiquidity: UserLiquidity = new UserLiquidity(
            PROVIDER_LIQUIDITY_POINTER,
            LIQUIDITY_PROVIDER_POINTER,
            providerId,
        );

        userLiquidity.pendingRemoval = true;
        userLiquidity.setActiveFlag(1);
        userLiquidity.setPriorityFlag(1);
        userLiquidity.setCanProvideLiquidity(true);
        userLiquidity.setReservedAmount(u128.fromU32(100));
        userLiquidity.setLiquidityAmount(u128.fromU32(200));
        userLiquidity.setIsLp(true);
        userLiquidity.setLiquidityProvided(u256.fromU32(300));

        userLiquidity.save();

        const userLiquidity2: UserLiquidity = new UserLiquidity(
            PROVIDER_LIQUIDITY_POINTER,
            LIQUIDITY_PROVIDER_POINTER,
            providerId,
        );

        expect(userLiquidity2.pendingRemoval).toStrictEqual(userLiquidity.pendingRemoval);
        expect(userLiquidity2.getActiveFlag()).toStrictEqual(userLiquidity.getActiveFlag());
        expect(userLiquidity2.getPriorityFlag()).toStrictEqual(userLiquidity.getPriorityFlag());
        expect(userLiquidity2.canProvideLiquidity()).toStrictEqual(
            userLiquidity.canProvideLiquidity(),
        );
        expect(userLiquidity2.getReservedAmount()).toStrictEqual(userLiquidity.getReservedAmount());
        expect(userLiquidity2.getLiquidityAmount()).toStrictEqual(
            userLiquidity.getLiquidityAmount(),
        );
        expect(userLiquidity2.getLiquidityProvided()).toStrictEqual(
            userLiquidity.getLiquidityProvided(),
        );
        expect(userLiquidity2.isLp()).toStrictEqual(userLiquidity.isLp());
    });

    it('should correctly reset', () => {
        const userLiquidity: UserLiquidity = new UserLiquidity(
            PROVIDER_LIQUIDITY_POINTER,
            LIQUIDITY_PROVIDER_POINTER,
            providerId,
        );

        userLiquidity.pendingRemoval = true;
        userLiquidity.setActiveFlag(1);
        userLiquidity.setPriorityFlag(1);
        userLiquidity.setCanProvideLiquidity(true);
        userLiquidity.setReservedAmount(u128.fromU32(100));
        userLiquidity.setLiquidityAmount(u128.fromU32(200));
        userLiquidity.setIsLp(true);
        userLiquidity.setLiquidityProvided(u256.fromU32(300));

        userLiquidity.reset();

        expect(userLiquidity.pendingRemoval).toBeFalsy();
        expect(userLiquidity.getActiveFlag()).toBeFalsy();
        expect(userLiquidity.getPriorityFlag()).toBeFalsy();
        expect(userLiquidity.canProvideLiquidity()).toBeFalsy();
        expect(userLiquidity.getReservedAmount()).toStrictEqual(u128.Zero);
        expect(userLiquidity.getLiquidityAmount()).toStrictEqual(u128.Zero);
        expect(userLiquidity.getLiquidityProvided()).toStrictEqual(u256.Zero);
        expect(userLiquidity.isLp()).toBeFalsy();
    });

    it('should correctly convert flags to byte[] when all true', () => {
        const userLiquidity: UserLiquidity = new UserLiquidity(
            PROVIDER_LIQUIDITY_POINTER,
            LIQUIDITY_PROVIDER_POINTER,
            providerId,
        );

        userLiquidity.pendingRemoval = true;
        userLiquidity.setActiveFlag(1);
        userLiquidity.setPriorityFlag(1);
        userLiquidity.setCanProvideLiquidity(true);
        userLiquidity.setIsLp(true);

        const bytes: u8[] = userLiquidity.toBytes();
        const packed: u256 = u256.fromBytes(bytes);

        const reader = new BytesReader(packed.toUint8Array());
        const flags: u8 = reader.readU8();

        const activeFlag: u8 = flags & 0b1;
        const priorityFlag: u8 = (flags >> 1) & 0b1;
        const canProvide: u8 = (flags >> 2) & 0b1;
        const isLiquidityProvider: u8 = (flags >> 3) & 0b1;
        const isPendingRemoval: u8 = (flags >> 4) & 0b1;

        expect(activeFlag).toStrictEqual(1);
        expect(priorityFlag).toStrictEqual(1);
        expect(canProvide).toStrictEqual(1);
        expect(isLiquidityProvider).toStrictEqual(1);
        expect(isPendingRemoval).toStrictEqual(1);
    });

    it('should correctly convert flags to byte[] when all false', () => {
        const userLiquidity: UserLiquidity = new UserLiquidity(
            PROVIDER_LIQUIDITY_POINTER,
            LIQUIDITY_PROVIDER_POINTER,
            providerId,
        );

        userLiquidity.pendingRemoval = false;
        userLiquidity.setActiveFlag(0);
        userLiquidity.setPriorityFlag(0);
        userLiquidity.setCanProvideLiquidity(false);
        userLiquidity.setIsLp(false);

        const bytes: u8[] = userLiquidity.toBytes();
        const packed: u256 = u256.fromBytes(bytes);
        const reader = new BytesReader(packed.toUint8Array());
        const flags: u8 = reader.readU8();

        const activeFlag: u8 = flags & 0b1;
        const priorityFlag: u8 = (flags >> 1) & 0b1;
        const canProvide: u8 = (flags >> 2) & 0b1;
        const isLiquidityProvider: u8 = (flags >> 3) & 0b1;
        const isPendingRemoval: u8 = (flags >> 4) & 0b1;

        expect(activeFlag).toStrictEqual(0);
        expect(priorityFlag).toStrictEqual(0);
        expect(canProvide).toStrictEqual(0);
        expect(isLiquidityProvider).toStrictEqual(0);
        expect(isPendingRemoval).toStrictEqual(0);
    });
});
