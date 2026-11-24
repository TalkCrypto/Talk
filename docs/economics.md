# Talk — economics

## The model

You set a price for talking to you. Someone decides whether that price is worth paying.

**If you reply** (within 72h):

| | |
|---|---|
| recipient | price minus 5% |
| Talk | 5% |

**If you never reply:**

| | |
|---|---|
| sender | 90% back |
| Talk | 10% |

Nothing else. No rules menu, no split options, no per-inbox configuration beyond the price.
One price, two outcomes.

## Why the 25% exists

Without it, a paid inbox is not defended: someone sends fifty messages, nobody answers, and
after 72 hours every cent comes back. The price would be a deposit, not a toll. The 10% is what
turns the price into a real filter — it is only cheap to message someone who answers.

## The naming

"Escrow" is contract language. In the product it is called **the Hold**:

- `100 TALK · on hold` — the payment is waiting.
- `100 TALK · paid` — they answered, the money moved.
- `90 TALK · returned` — nobody answered, the rest was forfeited.

Everything in the UI, the docs and the contract comments uses "hold". The word "escrow" stays
only where it is a legal or technical statement.

## The incentive

At 10% the gap between earning from a reply (5%) and from silence (10%) is small enough to defend:
the platform earns twice as much from an unanswered message as from a good conversation, but no
longer four times. If we want to close it completely, the remaining move is to give part of the
forfeit to the recipient — the one whose inbox was used.

## What this changes in the contract

`TalkInbox` today has three reply rules (`Refund`, `Keep`, `Split`). This model replaces them:

- remove the `Rule` enum and the rule parameter in `configure`
- `reply()` always pays `amount - 5%` to the recipient
- `refund()` (expired) pays `90%` to the sender and `10%` to the treasury
- `quote()` returns the price; nothing else to configure

`TalkCurve` is unaffected: it prices the token, not the messages.
