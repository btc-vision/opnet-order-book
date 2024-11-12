# Explanation of Ticks, TicksBitmap, and `getStoragePointer`

## Overview

The **TickBitmap** is a critical data structure in the OP_NET order book system that enables efficient management and
traversal of active price ticks. It serves as a compact representation of which ticks (price levels) are initialized (
active) or uninitialized (inactive) without needing to store each tick explicitly. This design optimizes storage usage
and computational efficiency, especially when dealing with a vast range of possible price levels.

---

## Mathematical Operations and Algorithm Behind TickBitmap

### 1. Bit Representation of Ticks

- **Concept**: Each tick index corresponds to a bit in a bitmap (a sequence of bits). The bit is set (`1`) if the tick
  is initialized and cleared (`0`) if not.
- **Bitmap Words**: The bitmap is divided into words of 256 bits (matching the size of a `u256` data type).
- **Tick Index Mapping**:
    - **Word Position (`wordPos`)**: Calculated by integer division of the tick index by 256 (since each word contains
      256 bits).
      ```typescript
      const wordPos = tickIndex >> 8; // Equivalent to tickIndex / 256
      ```
    - **Bit Position (`bitPos`)**: Calculated by taking the modulo of the tick index with 256.
      ```typescript
      const bitPos = tickIndex & 0xff; // Equivalent to tickIndex % 256
      ```

### 2. Initializing and Deinitializing Ticks

- **Flipping a Tick**: To initialize or deinitialize a tick, the corresponding bit in the bitmap is set or cleared.
  ```typescript
  // To set (initialize) a bit:
  word = word | (1 << bitPos);

  // To clear (deinitialize) a bit:
  word = word & ~(1 << bitPos);
  ```
- **Bitwise Operations**:
    - **OR (`|`)**: Used to set a bit.
    - **AND (`&`)** with complement (`~`): Used to clear a bit.
    - **Shift (`<<`)**: Used to create a mask with a `1` at the desired `bitPos`.

### 3. Checking if a Tick is Initialized

- **Operation**:
  ```typescript
  const isInitialized = (word & (1 << bitPos)) != 0;
  ```
- **Explanation**:
    - Create a mask with a `1` at the `bitPos`.
    - Perform a bitwise AND with the word.
    - If the result is non-zero, the tick is initialized.

### 4. Finding the Next Initialized Tick

- **Purpose**: Efficiently find the next active tick in the desired direction without scanning all ticks.
- **Algorithm**:

  **For Searching Lower Ticks (`lte = true`):**

    1. **Mask Bits Above `bitPos`**:
        - Zero out all bits above the current `bitPos` to consider only ticks less than or equal to the current index.
        - Mask:
          ```typescript
          const mask = (1 << (bitPos + 1)) - 1;
          word = word & mask;
          ```
    2. **Check for Non-Zero Word**:
        - If the word is zero, move to the previous word (`wordPos -= 1`) and repeat.
    3. **Find Most Significant Bit (MSB)**:
        - The highest set bit in the word corresponds to the next initialized tick.
        - Use a method to find the MSB.

  **For Searching Higher Ticks (`lte = false`):**

    1. **Mask Bits Below `bitPos`**:
        - Zero out all bits below the current `bitPos` to consider only ticks greater than or equal to the current
          index.
        - Mask:
          ```typescript
          const mask = ~((1 << bitPos) - 1);
          word = word & mask;
          ```
    2. **Check for Non-Zero Word**:
        - If the word is zero, move to the next word (`wordPos += 1`) and repeat.
    3. **Find Least Significant Bit (LSB)**:
        - The lowest set bit in the word corresponds to the next initialized tick.
        - Use a method to find the LSB.

- **Bit Scanning Methods**:
    - **Most Significant Bit (MSB)**: The highest-order bit that is set to `1`.
    - **Least Significant Bit (LSB)**: The lowest-order bit that is set to `1`.

### 5. Handling Large Tick Ranges

- **Scalability**: The bitmap can represent a vast range of ticks efficiently.
- **Sparse Distribution**: Since only initialized ticks consume storage, the system remains efficient even if ticks are
  sparsely distributed across a wide range.

