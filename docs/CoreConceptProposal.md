# Part 1: First-Order Architecture & Design

## 1. The Core Problem: Noncustodial AMM using native bitcoin

**Goal:** We want a noncustodial Automated Market Maker (AMM) that uses *native* Bitcoin—no centralized custody, no
synthetic token stand-ins.

**Challenge:** Bitcoin's script capabilities are limited. On Ethereum, smart contracts can hold both sides of a
liquidity pool (e.g., ETH + Token) in a Uniswap V2 contract. But Bitcoin does not offer that same level of
programmability; you can't just lock bitcoins in a contract that automatically rebalances.

Hence, the question: **How can we build a programmatic, trustless AMM that interacts with *real* BTC without relying on
custodians?**

### 2. Why Classical Uniswap Fails on Native Bitcoin

Traditional Uniswap relies on:

1. A contract holding two assets simultaneously.
2. The ability for anyone to deposit or withdraw those assets freely, updating the spot price as reserves change.

With real Bitcoin, you can't programmatically hold BTC inside a contract that rebalances. So the typical "pool of BTC +
Token" approach simply doesn't apply.

### 3. Forced One-Sided Pools for BTC

Because we can't store BTC in the contract, any on-chain pool can really only hold the *token* side. The "BTC side" is
therefore **virtual**. This means:

- The AMM sees a "virtual BTC reserve" for price calculations.
- Whenever a user wants to *sell* tokens for BTC, they place a *listing* (not an instant swap), waiting for an incoming
  buyer with actual BTC.
- Whenever a user wants to *add liquidity* with BTC, it effectively *buys tokens* from sellers in the queue, while the
  contract tracks that user's share of a "virtual BTC" balance.

### 4. On-Chain Order Books: High Fees, Limited Scalability

One might wonder: "Why not just build a standard on-chain order book for Bitcoin?" The answer: Bitcoin fees. Each limit
order or pointer transaction would require an on-chain update on the Bitcoin blockchain. The overhead quickly becomes
prohibitive. By contrast, this system tries to minimize raw Bitcoin transactions, only requiring them when actual BTC
moves from buyer to seller.

### 5. The Core Question

Putting it all together, we arrive at the core question for this entire system:

> **How can we build a programmatic, trustless (noncustodial) AMM using real BTC, despite Bitcoin's limitations?**

---

## 6. Proposed Solution: Native Swap

### 6.1. The Concept of $p_0$ & One-Sided Pool

1. **Baseline Price $p_0$**
    - When a token creator initializes the pool, they specify an initial token-to-BTC ratio ($p_0$), effectively
      defining how many BTC would be paired against the tokens *if* the contract could hold BTC.
    - The contract holds *only tokens* on-chain. It treats BTC as a "virtual reserve" in its accounting, using $p_0$
      as a starting point.

2. **One-Sided Pool**
    - This pool is "one-sided" because it physically contains tokens only.
    - The BTC side exists in the contract's ledger (virtualized), adjusting over time as trades come in.

### 6.2. FIFO "Listings" (Sell Swap Queue)

- Since the contract does not hold BTC, a user wanting to sell tokens for BTC **cannot** swap instantly against a real
  BTC balance.
- Instead, they **create a listing** (like placing an order in a queue).
- The listing remains inactive until another user brings in real BTC, at which point that portion of the queue is
  "consumed", and the seller's tokens are sold.
- Creating a listing is NOT the same as adding liquidity. It is a "virtual" sell order that sits in the
  queue. It does not affect the current price until it is consumed by a BUY order (i.e., a swap). This is very
  important to understand.

Being **FIFO** means the earliest listing is used first. Large additions of tokens do *not* crash the price immediately;
they merely sit in line until a real buyer arrives.

### 6.3. Price Moves Only When Liquidity Is Consumed

In a standard AMM, depositing or withdrawing liquidity instantly changes the ratio and thus the price. Here, that change
is deferred.

