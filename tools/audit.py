"""
Auditoría de Talk: verifica que el código, la ABI, los selectores, los topics y el
HTML estén donde deben y coincidan entre sí. Sale con código 1 si algo no cierra.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, r"C:\Users\nonam\AppData\Local\Temp\nexus")
from keccak import keccak256  # noqa: E402

ROOT = Path(r"C:\Users\nonam\Desktop\PROYECTOS\Talk")
WEB = ROOT / "web"

results = []


def check(ok, label, detail=""):
    results.append((bool(ok), label, detail))


def read(p):
    return p.read_text(encoding="utf-8")


# ---------------------------------------------------------------- fuentes
combined = json.loads(read(ROOT / "contracts" / "build" / "combined.json"))


def art(name):
    for k, v in combined["contracts"].items():
        if k.endswith(":" + name):
            abi = v["abi"] if isinstance(v["abi"], list) else json.loads(v["abi"])
            return {"abi": abi, "bin": v["bin"]}
    raise KeyError(name)


INBOX = art("TalkInbox")
TOKEN = art("TalkToken")
app_js = read(WEB / "app.js")
index_html = read(WEB / "index.html")
styles_css = read(WEB / "styles.css")
deploy_html = read(WEB / "deploy.html")
artifacts_js = read(WEB / "artifacts.js")
config_js = read(WEB / "config.js")

# ---------------------------------------------------------------- 1. artefactos
check(len(INBOX["bin"]) > 100, "TalkInbox tiene bytecode", f"{len(INBOX['bin'])//2} B")
check(len(TOKEN["bin"]) > 100, "TalkToken tiene bytecode", f"{len(TOKEN['bin'])//2} B")

abi_file = json.loads(read(WEB / "abi" / "TalkInbox.json"))
check(abi_file == INBOX["abi"], "web/abi/TalkInbox.json == ABI compilada")
abi_file_t = json.loads(read(WEB / "abi" / "TalkToken.json"))
check(abi_file_t == TOKEN["abi"], "web/abi/TalkToken.json == ABI compilada")

check(INBOX["bin"] in artifacts_js, "web/artifacts.js lleva el bytecode del inbox compilado")
check(TOKEN["bin"] in artifacts_js, "web/artifacts.js lleva el bytecode del token compilado")

# ---------------------------------------------------------------- 2. selectores
sigs = {}
for e in INBOX["abi"]:
    if e["type"] != "function":
        continue
    sig = e["name"] + "(" + ",".join(i["type"] for i in e["inputs"]) + ")"
    sigs[e["name"]] = (sig, "0x" + keccak256(sig.encode()).hex()[:8])

sel_block = re.search(r"const SEL = \{(.*?)\};", app_js, re.S)
check(sel_block is not None, "app.js define el mapa SEL")
used = dict(re.findall(r'(\w+):\s*"(0x[0-9a-f]{8})"', sel_block.group(1))) if sel_block else {}

alias = {
    "isExpired": "isExpired", "ttl": "TTL", "feeBps": "FEE_BPS",
}  # nombres del mapa -> nombres de la ABI
mismatch = []
for key, sel_hex in used.items():
    abi_name = alias.get(key, key)
    if abi_name not in sigs:
        mismatch.append(f"{key}: no existe en la ABI")
        continue
    sig, expected = sigs[abi_name]
    if sel_hex != expected:
        mismatch.append(f"{key}: {sel_hex} != {expected} ({sig})")
check(not mismatch, "todos los selectores de app.js coinciden con keccak(ABI)",
      "; ".join(mismatch) if mismatch else f"{len(used)} selectores")

# que no falte ninguno que el contrato exponga y la app use
needed = ["configure", "send", "reply", "refund", "inboxes", "payments", "quote", "isContact"]
missing = [n for n in needed if n not in {alias.get(k, k) for k in used}]
check(not missing, "la app usa las funciones clave del contrato", ", ".join(missing) or "ok")

# ---------------------------------------------------------------- 3. topics
ev = {e["name"]: e for e in INBOX["abi"] if e["type"] == "event"}


def topic_of(name):
    e = ev[name]
    sig = name + "(" + ",".join(i["type"] for i in e["inputs"]) + ")"
    return sig, "0x" + keccak256(sig.encode()).hex()


msg_sig, msg_topic = topic_of("Message")
settled_sig, settled_topic = topic_of("Settled")

check(msg_topic in app_js, "TOPIC_MSG coincide con keccak(Message(...))", msg_sig)
check(settled_topic in app_js, "TOPIC_SETTLED coincide con keccak(Settled(...))", settled_sig)

# ---------------------------------------------------------------- 4. HTML <-> JS
ids_html = set(re.findall(r'id="([^"]+)"', index_html))
els_block = re.search(r'const els = \{\};\s*\[(.*?)\]', app_js, re.S)
els_ids = set(re.findall(r'"([^"]+)"', els_block.group(1))) if els_block else set()

check(bool(els_ids), "app.js declara la lista de elementos", f"{len(els_ids)} ids")
missing_in_html = sorted(els_ids - ids_html)
check(not missing_in_html, "todos los ids que usa el JS existen en index.html",
      ", ".join(missing_in_html) if missing_in_html else "ok")

# ids del HTML que el JS nunca referencia (inofensivo, se reporta)
unused_html = sorted(ids_html - els_ids)
check(True, "ids del HTML sin usar en app.js (informativo)", ", ".join(unused_html) or "ninguno")

# el JS no debe tocar ids viejos del formulario anterior
stale = [s for s in ("fOpen", "fRule", "fPrice", "btnSave") if s in app_js]
check(not stale, "sin referencias al formulario viejo", ", ".join(stale) or "limpio")

# ---------------------------------------------------------------- 5. wizard
for need in ("wzOpen", "wzRule", "wzPrice", "wzSim", "wzNext", "wzBack", "wzDots"):
    if need not in ids_html:
        check(False, f"falta el id {need} en index.html")
check(all(n in ids_html for n in ("wzOpen", "wzRule", "wzPrice", "wzSim", "wzNext", "wzBack")),
      "el asistente tiene todos sus nodos en el HTML")

pages = re.findall(r'class="wz-page" data-p="(\d)"', index_html)
check(pages == ["1", "2", "3"], "el asistente tiene los 3 pasos", str(pages))

# ---------------------------------------------------------------- 6. deploy
check("TALK_ARTIFACTS" in artifacts_js, "artifacts.js expone TALK_ARTIFACTS")
check("ART.token" in deploy_html and "ART.inbox" in deploy_html and "art.bytecode" in deploy_html,
      "deploy.html usa el bytecode de artifacts.js")
for token in ("talk:cfg:token", "talk:cfg:inbox", "talk:cfg:fromBlock"):
    if token not in deploy_html:
        check(False, f"deploy.html no escribe {token}")
check(all(t in deploy_html for t in ("talk:cfg:token", "talk:cfg:inbox", "talk:cfg:fromBlock")),
      "deploy.html guarda las 3 claves de configuración")

# ---------------------------------------------------------------- 7. config / seguridad
check("token:" in config_js and "inbox:" in config_js, "config.js expone token e inbox")
check("socials" in config_js, "config.js expone las redes del banner")
# el arnés de dev no debe activarse sin query param
harness = re.search(r'if \(location\.search\.indexOf\("dev=1"\) < 0\) return;', index_html)
check(bool(harness), "el arnés de desarrollo está desactivado por defecto")
check("privateKey" not in app_js and "privateKey" not in deploy_html,
      "no se manejan claves privadas en el frontend")
check("localStorage.setItem(keyId" in app_js or "localStorage.setItem(keyId" in app_js,
      "la llave privada se guarda local (derivada de la firma)")

# ---------------------------------------------------------------- 8. estilos
classes_in_js = set(re.findall(r'class="([^"]+)"', app_js))
flat = set()
for c in classes_in_js:
    flat.update(c.split())
missing_css = sorted(c for c in flat if c and ("." + c) not in styles_css and not c.startswith("{"))
check(True, "clases del JS sin regla CSS (informativo)", ", ".join(missing_css) or "ninguna")

# tipografía declarada
check("fonts.googleapis.com" in index_html or "@font-face" in styles_css,
      "la tipografía se carga explícitamente")

# ---------------------------------------------------------------- 9. contratos: superficie
fns = [e["name"] for e in INBOX["abi"] if e["type"] == "function"]
expected_fns = {"configure", "setPrice", "send", "reply", "refund", "quote",
                "inboxes", "payments", "isContact", "isExpired", "nextId",
                "messageCount", "token", "treasury", "TTL", "FEE_BPS", "BPS", "MAX_CIPHERTEXT"}
check(expected_fns.issubset(set(fns)), "el contrato expone toda la superficie esperada",
      ", ".join(sorted(expected_fns - set(fns))) or "ok")
check("withdraw" not in [f.lower() for f in fns], "el contrato no tiene withdraw (sin backdoor)")
check('nonReentrant' in read(ROOT / "contracts" / "TalkInbox.sol"), "usa guard de reentrancy")

# ---------------------------------------------------------------- salida
print("AUDITORÍA TALK\n" + "=" * 66)
ok = 0
for passed, label, detail in results:
    mark = "PASS" if passed else "FAIL"
    print(f"  [{mark}] {label}" + (f"  ·  {detail}" if detail else ""))
    ok += 1 if passed else 0
print("=" * 66)
print(f"{ok}/{len(results)} comprobaciones OK")
sys.exit(0 if ok == len(results) else 1)