---

## Explanation of `getStoragePointer` Function and Uniqueness Management

### Purpose of `getStoragePointer`

The `getStoragePointer` function computes a unique storage location for each word (256-bit segment) of the TickBitmap
based on:

- **Base Pointer**: A fixed value representing the starting point for TickBitmap storage.
- **Token Address**: The address of the token, ensuring separation between different tokens.
- **Word Position**: The position of the word within the bitmap, allowing access to different segments.

### How `getStoragePointer` Works

```typescript
function getStoragePointer(wordPos: i64): u256 {
    const basePointerU256 = (this.bitmapBasePointer as u256) << 240;
    const tokenU256 = u256.fromBytes(this.token);
    const wordPosU256 = u256.fromI64(wordPos);

    // Combine token address and wordPos into subpointer
    const tokenShifted = tokenU256 << 80;
    const subpointer = tokenShifted | wordPosU256;

    // Combine base pointer and subpointer
    return basePointerU256 | subpointer;
}
```

### Breakdown of the Function

1. **Base Pointer (`bitmapBasePointer`)**:

    - **Purpose**: Serves as a unique identifier for the TickBitmap storage region.
    - **Shifted Left by 240 Bits**:
        - Ensures that the base pointer occupies the highest 16 bits of the 256-bit storage pointer.
        - Calculation:
          ```typescript
          basePointerU256 = (this.bitmapBasePointer as u256) << 240;
          ```

2. **Token Address (`token`)**:

    - **Purpose**: Differentiates the TickBitmap of different tokens.
    - **Shifted Left by 80 Bits**:
        - Positions the token address after the base pointer and before the word position.
        - Token addresses are 160 bits long.
        - Calculation:
          ```typescript
          tokenShifted = tokenU256 << 80;
          ```

3. **Word Position (`wordPos`)**:

    - **Purpose**: Identifies the specific word within the bitmap.
    - **Occupies the Lowest 80 Bits**:
        - Allows for a large range of word positions.
        - Calculation:
          ```typescript
          wordPosU256 = u256.fromI64(wordPos);
          ```

4. **Combining Components**:

    - **Subpointer**:
        - Combines the token address and word position.
        - Calculation:
          ```typescript
          subpointer = tokenShifted | wordPosU256;
          ```
    - **Final Storage Pointer**:
        - Combines the base pointer and subpointer.
        - Calculation:
          ```typescript
          storagePointer = basePointerU256 | subpointer;
          ```

### Ensuring Uniqueness

- **Unique Combination**: The storage pointer uniquely identifies a storage location based on:

    1. **Base Pointer**: Distinguishes the storage region for the TickBitmap.
    2. **Token Address**: Ensures that ticks for different tokens do not overlap in storage.
    3. **Word Position**: Differentiates between different words within the bitmap.

- **Avoiding Collisions**:

    - By assigning specific bit ranges to each component, the function ensures that no two storage pointers will be the
      same unless all components are identical.
    - **Bit Allocation**:

        - **Base Pointer**: Highest 16 bits (bits 240-255).
        - **Token Address**: Next 160 bits (bits 80-239).
        - **Word Position**: Lowest 80 bits (bits 0-79).

- **Sufficient Bit Width**:

    - **Token Address (160 bits)**: Accommodates all possible Ethereum-like addresses.
    - **Word Position (80 bits)**: Allows for \(2^{80}\) different word positions, which is more than sufficient for any
      practical application.

### Example Scenario

- **Suppose**:

    - `bitmapBasePointer` = 0x0001 (16 bits)
    - `token` = 0xABCDEF...123456 (160 bits)
    - `wordPos` = 0x00000000000000000001 (80 bits)

