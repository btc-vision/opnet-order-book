# High Level Concept Native Swap

## The Core Problem: No Bitcoin Custody

Because contracts cannot hold real BTC, we need to find a way to let people provide liquidity in a
*pair* (Tokens + BTC) without actually storing BTC. Instead, the BTC side is simulated.

---

## Outlined problematic with normal AMM using Native Bitcoin.

1) you can't add liquidity beyond the initial ratio (without reducing the price via adding a listing post pool
   creation), because BTC p0 is fixed. So in a situation where the # of tokens in the initial pool is low, it will
   remain low and volatility will be high. You can't thicken liquidity

2) Normal Uniswap V2 concept (with a reservation system and block based price updates) leads to a vulnerability where a
   user can create a massive listing (ie adding virtual liquidity), causing price to crash. Because the system is FIFO,
   it will penalize the first listers/LPers

3) There is no LP rewards for liquidity providers

The current proposed construction solves #1 and #3. If you make ONLY virtual listings in the virtual reserve impact
price, then #2 is solved BUT there is not really any sell pressure unless there's a big listing (i.e. how does price go
down with sells?). If you do the OPPOSITE, #2 is still an issue.

## Core Concept

1. **FIFO "Listings" (Liquidity Queues).**
    - Instead of immediately adding new liquidity into the pool (as in Uniswap v2), liquidity is placed into a "listing
      queue."
    - This listing (liquidity) is only *activated* (i.e., enters the "virtual reserve") once it is consumed by
      trades/swaps.
    - Being first-in-first-out (FIFO), earlier listings in the queue get consumed (i.e., effectively become part of the
      active liquidity) before newer listings.

2. **Price Only Changes When Liquidity Is Consumed.**
    - A large liquidity addition *does not* instantly crash the price the moment it is listed. It only affects price if
      and when users' swaps actually start to consume that liquidity.
    - In other words, someone can put up a massive listing of tokens for sale (or liquidity), but price only moves once
      trades "tap into" that listing.

3. **Swaps & Block-Based Updates.**
    - The pool updates its price in discrete steps—often as "block-based" updates or triggered upon interactions.
    - A single user action (swap, add liquidity, etc.) can cause the system to "sync" the price.
    - If there is no activity in a block, no new price update occurs.

4. **Preventing Price Manipulation / Vulnerabilities.**
    - One major goal is to eliminate the vulnerability where a single large addition of tokens in a typical AMM pool can
      abruptly crash or spike the price. Since this is a block based system and use a reservation process, we have
      to make the price impact only impact when liquidity is active.
    - In the FIFO model, the user who provides an outsize listing takes on the slippage risk themselves once their
      liquidity eventually gets consumed.
    - The price move that results is localized to the liquidity of the *particular listing* rather than retroactively
      affecting all prior liquidity providers.

---

## Key Design Implications

1. **Thickening Liquidity Without Crashing Price.**
    - In older approaches, adding a large amount of tokens (relative to the pool) could instantly crash the price.
    - With this design, a large "listing" can sit in the queue and does not affect the current price until it is
      *actually used* by swaps.
    - This means liquidity can scale more easily without wrecking the spot price for existing holders.
    - This prevents price manipulation and make the system more stable.

2. **Idea of Liquidity Addition/Removal (not listings)**
    - The idea of two-sided liquidity in a manner that auto-converts part of one side into the other (so you effectively
      deposit BTC + tokens, but behind the scenes, one side is swapped so that the system can hold a 50/50 "virtual"
      position).
    - Removing liquidity similarly is queued so that you gradually "withdraw" your share from ongoing swaps.

3. **Price Stability on the Downside.**
    - This FIFO, listing-based mechanism tends to be more stable on the downside because
      large sell pressure can only "materialize" if the newly added listing is consumed. Otherwise, it just sits in the
      queue.
    - If there are no buyers, the listing does not drag the price to zero because it is not included in the active
      reserve.

4. **Different Behavior than a Standard AMM.**
    - Traditional Uniswap v2 or other AMMs let anyone freely add or remove liquidity at the current ratio, which updates
      price continuously.
    - In this "native swap," price is more stepwise and depends heavily on which part of the liquidity queue is actually
      being tapped.
    - This may mean that if people want to sell tokens at a *very* low price, they might actually prefer a traditional
      DEX route rather than going through the queue, especially if no one is actively consuming big lumps of cheap
      liquidity.

5. **Potential for Reduced Impermanent Loss / Different Fee Dynamics.**
    - Because listings are only consumed when swaps come in, liquidity providers might experience different exposure
      than a classic constant-product pool.
    - The conversation suggests it might eliminate or reduce some forms of impermanent loss but introduces new
      complexities (e.g., once consumed, the liquidity is "locked" until fully used or you exit by queueing out).

---

## Adding & Removing Liquidity (the "Two-Sided" Concept)

The proposed idea to handle BTC liquidity is to have a "two-sided" liquidity system that is not directly tied to the
underlying asset. Instead, it is a virtual representation of the user's position.

Whenever a liquidity provider (LP) adds BTC, it is actually used to "buy" tokens from people who are selling. On the
flip side, when an LP wants to remove BTC, it happens gradually as other users swap into the liquidity pool. The
contract tracks how much BTC each LP is owed over time (a "virtual BTC" balance).

### Adding Liquidity

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

### Removing Liquidity

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

### How "Virtual BTC" Works Behind the Scenes for LP providers

- **Ledger Tracking**: The contract basically keeps a record:
    - "Liquidity Provider A contributed X BTC worth of liquidity."
    - That "BTC" is used to buy tokens from existing sellers, so physically those tokens shift from sellers to the
      contract pool.
    - The contract notes: "Provider A is owed X BTC (plus swap fees)."
- **Swaps Refill the BTC**: When future trades bring real BTC into the ecosystem (people buying tokens with BTC), the
  contract routes that BTC toward fulfilling outstanding BTC obligations for liquidity removers.

### User Flow Example (Adding & Removing Liquidity)

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
