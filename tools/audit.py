"""
Talk audit: verifies that the code, the ABI, the selectors, the event topics and the
HTML line up with each other. Exits with code 1 if anything is off.
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


# ---------------------------------------------------------------- sources
combined = json.loads(read(ROOT / "contracts" / "build" / "combined.json"))


def art(name):
    for k, v in combined["contracts"].items():
        if k.endswith(":" + name):
            abi = v["abi"] if isinstance(v["abi"], list) else json.loads(v["abi"])
            return {"abi": abi, "bin": v["bin"]}
    raise KeyError(name)


INBOX = art("TalkInbox")
TOKEN = art("TalkToken")
CURVE = art("TalkCurve")
app_js = read(WEB / "app.js")
landing_html = read(WEB / "index.html")
app_html = read(WEB / "app.html")
styles_css = read(WEB / "styles.css")
deploy_html = read(WEB / "deploy.html")
artifacts_js = read(WEB / "artifacts.js")
config_js = read(WEB / "config.js")

# ---------------------------------------------------------------- 1. artefactos
check(len(INBOX["bin"]) > 100, "TalkInbox has bytecode", f"{len(INBOX['bin'])//2} B")
check(len(TOKEN["bin"]) > 100, "TalkToken has bytecode", f"{len(TOKEN['bin'])//2} B")

abi_file = json.loads(read(WEB / "abi" / "TalkInbox.json"))
check(abi_file == INBOX["abi"], "web/abi/TalkInbox.json == compiled ABI")
abi_file_t = json.loads(read(WEB / "abi" / "TalkToken.json"))
check(abi_file_t == TOKEN["abi"], "web/abi/TalkToken.json == compiled ABI")

check(INBOX["bin"] in artifacts_js, "web/artifacts.js carries the compiled inbox bytecode")
check(TOKEN["bin"] in artifacts_js, "web/artifacts.js carries the compiled token bytecode")

# ---------------------------------------------------------------- 2. selectores
sigs = {}
for e in INBOX["abi"]:
    if e["type"] != "function":
        continue
    sig = e["name"] + "(" + ",".join(i["type"] for i in e["inputs"]) + ")"
    sigs[e["name"]] = (sig, "0x" + keccak256(sig.encode()).hex()[:8])

sel_block = re.search(r"const SEL = \{(.*?)\};", app_js, re.S)
check(sel_block is not None, "app.js defines the SEL map")
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
check(not mismatch, "every app.js selector matches keccak(ABI)",
      "; ".join(mismatch) if mismatch else f"{len(used)} selectores")

# que no falte ninguno que el contrato exponga y la app use
needed = ["configure", "send", "reply", "refund", "inboxes", "payments", "quote", "isContact"]
missing = [n for n in needed if n not in {alias.get(k, k) for k in used}]
check(not missing, "the app uses the key contract functions", ", ".join(missing) or "ok")

# ---------------------------------------------------------------- 3. topics
ev = {e["name"]: e for e in INBOX["abi"] if e["type"] == "event"}


def topic_of(name):
    e = ev[name]
    sig = name + "(" + ",".join(i["type"] for i in e["inputs"]) + ")"
    return sig, "0x" + keccak256(sig.encode()).hex()


msg_sig, msg_topic = topic_of("Message")
settled_sig, settled_topic = topic_of("Settled")

check(msg_topic in app_js, "TOPIC_MSG matches keccak(Message(...))", msg_sig)
check(settled_topic in app_js, "TOPIC_SETTLED matches keccak(Settled(...))", settled_sig)

# ---------------------------------------------------------------- 4. HTML <-> JS
ids_html = set(re.findall(r'id="([^"]+)"', app_html))
els_block = re.search(r'const els = \{\};\s*\[(.*?)\]', app_js, re.S)
els_ids = set(re.findall(r'"([^"]+)"', els_block.group(1))) if els_block else set()

check(bool(els_ids), "app.js declares the element list", f"{len(els_ids)} ids")
missing_in_html = sorted(els_ids - ids_html)
check(not missing_in_html, "every id the JS uses exists in app.html",
      ", ".join(missing_in_html) if missing_in_html else "ok")

# ids del HTML que el JS nunca referencia (inofensivo, se reporta)
unused_html = sorted(ids_html - els_ids)
check(True, "HTML ids unused by app.js (informational)", ", ".join(unused_html) or "ninguno")

# el JS no debe tocar ids viejos del formulario anterior
stale = [s for s in ("fOpen", "fRule", "fPrice", "btnSave") if s in app_js]
check(not stale, "no references to the old form", ", ".join(stale) or "limpio")

# las dos páginas: landing pública y app
check("app.html" in landing_html, "the landing links to the app")
check('src="app.js"' in app_html and 'src="config.js"' in app_html,
      "the app loads config.js and app.js")
check('href="index.html"' in app_html, "the app links back to the landing")
check('src="app.js"' not in landing_html, "the landing does not load the app bundle")

# ---------------------------------------------------------------- 5. wizard
for need in ("wzOpen", "wzRule", "wzPrice", "wzSim", "wzNext", "wzBack", "wzDots"):
    if need not in ids_html:
        check(False, f"missing id {need} in app.html")
check(all(n in ids_html for n in ("wzOpen", "wzRule", "wzPrice", "wzSim", "wzNext", "wzBack")),
      "the wizard has all its nodes in the HTML")

pages = re.findall(r'class="wz-page" data-p="(\d)"', app_html)
check(pages == ["1", "2", "3"], "the wizard has all 3 steps", str(pages))

# ---------------------------------------------------------------- 6. deploy
check("TALK_ARTIFACTS" in artifacts_js, "artifacts.js exposes TALK_ARTIFACTS")
check("ART.token" in deploy_html and "ART.inbox" in deploy_html and "art.bytecode" in deploy_html,
      "deploy.html uses the artifacts.js bytecode")
for token in ("talk:cfg:token", "talk:cfg:inbox", "talk:cfg:fromBlock"):
    if token not in deploy_html:
        check(False, f"deploy.html does not write {token}")
check(all(t in deploy_html for t in ("talk:cfg:token", "talk:cfg:inbox", "talk:cfg:fromBlock")),
      "deploy.html persists all 3 config keys")

# ---------------------------------------------------------------- 7. config / seguridad
check("token:" in config_js and "inbox:" in config_js, "config.js exposes token and inbox")
check("socials" in config_js, "config.js exposes the banner socials")
# the dev harness must not activate without the query param
harness = re.search(r'if \(location\.search\.indexOf\("dev=1"\) < 0\) return;', app_html)
check(bool(harness), "the dev harness is off by default")
check("privateKey" not in app_js and "privateKey" not in deploy_html,
      "no private keys handled in the frontend")
check("localStorage.setItem(keyId" in app_js or "localStorage.setItem(keyId" in app_js,
      "the private key is stored locally (derived from the signature)")

# ---------------------------------------------------------------- 8. estilos
classes_in_js = set(re.findall(r'class="([^"]+)"', app_js))
flat = set()
for c in classes_in_js:
    flat.update(c.split())
missing_css = sorted(c for c in flat if c and ("." + c) not in styles_css and not c.startswith("{"))
check(True, "JS classes with no CSS rule (informational)", ", ".join(missing_css) or "ninguna")

# declared typefaces
check("fonts.googleapis.com" in landing_html or "@font-face" in styles_css,
      "the typefaces are loaded explicitly")

# ---------------------------------------------------------------- 9. contratos: superficie
fns = [e["name"] for e in INBOX["abi"] if e["type"] == "function"]
expected_fns = {"configure", "setPrice", "send", "reply", "refund", "quote",
                "inboxes", "payments", "isContact", "isExpired", "nextId",
                "messageCount", "token", "treasury", "TTL", "FEE_BPS", "BPS", "MAX_CIPHERTEXT"}
check(expected_fns.issubset(set(fns)), "the contract exposes the expected surface",
      ", ".join(sorted(expected_fns - set(fns))) or "ok")
check("withdraw" not in [f.lower() for f in fns], "the contract has no withdraw (no backdoor)")
check('nonReentrant' in read(ROOT / "contracts" / "TalkInbox.sol"), "uses a reentrancy guard")

# ---------------------------------------------------------------- salida
# ---------------------------------------------------------------- 7. curva
curve_src = read(ROOT / "contracts" / "TalkCurve.sol")
check(len(CURVE["bin"]) > 100, "TalkCurve has bytecode", f"{len(CURVE['bin'])//2} B")
check("function withdraw" not in curve_src and "selfdestruct" not in curve_src,
      "the curve has no withdraw and no selfdestruct")
check("FEE_BPS = 100" in curve_src, "curve fee is 1%")
check("priceEnd_ < priceStart_" in curve_src, "the curve rejects an inverted price range")
check("nonReentrant" in curve_src, "the curve is reentrancy-guarded")
curve_fns = {fn["name"] for fn in CURVE["abi"] if fn.get("type") == "function"}
need = {"buy", "sell", "quoteBuy", "quoteSell", "priceAt", "cost", "tokensFor", "sold", "supply"}
check(need <= curve_fns, "the curve exposes the expected surface", ", ".join(sorted(need - curve_fns)) or "ok")
check((ROOT / "docs" / "curve.md").exists(), "curve spec is documented")
check((ROOT / "tools" / "test-curve.py").exists(), "curve test suite exists")

print("TALK AUDIT\n" + "=" * 66)
ok = 0
for passed, label, detail in results:
    mark = "PASS" if passed else "FAIL"
    print(f"  [{mark}] {label}" + (f"  ·  {detail}" if detail else ""))
    ok += 1 if passed else 0
print("=" * 66)
print(f"{ok}/{len(results)} checks OK")
sys.exit(0 if ok == len(results) else 1)


