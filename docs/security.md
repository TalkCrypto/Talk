# Security review — before the Pons launch

Scope: `TalkToken`, `TalkInbox`, `TalkCurve` plus the deployed configuration on Robinhood Chain
(4663). Reviewed against the source in `contracts/` and the live contracts at
`0x3476AFfa…f176` (token) and `0x09CbF9B0…F80a` (inbox).

This is a manual review by the author of the code. It is **not** an external audit, and it does
not replace one.

---

## 1. What is already solid

- **No privileged functions on the token.** Fixed supply, no mint, no owner, no pause, no
  blacklist, no upgrade path. Nobody — including us — can create tokens after deployment.
- **The inbox cannot be drained.** No `withdraw`, no `sweep`, no owner. Tokens only move when a
  recipient replies or a payment expires.
- **Reentrancy guarded** on every function that moves value (`send`, `reply`, `refund`), and
  `buy` / `sell` on the curve.
- **Fee-on-transfer safe**: `send` verifies the balance delta, so a token that skims on transfer
  fails loudly instead of silently short-paying.
- **Exact amounts**: the fee is computed on what was actually spent, never on `msg.value`, and the
  surplus goes back in the same transaction.
- **No `delegatecall`, no assembly, no external call to a user-supplied address.**

---

## 2. Findings

### H-1 · `send()` has no maximum price — recipient can raise it mid-flight

**Where:** `TalkInbox.send(address to, bytes ciphertext)`

`send` reads `quote(from, to)` at execution time and pulls that amount. A recipient can raise
their price between the moment the sender sees the quote and the moment the transaction is mined,
and the sender pays the new price.

**Impact:** a sender who approved the inbox (or signed a permit for a large amount) can be charged
far more than they agreed to. It is a classic missing-slippage bug, and it is exploitable by any
recipient who watches the mempool.

**Fix (for the next deployment):**

```solidity
function send(address to, uint256 maxPrice, bytes calldata ciphertext) external returns (uint256) {
    ...
    uint256 price = quote(msg.sender, to);
    if (price > maxPrice) revert PriceAboveLimit(price, maxPrice);
```

The client must send `maxPrice = quote * 101 / 100`.

**Mitigation until then:** every approval must be for the exact price, never `type(uint256).max`.
The app should call `permit` with `value = price` and never cache a large allowance.

---

### M-1 · `permit` consumes the nonce before verifying the signature

**Where:** `TalkToken.permit`

The digest is built with `nonces[owner]++`, so the nonce is incremented even when `ecrecover`
returns a wrong address and the call reverts. An attacker who sees a pending permit can front-run
it with a deliberately invalid signature and burn that nonce, invalidating the legitimate permit.

**Impact:** griefing, not theft. It costs the victim a retry.

**Fix:** read the nonce, verify the signature, and only then increment.

---

### M-2 · Treasury is a single hot wallet holding 89.9% of supply

**Where:** live deployment — `treasury()` returns `0xCcCF7A08…6A5E`, an EOA with no code.

That address holds **898,996,953 of 1,000,000,000 TALK**. It is the same key that signs day-to-day
transactions in the browser.

**Impact:** one compromised key means the treasury, the fees and the supply. For a launch this is
the largest single risk in the project, and it has nothing to do with the contracts.

**Fix:**
1. Move the unallocated supply to a multisig (Safe) before the Pons launch.
2. Deploy the next inbox with `treasury` pointing at the multisig, not at a personal wallet.
3. Keep at most an operating float in the hot wallet.

---

### L-1 · Signature malleability in `permit`

`ecrecover` accepts both `s` and `n - s`. Because the nonce advances, a replayed permit fails, so
this is not exploitable on its own — but the standard guard is one line and removes the class:

```solidity
if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) revert BadSignature();
```

---

### L-2 · A refund can be blocked by a reverting recipient

`refund` sends 90% to `p.from`. If the sender is a contract that reverts on receive, that payment
can never be settled and its tokens stay locked. The classic fix is a pull-payment fallback
(credit the balance, let them withdraw), which costs an extra mapping and one more function.

Given that senders are wallets, this is acceptable for v1, but it should be documented.

---

### L-3 · Price has no upper bound

`configure` accepts any `uint256` price. Nothing breaks — `quote` returns it and `send` reverts
when the buyer lacks the balance — but a typo can set a price no one can pay, and the UI will show
an absurd number. A `MAX_PRICE` constant (say 1e30) would turn a silent mistake into a revert.

---

### I-1 · Contacts are permanent (by design)

After one reply, both sides write free forever. That is the product's promise, but it means a
recipient cannot re-close the door on a specific sender. Worth stating in the FAQ, because a user
will eventually ask.

---

## 3. Pre-launch checklist

| | Item | State |
|---|---|---|
| ☐ | H-1 fixed (`maxPrice` in `send`) and tested | pending |
| ☐ | M-1 fixed (verify before incrementing nonce) | pending |
| ☐ | Supply moved to a multisig; treasury set to it | **pending, highest priority** |
| ☐ | Contracts verified on Blockscout | unknown — confirm by hand |
| ☐ | Exact approvals in the client (no unlimited) | check `app.js` |
| ☐ | External audit booked | no |
| ☐ | Incident runbook: who does what if a key leaks | no |

## 4. What I would not launch without

1. **The multisig.** Not a contract change, a custody change — and today it is the weakest link by
   a wide margin.
2. **H-1.** A paid inbox that can charge more than the user agreed to is a product-ending bug the
   first time it happens in public.
3. **Verified source.** The whitepaper already says "contracts verified". If that is not true on
   Blockscout, it is the kind of detail that gets screenshotted.
