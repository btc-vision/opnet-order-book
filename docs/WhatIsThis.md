# Native Bitcoin Swap Contract with Dynamic Pricing and Liquidity Management

## **Overview**

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

The price at time$t$is calculated using the following formula:

```math

\text{Price}(t) = \max\left( P_0, \quad P_0 \times \left(1 + k \times \frac{\text{EWMA}_V(t)}{\text{EWMA}_L(t)} \right) \right)

```

- **$P_0$**: Base price (minimum acceptable price) for the token.
- **$k$**: Scaling constant determining the sensitivity of the price adjustment.
- **$\text{EWMA}_V(t)$**: Exponentially Weighted Moving Average of buy volume up to time $t$.
- **$\text{EWMA}_L(t)$**: Exponentially Weighted Moving Average of total liquidity up to time $t$.

### **Modifications for Zero Liquidity Periods**

To ensure that the price **increases over time when there is no liquidity**, we have modified the EWMA calculation for
liquidity $\text{EWMA}_L$ to incorporate the effect of time without liquidity.

#### **Adjusted $\text{EWMA}_L$ During Zero Liquidity**

When the available liquidity is zero, we adjust the $\text{EWMA}_L$ value to **decay exponentially over time**,
reflecting increasing scarcity and causing the price to increase accordingly.

##### **Decay of $\text{EWMA}_L$**

The decay of $\text{EWMA}_L$ during periods of zero liquidity is calculated as:

```math
\text{EWMA}_L(t) = \text{EWMA}_L(t_0) \times d^{(t - t_0)}
```

- **$\text{EWMA}_L(t_0)$**: The last known $\text{EWMA}_L$ before liquidity became zero (at time $t_0$ ).
- **$d$**: Decay rate per block (a value between 0 and 1, e.g., 0.9).
- **$t - t_0$**: Number of blocks elapsed since liquidity became zero.

As $\text{EWMA}_L(t)$ decreases over time due to decay, the price $\text{Price}(t)$ increases because $\text{EWMA}_L(t)$
is in the denominator of the price formula.

#### **Modified Price Calculation During Zero Liquidity**

By incorporating the decayed $\text{EWMA}_L(t)$ , the price formula becomes:

```math
\text{Price}(t) = \max\left( P_0, \; P_0 \times \left(1 + k \times \frac{\text{EWMA}_V(t)}{\text{EWMA}_L(t_0) \cdot d^{(t - t_0)}} \right) \right)
```

This ensures that as the number of blocks without liquidity increases, the price increases accordingly.

### **Updating EWMA Values**

#### **EWMA of Liquidity ( $\text{EWMA}_L$ )**

We adjust the EWMA calculation for liquidity to account for periods with and without liquidity.

- **When Liquidity Is Available:**

  We use the standard EWMA update formula:

```math
\text{EWMA}_L(t) = \alpha \times L(t) + (1 - \alpha) \times \text{EWMA}_L(t - 1)
```

Where:

- **$\alpha$**: Smoothing factor for the EWMA.
- **$L(t)$**: Current liquidity at time $t$.

- **When Liquidity Is Zero:**

  We apply the decay factor to the previous $\text{EWMA}_L$:

```math
\text{EWMA}_L(t) = \text{EWMA}_L(t - 1) \times d
```

This process repeats for each block without liquidity, causing $\text{EWMA}_L$ to decay exponentially over time.

#### **EWMA of Buy Volume ( $\text{EWMA}_V$ )**

The EWMA of buy volume continues to be updated using the standard EWMA formula:

```math
\text{EWMA}_V(t) = \alpha \times V(t) + (1 - \alpha) \times \text{EWMA}_V(t - 1)
```

- **$V(t)$**: Buy volume at time $t$.

### **Preventing Price from Resetting or Going to Zero**

By incorporating the decay of $\text{EWMA}_L$ during periods without liquidity, the price does not reset to $P_0$ or
drop unexpectedly. Instead, it **increases over time**, reflecting the scarcity of liquidity.

### **Ensuring Price Does Not Become Unrealistic**

To prevent the price from becoming excessively high due to the exponential increase, we set:

- **Minimum $\text{EWMA}_L$ Value:** A small positive value to prevent division by zero (e.g., $\text{EWMA}_L \geq 1$ ).

- **Maximum Price Cap:** A ceiling on the price to prevent it from becoming impractically high.

---

## **Liquidity Management**

Users can exchange tokens for bitcoin by **adding liquidity to the contract**. This process is not instantaneous—the
user will receive bitcoin once their liquidity is sold. To ensure fairness, we treat all added liquidity equitably,
meaning **whoever added liquidity first will have their liquidity sold first** (First-In-First-Out).

### **Liquidity Storage Structure**

- **Queue Structure:** A queue is maintained to manage liquidity providers in a FIFO manner.
- **Single Entry per User:** Each user has a single entry in the queue. Additional liquidity is added to their existing
  position.
- **Active Status:** Users have an active flag indicating if they have an active liquidity position.
- **Bitcoin Deposit Address:** When adding liquidity, the user specifies their Bitcoin address for receiving payments.

