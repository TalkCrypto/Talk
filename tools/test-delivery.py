"""
Delivery test: does a message that gets sent actually arrive?

This exercises the path the client uses, not the contract internals:
  send -> event log -> eth_getLogs (paginated) -> decode -> order -> dedup -> payload intact

If this passes, a message written on chain is a message the inbox can show.
"""
import json
import sys
import time
import urllib.request

import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "vendor"))
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


def topic(sig):
    return "0x" + keccak256(sig.encode()).hex()


def u256(v):
    return f"{int(v) & ((1 << 256) - 1):064x}"


def addr(a):
    return a.lower().replace("0x", "").rjust(64, "0")


def w(hexdata, i):
    h = hexdata[2:] if hexdata.startswith("0x") else hexdata
    return int(h[i * 64:(i + 1) * 64] or "0", 16)


def call(to, data):
    return post("eth_call", [{"to": to, "data": data}, "latest"])


def tx(frm, to, data, value=0):
    t = {"from": frm, "to": to, "data": data, "gas": hex(6_000_000)}
    if value:
        t["value"] = hex(value)
    h = post("eth_sendTransaction", [t])
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


def deploy(art, args_hex, frm):
    data = "0x" + art["bin"] + args_hex
    t = {"from": frm, "data": data, "gas": hex(6_000_000)}
    h = post("eth_sendTransaction", [t])
    for _ in range(400):
        r = post("eth_getTransactionReceipt", [h])
        if r:
            if r["status"] != "0x1":
                raise RuntimeError("deploy reverted")
            return r["contractAddress"], int(r["blockNumber"], 16)
        time.sleep(0.05)
    raise RuntimeError("deploy timeout")


