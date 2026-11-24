"""
End-to-end test of TalkInbox on a local EVM node (anvil).

Covers the full cycle with real test money:
  activate inbox -> send paying -> reply and settle (3 rules) -> contacts go free
  -> refund after expiry -> expected failures
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

# ---------------------------------------------------------------- transport
_id = [0]


def post(method, params):
    _id[0] += 1
    body = json.dumps({"jsonrpc": "2.0", "id": _id[0], "method": method, "params": params}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        out = json.loads(r.read().decode())
    if "error" in out:
        raise RuntimeError(out["error"].get("message", out["error"]))
    return out["result"]


def sel(sig):
    return "0x" + keccak256(sig.encode()).hex()[:8]


def u256(v):
    return f"{int(v):064x}"


def addr(a):
    return a.lower().replace("0x", "").rjust(64, "0")


def w(hexdata, i):
    return hexdata[2 + i * 64: 2 + (i + 1) * 64]


def to_int(hexdata):
    return int(hexdata, 16)


def call(to, data):
    return post("eth_call", [{"to": to, "data": data}, "latest"])


def send(frm, to, data, value=0):
    tx = {"from": frm, "to": to, "data": data}
    if value:
        tx["value"] = hex(value)
    h = post("eth_sendTransaction", [tx])
    for _ in range(200):
        r = post("eth_getTransactionReceipt", [h])
        if r:
            if r["status"] != "0x1":
                raise RuntimeError("reverted: " + h)
            return r
        time.sleep(0.05)
    raise RuntimeError("timeout " + h)


def expect_revert(fn, label):
    try:
        fn()
    except RuntimeError:
        results.append((True, label))
        return
    results.append((False, label + " (did not revert)"))


results = []


def check(label, cond):
    results.append((bool(cond), label))


# ---------------------------------------------------------------- deploy
def deploy(artifact, args_hex):
    data = artifact["bytecode"] + args_hex
    r = send(ACCOUNTS[0], None, data) if False else send_creation(data)
    return r["contractAddress"]


def send_creation(data):
    h = post("eth_sendTransaction", [{"from": ACCOUNTS[0], "data": data, "gas": hex(8_000_000)}])
    for _ in range(300):
        r = post("eth_getTransactionReceipt", [h])
        if r:
            if r["status"] != "0x1":
                raise RuntimeError("deploy reverted")
            return r
        time.sleep(0.05)
    raise RuntimeError("timeout deploy")


ACCOUNTS = post("eth_accounts", [])
if len(ACCOUNTS) < 5:
    raise SystemExit("anvil needs 5 accounts")

ART = json.load(open(ROOT + r"\contracts\build\combined.json", encoding="utf-8"))


def art(name):
    for k, v in ART["contracts"].items():
        if k.endswith(":" + name):
            return {"abi": v["abi"], "bytecode": "0x" + v["bin"]}
    raise KeyError(name)


TOKEN_ART = art("TalkToken")
INBOX_ART = art("TalkInbox")

A, B, C, D, TREASURY = ACCOUNTS[0], ACCOUNTS[1], ACCOUNTS[2], ACCOUNTS[3], ACCOUNTS[4]
SUPPLY = 1_000_000 * UNIT


def enc_str(s):
    b = s.encode()
    h = b.hex()
    return u256(len(b)) + h.ljust((len(h) + 63) // 64 * 64, "0")


# constructor TalkToken(string,string,uint256,address)
name_e, sym_e = enc_str("Talk"), enc_str("TALK")
off_name = 4 * 32
off_sym = off_name + len(name_e) // 2
token_args = u256(off_name) + u256(off_sym) + u256(SUPPLY) + addr(A) + name_e + sym_e
TOKEN = deploy(TOKEN_ART, token_args)

# constructor TalkInbox(address token, address treasury)
INBOX = deploy(INBOX_ART, addr(TOKEN) + addr(TREASURY))

print("TOKEN:", TOKEN)
print("INBOX:", INBOX)

SEL = {
    "configure": sel("configure(bool,uint8,bytes32,uint256)"),
    "setPrice": sel("setPrice(uint256)"),
    "inboxes": sel("inboxes(address)"),
    "payments": sel("payments(uint256)"),
    "quote": sel("quote(address,address)"),
    "isContact": sel("isContact(address,address)"),
    "send": sel("send(address,bytes)"),
    "reply": sel("reply(uint256,bytes)"),
    "refund": sel("refund(uint256)"),
    "ttl": sel("TTL()"),
    "feeBps": sel("FEE_BPS()"),
    "nextId": sel("nextId()"),
    "token": sel("token()"),
    "treasury": sel("treasury()"),
    "bal": sel("balanceOf(address)"),
    "approve": sel("approve(address,uint256)"),
    "allowance": sel("allowance(address,address)"),
}


def enc_bytes(hexdata):
    h = hexdata.replace("0x", "")
    n = len(h) // 2
    return u256(n) + h.ljust((len(h) + 63) // 64 * 64, "0")


def ct(nbytes, tag):
    """Test envelope: version byte 1 plus padding to the requested size."""
    body = "01" + (tag.encode().hex().ljust(nbytes * 2, "0"))[: nbytes * 2]
    return "0x" + body


def token_bal(who):
    return to_int(call(TOKEN, SEL["bal"] + addr(who)))


def inbox_of(who):
    d = call(INBOX, SEL["inboxes"] + addr(who))
    return {
        "registered": to_int(w("0x" + w(d, 0), 0)) if False else int(w(d, 0), 16) == 1,
        "open": int(w(d, 1), 16) == 1,
        "rule": int(w(d, 2), 16),
        "encKey": w(d, 3),
        "price": int(w(d, 4), 16),
    }


def payment(pid):
    d = call(INBOX, SEL["payments"] + u256(pid))
    return {
        "from": "0x" + w(d, 0)[24:],
        "to": "0x" + w(d, 1)[24:],
        "amount": int(w(d, 2), 16),
        "expires": int(w(d, 3), 16),
        "status": int(w(d, 4), 16),
    }


def quote(a, b):
    return to_int(call(INBOX, SEL["quote"] + addr(a) + addr(b)))


def is_contact(a, b):
    return int(call(INBOX, SEL["isContact"] + addr(a) + addr(b)), 16) == 1


# ============================================================ 0. constants
check("TTL == 72h", to_int(call(INBOX, SEL["ttl"])) == 72 * 3600)
check("FEE_BPS == 500 (5%)", to_int(call(INBOX, SEL["feeBps"])) == 500)
check("token() == $TALK", "0x" + w(call(INBOX, SEL["token"]), 0)[24:] == TOKEN.lower())
check("treasury() == treasury", "0x" + w(call(INBOX, SEL["treasury"]), 0)[24:] == TREASURY.lower())
check("nextId starts at 1", to_int(call(INBOX, SEL["nextId"])) == 1)

# ============================================================ 1. token distribution
TRANSFER = sel("transfer(address,uint256)")
for who in (B, C, D):
    send(A, TOKEN, "0x" + TRANSFER[2:] + addr(who) + u256(10_000 * UNIT))
for who in (B, C, D):
    send(who, TOKEN, SEL["approve"] + addr(INBOX) + u256(10_000 * UNIT))
check("B received 10,000 TALK", token_bal(B) == 10_000 * UNIT)
check("A keeps the rest", token_bal(A) == (SUPPLY - 30_000 * UNIT))
check("B approved the contract", to_int(call(TOKEN, SEL["allowance"] + addr(B) + addr(INBOX))) == 10_000 * UNIT)

# ============================================================ 2. activate inbox
KEY_B = "11" * 32
KEY_C = "22" * 32
KEY_D = "33" * 32

# A cobra 100 TALK, regla Keep (se lo queda menos 5%)
send(A, INBOX, SEL["configure"] + u256(0) + u256(1) + KEY_B + u256(100 * UNIT))
box = inbox_of(A)
check("A: inbox registered", box["registered"])
check("A: price 100 TALK", box["price"] == 100 * UNIT)
check("A: rule Keep", box["rule"] == 1)
check("A: encKey stored", box["encKey"] == KEY_B)

check("quote(B->A) == 100 TALK", quote(B, A) == 100 * UNIT)
check("quote(A->B) == 0 (B has no inbox)", quote(A, B) == 0)

expect_revert(lambda: send(B, INBOX, SEL["send"] + addr(C) + u256(2 * 32) + enc_bytes(ct(80, "hola"))),
              "sending to a wallet with no inbox reverts (NotRegistered)")
expect_revert(lambda: send(A, INBOX, SEL["send"] + addr(A) + u256(2 * 32) + enc_bytes(ct(80, "yo"))),
              "messaging yourself reverts (SelfMessage)")

# ============================================================ 3. send paying
before_b = token_bal(B)
send(B, INBOX, SEL["send"] + addr(A) + u256(2 * 32) + enc_bytes(ct(80, "hola")))
after_b = token_bal(B)
check("B paid exactly 100 TALK", before_b - after_b == 100 * UNIT)
check("the contract holds 100 in escrow", token_bal(INBOX) == 100 * UNIT)
check("nextId moved to 2", to_int(call(INBOX, SEL["nextId"])) == 2)

p = payment(1)
tip = int(post("eth_getBlockByNumber", ["latest", False])["timestamp"], 16)
check("payment 1 is pending", p["status"] == 1)
check("payment 1: from B, to A", p["from"].lower() == B.lower() and p["to"].lower() == A.lower())
check("payment 1: expires in 72h", p["expires"] - tip == 72 * 3600)

# ============================================================ 4. Keep rule
before_a, before_t = token_bal(A), token_bal(TREASURY)
send(A, INBOX, SEL["reply"] + u256(1) + u256(2 * 32) + enc_bytes(ct(90, "respuesta")))
after_a, after_t = token_bal(A), token_bal(TREASURY)
check("A received 95 TALK (100 - 5%)", after_a - before_a == 95 * UNIT)
check("treasury received 5 TALK", after_t - before_t == 5 * UNIT)
check("payment 1 settled", payment(1)["status"] == 2)
check("escrow is empty", token_bal(INBOX) == 0)
check("A and B are now contacts", is_contact(A, B) and is_contact(B, A))
check("quote(B->A) == 0 after replying", quote(B, A) == 0)

expect_revert(lambda: send(A, INBOX, SEL["reply"] + u256(1) + u256(2 * 32) + enc_bytes(ct(80, "otra"))),
              "replying twice reverts (NotPending)")
expect_revert(lambda: send(B, INBOX, SEL["reply"] + u256(1) + u256(2 * 32) + enc_bytes(ct(80, "x"))),
              "replying to someone else's payment reverts (NotPending)")

# ============================================================ 5. free after contact
before_b = token_bal(B)
send(B, INBOX, SEL["send"] + addr(A) + u256(2 * 32) + enc_bytes(ct(70, "free")))
check("contact messages are free", token_bal(B) == before_b)
check("no new payment is created", to_int(call(INBOX, SEL["nextId"])) == 2)

# ============================================================ 6. Split rule
send(C, INBOX, SEL["configure"] + u256(0) + u256(2) + KEY_C + u256(200 * UNIT))
before_d = token_bal(D)
send(D, INBOX, SEL["send"] + addr(C) + u256(2 * 32) + enc_bytes(ct(80, "split")))
check("D paid 200", before_d - token_bal(D) == 200 * UNIT)

before_c, before_t = token_bal(C), token_bal(TREASURY)
send(C, INBOX, SEL["reply"] + u256(2) + u256(2 * 32) + enc_bytes(ct(80, "ok")))
after_c, after_t = token_bal(C), token_bal(TREASURY)
recv = after_c - before_c
fee = after_t - before_t
check("split: C gets 95 (half of 100, minus 5%)", recv == 95 * UNIT)
check("split: fee is 5", fee == 5 * UNIT)
check("split: D gets 100 back", token_bal(D) == before_d - 200 * UNIT + 100 * UNIT)

# ============================================================ 7. Refund rule
send(A, INBOX, SEL["configure"] + u256(0) + u256(0) + KEY_B + u256(80 * UNIT))
# A y B son contactos: necesitamos un tercero. D escribe a A.
before_d = token_bal(D)
send(D, INBOX, SEL["send"] + addr(A) + u256(2 * 32) + enc_bytes(ct(80, "refund")))
check("D paid 80", before_d - token_bal(D) == 80 * UNIT)
before_d = token_bal(D)
send(A, INBOX, SEL["reply"] + u256(3) + u256(2 * 32) + enc_bytes(ct(80, "toma")))
check("Refund rule: the sender gets 80 back", token_bal(D) - before_d == 80 * UNIT)
check("Refund rule: no fee", payment(3)["status"] == 2)

# ============================================================ 8. expiry and refund
send(B, INBOX, SEL["configure"] + u256(0) + u256(1) + KEY_B + u256(50 * UNIT))
# B y C no son contactos
before_c = token_bal(C)
send(C, INBOX, SEL["send"] + addr(B) + u256(2 * 32) + enc_bytes(ct(80, "payment")))
pid = to_int(call(INBOX, SEL["nextId"])) - 1
check("new payment in escrow", payment(pid)["status"] == 1)
expect_revert(lambda: send(C, INBOX, SEL["refund"] + u256(pid)),
              "refunding early reverts (NotExpired)")

post("evm_increaseTime", [72 * 3600 + 60])
post("evm_mine", [])
send(C, INBOX, SEL["refund"] + u256(pid))
check("after 72h the sender gets everything back", token_bal(C) == before_c)
check("payment refunded", payment(pid)["status"] == 3)
check("escrow is empty at the end", token_bal(INBOX) == 0)
expect_revert(lambda: send(C, INBOX, SEL["refund"] + u256(pid)),
              "refunding twice reverts (NotPending)")

# ============================================================ 9. open inbox
send(A, INBOX, SEL["configure"] + u256(1) + u256(1) + KEY_B + u256(500 * UNIT))
before_d = token_bal(D)
send(D, INBOX, SEL["send"] + addr(A) + u256(2 * 32) + enc_bytes(ct(60, "abierto")))
check("open inbox: writing is free", token_bal(D) == before_d)

# ============================================================ 10. limits
expect_revert(lambda: send(D, INBOX, SEL["send"] + addr(A) + u256(2 * 32) + enc_bytes("0x" + "aa" * 5000)),
              "oversized message reverts (TooLong)")

# ============================================================ result
print()
ok = 0
for passed, label in results:
    print(("  PASS  " if passed else "  FAIL  ") + label)
    ok += 1 if passed else 0
print(f"\n{ok}/{len(results)} checks OK")
sys.exit(0 if ok == len(results) else 1)

