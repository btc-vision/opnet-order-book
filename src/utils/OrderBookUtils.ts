import { Blockchain, TransactionOutput } from '@btc-vision/btc-runtime/runtime';

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