def enc_str(s):
    b = s.encode()
    return u256(len(b)) + b.hex().ljust(((len(b) + 31) // 32) * 64, "0")


def bytes_arg(hexstr):
    raw = hexstr[2:]
    return u256(len(raw) // 2) + raw.ljust(((len(raw) // 2 + 31) // 32) * 64, "0")


ART = json.load(open(ROOT + r"\contracts\build\combined.json", encoding="utf-8"))


def art(name):
    for k, v in ART["contracts"].items():
        if k.endswith(":" + name):
            return v
    raise KeyError(name)


S = {
    "transfer": sel("transfer(address,uint256)"), "approve": sel("approve(address,uint256)"),
    "configure": sel("configure(bool,bytes32,uint256)"), "send": sel("send(address,uint256,bytes)"),
    "reply": sel("reply(uint256,bytes)"), "nextId": sel("nextId()"),
}
TOPIC_MSG = topic("Message(uint256,address,address,uint256,bytes)")

ACCOUNTS = post("eth_accounts", [])
A, B, C = ACCOUNTS[0], ACCOUNTS[1], ACCOUNTS[2]
TREASURY = ACCOUNTS[4]

print("\nDELIVERY — does the message arrive?\n" + "=" * 66)

name_e, sym_e = enc_str("Talk"), enc_str("TALK")
off_name = 4 * 32
off_sym = off_name + len(name_e) // 2
TOKEN, b0 = deploy(art("TalkToken"), u256(off_name) + u256(off_sym) + u256(10**9 * UNIT) + addr(A) + name_e + sym_e, A)
INBOX, deployBlock = deploy(art("TalkInbox"), addr(TOKEN) + addr(TREASURY), A)

for who in (A, B, C):
    tx(A, TOKEN, S["transfer"] + addr(who) + u256(500 * UNIT))
    tx(who, TOKEN, S["approve"] + addr(INBOX) + u256(500 * UNIT))

KEY = "11" * 32
tx(A, INBOX, S["configure"] + u256(0) + KEY + u256(10 * UNIT))
tx(B, INBOX, S["configure"] + u256(0) + KEY + u256(0))

# ---------------------------------------------------------------- three messages
print("\n1. sending")
ids = []
for i, msg in enumerate(["first", "second", "third"]):
    ct = "0x01" + KEY + "22" * 24 + msg.encode().hex().ljust(64, "0")
    tx(B, INBOX, S["send"] + addr(A) + u256(10 ** 40) + u256(96) + bytes_arg(ct))
    ids.append(i + 1)

# a reply from A to B, which is also a Message event
ct_reply = "0x01" + KEY + "33" * 24 + b"reply".hex().ljust(64, "0")
tx(A, INBOX, S["reply"] + u256(1) + u256(64) + bytes_arg(ct_reply))

latest = int(post("eth_blockNumber", []), 16)

# ---------------------------------------------------------------- the client path
print("\n2. reading them back the way the app does")


def _payload_len(data):
    off = int(data[66:130], 16)          # byte offset of the bytes argument
    return int(data[2 + off * 2 : 2 + off * 2 + 64], 16)


def _payload(data):
    off = int(data[66:130], 16)
    n = int(data[2 + off * 2 : 2 + off * 2 + 64], 16)
    start = 2 + off * 2 + 64
    return "0x" + data[start:start + n * 2]


def fetch(from_block, to_block):
    logs = post("eth_getLogs", [{
        "address": INBOX, "topics": [TOPIC_MSG],
        "fromBlock": hex(from_block), "toBlock": hex(to_block)
    }])
    out = []
    for lg in logs:
        out.append({
            "key": lg["transactionHash"] + ":" + str(int(lg["logIndex"], 16)),
            "block": int(lg["blockNumber"], 16),
            "txIndex": int(lg["transactionIndex"], 16),
            "logIndex": int(lg["logIndex"], 16),
            "id": int(lg["topics"][1], 16),
            "from": "0x" + lg["topics"][2][-40:],
            "to": "0x" + lg["topics"][3][-40:],
            "paymentId": int(lg["data"][2:66], 16),
            "payload": _payload(lg["data"]),
            "len": _payload_len(lg["data"]),
        })
    return out


all_logs = fetch(deployBlock, latest)
check(len(all_logs) == 4, f"all 4 messages arrived (got {len(all_logs)})")
check([m["id"] for m in all_logs] == [1, 2, 3, 4], "ids arrive in order: " + str([m["id"] for m in all_logs]))

print("\n3. pagination and duplicates")
paged = []
step = 2
b = deployBlock
while b <= latest:
    paged += fetch(b, min(b + step - 1, latest))
    b += step
check(len(paged) == len(all_logs), "paginated reads return the same messages")

overlap = fetch(deployBlock, latest) + fetch(deployBlock + 1, latest)
seen, unique = set(), []
for m in overlap:
    if m["key"] in seen:
        continue
    seen.add(m["key"])
    unique.append(m)
check(len(unique) == len(all_logs), "dedup by tx hash + log index collapses the overlap")

print("\n4. the payload survives")
for m in all_logs:
    if m["len"] != 89:
        check(False, f"payload length intact for message {m['id']}")
        break
else:
    check(True, "payload length intact for every message")

first = all_logs[0]
raw = bytes.fromhex(first["payload"][2:])
check(raw[:1] == b"\x01", "envelope version byte is 1")
check(raw[1:33].hex() == KEY, "sender key is embedded in the envelope")
check(raw[33:57] == b"\x22" * 24, "nonce is preserved")
check(raw[57:62] == b"first", "the text payload is intact")

print("\n5. routing")
check(first["from"].lower() == B.lower(), "message 1 came from B")
check(first["to"].lower() == A.lower(), "message 1 went to A")
reply = all_logs[3]
check(reply["from"].lower() == A.lower() and reply["to"].lower() == B.lower(), "the reply goes back to B")
check(reply["paymentId"] == 1, "the reply points at payment 1")

print("\n" + "=" * 66)
ok = sum(1 for passed, _ in results if passed)
print(f"{ok}/{len(results)} checks OK")
if ok != len(results):
    for passed, label in results:
        if not passed:
            print("  - " + label)
    sys.exit(1)
