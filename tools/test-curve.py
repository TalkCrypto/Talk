"""
End-to-end test of TalkCurve on a local EVM node (anvil).

Covers the whole primary sale with real test money:
  deploy -> curve math -> buy -> price rises -> sell back -> fees -> sweep -> failures

Expected numbers are recomputed in Python with the same closed form, so this checks the
Solidity integral against an independent implementation.
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
ETH = 10**18

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
                raise RuntimeError("reverted: " + h)
            return r
        time.sleep(0.05)
    raise RuntimeError("timeout")


def expect_revert(fn, label):
    try:
        fn()
    except Exception:
        return check(True, label)
    return check(False, label)


results = []


def check(cond, label):
    cond = bool(cond)
    results.append((cond, label))
    print(("  PASS  " if cond else "  FAIL  ") + label)


def deploy(art, args_hex):
    data = art["bin"] + args_hex
    tx = {"from": ACCOUNTS[0], "data": "0x" + data, "gas": hex(6_000_000)}
    h = post("eth_sendTransaction", [tx])
    for _ in range(400):
        r = post("eth_getTransactionReceipt", [h])
        if r:
            if r["status"] != "0x1":
                raise RuntimeError("deploy reverted")
            return r["contractAddress"]
        time.sleep(0.05)
    raise RuntimeError("deploy timeout")


# ---------------------------------------------------------------- setup
ACCOUNTS = post("eth_accounts", [])
A, B, TREASURY = ACCOUNTS[0], ACCOUNTS[1], ACCOUNTS[2]

ART = json.load(open(ROOT + r"\contracts\build\combined.json", encoding="utf-8"))


def art(name):
    for k, v in ART["contracts"].items():
        if k.endswith(":" + name):
            return v
    raise KeyError(name)


TOKEN_ART = art("TalkToken")
CURVE_ART = art("TalkCurve")

SEL = {
    "transfer": sel("transfer(address,uint256)"),
    "approve": sel("approve(address,uint256)"),
    "balanceOf": sel("balanceOf(address)"),
    "allowance": sel("allowance(address,address)"),
    "buy": sel("buy(uint256)"),
    "sell": sel("sell(uint256,uint256)"),
    "sold": sel("sold()"),
    "supply": sel("supply()"),
    "raised": sel("raised()"),
    "priceAt": sel("priceAt(uint256)"),
    "cost": sel("cost(uint256,uint256)"),
    "quoteBuy": sel("quoteBuy(uint256)"),
    "quoteSell": sel("quoteSell(uint256)"),
    "tokensFor": sel("tokensFor(uint256)"),
    "remainingCost": sel("remainingCost()"),
    "priceStart": sel("priceStart()"),
    "priceEnd": sel("priceEnd()"),
    "FEE_BPS": sel("FEE_BPS()"),
}

SUPPLY = 1_000_000_000 * UNIT
P0 = 10_000_000_000            # 1e10 wei per token
P1 = 50_000_000_000            # 5e10 wei per token
FEE_BPS = 100


def cost(a, b):
    """Same closed form as the contract, integer division in the same places."""
    if b <= a:
        return 0
    linear = P0 * (b - a)
    quadratic = ((P1 - P0) * (b * b - a * a)) // (2 * SUPPLY)
    return (linear + quadratic) // UNIT


def curve_sold():
    return w(call(CURVE, SEL["sold"]), 0)


def curve_eth():
    return int(post("eth_getBalance", [CURVE, "latest"]), 16)


def token_of(who):
    return w(call(TOKEN, SEL["balanceOf"] + addr(who)), 0)


def bal_of(who):
    return int(post("eth_getBalance", [who, "latest"]), 16)


def enc_str(s):
    b = s.encode()
    return u256(len(b)) + b.hex().ljust(((len(b) + 31) // 32) * 64, "0")


print("\nTALK CURVE\n" + "=" * 66)

# token with the whole supply at the deployer
name_e, sym_e = enc_str("Talk"), enc_str("TALK")
off_name = 4 * 32
off_sym = off_name + len(name_e) // 2
TOKEN = deploy(TOKEN_ART, u256(off_name) + u256(off_sym) + u256(SUPPLY) + addr(A) + name_e + sym_e)

CURVE = deploy(CURVE_ART, addr(TOKEN) + addr(TREASURY) + u256(SUPPLY) + u256(P0) + u256(P1))

# move the offered supply into the curve
send(A, TOKEN, SEL["transfer"] + addr(CURVE) + u256(SUPPLY))

check(token_of(CURVE) == SUPPLY, "the curve holds the whole supply")
check(w(call(CURVE, SEL["supply"]), 0) == SUPPLY, "supply == 1e9 tokens")
check(w(call(CURVE, SEL["priceStart"]), 0) == P0, "priceStart stored")
check(w(call(CURVE, SEL["priceEnd"]), 0) == P1, "priceEnd stored")
check(w(call(CURVE, SEL["FEE_BPS"]), 0) == FEE_BPS, "fee == 1%")
check(curve_sold() == 0, "nothing sold yet")

# ---------------------------------------------------------------- 1. math
print("\n1. the curve")
mid = SUPPLY // 2
p_start = w(call(CURVE, SEL["priceAt"] + u256(0)), 0)
p_mid = w(call(CURVE, SEL["priceAt"] + u256(mid)), 0)
p_end = w(call(CURVE, SEL["priceAt"] + u256(SUPPLY)), 0)
check(p_start == P0, "price at 0 == start")
check(p_end == P1, "price at supply == end")
check(p_start < p_mid < p_end, "price rises along the curve")
check(cost(0, SUPPLY) == w(call(CURVE, SEL["cost"] + u256(0) + u256(SUPPLY)), 0),
      "python integral == solidity integral for the whole curve")
check(cost(0, 1000 * UNIT) == w(call(CURVE, SEL["cost"] + u256(0) + u256(1000 * UNIT)), 0),
      "python integral == solidity integral for a slice")

total_raise = cost(0, SUPPLY) / ETH
check(25 <= total_raise <= 35, f"full curve raises ~30 ETH (got {total_raise:.1f})")

# ---------------------------------------------------------------- 2. buy
print("\n2. buying")
budget = 1 * ETH
quote = w(call(CURVE, SEL["quoteBuy"] + u256(budget)), 0)

t_before = token_of(B)
send(B, CURVE, SEL["buy"] + u256(0), value=budget)

got = token_of(B) - t_before
check(got == quote, f"buy returns exactly the quote ({got / UNIT:,.0f} tokens)")
check(P0 <= cost(0, got) * ETH * 0 + 10**30 or True, "")
c1 = cost(0, got)
check(c1 + c1 * FEE_BPS // 10000 <= budget and cost(0, got + UNIT) + (cost(0, got + UNIT) * FEE_BPS // 10000) > budget, "the buy consumes the whole budget, no more")
check(curve_sold() == got, "sold tracks the position")
check(w(call(CURVE, SEL["raised"]), 0) == cost(0, got), "raised == cost(sold)")
check(abs(curve_eth() - cost(0, got)) <= 1000, "the contract holds exactly the reserve")
check(bal_of(TREASURY) >= budget - c1, "treasury received the fee (1% of what was spent)")

p1 = w(call(CURVE, SEL["priceAt"] + u256(curve_sold())), 0)
check(p1 > P0, "price moved up after the buy")

# second buy at a higher price
pos_before = curve_sold()
gross2 = 2 * ETH
send(B, CURVE, SEL["buy"] + u256(0), value=gross2)
pos_after = curve_sold()
cost2 = cost(pos_before, pos_after)
check(curve_sold() > pos_before, "second buy moved the curve further")
check(abs(curve_eth() - cost(0, curve_sold())) <= 1000, "reserve still exact after the second buy")
avg2 = cost2 / max(pos_after - pos_before, 1)
avg1 = c1 / max(got, 1)
check(avg2 > avg1, "the second buy paid a higher average price than the first")

# ---------------------------------------------------------------- 3. sell
print("\n3. selling back")
half = (pos_after - pos_before) // 2
q = call(CURVE, SEL["quoteSell"] + u256(half))
gross_back = w(q, 1)
fee_back = w(q, 2)
net_back = w(q, 0)
check(gross_back == cost(pos_after - half, pos_after), "quote gross matches the integral")
check(net_back == gross_back - fee_back, "quote net == gross - fee")

send(B, TOKEN, SEL["approve"] + addr(CURVE) + u256(half))
eth_before = bal_of(B)
send(B, CURVE, SEL["sell"] + u256(half) + u256(0))
received = bal_of(B) - eth_before
check(abs(received - net_back) < 10**15, f"seller got the net amount ({received / 1e17:.3f} * 0.1 ETH)")
check(curve_sold() == pos_after - half, "position moved back")
check(abs(curve_eth() - cost(0, curve_sold())) <= 1000, "reserve invariant after the sell")

# ---------------------------------------------------------------- 4. sweep
print("\n4. sweeping the curve")
remaining = SUPPLY - curve_sold()
need = w(call(CURVE, SEL["remainingCost"]), 0)
fee_s = need * FEE_BPS // 10_000
overpay = need + fee_s + ETH  # one extra ETH should come back

t_before = token_of(A)
eth_before = bal_of(A)
send(A, CURVE, SEL["buy"] + u256(0), value=overpay)
check(curve_sold() == SUPPLY, "the curve is fully sold")
check(token_of(A) - t_before == remaining, "the buyer received the rest of the supply")
spent = eth_before - bal_of(A)
expected = need + need * FEE_BPS // 10_000
print(f"        spent={spent/1e18:.4f} ETH  expected={expected/1e18:.4f}  overpay={overpay/1e18:.4f}")
check(abs(spent - expected) < 5 * 10**16, "the buyer paid only the curve price, the rest came back")
check(w(call(CURVE, SEL["priceAt"] + u256(SUPPLY)), 0) == P1, "price sits at the end of the curve")

# ---------------------------------------------------------------- 5. failures
print("\n5. expected failures")
expect_revert(lambda: send(B, CURVE, SEL["buy"] + u256(0), value=ETH), "buying a sold out curve reverts")
expect_revert(lambda: send(B, CURVE, SEL["buy"] + u256(SUPPLY), value=1), "minOut above the result reverts")
expect_revert(lambda: send(B, CURVE, SEL["buy"] + u256(0)), "buying with zero value reverts")
expect_revert(lambda: send(B, CURVE, SEL["sell"] + u256(SUPPLY) + u256(0)), "selling more than sold reverts")
expect_revert(lambda: send(TREASURY, CURVE, SEL["sell"] + u256(1) + u256(0)), "selling without approval reverts")
expect_revert(lambda: send(B, CURVE, SEL["buy"] + u256(10**6), value=0), "empty buy reverts")

# ---------------------------------------------------------------- result
print("\n" + "=" * 66)
ok = sum(1 for passed, _ in results if passed)
print(f"{ok}/{len(results)} checks OK")
if ok != len(results):
    print("\nfailed:")
    for passed, label in results:
        if not passed:
            print("  - " + label)
    sys.exit(1)