- A giant token listing does *not* move the price the moment it's added.
- Price changes occur *when trades actually happen* (i.e., when someone brings BTC and "consumes" that listing).

### 6.4. Swaps & Block-Based Updates

- The contract updates price at discrete intervals—often once per swap or per block.
- If a block passes with no actions, no new price is calculated.
- This approach helps prevent chaotic price movements from front-running or partial transaction ordering.

### 6.5. Preventing Price Manipulation / Vulnerabilities

By deferring price updates until consumed, you avoid the classic scenario where a user instantly crashes the price by
adding a disproportionate amount of tokens to a liquidity pool.

- The user who contributes a giant listing will only affect price as that listing is eaten away by incoming BTC.
- Past liquidity providers remain unaffected until the new listing actively becomes part of the *consumed* reserves.

### 6.6. Priority Queue

On top of the FIFO queue, there is an optional *priority queue* for those who want to *expedite* their selling. This
feature simply ensures they get matched before the normal FIFO line. However, it doesn't override more critical
operations (like liquidity removal).

### 6.7. Everything On-Chain

No off-chain or second-layer solution is needed. All rules about who owes whom BTC can be encoded in the contract. The
contract can verify real Bitcoin transactions by checking UTXOs and ensuring the correct address and amount were paid.

---

### Part 2: Second-Order Implications & Considerations

1. **Token creators**
    - Token creators who wish to create a native bitcoin pool must instantiate their pool on the contract. Only owner
      are allowed to do so because of the constraints that must be set during the creation process.
    - When a user creates a one-sided pool, xy = k is respected but given BTC cannot be held by the contract, it is
      simulated through a base price constant (p0) that creates the initial ratio of BTC to token
    - In this way, xy = k —> f(p0) * y = k, where f(p0) is the number of bitcoin to match y, the number of OP_20 tokens
      on initial pool creation

        - **Purpose:** Initialize a brand-new liquidity pool with a *floor price* and some initial token liquidity.
        - **floorPrice**: The initial price (p0) for the token. (1 sat = x token).
        - **initialLiquidity**: Amount of tokens to seed the pool.
        - **receiver**: The BTC address where the initial provider wants to receive BTC.
        - **antiBotEnabledFor** & **antiBotMaximumTokensPerReservation**: Optional anti-bot configuration.
        - **maxReservesIn5BlocksPercent**: Extra limit on how many tokens can be reserved in a rolling 5-block window (
          protection from sudden spikes).
        - Only the **token owner** can call `createPool()`.
            - `floorPrice` and `initialLiquidity` **cannot be zero**.
            - If `antiBotEnabledFor` is set, then `antiBotMaximumTokensPerReservation` **cannot be zero**.

2. **Thickening Liquidity Without Crashing Price.**
    - In older approaches, adding a large amount of tokens (relative to the pool) could instantly crash the price.
    - With this design, a large "listing" can sit in the queue and does not affect the current price until it is
      *actually used* by swaps.
    - This means liquidity can scale more easily without wrecking the spot price for existing holders.
    - This prevents price manipulation and make the system more stable.

3. **Idea of Liquidity Addition/Removal (not listings)**
    - The idea of two-sided liquidity in a manner that auto-converts part of one side into the other (so you effectively
      deposit BTC + tokens, but behind the scenes, one side is swapped so that the system can hold a 50/50 "virtual"
      position).
    - Removing liquidity similarly is queued so that you gradually "withdraw" your share from ongoing swaps.

4. **Price Stability on the Downside.**
    - This FIFO, listing-based mechanism tends to be more stable on the downside because
      large sell pressure can only "materialize" if the newly added listing is consumed. Otherwise, it just sits in the
      queue.
    - If there are no buyers, the listing does not drag the price to zero because it is not included in the active
      reserve.

