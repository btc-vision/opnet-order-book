The goal is to create a native Bitcoin swap contract, similar to an order book but with some twists. Since we cannot let
people decide at what price they wish to sell their tokens for—because this would be too costly—we need to implement a
system akin to Uniswap V3 with a significant modification: **OP\_NET contracts cannot hold bitcoins**. This means we
only have access to one side of the reserve, which is the token being traded.

To address this limitation, the contract must be able to **track buy pressure to set the price accordingly**. The buy
pressure is represented by the volume of tokens being traded and a time-based algorithm calculated from the block
number, as we cannot rely on block timestamps due to potential miner manipulation (timestamp attacks). Using block
numbers ensures the system is resilient to such exploits.

---

## **Dynamic Pricing Mechanism**

We implement an **Exponentially Weighted Moving Average (EWMA)** to calculate both the buy volume and the available
liquidity, providing a secure and efficient way to adjust the price without extensive historical data storage.

### **Price Calculation Formula**

The price at time $t$ is calculated using the following formula:

```math
\text{Price}(t) = \max\left( P_0, \quad P_0 \times \left(1 + k \times \frac{\text{EWMA}_{V}(t)}{\text{EWMA}_{L}(t)} \right) \right)
```

- **$P_0$**: Base price (minimum acceptable price) for the token.
- **$k$**: Scaling constant determining the sensitivity of the price adjustment.
- **$\text{EWMA}_{V}(t)$**: Exponentially Weighted Moving Average of buy volume up to time $t$.
- **$\text{EWMA}_{L}(t)$**: Exponentially Weighted Moving Average of total liquidity up to time $t$.

### **Updating EWMA Values**

Initially, the EWMA values were intended to be updated using the standard EWMA formula:

```math
\text{EWMA}_{X}(t) = \alpha \cdot X(t) + (1 - \alpha) \cdot \text{EWMA}_{X}(t - 1)
```

However, this formula assumes updates occur at every time interval, which isn't always the case in a blockchain context
due to variable block times and transaction frequencies. Additionally, calculating powers for:

```math
(1 - \alpha)^n
```

May lead to overflows or loss of precision in fixed-point arithmetic.

#### **Adjusted EWMA Formula**

To address these issues, we adjust the EWMA calculation to account for the number of blocks elapsed since the last
update:

```math
\text{EWMA}_{X}(t) = \left(1 - \alpha \cdot n \right) \cdot \text{EWMA}_{X}(t - n) + \left( \alpha \cdot n \right) \cdot X(t)
```

Where:

- **$n$**: Number of blocks elapsed since the last update.
- **$\alpha \cdot n \leq 1$**: Ensures the decay factor remains within valid bounds.
- **$X(t)$**: Sum of the values during the elapsed blocks (buy volume or liquidity).

If $\alpha \cdot n \geq 1$, the formula simplifies to:

$$
\text{EWMA}_{X}(t) = X(t)
$$

This adjusted formula provides a linear approximation of the decay factor, which simplifies computation and avoids
overflows.

##### **Key Points in the Adjusted Formula**

- **Decay Factor**: Calculated as $1 - \alpha \cdot n$, representing the diminishing influence of older data.
- **Weight of Current Value**: Increased proportionally with $\alpha \cdot n$, emphasizing recent data.
- **Validity Constraint**: The formula is valid when $\alpha \cdot n \leq 1$; otherwise, the EWMA resets to the
  current value.

### **Representing Buy Volume and Liquidity**

#### **Buy Volume $V(t)$**

- **Definition**: Total number of tokens purchased by buyers during the elapsed blocks.
- **Measurement**: Expressed in tokens, aligning with the contract's control over token transfers.
- **Accumulation**: Buy volume is accumulated over transactions within the same block and across multiple blocks if the
  EWMA hasn't been updated.

#### **Liquidity $L(t)$**

- **Definition**: Total available liquidity in the contract, representing tokens provided by liquidity providers.
- **Measurement**: Expressed in tokens.
- **Accumulation**: Changes in liquidity (additions or withdrawals) are accumulated similarly to buy volume.

### **Handling Multiple Transactions per Block**

- **Accumulating Pending Changes**: The contract accumulates changes to buy volume and liquidity within a block.
- **Interim EWMA Calculations**: When a price quote is requested, the contract calculates interim EWMA values that
  include pending changes, ensuring the price reflects the most recent state.
- **Preventing Overflows**: By using linear approximations and careful scaling, the contract avoids numerical overflows
  in calculations.

---

## **Liquidity Management**