### **Liquidity Withdrawal Conditions**

- **No Pending Reservations:** Users can withdraw their liquidity only if there are **no pending reservations** assigned
  to it.
- **Withdrawal Process:** Once eligible, users can withdraw their tokens from the contract.

### **Minimum Liquidity Threshold**

To ensure that there is always a **minimum amount of liquidity** available in the market and to prevent liquidity from
reaching zero, we enforce a **minimum liquidity threshold**.

- **Threshold Value:** For example, 10,000 units of liquidity.
- **Reservation Restriction:** Users cannot reserve liquidity if doing so would reduce the total available liquidity
  below the threshold.
- **Purpose:** This helps maintain market stability and ensures that the price does not become excessively high too
  quickly.

---

## **Swap Reservation Process**

Due to the inability of OP\_NET contracts to revert bitcoin transactions, we use a **two-block process** for swaps:

1. **Reservation Transaction:** The buyer makes a reservation to swap bitcoin for tokens.
2. **Completion Transaction:** The buyer sends bitcoin directly to the liquidity providers' addresses as per the
   reservation details.

### **Reservation Details**

- **Reservation ID (u256):** A unique identifier storing reservation parameters.
- **Structure:**
    - **Expiration Block Number:** Current block number plus 5 blocks.
    - **Start and End Indices:** Indicate the range of liquidity providers involved.
    - **Total Reserved Amount:** Original amount before dust removal.

- **Per-Provider Amounts:** An array stores the amount reserved from each provider, adjusted for precision.

### **Precision Handling**

- **Decimal Precision:** Adjusted to ensure amounts fit into storage variables without loss of significant digits.
- **Dust Handling:** Small remaining amounts that are not practical to process are considered dust and discarded.

### **Reservation Expiration and Purging**

- **Lifespan:** Reservations expire after 5 blocks if not completed.
- **Purging Process:**
    - **Tracking:** Expired reservations are tracked per token.
    - **Restoration:** Liquidity associated with expired reservations is restored to the providers.

---

## **Example Code Snippet with Modifications**

Below is an example of the modified `Quoter` class, incorporating the adjustments to handle periods without liquidity:

```typescript
import { u256 } from 'as-bignum/assembly';
import { SafeMath } from '../../../btc-runtime/runtime';

export class Quoter {
    public static readonly a: u256 = u256.fromU32(30_000_000);
    public static readonly k: u256 = u256.fromU32(5_000_000);

    public static readonly SCALING_FACTOR: u256 = u256.fromU32(100_000_000);
    public static readonly MIN_EWMA_L: u256 = u256.fromU64(1);
    public static readonly PRICE_CAP: u256 = u256.fromU64(1_000_000_000);

    public static getScalingFactor(): u256 {
        return Quoter.SCALING_FACTOR;
    }

    public static pow(base: u256, exponent: u256): u256 {
        let result: u256 = Quoter.SCALING_FACTOR;
        let b: u256 = base;
        let e: u256 = exponent;

        while (u256.gt(e, u256.Zero)) {
            if (u256.eq(u256.and(e, u256.One), u256.One)) {
                result = SafeMath.div(SafeMath.mul(result, b), Quoter.SCALING_FACTOR);
            }
            e = u256.shr(e, 1);
            b = SafeMath.div(SafeMath.mul(b, b), Quoter.SCALING_FACTOR);
        }

        return result;
    }

    public calculatePrice(P0: u256, k: u256, EWMA_V: u256, EWMA_L: u256): u256 {
        // Prevent division by zero or extremely small values
        const adjustedEWMA_L = u256.lt(EWMA_L, Quoter.MIN_EWMA_L) ? Quoter.MIN_EWMA_L : EWMA_L;

        const ratio: u256 = SafeMath.div(
            SafeMath.mul(EWMA_V, Quoter.SCALING_FACTOR),
            adjustedEWMA_L,
        );

        const scaledAdjustment: u256 = SafeMath.div(SafeMath.mul(k, ratio), Quoter.SCALING_FACTOR);

        const adjustedPrice: u256 = SafeMath.div(
            SafeMath.mul(P0, SafeMath.add(Quoter.SCALING_FACTOR, scaledAdjustment)),
            Quoter.SCALING_FACTOR,
        );

        return u256.gt(adjustedPrice, Quoter.PRICE_CAP) ? Quoter.PRICE_CAP : adjustedPrice;
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

        const oneMinusAlpha: u256 = SafeMath.sub(scalingFactor, alpha);
        const decayFactor: u256 = Quoter.pow(oneMinusAlpha, blocksElapsed);

        const weightedPrevEWMA: u256 = SafeMath.div(
            SafeMath.mul(decayFactor, previousEWMA),
            scalingFactor,
        );

        const weightedCurrentValue: u256 = SafeMath.div(
            SafeMath.mul(SafeMath.sub(scalingFactor, decayFactor), currentValue),
            scalingFactor,
        );

        return SafeMath.add(weightedPrevEWMA, weightedCurrentValue);
    }
}

export const quoter = new Quoter();
```