- **Storage Pointer Calculation**:

    - **Base Pointer Shifted**:
      ```plaintext
      basePointerU256 = 0x0001 << 240
                     = 0x00010000...0000 (256 bits, with 1 in bits 240-255)
      ```
    - **Token Shifted**:
      ```plaintext
      tokenShifted = token << 80
                  = 0xABCDEF...123456000...0000 (token in bits 80-239)
      ```
    - **Subpointer**:
      ```plaintext
      subpointer = tokenShifted | wordPosU256
                = (token in bits 80-239) | (wordPos in bits 0-79)
      ```
    - **Final Storage Pointer**:
      ```plaintext
      storagePointer = basePointerU256 | subpointer
                    = (basePointer in bits 240-255) | (token in bits 80-239) | (wordPos in bits 0-79)
      ```

- **Uniqueness Guarantee**:
    - **Different Tokens**: Different token addresses will result in different storage pointers.
    - **Different Word Positions**: Even for the same token, different `wordPos` values lead to different storage
      pointers.
    - **Same Token and Word Position**: Only when both the token and `wordPos` are the same will the storage pointer be
      the same.

### Key Comparisons Between OP_NET and Uniswap v3/v4 Ticks

1. **Tick Structure and Purpose**
    - **Uniswap v3/v4**: In Uniswap, each "tick" represents a specific price range where liquidity is concentrated.
      Instead of a flat pool, Uniswap v3 introduces the concept of **concentrated liquidity**, allowing liquidity
      providers (LPs) to choose specific price ranges in which they wish to provide liquidity. This enables higher
      capital efficiency, as liquidity is allocated to specific price bands, allowing more transactions with less
      overall liquidity.
    - **OP_NET**: Similarly, the OP_NET tick system also allows liquidity to be mapped to specific price positions (
      ticks). However, OP_NET is primarily focused on enabling an order book-like structure, where each tick acts as a
      fixed price point for trades. This is closer to a **traditional limit order book** model, where specific
      quantities are available at fixed prices.

2. **Bitmap Representation for Ticks**
    - **Uniswap v3**: Uniswap v3 uses a **bitmap** for representing which ticks are active, similar to OP_NET’s
      TickBitmap. This allows for an efficient and compact representation of initialized price ranges, enabling quick
      traversal to find the next or previous tick in the order book. For instance, when executing a swap, Uniswap v3 can
      quickly find the nearest initialized tick, helping the protocol traverse from one price range to the next as
      trades are executed.
    - **OP_NET**: OP_NET’s TickBitmap operates in a similar manner, but it’s tailored to manage the representation of
      ticks as fixed price levels in an on-chain order book. It employs bitwise operations to manage initialized and
      uninitialized ticks across potentially vast ranges, similar to Uniswap’s efficiency for managing active price
      levels.

3. **Storage Pointer and Data Organization**
    - **Uniswap v3**: The tick data in Uniswap v3 is organized in a way that optimizes for gas efficiency, using
      mappings for storing tick data. Each tick has specific information about liquidity and fees. The storage
      organization doesn’t use the same level of bitwise manipulation for storage pointers but instead relies on mapping
      keys that allow for more straightforward access to tick data within specific ranges.
    - **OP_NET**: OP_NET’s `getStoragePointer` function is designed to generate a unique pointer based on a combination
      of **base pointer**, **token address**, and **word position**. This method ensures that each tick can be
      referenced in a way that’s both unique and efficient, allowing it to manage ticks across different tokens and
      price positions.

4. **Price Progression and Efficiency**
    - **Uniswap v3**: In Uniswap v3, the protocol continuously progresses through the price range as trades occur,
      moving from one tick to the next in a direction defined by the trade. This is efficient for continuous trading
      within a narrow range, as liquidity providers can choose specific ranges, and trades automatically progress across
      these ranges as needed.
    - **OP_NET**: OP_NET's system is more suited for a fixed price point order book. It is structured for users placing
      and reserving liquidity at specific prices, allowing trades at these defined points without automatic progression
      across ranges.

5. **Reservation and Expiration Mechanisms**
    - **Uniswap v3**: Uniswap v3 does not employ an expiration or reservation system for ticks. Liquidity is
      continuously available within the price range, and trades interact with the liquidity based on the current market
      price.
    - **OP_NET**: In OP_NET, each reservation at a tick expires after a specified number of blocks. This is important in
      an order book context, where a trade reservation might be temporary, and liquidity may need to be reallocated if a
      trade does not execute in time.
