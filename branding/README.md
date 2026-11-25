# Talk

**The communication layer for crypto networks.** Encrypted messaging between wallets:
a stranger pays $TALK to reach you, you reply within 72h and keep 95% — or the payment
returns 90% after 72h. No accounts, no backend, no server in the middle.

- App: live on Robinhood Chain
- X: https://x.com/Talkwhitall
- Launching on Pons — the $TALK token address will be published the day it launches

---

## What ships today (already on-chain, verified)

| Contract | Address | Role |
|----------|---------|------|
| TalkInbox | `0x09CbF9B06881630b681eCca7Df7fD54A0D45F80a` | Inboxes, escrow (72h), contacts |
| TalkToken | `0x3476AFfa0f73aED50dc8bA0645965f992656f176` | Internal test token — the live $TALK launches on Pons |

- Chain: Robinhood Chain (4663) · Explorer: https://robinhoodchain.blockscout.com
- All contracts verified on the explorer. No mint, no withdraw function, reentrancy-guarded.
- Fee on trades after launch: **2%** — 1% communication infrastructure, 1% dev & tooling.
  Fixed at launch, split weekly, visible on-chain.

## How it works

1. **Sign once** — your wallet signature derives your encryption keys. They never leave your device.
2. **Set your price** — your inbox is a pass. Strangers pay it; contacts write free forever.
3. **Reply to clear** — the payment sits in the contract, not with us. Reply within 72h and
   you keep 95%. Stay silent and 90% goes back. The 10% forfeit is the spam filter.

Messages are encrypted in the browser (X25519 + XSalsa20-Poly1305). The chain only ever
stores opaque bytes.

## Source code

Private until launch — once $TALK ships on Pons, the full repository (contracts, web app,
tests: 114 automated checks) goes public here. Nothing in this repo is a placeholder for
security through obscurity: verify the contracts on the explorer instead.

---

*Talk · @Talkwhitall · not audited externally — keep amounts small.*
