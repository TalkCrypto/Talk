# Talk Curve — primary sale

The bonding curve is how $TALK gets distributed. Instead of a fixed price or a presale, the
price rises with every token sold, and anyone can buy or sell at the same terms the contract
offers. No allocation list, no whitelist, no vesting schedule to police.

## The curve

The price is a straight line in the amount already sold:

```
p(s) = p0 + (p1 - p0) · s / S
```

- `S` — supply offered on the curve (token wei)
- `s` — amount sold so far
- `p0` — price at the first token (wei per whole token)
- `p1` — price at the last token

Buying costs the area under that line between two positions:

```
cost(a, b) = p0·(b-a) + (p1-p0)·(b²-a²) / (2S)
```

That integral is the only piece of math in the contract, and it is computed with integer
division in a fixed order so the result is reproducible off-chain.

### Why a linear curve

- **Predictable**: someone can compute the exact cost of the next buy without simulating anything.
- **No step jumps**: price moves continuously, so there is no cliff that rewards sniping.
- **Auditable**: two multiplications and a division. Quadratic and exponential curves are prettier
  on a chart and much harder to verify by hand.

## Inverse: how many tokens a budget buys

There is no closed-form inversion in the contract. `tokensFor(budget)` does a bounded binary
search over `[0, remaining]`, at most ~90 iterations, checking `costWithFee(a, b) <= budget`.
Bisection is used deliberately: it is exact to the wei, conservative in rounding, and it can't
overflow the way a quadratic formula can.

## Fees

- **1% (`FEE_BPS = 100`)** on every buy and sell, charged on the amount actually spent or returned
  and forwarded to the treasury in the same transaction.
- A buy with unused budget gets the difference back immediately, including the surplus when the
  curve is swept. Nothing stays stuck in the contract.

## Invariants

These are the properties the tests assert on every path:

1. **Reserve solvency** — the ETH held by the contract equals `cost(0, sold)`, up to rounding
   (a few wei per trade, from integer division in the quadratic term). A sell can always be paid.
2. **Monotonic price** — `priceAt` is non-decreasing in `s`; `p1 >= p0` is enforced at deploy.
3. **No backdoor** — no `withdraw`, no owner, no pause, no upgrade path. The only ETH that leaves
   is a sell refund or a fee.
4. **Supply cap** — `sold` can never exceed `supply`, and `supply` can never increase.
5. **Fee accounting** — `paid + fee <= msg.value` on every buy; the treasury never receives tokens.

## Parameters at launch

| | |
|---|---|
| supply on curve | 1,000,000,000 $TALK |
| price start | 0.00000001 ETH per token |
| price end | 0.00000005 ETH per token |
| full curve raise | ~30 ETH |
| fee | 1% to treasury |
| curve type | linear, ETH-quoted |

These are constructor arguments, so a deployment can choose others. The UI quotes whatever the
deployed contract reports — nothing is hardcoded in the frontend.

## Multi-chain from day one

The contract has no chain-specific logic: it takes the token address and the treasury address as
constructor arguments and prices in the native coin. That means the same bytecode deploys on
Robinhood Chain, Base, Arbitrum or any EVM without changes.

What changes per chain lives in configuration, never in code:

- `web/config.js` — chain id, RPC, explorer, and one address set per deployment.
- The deploy wizard reads the connected chain and writes the addresses for that chain only.

Scaling plan:

1. **Now — Robinhood Chain.** First curve, first real money, small caps.
2. **Next — Base and Arbitrum.** Same contracts, independent deployments and independent curves.
   A curve is per-chain by nature: liquidity never crosses chains, and pretending otherwise is how
   bridges lose money.
3. **Later — one indexer.** Read every deployment from the same event schema so the app can show a
   portfolio across chains without a per-chain backend.

## What is still missing before real money

- ~~Sweep surplus refund~~ (found by the test suite, fixed).
- Slippage guards exist (`minOut`), but there is no deadline parameter yet.
- No anti-snipe mechanism on the first block. Decide before launch: either accept it, or add a
  per-wallet cap for the first N blocks.
- No graduation: when the curve sells out, it just stops. If we want liquidity on a DEX after
  that, the curve needs a `graduate()` step that seeds a pool with the raised ETH.
- External audit: none. Keep the caps low until there is one.
