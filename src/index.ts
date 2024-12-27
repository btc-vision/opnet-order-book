import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { NativeSwap } from './contracts/NativeSwap';

// DO NOT TOUCH TO THIS.
Blockchain.contract = () => {
    // ONLY CHANGE THE CONTRACT CLASS NAME.
    // DO NOT ADD CUSTOM LOGIC HERE.

    return new NativeSwap();
};

// VERY IMPORTANT
export * from '@btc-vision/btc-runtime/runtime/exports';
