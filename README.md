# Talk

Encrypted messaging between wallets. Payments are held in escrow for 72 hours and settled in
**$TALK**, our own token.

Self-contained: our contracts plus a static site. No backend, no database, no third-party service
in the path.

---

## Live

| | |
|---|---|
| Chain | Robinhood Chain (4663) |
| $TALK | `0x29a248ebb20570f0730f7f2595b7abf1b9c8f0b2` |
| Inbox | `0x94afd1714c018e2d193ae5e83e5265cbeb1020a9` |
| App | https://talkwhitall.com |

Send a message: set a price, get paid to reply. Contracts are verified on-chain.
## Status

| | |
|---|---|
| Contracts | compile with `solc 0.8.26` (optimizer, 200 runs) |
| Static audit | **47/47** (`tools/audit.py`: selectors, topics, ABI, struct shape, ids, artifacts) |
| Contract tests | **36/36** on a local EVM node (anvil), with test money moving |
| Frontend tests | **39/39** (crypto, ABI encoding, event decoding) |
| External audit | **none** — keep amounts small |

What the tests actually cover: activating an inbox, sending a paid message, settling (95/5 on
reply), contacts going free, expiry plus refund after 72 hours (90/10), the open inbox, double
reply, refunding a settled payment, and the other failure cases we expect (self-message,
unregistered inbox, oversized payload, and so on).

---

## How it works

```
stranger ──pays X TALK──▶ contract (escrow)
                             │
                 ┌───────────┴────────────┐
           replies within 72h        no reply
                 │                        │
     recipient keeps X minus 5%     anyone can refund
     (Talk takes 5%)                → 90% goes back, 10% stays
                 │
         they are contacts: free forever
```

- **Fee:** 5% of what the recipient keeps, paid to the treasury. Refunds and free messages pay nothing.
- **Payment states:** `1` in escrow · `2` settled · `3` refunded.
- **No reply within 72h:** the sender gets 90% back and Talk keeps 10% — the forfeit is the spam filter.
- **One price, two outcomes.** There is no rule menu: the terms are the same for every inbox.

### Encryption

All of it happens in the browser. The contract only stores opaque bytes.

```
signature = personal_sign("Talk\n\nSign to unlock…")   // free, not a transaction
seed      = SHA-256(signature bytes)                    // 32 B
keypair   = nacl.box.keyPair.fromSecretKey(seed)        // X25519
```

- The public key (32 B) is published in the contract as `encKey` when you activate the inbox.
- The private key stays in `localStorage` (`talk:enc:<wallet>`) and **never leaves the device**.
- That's why the same wallet opens the same inbox on any machine: the key derives from the signature.

Message envelope, carried in the event:

```
[ 0x01 ][ sender pubkey 32 B ][ nonce 24 B ][ nacl.box (text + 16 B tag) ]
```

`nacl.box` is X25519 + XSalsa20-Poly1305. The recipient uses the sender key embedded in the envelope,
unless the envelope is their own — then they use the peer's key.

---

## Layout

```
Talk/
  contracts/
    TalkToken.sol      fixed-supply ERC-20, no mint
    TalkInbox.sol      inbox + escrow + contacts
    build/             solc combined.json
  web/
    index.html         dashboard
    app.js             logic, crypto, wizard
    styles.css         black and white, editorial
    config.js          addresses and social links
    deploy.html        deployment wizard
    artifacts.js       generated ABI + bytecode
    abi/               ABI as JSON
  tools/
    build-artifacts.mjs   solc → artifacts.js
    audit.py              static audit (ABI ↔ selectors ↔ topics ↔ HTML)
    serve-web.mjs         static server (dev)
    test-contract.py      end-to-end suite against anvil
    test-web.mjs          frontend logic suite
    setup-local.mjs       seeds test state on anvil
    solc/solc.exe         compiler
    foundry/anvil.exe     local EVM node
```

### Audit

`python tools/audit.py` proves nothing has drifted:

- every selector in `app.js` against `keccak256` of the signature in the compiled ABI;
- both event `topic0` values (`Message`, `Settled`);
- that `web/abi/*.json` and the bytecode in `artifacts.js` are exactly what solc produced;
- that every `id` the JS looks up exists in the HTML, and that no references to the old form remain;
- that `deploy.html` persists all three config keys and uses the artifacts;
- that the contract has no `withdraw`, uses a reentrancy guard, and exposes the expected surface.

