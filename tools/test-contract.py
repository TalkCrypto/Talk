"""
Test end-to-end de TalkInbox sobre un nodo EVM local (anvil).

Cubre el ciclo completo con dinero real de prueba:
  activar buzón → enviar pagando → responder y liquidar (3 reglas) → contactos gratis
  → reembolso tras expirar → errores esperados
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

# ---------------------------------------------------------------- transporte
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
                raise RuntimeError("revertió: " + h)
            return r
        time.sleep(0.05)
    raise RuntimeError("timeout " + h)


def expect_revert(fn, label):
    try:
        fn()
    except RuntimeError:
        results.append((True, label))
        return
    results.append((False, label + " (no revirtió)"))


results = []


def check(label, cond):
    results.append((bool(cond), label))


# ---------------------------------------------------------------- despliegue
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
                raise RuntimeError("deploy revirtió")
            return r
        time.sleep(0.05)
    raise RuntimeError("timeout deploy")


ACCOUNTS = post("eth_accounts", [])
if len(ACCOUNTS) < 5:
    raise SystemExit("anvil necesita 5 cuentas")

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
    """Sobre de prueba: version 1 + relleno del largo pedido."""
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


# ============================================================ 0. constantes
check("TTL == 72h", to_int(call(INBOX, SEL["ttl"])) == 72 * 3600)
check("FEE_BPS == 500 (5%)", to_int(call(INBOX, SEL["feeBps"])) == 500)
check("token() == $TALK", "0x" + w(call(INBOX, SEL["token"]), 0)[24:] == TOKEN.lower())
check("treasury() == tesorería", "0x" + w(call(INBOX, SEL["treasury"]), 0)[24:] == TREASURY.lower())
check("nextId arranca en 1", to_int(call(INBOX, SEL["nextId"])) == 1)

# ============================================================ 1. reparto de tokens
TRANSFER = sel("transfer(address,uint256)")
for who in (B, C, D):
    send(A, TOKEN, "0x" + TRANSFER[2:] + addr(who) + u256(10_000 * UNIT))
for who in (B, C, D):
    send(who, TOKEN, SEL["approve"] + addr(INBOX) + u256(10_000 * UNIT))
check("B recibió 10.000 TALK", token_bal(B) == 10_000 * UNIT)
check("A conserva el resto", token_bal(A) == (SUPPLY - 30_000 * UNIT))
check("B aprobó el contrato", to_int(call(TOKEN, SEL["allowance"] + addr(B) + addr(INBOX))) == 10_000 * UNIT)

# ============================================================ 2. activar buzón
KEY_B = "11" * 32
KEY_C = "22" * 32
KEY_D = "33" * 32

# A cobra 100 TALK, regla Keep (se lo queda menos 5%)
send(A, INBOX, SEL["configure"] + u256(0) + u256(1) + KEY_B + u256(100 * UNIT))
box = inbox_of(A)
check("A: buzón registrado", box["registered"])
check("A: precio 100 TALK", box["price"] == 100 * UNIT)
check("A: regla Keep", box["rule"] == 1)
check("A: encKey guardada", box["encKey"] == KEY_B)

check("quote(B->A) == 100 TALK", quote(B, A) == 100 * UNIT)
check("quote(A->B) == 0 (B sin buzón)", quote(A, B) == 0)

expect_revert(lambda: send(B, INBOX, SEL["send"] + addr(C) + u256(2 * 32) + enc_bytes(ct(80, "hola"))),
              "enviar a wallet sin buzón revierte (NotRegistered)")
expect_revert(lambda: send(A, INBOX, SEL["send"] + addr(A) + u256(2 * 32) + enc_bytes(ct(80, "yo"))),
              "mensaje a uno mismo revierte (SelfMessage)")

# ============================================================ 3. enviar pagando
before_b = token_bal(B)
send(B, INBOX, SEL["send"] + addr(A) + u256(2 * 32) + enc_bytes(ct(80, "hola")))
after_b = token_bal(B)
check("B pagó exactamente 100 TALK", before_b - after_b == 100 * UNIT)
check("el contrato retiene 100 en escrow", token_bal(INBOX) == 100 * UNIT)
check("nextId pasó a 2", to_int(call(INBOX, SEL["nextId"])) == 2)

p = payment(1)
tip = int(post("eth_getBlockByNumber", ["latest", False])["timestamp"], 16)
check("pago 1 pendiente", p["status"] == 1)
check("pago 1: from B, to A", p["from"].lower() == B.lower() and p["to"].lower() == A.lower())
check("pago 1: vence en 72h", p["expires"] - tip == 72 * 3600)

# ============================================================ 4. regla Keep
before_a, before_t = token_bal(A), token_bal(TREASURY)
send(A, INBOX, SEL["reply"] + u256(1) + u256(2 * 32) + enc_bytes(ct(90, "respuesta")))
after_a, after_t = token_bal(A), token_bal(TREASURY)
check("A cobró 95 TALK (100 - 5%)", after_a - before_a == 95 * UNIT)
check("tesorería cobró 5 TALK", after_t - before_t == 5 * UNIT)
check("pago 1 liquidado", payment(1)["status"] == 2)
check("escrow vacío", token_bal(INBOX) == 0)
check("A y B ahora son contactos", is_contact(A, B) and is_contact(B, A))
check("quote(B->A) == 0 tras responder", quote(B, A) == 0)

expect_revert(lambda: send(A, INBOX, SEL["reply"] + u256(1) + u256(2 * 32) + enc_bytes(ct(80, "otra"))),
              "responder dos veces revierte (NotPending)")
expect_revert(lambda: send(B, INBOX, SEL["reply"] + u256(1) + u256(2 * 32) + enc_bytes(ct(80, "x"))),
              "responder un pago ajeno revierte (NotPending)")

# ============================================================ 5. gratis tras contacto
before_b = token_bal(B)
send(B, INBOX, SEL["send"] + addr(A) + u256(2 * 32) + enc_bytes(ct(70, "gratis")))
check("mensaje de contacto es gratis", token_bal(B) == before_b)
check("no crea pago nuevo", to_int(call(INBOX, SEL["nextId"])) == 2)

# ============================================================ 6. regla Split
send(C, INBOX, SEL["configure"] + u256(0) + u256(2) + KEY_C + u256(200 * UNIT))
before_d = token_bal(D)
send(D, INBOX, SEL["send"] + addr(C) + u256(2 * 32) + enc_bytes(ct(80, "split")))
check("D pagó 200", before_d - token_bal(D) == 200 * UNIT)

before_c, before_t = token_bal(C), token_bal(TREASURY)
send(C, INBOX, SEL["reply"] + u256(2) + u256(2 * 32) + enc_bytes(ct(80, "ok")))
after_c, after_t = token_bal(C), token_bal(TREASURY)
recv = after_c - before_c
fee = after_t - before_t
check("split: C cobra 95 (mitad 100 - 5%)", recv == 95 * UNIT)
check("split: comisión 5", fee == 5 * UNIT)
check("split: D recupera 100", token_bal(D) == before_d - 200 * UNIT + 100 * UNIT)

# ============================================================ 7. regla Refund
send(A, INBOX, SEL["configure"] + u256(0) + u256(0) + KEY_B + u256(80 * UNIT))
# A y B son contactos: necesitamos un tercero. D escribe a A.
before_d = token_bal(D)
send(D, INBOX, SEL["send"] + addr(A) + u256(2 * 32) + enc_bytes(ct(80, "refund")))
check("D pagó 80", before_d - token_bal(D) == 80 * UNIT)
before_d = token_bal(D)
send(A, INBOX, SEL["reply"] + u256(3) + u256(2 * 32) + enc_bytes(ct(80, "toma")))
check("regla Refund: el remitente recupera 80", token_bal(D) - before_d == 80 * UNIT)
check("regla Refund: sin comisión", payment(3)["status"] == 2)

# ============================================================ 8. expiración y reembolso
send(B, INBOX, SEL["configure"] + u256(0) + u256(1) + KEY_B + u256(50 * UNIT))
# B y C no son contactos
before_c = token_bal(C)
send(C, INBOX, SEL["send"] + addr(B) + u256(2 * 32) + enc_bytes(ct(80, "pago")))
pid = to_int(call(INBOX, SEL["nextId"])) - 1
check("nuevo pago en escrow", payment(pid)["status"] == 1)
expect_revert(lambda: send(C, INBOX, SEL["refund"] + u256(pid)),
              "reembolsar antes de tiempo revierte (NotExpired)")

post("evm_increaseTime", [72 * 3600 + 60])
post("evm_mine", [])
send(C, INBOX, SEL["refund"] + u256(pid))
check("tras 72h el remitente recupera todo", token_bal(C) == before_c)
check("pago reembolsado", payment(pid)["status"] == 3)
check("escrow vacío al final", token_bal(INBOX) == 0)
expect_revert(lambda: send(C, INBOX, SEL["refund"] + u256(pid)),
              "reembolsar dos veces revierte (NotPending)")

# ============================================================ 9. buzón abierto
send(A, INBOX, SEL["configure"] + u256(1) + u256(1) + KEY_B + u256(500 * UNIT))
before_d = token_bal(D)
send(D, INBOX, SEL["send"] + addr(A) + u256(2 * 32) + enc_bytes(ct(60, "abierto")))
check("buzón abierto: escribir es gratis", token_bal(D) == before_d)

# ============================================================ 10. límites
expect_revert(lambda: send(D, INBOX, SEL["send"] + addr(A) + u256(2 * 32) + enc_bytes("0x" + "aa" * 5000)),
              "mensaje gigante revierte (TooLong)")

# ============================================================ resultado
print()
ok = 0
for passed, label in results:
    print(("  PASS  " if passed else "  FAIL  ") + label)
    ok += 1 if passed else 0
print(f"\n{ok}/{len(results)} comprobaciones OK")
sys.exit(0 if ok == len(results) else 1)

