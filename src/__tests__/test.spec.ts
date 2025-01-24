import { Address, ADDRESS_BYTE_LENGTH, BytesWriter } from '@btc-vision/btc-runtime/runtime';

describe('Test something', () => {
    it('Should create a binary writer', () => {
        const someAddress = new Address([
            40, 74, 228, 172, 219, 50, 169, 155, 163, 235, 250, 102, 169, 29, 219, 65, 167, 183,
            161, 210, 254, 244, 21, 57, 153, 34, 205, 138, 4, 72, 92, 2,
        ]);

        const writer = new BytesWriter(ADDRESS_BYTE_LENGTH);
        writer.writeAddress(someAddress);

        const buffer = writer.getBuffer();
        const bytes = new Uint8Array(ADDRESS_BYTE_LENGTH);
        bytes.set([
            40, 74, 228, 172, 219, 50, 169, 155, 163, 235, 250, 102, 169, 29, 219, 65, 167, 183,
            161, 210, 254, 244, 21, 57, 153, 34, 205, 138, 4, 72, 92, 2,
        ]);

        // Log something
        //log(`${bytes}`);

        expect(buffer).toStrictEqual(bytes);
    });

    // ...
});
