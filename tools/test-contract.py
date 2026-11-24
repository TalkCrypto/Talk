"""
End-to-end test of TalkInbox on a local EVM node (anvil) — one price, two outcomes.

  reply within 72h -> recipient keeps 95%, Talk takes 5%
  no reply         -> sender gets 90% back, Talk keeps 10%
"""
import json
import sys
import time
import urllib.request

sys.path.insert(0, r"C:\Users\nonam\AppData\Local\Temp\nexus")
from keccak import keccak256  # noqa: E402

RPC = "http://127.0.0.1:8546"
ROOT = r"C:\Users\nonam\Desktop\PROYECTOS\Talk"
UNIT = 10**18

_id = [0]


def post(method, params):
    _id[0] += 1
    body = json.dumps({"jsonrpc": "2.0", "id": _id[0], "method": method, "params": params}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        out = json.loads(r.read().decode())
    if "error" in out:
        raise RuntimeError(out["error"].get("message", out["error"]))
    return out["result"]


def sel(sig):
    return "0x" + keccak256(sig.encode()).hex()[:8]


def u256(v):
    return f"{int(v) & ((1 << 256) - 1):064x}"


def addr(a):
    return a.lower().replace("0x", "").rjust(64, "0")


def w(hexdata, i):
    h = hexdata[2:] if hexdata.startswith("0x") else hexdata
    return int(h[i * 64:(i + 1) * 64] or "0", 16)


def call(to, data):
    return post("eth_call", [{"to": to, "data": data}, "latest"])


def send(frm, to, data, value=0):
    tx = {"from": frm, "to": to, "data": data, "gas": hex(6_000_000)}
    if value:
        tx["value"] = hex(value)
    h = post("eth_sendTransaction", [tx])
    for _ in range(400):
        r = post("eth_getTransactionReceipt", [h])
        if r:
            if r["status"] != "0x1":
                raise RuntimeError("reverted")
            return r
        time.sleep(0.05)
    raise RuntimeError("timeout")


results = []


def check(cond, label):
    cond = bool(cond)
    results.append((cond, label))
    print(("  PASS  " if cond else "  FAIL  ") + label)


def expect_revert(fn, label):
    try:
        fn()
    except Exception:
        return check(True, label)
    return check(False, label)


def deploy(art, args_hex):
    tx = {"from": ACCOUNTS[0], "data": "0x" + art["bin"] + args_hex, "gas": hex(6_000_000)}
    h = post("eth_sendTransaction", [tx])
    for _ in range(400):
        r = post("eth_getTransactionReceipt", [h])
        if r:
            if r["status"] != "0x1":
                raise RuntimeError("deploy reverted")
            return r["contractAddress"]
        time.sleep(0.05)
    raise RuntimeError("deploy timeout")


def enc_str(s):
    b = s.encode()
    return u256(len(b)) + b.hex().ljust(((len(b) + 31) // 32) * 64, "0")


ACCOUNTS = post("eth_accounts", [])
A, B, C = ACCOUNTS[0], ACCOUNTS[1], ACCOUNTS[2]
TREASURY = ACCOUNTS[3]

ART = json.load(open(ROOT + r"\contracts\build\combined.json", encoding="utf-8"))


def art(name):
    for k, v in ART["contracts"].items():
        if k.endswith(":" + name):
            return v
    raise KeyError(name)


TOKEN_ART, INBOX_ART = art("TalkToken"), art("TalkInbox")

S = {
    "transfer": sel("transfer(address,uint256)"),
    "approve": sel("approve(address,uint256)"),
    "balanceOf": sel("balanceOf(address)"),
    "configure": sel("configure(bool,bytes32,uint256)"),
    "setPrice": sel("setPrice(uint256)"),
    "send": sel("send(address,bytes)"),
    "reply": sel("reply(uint256,bytes)"),
    "refund": sel("refund(uint256)"),
    "quote": sel("quote(address,address)"),
    "isContact": sel("isContact(address,address)"),
    "nextId": sel("nextId()"),
    "TTL": sel("TTL()"),
    "FEE_BPS": sel("FEE_BPS()"),
    "FORFEIT_BPS": sel("FORFEIT_BPS()"),
    "inboxes": sel("inboxes(address)"),
    "payments": sel("payments(uint256)"),
    "isExpired": sel("isExpired(uint256)"),
}

SUPPLY = 1_000_000 * UNIT
KEY = "11" * 32


def ct(n=60, tag=1):
    """Envelope: version 1 + pubkey + nonce + payload."""
    return "0x01" + KEY + "22" * 24 + (f"{tag:02x}" * n)


def bal(who):
    return w(call(TOKEN, S["balanceOf"] + addr(who)), 0)


def bytes_arg(hexstr):
    raw = hexstr[2:]
    n = len(raw) // 2
    return u256(n) + raw.ljust(((n + 31) // 32) * 64, "0")


print("\nTALK INBOX — one price, two outcomes\n" + "=" * 66)

off_name = 4 * 32
name_e, sym_e = enc_str("Talk"), enc_str("TALK")
off_sym = off_name + len(name_e) // 2
TOKEN = deploy(TOKEN_ART, u256(off_name) + u256(off_sym) + u256(SUPPLY) + addr(A) + name_e + sym_e)
INBOX = deploy(INBOX_ART, addr(TOKEN) + addr(TREASURY))

check(w(call(INBOX, S["TTL"]), 0) == 72 * 3600, "TTL == 72h")
check(w(call(INBOX, S["FEE_BPS"]), 0) == 500, "reply fee == 5%")
check(w(call(INBOX, S["FORFEIT_BPS"]), 0) == 1000, "no-reply forfeit == 10%")
check(w(call(INBOX, S["nextId"]), 0) == 1, "nextId starts at 1")

# ---------------------------------------------------------------- funds + inboxes
for who in (A, B, C):
    send(A, TOKEN, S["transfer"] + addr(who) + u256(1000 * UNIT))
    send(who, TOKEN, S["approve"] + addr(INBOX) + u256(1000 * UNIT))

check(bal(B) == 1000 * UNIT, "B funded")

print("\n1. opening an inbox")
send(A, INBOX, S["configure"] + u256(0) + KEY + u256(100 * UNIT))
box = call(INBOX, S["inboxes"] + addr(A))
check(w(box, 0) == 1, "A is registered")
check(w(box, 1) == 0, "A's inbox is not open")
check(w(box, 3) == 100 * UNIT, "A charges 100 TALK")
check(w(call(INBOX, S["quote"] + addr(B) + addr(A)), 0) == 100 * UNIT, "quote B->A == 100")
check(w(call(INBOX, S["quote"] + addr(A) + addr(B)), 0) == 0, "quote A->B == 0 (B has no inbox)")

print("\n2. sending a paid message")
b_before = bal(B)
send(B, INBOX, S["send"] + addr(A) + u256(64) + bytes_arg(ct()))
check(bal(B) == b_before - 100 * UNIT, "B paid exactly 100 TALK")
check(bal(INBOX) == 100 * UNIT, "the contract holds 100 on hold")
check(w(call(INBOX, S["nextId"]), 0) == 2, "nextId moved to 2")
p1 = call(INBOX, S["payments"] + u256(1))
check(w(p1, 4) == 1, "payment 1 is pending")

print("\n3. replying: 95 / 5")
a_before, t_before = bal(A), bal(TREASURY)
send(A, INBOX, S["reply"] + u256(1) + u256(64) + bytes_arg(ct(50, 2)))
check(bal(A) - a_before == 95 * UNIT, "A received 95 (100 - 5%)")
check(bal(TREASURY) - t_before == 5 * UNIT, "Talk received 5")
check(bal(INBOX) == 0, "the hold is empty")
check(w(call(INBOX, S["isContact"] + addr(A) + addr(B)), 0) == 1, "A and B are now contacts")
check(w(call(INBOX, S["quote"] + addr(B) + addr(A)), 0) == 0, "free for B after the reply")

b_before = bal(B)
send(B, INBOX, S["send"] + addr(A) + u256(64) + bytes_arg(ct()))
check(bal(B) == b_before, "a contact writes for free")
check(w(call(INBOX, S["nextId"]), 0) == 2, "free messages don't create a payment")

print("\n4. nobody replies: 90 / 10")
send(C, INBOX, S["send"] + addr(A) + u256(64) + bytes_arg(ct()))
check(bal(INBOX) == 100 * UNIT, "C's payment is on hold")
expect_revert(lambda: send(A, INBOX, S["refund"] + u256(2)), "refunding before expiry reverts")

post("evm_increaseTime", [72 * 3600 + 10])
post("evm_mine", [])

check(w(call(INBOX, S["isExpired"] + u256(2)), 0) == 1, "payment 2 is expired")
c_before, t_before = bal(C), bal(TREASURY)
send(B, INBOX, S["refund"] + u256(2))   # anyone can settle it
check(bal(C) - c_before == 90 * UNIT, "the sender got 90 back")
check(bal(TREASURY) - t_before == 10 * UNIT, "Talk kept 10")
check(bal(INBOX) == 0, "the hold is empty again")
check(C != A and w(call(INBOX, S["quote"] + addr(C) + addr(A)), 0) == 100 * UNIT,
      "C is not a contact: still pays")

print("\n5. expected failures")
expect_revert(lambda: send(B, INBOX, S["send"] + addr(B) + u256(64) + bytes_arg(ct())), "messaging yourself reverts")
expect_revert(lambda: send(B, INBOX, S["send"] + addr(C) + u256(64) + bytes_arg(ct())), "sending to a wallet with no inbox reverts")
expect_revert(lambda: send(B, INBOX, S["reply"] + u256(2) + u256(64) + bytes_arg(ct())), "replying twice reverts")
expect_revert(lambda: send(B, INBOX, S["reply"] + u256(1) + u256(64) + bytes_arg(ct())), "replying to someone else's payment reverts")
expect_revert(lambda: send(B, INBOX, S["refund"] + u256(1)), "refunding a settled payment reverts")
expect_revert(lambda: send(B, INBOX, S["send"] + addr(A) + u256(64) + bytes_arg(ct(5000))),
              "an oversized message reverts")

print("\n6. open inbox")
send(B, INBOX, S["configure"] + u256(1) + KEY + u256(500 * UNIT))
check(w(call(INBOX, S["quote"] + addr(C) + addr(B)), 0) == 0, "an open inbox charges nothing")

print("\n" + "=" * 66)
ok = sum(1 for passed, _ in results if passed)
print(f"{ok}/{len(results)} checks OK")
if ok != len(results):
    for passed, label in results:
        if not passed:
            print("  - " + label)
    sys.exit(1)