Users can exchange tokens for bitcoin by **adding liquidity to the contract**. This process is not instantaneous—the
user will receive bitcoin once their liquidity is sold. To ensure fairness, we treat all added liquidity equitably,
meaning **whoever added liquidity first will have their liquidity sold first** (First-In-First-Out).

### **Liquidity Storage Structure**

- **Queue Structure**: A queue is maintained to manage liquidity providers in a FIFO manner.
- **Single Entry per User**: Each user has a single entry in the queue. Additional liquidity is added to their existing
  position.
- **Active Status**: Users have an active flag indicating if they have an active liquidity position.
- **Bitcoin Deposit Address**: When adding liquidity, the user specifies their Bitcoin address for receiving payments.

### **Liquidity Withdrawal Conditions**

- **No Pending Reservations**: Users can withdraw their liquidity only if there are **no pending reservations** assigned
  to it.
- **Withdrawal Process**: Once eligible, users can withdraw their tokens from the contract.

---

## **Swap Reservation Process**

Due to the inability of OP\_NET contracts to revert bitcoin transactions, we use a **two-block process** for swaps:

1. **Reservation Transaction**: The buyer makes a reservation to swap bitcoin for tokens.
2. **Completion Transaction**: The buyer sends bitcoin directly to the liquidity providers' addresses as per the
   reservation details.

### **Reservation Details**

- **Reservation ID (u256)**: A unique identifier storing reservation parameters.
- **Structure**:
    - **Expiration Block Number**: Current block number plus 5 blocks.
    - **Start and End Indices**: Indicate the range of liquidity providers involved.
    - **Total Reserved Amount**: Original amount before dust removal.

- **Per-Provider Amounts**: An array stores the amount reserved from each provider, adjusted for precision.

### **Precision Handling**

- **Decimal Precision**: Adjusted to ensure amounts fit into storage variables without loss of significant digits.
- **Dust Handling**: Small remaining amounts that are not practical to process are considered dust and discarded.

### **Reservation Expiration and Purging**

- **Lifespan**: Reservations expire after 5 blocks if not completed.
- **Purging Process**:
    - **Tracking**: Expired reservations are tracked per token.
    - **Restoration**: Liquidity associated with expired reservations is restored to the providers.

---

## **Example Code Snippet**

```typescript
import { u256 } from 'as-bignum/assembly';
import { SafeMath } from '../../../btc-runtime/runtime';

export class Quoter {
    public static readonly a: u256 = u256.fromU32(30_000_000); // Alpha scaled by 1e8
    public static readonly k: u256 = u256.fromU32(5_000_000);  // k scaled by 1e8

    public static readonly SCALING_FACTOR: u256 = u256.fromU32(100_000_000); // 1e8

    public static getScalingFactor(): u256 {
        return Quoter.SCALING_FACTOR;
    }

    public calculatePrice(P0: u256, k: u256, EWMA_V: u256, EWMA_L: u256): u256 {
        if (u256.eq(EWMA_L, u256.Zero)) {
            return P0;
        }

        const ratio: u256 = SafeMath.div(SafeMath.mul(EWMA_V, Quoter.SCALING_FACTOR), EWMA_L);
        const scaledAdjustment: u256 = SafeMath.div(SafeMath.mul(k, ratio), Quoter.SCALING_FACTOR);

        const adjustedPrice: u256 = SafeMath.div(
            SafeMath.mul(P0, SafeMath.add(Quoter.SCALING_FACTOR, scaledAdjustment)),
            Quoter.SCALING_FACTOR,
        );

        return u256.gt(adjustedPrice, P0) ? adjustedPrice : P0;
    }

    public updateEWMA(
        currentValue: u256,
        previousEWMA: u256,
        alpha: u256,
        blocksElapsed: u256,
    ): u256 {
        if (blocksElapsed.isZero()) {
            return previousEWMA;
        }

        const scalingFactor = Quoter.SCALING_FACTOR;

        const alphaTimesBlocks = SafeMath.mul(alpha, blocksElapsed);

        if (u256.gte(alphaTimesBlocks, scalingFactor)) {
            // Decay factor becomes zero or negative
            return currentValue;
        } else {
            const decayFactor = SafeMath.sub(scalingFactor, alphaTimesBlocks);
            const weightedPrevEWMA = SafeMath.div(
                SafeMath.mul(decayFactor, previousEWMA),
                scalingFactor,
            );
            const weightedCurrentValue = SafeMath.div(
                SafeMath.mul(alphaTimesBlocks, currentValue),
                scalingFactor,
            );
            return SafeMath.add(weightedPrevEWMA, weightedCurrentValue);
        }
    }
}

export const quoter = new Quoter();
```