It reads files only — no network, no node.

---

## Deploy

### Option A — the bundled wizard

Serve `web/` and open `deploy.html` with your wallet on **Robinhood Chain**:

1. **Deploy $TALK** — name, symbol, supply, recipient.
2. **Deploy TalkInbox** — payment token plus treasury (which receives the 5%).
3. The addresses are stored in the browser; step 3 prints the snippet for `web/config.js` and
   links to the dashboard.

You need ETH on the chain for gas (two deployments: roughly 1.5M and 4M gas).

### Option B — Remix or forge

Open `contracts/TalkToken.sol` and `contracts/TalkInbox.sol`, compile with 0.8.26, deploy. Then
paste the addresses into `web/config.js` (or the *Deployment settings* panel in the app).

```js
// web/config.js
token: "0x…",      // $TALK
inbox: "0x…",      // TalkInbox
fromBlock: 122000000
```

`fromBlock` matters: `eth_getLogs` scans from there. Leave it at 0 on a long chain and the RPC will
refuse the range.

### Social links

```js
socials: {
  x: "https://x.com/yourHandle", xHandle: "@yourHandle",
  telegram: "https://t.me/…", discord: "https://discord.gg/…",
  github: "https://github.com/…", site: "https://…"
}
```

Anything left empty renders as a dimmed, non-clickable chip.

---

## Run it locally

```bash
node tools/serve-web.mjs          # http://127.0.0.1:8100
# preview with sample data, no wallet:
#   http://127.0.0.1:8100/?demo=1          → populated dashboard
#   http://127.0.0.1:8100/?demo=wizard     → inbox wizard

node tools/setup-local.mjs        # needs anvil on 8546
python tools/test-contract.py
node tools/test-web.mjs
```

For the contract suite, run `anvil --port 8546` in another terminal.

---

## The dashboard

**Visual language:** paper on black. Instrument Serif for headlines and numbers, Geist for the
interface, Geist Mono only for data (addresses, hashes, stamps). No generic cards in the inbox
column — 1px rules, lists, and one printed object.

- **Banner:** serif headline with the second line in italic, two calls to action, social links as stamps.
- **Four metrics** in a band: balance, messages, in escrow, earned. All derived from events
  (`Message`, `Settled`), never from an API.
- **The inbox is a pass.** Not a form: a white ticket with the perforation, the price in large
  serif numerals, terms with dot leaders, and on the stub the price, a barcode generated from your
  `encKey`, and the serial. If it isn't issued yet it shows as a **draft**.
- **Three-step wizard** → **two-step wizard** to issue the pass: each choice updates the ticket
  live (price, who gets in), with an exact split simulation. The reply terms are fixed by the
  contract and shown as such.
- **Conversations** as a ruled list; the active one gets a white bar on the left.
- **Thread:** grouped by sender, day separators, real block timestamps, payment chips by state, and
  your own bubbles in white.

---

## Design decisions

- **One token.** `TalkInbox` charges in a single immutable token set in the constructor. Simpler and
  cheaper than multi-asset; a different token means a different inbox.
- **Derived state.** `isContact` is set when a payment settles, in both directions. There's no
  editable contact list: contacts are an economic fact, not a preference.
- **Strict accounting.** `send` verifies that exactly the required amount arrived (`WrongPayment`),
  so fee-on-transfer tokens can't quietly break the escrow.
- **No rescue function.** The contract has no `withdraw`: the only funds that move are the ones the
  escrow dictates. No backdoor.
- **Reentrancy guard** on `send`, `reply` and `refund`.

### Known limits

- The text travels in the event: anyone can see it (encrypted) and you pay gas for its size.
  `MAX_CIPHERTEXT` is 4096 B (~4 KB of text).
- With a fee-on-transfer token the recipient gets less than nominal, even though entry accounting is exact.
- An inbox can't be deleted (the `encKey` stays). Lose the wallet, lose the inbox.
- No external audit.

---

## Compared to other wallet mail apps
Same messaging idea, but Talk runs its own stack:

| | Typical wallet mail | Talk |
|---|---|---|
| Contract | third-party, already deployed | yours |
| Currency | multi-asset | **$TALK only** |
| 5% fee | goes to someone else's treasury | **goes to your treasury** |
| Payment logic | multi-asset | single token, less gas |
| Interface | full app | dashboard focused on the inbox |