5. **Different Behavior than a Standard AMM.**
    - Traditional Uniswap v2 or other AMMs let anyone freely add or remove liquidity at the current ratio, which updates
      price continuously.
    - In this "native swap," price is more stepwise and depends heavily on which part of the liquidity queue is actually
      being tapped.
    - This may mean that if people want to sell tokens at a *very* low price, they might actually prefer a traditional
      DEX route rather than going through the queue, especially if no one is actively consuming big lumps of cheap
      liquidity.

6. **Potential for Reduced Impermanent Loss / Different Fee Dynamics.**
    - Because listings are only consumed when swaps come in, liquidity providers might experience different exposure
      than a classic constant-product pool.
    - The conversation suggests it might eliminate or reduce some forms of impermanent loss but introduces new
      complexities (e.g., once consumed, the liquidity is "locked" until fully used or you exit by queueing out).6

7. **Reservation process**
    - The reservation process is on-chain, inside the contract, when someone reserve tokens, they are not actually
      purchasing the tokens, they are just reserving them for 5 blocks. The reservation process give them a list of
      recipient to send Bitcoin to. The reservation process is used to prevent frontrunner and to allow the system to
      know who is selling tokens for Bitcoin. It also prevent any risk of Bitcoin being sent to the wrong address or
      lost.
    - Reserving does not transfer any tokens, it only reserve them for 5 blocks. If the reservation is not fulfilled
      within 5 blocks, it is cancelled and the tokens are released back to the seller total available tokens.
    - If the reservation is not fulfilled, the buyer is timed out for a determined amount of block to prevent spamming
      the reservation process and clogging the system.
    - A maximum cap of a % of the liquidity under a 5 block period can be applied to reservations to prevent malicious
      actors from reserving all the liquidity and preventing other users from buying tokens.
    - An anti bot process is in place, (if enabled by the token creator), to prevent up to x amount to be reserved for x
      amount of block after trading is enabled. This is to prevent bots from reserving all the liquidity and preventing
      other users from buying tokens.
    - More security measures are in place to prevent malicious actors from reserving all the liquidity and preventing
      other users from buying tokens.
    - Reservations prioritize people removing liquidity first, then, people in the priority queue, then, people in the
      FIFO queue and then, lastly, the initial "dev-liquidity".

8. **Swap**
    - The swap process fulfill reservations and swap Bitcoin for tokens. It checks that the user swapping have sent the
      right amount of Bitcoin to the right address provided during the reservation process. It allows for partial swap
      at the cost of a timeout if not at least 90% of the reserved tokens are swapped.

---

### Part 3: Adding & Removing Liquidity (the "Two-Sided" Concept)

The proposed idea to handle BTC liquidity is to have a "two-sided" liquidity system that is not directly tied to the
underlying asset. Instead, it is a virtual representation of the user's position.

Whenever a liquidity provider (LP) adds BTC, it is actually used to "buy" tokens from people who are selling. On the
flip side, when an LP wants to remove BTC, it happens gradually as other users swap into the liquidity pool. The
contract tracks how much BTC each LP is owed over time (a "virtual BTC" balance).

#### Liquidity Provider vs tokens providers (want to sell tokens for BTC)

A liquidity provider is someone who wish to add liquidity to an LP pool. They provide both tokens and BTC.

A token provider is someone who wish to sell tokens for BTC. They provide tokens only, they get pushed into a queue
waiting for a buyer to consume their tokens. They are not liquidity providers. Their tokens are not added to the pool
until a buyer start to consume their tokens.

#### Adding Liquidity

1. **User sends X tokens and X BTC**
    - Suppose an LP wants to provide liquidity in a 50/50 ratio of token and BTC. They have some BTC, and they have
      token on-chain.

2. **Because the contract can not hold Bitcoin**
    - The user's BTC effectively goes to *fulfill existing sell orders* from other token-holders who want to sell tokens
      in exchange for BTC.
    - In other words, by adding liquidity, the user's BTC is used to purchase tokens from those who were listing token
      for BTC.
    - The newly purchased tokens are credited to the liquidity provider's portion of the pool.

