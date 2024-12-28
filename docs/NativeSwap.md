# Native Swap For UTXO-Based Chains

Below is an in-depth explanation of how the "native swap" mechanism works in UTXO based chains. The core concept is that
this AMM (Automated Market Maker) has to handle native transactions which are not natively revertible once broadcast on
the target network and so it relies on a reservation-based model along with "block-based" price updates to protect users
and providers against exploits and irrecoverable token loss.

## Table of Contents

1. [High-Level Mechanics](#high-level-mechanics)
2. [Core AMM Logic](#core-amm-logic)
    - [Constant Product Math](#constant-product-math)
    - [1. Virtual Reserves](#1-virtual-reserves)
    - [2. Delta Accumulators & Single Block Updates](#2-delta-accumulators--single-block-updates)
    - [3. Reservation Flow](#3-reservation-flow)
    - [4. Preventing Exploits & Reverts](#4-preventing-exploits--reverts)
        - [Anti-bot Measures](#anti-bot-measures)
        - [Partial Reverts Inside the Contract](#partial-reverts-inside-the-contract)
        - [Why block-based updates avoid reversion](#why-block-based-updates-avoid-reversion)
    - [5. Why It Must Be Built This Way](#5-why-it-must-be-built-this-way)
        - [Irreversibility of Bitcoin](#irreversibility-of-bitcoin)
        - [Guaranteed Consistency for Liquidity Providers](#guaranteed-consistency-for-liquidity-providers)
        - [Reservation Expiry & Cleanup](#reservation-expiry--cleanup)
3. [User Process Flow](#process-flow)
    - [1. createPool()](#1-createpool)
    - [2. addLiquidity()](#2-addliquidity)
    - [3. reserveLiquidity()](#3-reserveliquidity)
    - [4. swap()](#4-swap)
    - [5. removeLiquidity()](#5-removeliquidity)
4. [Constraints & Rules](#constraints--rules)
5. [Security & Exploit Mitigation](#security--exploit-mitigation)
    - [Partial Fill Logic](#partial-fill-logic)
    - [Bot Limitations](#bot-limitations)
    - [Purge Mechanism](#purge-mechanism)

---

## High-Level Mechanics

### **Reservation Model**

**Problem**: When performing on chain or dual-layer swaps (in this case, with real on-chain BTC inputs), you
cannot revert a Bitcoin transaction once it's been broadcast to miners. If the AMM tries to do a typical "single
function call swap" and something fails, the BTC that was already sent can't be undone.

**Solution**: The system uses a "reservation" approach. A user first "reserves" an amount of tokens at the current
*block-based* price. This means the protocol locks a certain number of tokens for that user, guaranteed for a
specific number of blocks. During this time, the user can broadcast an actual BTC transaction to the AMM's
contract. If the transaction arrives within the reservation window, the contract completes the swap. Otherwise,
the reservation expires and the tokens are freed back to liquidity providers.

### **Block-Based Price Updating**

The AMM only re-calculates the global (virtual) reserves and price once per block—rather than on every single
swap because of the reservation mechanism. If the system *constantly updated price on every swap*, there could be
a mismatch between the user's locked reservation price and the real-time price. This mismatch would invite various
forms of sandwich attacks or partial reverts with leftover BTC.

By updating the virtual reserves once per block, every reservation within that block refers to a consistent price
snapshot. When a user calls a swap, the contract looks up the price from the block in which that user reserved
liquidity, guaranteeing a stable price that can't be front-run.

### **Irreversible BTC Transactions**

If something fails after the BTC is already sent, you cannot revert on the Bitcoin blockchain. Other blockchains
or typical single-chain AMM transactions (e.g., in Ethereum) can revert the entire transaction so that no party
loses funds if something goes wrong.
Here, the protocol must protect itself and users from scenario such as:

1. The user broadcasts BTC to the contract's receiving address.
2. The on-chain logic reverts half-way.
3. Now the tokens can't be claimed by the user, but the BTC is already gone (since the Bitcoin transaction
   cannot revert).
   Hence, the entire swap logic is arranged around the concept that *we confirm the user wants X tokens for Y BTC,
   lock (reserve) those tokens at an agreed quote, wait for the BTC to arrive, then finalize the swap.* If the BTC
   never arrives, the user's reservation times out after a set number of blocks, ensuring the locked tokens are
   re-exposed to the AMM for other trades.

---

## Core AMM Logic

### Constant Product Math

The contract maintains *virtual reserves* $B$ for BTC and $T$ for tokens. Under a **constant product** model:

$$ [
B \times T = \text{constant}
] $$

#### **Buying** (BTC in, tokens out):

$$ [
(B + \Delta B) \times (T - \Delta T_{\text{buy}}) \approx B \times T
] $$

This ensures that as more BTC flows in, fewer tokens remain, pushing the *price* up.

#### **Selling** (tokens in, BTC out):

$$ [
(B - \Delta B_{\text{sell}}) \times (T + \Delta T_{\text{sell}}) \approx B \times T
] $$

More tokens in the pool means the price of tokens goes down relative to BTC.

### 1. Virtual Reserves

#### `virtualBTCReserve` & `virtualTokenReserve`

The contract tracks two virtual reserves, $B$ and $T$. These are not necessarily the actual on-chain balances in the
contract but are instead used to compute prices in an AMM-like formula. The purpose of using virtual amounts is so
that the protocol can manipulate how the liquidity pool scales without letting short-term trades push the reserves to
zero or cause extreme slippage.

#### Scaling and Partial Fill

You will see lines like:

  ```ts
  // B' = B*T / (T - dT_buy)
  // T' = B*T / (B + dB_buy)
  ```

to maintain the invariant $B \times T = \text{constant}$ for typical constant-product style AMMs (modified for
partial fills to align with the actual BTC that arrives). But because the contract has to handle bridging from real BTC,
it accumulates changes in a "delta" until the next "updateVirtualPoolIfNeeded()" call (essentially once-per-block).

### 2. Delta Accumulators & Single Block Updates

#### Why not update price every swap?

Typically, an Uniswap-like AMM updates the pool instantly whenever a swap executes. However, in an environment that
cannot revert the BTC leg, you need to be sure that once a user commits to a price, that price *cannot* then shift out
from under them.

#### `deltaTokensAdd`, `deltaTokensBuy`, `deltaBTCSell`, etc.

Instead of recalculating the price each time a reservation or partial swap is made, the contract accumulates these
deltas:

- `deltaTokensAdd`: When liquidity is added.
- `deltaTokensBuy`, `deltaBTCBuy`: When users buy tokens with BTC (the AMM sees tokens out, BTC in).
- `deltaTokensSell`, `deltaBTCSell`: When users sell tokens for BTC (the AMM sees tokens in, BTC out).  
  These deltas are all zeroed out the next time the AMM calls `updateVirtualPoolIfNeeded()` (which runs once per
  block if any transactions happen).

#### `lastVirtualUpdateBlock`

This stored value tracks when we last performed the big re-computation of the AMM's reserves. If multiple reservations
are created within the same block or multiple liquidity additions happen, they are aggregated in these deltas. Then,
after the block transitions, `updateVirtualPoolIfNeeded()` will finalize the new price for the next block.

### 3. Reservation Flow

A typical swap from a user perspective is:

1. **`reserveLiquidity(...)`**
    - The user signals they want up to X tokens, using up to Y BTC.
    - The contract compares the user's ask with the *current block's* quote (from `quote()`, referencing
      `virtualBTCReserve` and `virtualTokenReserve`).
    - It finds and locks (reserves) those tokens from providers in either a standard queue or a priority queue,
      depending on the providers' usage.
    - This reservation is recorded under that user's address in the `Reservation` object, which persists in the contract
      state.

2. **The user sends BTC**
    - On the Bitcoin side, the user crafts a transaction that pays the protocol's BTC address with an output
      specifically matching the contract's recognized script or address.
    - Once the contract sees the BTC in its UTXOs during the `swap()` call, it finalizes the trade.

3. **`swap(...)`**
    - The user calls `swap(...)` on the contract after sending BTC.
    - The contract verifies how many satoshis actually arrived for that user's "reserved" indexes.
    - It calculates how many tokens from each liquidity provider that reservation can fill.
    - The swap is executed at the locked-in block-based quote that was captured in `_quoteHistory` for the reservation's
      creation block. This ensures no price shift can occur between reservation time and swap time.
    - The tokens are then transferred to the user.
    - The contract updates the global `deltaBTCBuy` / `deltaTokensBuy` or `deltaBTCSell` / `deltaTokensSell`, which will
      factor into the next block's updated AMM price.

If the user never sends BTC, or if they try to call `swap()` too early or too late, the reservation eventually expires
and the tokens are freed.

### 4. Preventing Exploits & Reverts

#### Anti-bot Measures

The contract includes checks like `maxTokensPerReservation`, `STRICT_MINIMUM_PROVIDER_RESERVATION_AMOUNT`, a 5-block
cap (
`maxReserves5BlockPercent`), etc. These constraints ensure that no single user can hog all the liquidity in a short
time window and manipulate on chain settlement.

#### Partial Reverts Inside the Contract

Notice that the contract has multiple checks (`if (providerId.isZero()) { throw ... }`, etc.) that revert if something
is inconsistent. But a revert in the OP_NET environment *before* finalizing the reservation or the swap is still safe,
because the user's BTC is only recognized if the outputs match in `swap()`.

However, if the user's Bitcoin has already arrived, it means we are in the final step of `swap()`, so the contract
must handle partial fills or just finalize. Because we do block-based quotes, we avoid having a half-filled state that
leads to indefinite leftover BTC.

#### Why block-based updates avoid reversion

If the AMM updated the price *mid-transaction* or on the same block for multiple reservations, an attacker might craft
an exploit that tries to pick off the best price or cause partial reverts once they see the user's BTC in the mempool.
By only finalizing changes once per block, the protocol ensures that everyone in that block sees the same uniform
price reference.

### 5. Why It Must Be Built This Way

#### Irreversibility of Bitcoin

As mentioned, the key driver is that any misstep after a BTC transaction is broadcast leaves the protocol holding the
bag. In many typical blockchain AMMs (like on Ethereum), a revert just undoes the whole transaction, giving the user
back their ETH and leaving the contract state unchanged. That’s impossible once BTC is transmitted to a noncustodial
address. Hence, the design choice of *block-based reservations* is crucial.

#### Guaranteed Consistency for Liquidity Providers

Liquidity providers deposit tokens into the system and rely on the AMM to manage partial or full usage of their
liquidity. By having a per-block update cycle, the system can neatly handle multiple user reservations and finalize
them after a single block. This approach ensures providers don’t get sandwiched or exploited between sub-block
transactions.

#### Reservation Expiry & Cleanup

Because the reservation has a fixed lifespan (e.g., 5 blocks in the `RESERVATION_EXPIRE_AFTER` parameter), it
prevents indefinite token lockdown. If the user does not finalize the swap or send the BTC in time, the system calls
`purgeReservationsAndRestoreProviders()`, freeing up the tokens for other swaps. This is especially vital given that
we cannot forcibly "undo" the user’s un-sent Bitcoin transaction after some waiting period.

___

## Process Flow

Below is how each main function works, from the user's perspective.

### 1. createPool()

**Who uses it?** The token owner (project deployer).  
**Purpose:** Initialize a brand-new liquidity pool with a *floor price* and some initial token liquidity.

- **floorPrice**: The initial price (scaled in a specific way internally).
- **providerId**: The unique identifier for the *initial provider*.
- **initialLiquidity**: Amount of tokens to seed the pool.
- **receiver**: The BTC address where the initial provider wants to receive BTC.
- **antiBotEnabledFor** & **antiBotMaximumTokensPerReservation**: Optional anti-bot configuration.
- **maxReservesIn5BlocksPercent**: Extra limit on how many tokens can be reserved in a rolling 5-block window (
  protection from sudden spikes).

**Constraints**:

- Only the **token owner** can call `createPool()`.
- `floorPrice` and `initialLiquidity` **cannot be zero**.
- If `antiBotEnabledFor` is set, then `antiBotMaximumTokensPerReservation` **cannot be zero**.

### 2. addLiquidity()

**Who uses it?** Anyone wishing to deposit tokens.  
**Purpose:** Provide liquidity to the pool, potentially as a *priority* provider.

**Parameters**:

- **token**: The token address for which you're providing liquidity.
- **receiver**: Your BTC address to receive satoshis when your tokens are sold.
- **amountIn**: Number of tokens you are depositing.
- **priority**: Boolean. If `true`, you pay a tax to enter the *priority queue*.

**Workflow**:

1. The contract checks if you already have liquidity in the **priority** or **standard** queue.
2. You send tokens to the contract via `TransferHelper.safeTransferFrom`.
3. If `priority === true`, a portion of your tokens are taxed (burned) to pay for your seat in the priority queue.
4. The rest of your tokens are recognized as your liquidity.

**Constraints**:

- You **cannot** exceed the pool's maximum token or numeric limits (checked by SafeMath).
- The pool enforces a minimum "liquidity in satoshis" to ensure that trivial amounts aren't added (see
  `MINIMUM_LIQUIDITY_IN_SAT_VALUE_ADD_LIQUIDITY`).
- If you're already in the *priority queue*, you must keep adding as priority (you can't switch back and forth for
  free).

### 3. reserveLiquidity()

**Who uses it?** Traders who want to buy tokens.  
**Purpose:** "Reserve" tokens before actually paying BTC.

**Parameters**:

- **maximumAmountIn**: How many tokens you *ultimately* plan to buy (in satoshis, scaled for the contract).
- **minimumAmountOut**: The minimum tokens you are willing to accept.

**Workflow**:

1. The contract calculates how many tokens your `maximumAmountIn` could buy at the current *virtual price*.
2. It checks availability across the **priority** and **standard** queue providers.
3. It marks those tokens "reserved" for you (they cannot be sold to anyone else).
4. It emits an event indicating the reserved tokens and how many satoshis might be needed.

**Constraints**:

- If you have an existing active reservation, you can't create a new one.
- Must be >= the **minimum trade size** (e.g., `10,000 satoshis`).
- If the pool is in the *anti-bot window*, you cannot exceed `maxTokensPerReservation`.
- If the pool doesn't have enough free tokens, the reservation is partially or fully declined.

### 4. swap()

**Who uses it?** Buyers who previously reserved tokens.  
**Purpose:** Finalize the purchase by sending actual BTC to the providers.

**Workflow**:

1. The contract checks your reservation details (how many tokens were reserved, from which providers, etc.).
2. It looks at your transaction outputs (`Blockchain.tx.outputs`) to see how much BTC (satoshis) is sent to each
   provider's BTC address.
3. Based on the actual BTC provided, it calculates the final number of tokens you can buy (partial fill if underpaid).
4. Transfers tokens to you and updates providers' liquidity.
5. Emits a `SwapExecutedEvent`.

**Constraints**:

- You must call `swap()` **before** your reservation expires (`RESERVATION_EXPIRE_AFTER` blocks).
- If you send **no** or **insufficient** BTC, your reserved tokens get restored back to the providers.
- If the contract's "virtual price" was extremely high or low, partial fill might apply to avoid overshoot.

### 5. removeLiquidity()

**Who uses it?** Liquidity providers who want their tokens back.
**Purpose:** Withdraw your active token position from the pool.

**Workflow**:

- Not yet implemented—**TODO**.

**Constraints**:

- You must have free (non-reserved) liquidity in the pool.

## Constraints & Rules

1. **Minimum Trade Size**:
    - `minimumTradeSize` = 10,000 satoshis. Any reservation or swap below this reverts.

2. **Anti-Bot Window**:
    - If `antiBotEnabledFor` > 0, until `antiBotExpirationBlock`, large single reservations are blocked.
    - The contract enforces `maxTokensPerReservation`.

3. **Priority Tax**:
    - If you choose the **priority queue** for your liquidity, a percentage of your deposited tokens is burned. This tax
      is set by `PERCENT_TOKENS_FOR_PRIORITY_QUEUE / PERCENT_TOKENS_FOR_PRIORITY_FACTOR`.

4. **Reservation Expiration**:
    - `RESERVATION_EXPIRE_AFTER` blocks (default = 5).
    - If you don't call `swap()` by then, your reservation can be purged, and tokens are restored to the providers.

5. **Virtual Updates**:
    - After each block, the contract updates its "virtual" reserves (BTC & tokens) once. This ensures stable price
      calculations and partial fill logic.

6. **Revert on Invalid Inputs**:
    - Zero or negative amounts, overflow conditions, or unverified BTC addresses cause immediate reverts.

## Security & Exploit Mitigation

### Partial Fill Logic

If a buyer does not send enough BTC to match their "desired" amount of tokens, the contract partially fills the trade:

- **Excess tokens** remain in the liquidity pool, or get restored to the provider's available (non-reserved) balance.
- **No infinite minting** scenario because the contract always ensures $(B \times T)$ remains constant or adjusts it
  proportionally.

### Bot Limitations

An **anti-bot** mechanism:

- Caps how many tokens can be reserved per user for a certain number of blocks after the pool is created.
- Prevents a single bot from reserving nearly all liquidity in the first blocks.

### Purge Mechanism

Stale reservations are automatically purged after `RESERVATION_EXPIRE_AFTER` blocks:

- Any tokens that were "reserved" return to the provider's available balance.
- Ensures no indefinite lock of liquidity.
