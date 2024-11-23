The goal is to create a native Bitcoin swap contract, similar to an order book but with some twists. Since we cannot let
people decide at what price they wish to sell their tokens for—because this would be too costly—we need to implement a
system akin to Uniswap V3 with a significant modification: **OP_NET contracts cannot hold bitcoins**. This means we only
have access to one side of the reserve, which is the token being traded.

To address this limitation, the contract must be able to **track buy pressure to set the price accordingly**. The buy
pressure is represented by the volume of tokens being traded and a time-based algorithm calculated from the block
number, as we cannot rely on block timestamps due to potential miner manipulation (timestamp attacks). Using block
numbers ensures the system is resilient to such exploits.

### **Dynamic Pricing Mechanism**

We implement an **Exponentially Weighted Moving Average (EWMA)** to calculate both the buy volume and the available
liquidity, providing a secure and efficient way to adjust the price without extensive historical data storage.

#### **Price Calculation Formula**

The price at time $t$ is calculated using the following formula:

```math
\text{Price}(t) = \max \left( 
    P_0,\ 
    P_0 \times \left( 
        1 + k \times \frac{\text{EWMA}_{V}(t)}{\text{EWMA}_{L}(t)} 
    \right) 
\right)
```

- **$P_0$**: Base price (minimum acceptable price) for the token.
- **$k$**: Scaling constant determining the sensitivity of the price adjustment.
- **$\text{EWMA}_{V}(t)$**: Exponentially Weighted Moving Average of buy volume at time $t$.
- **$\text{EWMA}_{L}(t)$**: Exponentially Weighted Moving Average of total liquidity at time $t$.

#### **Updating EWMA Values**

The EWMA values are updated at each block using the formula:

```math
\text{EWMA}_{X}(t) = \alpha \times X(t) + (1 - \alpha) \times \text{EWMA}_{X}(t - 1)
```

- **$\alpha$**: Smoothing factor between 0 and 1 (controls responsiveness).
- **$X(t)$**: Current value at time $t$ (buy volume $V(t)$ or liquidity $L(t)$).
- **$\text{EWMA}_{X}(t - 1)$**: Previous EWMA value.

#### **Representing Buy Volume**

- **Buy Volume $V(t)$**: Represents the **total number of tokens actually purchased by buyers during block $t$**.
- **Measurement**: Expressed in tokens (not satoshis or BTC), aligning with the contract's control over token transfers.
- **Calculation**: Sum of tokens transferred from liquidity providers to buyers within block $t$.

### **Liquidity Management**

An user can exchange tokens for bitcoin by **adding liquidity to the contract**. This process is not instantaneous—the
user will receive bitcoin once their liquidity is sold. To ensure fairness, we treat all added liquidity equitably,
meaning **whoever added liquidity first will have their liquidity sold first** (First-In-First-Out).

#### **Liquidity Storage Structure**

- **u256 Array**: Used to store user liquidity positions.
- **First Byte**: Represents if the user has an active position (0 for inactive, 1 for active).
- **Single Entry per User**: A user may only be present once in the queue; additional tokens are added to their existing
  position.
- **Bitcoin Deposit Address**: When adding liquidity, the user specifies their bitcoin address for receiving payments
  from buyers.

#### **Liquidity Withdrawal Conditions**

- **Pending Reservations**: Users can withdraw their liquidity only if there are **no pending reservations** assigned to
  it.
- **Second Byte**: Represents the number of pending reservations on the user's liquidity.
- **Withdrawal**: Allowed when the second byte indicates zero pending reservations.

### **Swap Reservation Process**

Due to the inability of OP_NET contracts to revert bitcoin transactions, we use a **two-block process** for swaps:

1. **Reservation Transaction**: The user makes a reservation to swap bitcoin for tokens.
2. **Completion Transaction**: The buyer sends bitcoin directly to the liquidity providers' addresses as per the
   reservation details.

#### **Reservation Details**

- **Reservation ID (u256)**: Pointer storing concatenated reservation parameters.
- **Structure (32 bytes)**:
    1. **8 bytes**: Expiration block number (current block number + 5 blocks).
    2. **2 bytes**: Start index of the liquidity provider queue.
    3. **2 bytes**: End index of the liquidity provider queue.
    4. **20 bytes**: Total reserved amount (original amount without dust removal).

- **u64 Array**: Represents the amount reserved for each provider, adjusted for precision.

#### **Precision Handling**

- **Decimal Precision**: Keep only 4 decimal places to fit the reserved amounts into u64 variables.
- **Token Decimals**: If the token has 18 decimals, remove the first 14 decimals for storage.
- **Dust Handling**: Remaining liquidity smaller than the minimum price (e.g., 1,000 satoshis) is considered dust and
  discarded.

### **Reservation Expiration and Purging**

- **Reservation Lifespan**: Each reservation expires after **5 blocks**.
- **Purging Expired Reservations**:
    - **u256 Array**: Tracks expired reservations per token.
    - **Zeroing Out**: Once purged, the array is reset to zero, and the liquidity is restored.

### **Global State Updates**

The contract tracks:

- **Total Available Liquidity per Token**: Updated whenever liquidity is added or removed.
- **Total Reserved Liquidity per Token**: Updated when liquidity is reserved or consumed.

Each time liquidity is added, removed, consumed, or reserved, we update the global variables accordingly to maintain an
accurate state.

### **Key Advantages of the EWMA-Based Mechanism**

- **Efficiency**: Reduces computational overhead by avoiding extensive historical data storage.
- **Security**: Mitigates manipulation risks by smoothing out sudden spikes in buy volume or liquidity.
- **Responsiveness**: Adjusts prices dynamically based on recent market activity while maintaining stability.
- **Fairness**: Ensures that token prices reflect genuine demand, benefiting both buyers and liquidity providers.

### **Implementation Considerations**

- **Smoothing Factor $\alpha$**: Determines the balance between responsiveness and smoothing; typical values might be
  around 0.3.
- **Scaling Constant $k$**: Controls price sensitivity; should be calibrated based on desired market responsiveness.
- **Atomic Updates**: Ensure that updates to EWMA values and global states are performed atomically to maintain
  consistency.
- **Data Types**: Use `u256` for variables requiring high precision, especially in arithmetic operations.
