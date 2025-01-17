import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    ADDRESS_BYTE_LENGTH,
    Blockchain,
    BytesWriter,
    encodeSelector,
    Revert,
    SELECTOR_BYTE_LENGTH,
    TransactionOutput,
    TransferHelper,
    U256_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';

export const FEE_COLLECT_SCRIPT_PUBKEY: string =
    'bcrt1plz0svv3wl05qrrv0dx8hvh5mgqc7jf3mhqgtw8jnj3l3d3cs6lzsfc3mxh';

export function getTotalFeeCollected(): u64 {
    const outputs = Blockchain.tx.outputs;

    let totalFee: u64 = 0;

    // We are certain it's not the first output.
    for (let i = 1; i < outputs.length; i++) {
        const output: TransactionOutput = outputs[i];
        if (output.to !== FEE_COLLECT_SCRIPT_PUBKEY) {
            continue;
        }

        if (u64.MAX_VALUE - totalFee < output.value) {
            break;
        }

        totalFee += output.value;
    }

    return totalFee;
}

export function depositStakingRewards(
    token: Address,
    stakingContractAddress: Address,
    amount: u256,
): void {
    TransferHelper.safeApprove(token, stakingContractAddress, amount);
    const calldata = new BytesWriter(SELECTOR_BYTE_LENGTH + ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH);
    calldata.writeSelector(encodeSelector('depositAndDistributeRewards(address,uint256)'));
    calldata.writeAddress(token);
    calldata.writeU256(amount);

    const response = Blockchain.call(stakingContractAddress, calldata);
    const isOk = response.readBoolean();

    if (!isOk) {
        throw new Revert(`NativeSwap: STAKING_DEPOSIT_FAILED`);
    }
}