3. **The contract "holds" the tokens side**
    - Even though the BTC is used to buy tokens from sellers, the liquidity provider is credited as if they contributed
      both X tokens and X BTC.
    - On-chain, the contract tracks that the LP's share of the pool is worth some quantity of token + an equivalent
      quantity of "virtual BTC."
    - This is often referred to as a "virtual reserve" of BTC: the contract keeps a ledger entry stating how much BTC
      each LP contributed.

4. **Outcome**
    - The liquidity provider ends up with a position: "X tokens + X virtual BTC" in the pool.
    - They do not physically hold the newly bought tokens in their own wallet. Rather, they receive an *LP balance* or
      *LP token*, while the actual tokens end up locked (or tracked) by the contract as part of the pool's total
      reserves.
    - This is conceptually similar to a typical "LP share" that AMMs (like Uniswap) create, except here one side is
      virtual.

#### Removing Liquidity

When the liquidity provider wants to exit and redeem their share of the pool:

1. **Request removal ("pending removal queue")**
    - The LP notifies the contract they want to remove liquidity. Because the pool does not have the real BTC on hand
      (it was never stored in the contract), there needs to be a process to *collect* that BTC from actual swaps
      happening in the future.
    - The contract therefore places the LP's removal request into a queue.

2. **Tokens are returned immediately**
    - The LP can receive back the token portion (i.e., the tokens that represent their share) instantly.
    - Essentially, the contract just unassigns or "unlocks" that number of tokens from the LP's share.

3. **BTC is returned gradually**
    - Since the system can't magically give you the BTC, it has to wait for new
      swaps coming from other users who *buy tokens* with BTC, or new liquidity providers who *add BTC*.
    - Over time, each new incoming swap that uses BTC will gradually fulfill the queued removal requests, sending the
      owed BTC to the exiting liquidity providers.
    - Eventually, once enough BTC volume flows in from new swaps, the LP gets the full BTC amount that the system owes
      them.

4. **Impermanent loss implications**
    - In a normal AMM, if the token price changes a lot while you are providing both tokens and BTC, you may suffer
      impermanent loss. This concept *might* be mitigated or altered here because of how the system is using the
      "virtual BTC" approach.
    - Providers might avoid some typical impermanent loss by tracking the token vs. "virtual BTC" valuations. There is,
      of course, still the risk that if no one swaps in with BTC, you might wait a long time to get your BTC out.

#### How "Virtual BTC" Works Behind the Scenes for LP providers

- **Ledger Tracking**: The contract basically keeps a record:
    - "Liquidity Provider A contributed X BTC worth of liquidity."
    - That "BTC" is used to buy tokens from existing sellers, so physically those tokens shift from sellers to the
      contract pool.
    - The contract notes: "Provider A is owed X BTC (plus swap fees)."
- **Swaps Refill the BTC**: When future trades bring real BTC into the ecosystem (people buying tokens with BTC), the
  contract routes that BTC toward fulfilling outstanding BTC obligations for liquidity removers.

#### User Flow Example (Adding & Removing Liquidity)

1. **Add Liquidity**
    - *Scenario*: You have 500 BANANA tokens and want to provide 500 BANANA + 500 BTC worth of liquidity.
    - *Action*: The BTC portion is used right away to "buy" BANANA from people looking to sell BANANA for BTC.
    - *Result*: You get credited with a 50/50 BANANA-BTC position in the pool (but the BTC side is accounted for on a "
      virtual" basis).

2. **Earning Fees**
    - As other users swap in/out, you earn a portion of the fees (depending on how the system is set up).

3. **Remove Liquidity**
    - You request to withdraw your share.
    - The system (a) gives you your BANANA portion back, and (b) places a claim for your BTC portion in a queue.
    - Over time, as more swaps come in from traders who pay BTC for BANANA, the system routes that BTC to you until
      your "owed BTC" is fully satisfied.  
