import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { webcrypto } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nacl = require(path.join(process.env.TEMP, "nexus", "nacl.min.js"));

const ROOT = "C:/Users/nonam/Desktop/PROYECTOS/Talk/web";
const app = fs.readFileSync(ROOT + "/app.js", "utf8");

const makeEl = () => new Proxy({
  style: {}, dataset: {}, value: "", textContent: "", innerHTML: "", hidden: false,
  disabled: false, className: "", scrollTop: 0, scrollHeight: 0,
  appendChild() {}, setAttribute() {}, querySelectorAll: () => [],
  addEventListener() {}, onclick: null, onchange: null,
}, { get: (t, k) => (k in t ? t[k] : undefined), set: (t, k, v) => (t[k] = v, true) });

const store = new Map();
const sandbox = {
  console,
  document: { getElementById: () => makeEl(), addEventListener() {}, querySelectorAll: () => [], createElement: () => makeEl() },
  window: { TALK_CONFIG: {
    chain: { id: 4663, name: "Robinhood Chain", rpc: "https://rpc", explorer: "https://e" },
    token: "0x1111111111111111111111111111111111111111",
    inbox: "0x2222222222222222222222222222222222222222",
    fromBlock: 0, symbol: "TALK", decimals: 18 } },
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
  crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, DataView, BigInt, Math, Date, JSON,
  Promise, Error, Number, String, Array, Object, Map, Set, parseInt, parseFloat, isNaN,
  nacl, fetch: () => { throw new Error("no fetch"); },
  location: { reload() {} }, setTimeout, clearTimeout,
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

const test = `
globalThis.__t = (async () => {
  const out = [];
  const ok = (n, c) => out.push([!!c, n]);
  const eq = (a, b) => String(a) === String(b);

  // --- hashing
  const abc = new TextEncoder().encode("abc");
  ok("sha256Fallback vector", eq(bytesToHex(sha256Fallback(abc)),
     "0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
  ok("sha256 subtle == fallback", eq(bytesToHex(await sha256(abc)), bytesToHex(sha256Fallback(abc))));

  // --- units
  ok("parseUnits('100')", parseUnits("100") === 100n * 10n**18n);
  ok("parseUnits('0.5')", parseUnits("0.5") === 5n * 10n**17n);
  let threw = false; try { parseUnits("x"); } catch { threw = true; }
  ok("parseUnits throws on garbage", threw);
  ok("fmt(100 TALK)", eq(fmt(100n * 10n**18n), "100 TALK"));

  // --- deterministic signature
  ok("SIG_MSG is stable", SIG_MSG === "Talk\\n\\nSign to unlock your encrypted inbox.\\n" +
     "This is free: it is not a transaction and costs no gas.\\n\\nKey version: 1");

  // --- ABI: send(address,bytes)
  const to = "0x" + "ab".repeat(20);
  const ct = "0x" + "01" + "cd".repeat(57);
  const call = SEL.send + asAddr(to) + u256(2 * 32) + dynBytes(ct);
  ok("send selector", call.startsWith("0xc89acc86"));
  ok("send: offset = 64", words(call.slice(10))[1] === u256(64));
  ok("send: length = 58", words(call.slice(10))[2] === u256(58));

  // --- ABI: configure
  const cfg = SEL.configure + u256(0) + u256(1) + asAddr("0x" + "11".repeat(32)) + u256(100n * 10n**18n);
  ok("configure selector", cfg.startsWith("0xc9119f4b"));
  ok("configure: 4 words", words(cfg.slice(10)).length === 4);
  ok("configure: price 100", wBig(words(cfg.slice(10))[3]) === 100n * 10n**18n);

  // --- ABI: reply
  const rep = SEL.reply + u256(7) + u256(64) + dynBytes(ct);
  ok("reply selector", rep.startsWith("0xb21faa4a"));
  ok("reply: paymentId 7", wBig(words(rep.slice(10))[0]) === 7n);

  // --- ABI: refund
  ok("refund selector", (SEL.refund + u256(3)).startsWith("0x278ecde1"));

  // --- decode inboxes() with 5 words
  const inboxData = "0x" + u256(1) + u256(0) + u256(2) + "ab".repeat(32) + u256(250n * 10n**18n);
  const wi = words(inboxData);
  ok("inboxes: registered", wBig(wi[0]) === 1n);
  ok("inboxes: rule split", wBig(wi[2]) === 2n);
  ok("inboxes: price", wBig(wi[4]) === 250n * 10n**18n);

  // --- decode payments() with 5 slots
  const payData = "0x" + asAddr("0x" + "11".repeat(20)) + asAddr("0x" + "22".repeat(20)) +
                  u256(95n * 10n**18n) + u256(2000000000) + u256(1);
  const wp = words(payData);
  ok("payments: from", wAddr(wp[0]) === "0x" + "11".repeat(20));
  ok("payments: amount", wBig(wp[2]) === 95n * 10n**18n);
  ok("payments: status pending", wBig(wp[4]) === 1n);

  // --- decode a Message log
  const logData = "0x" + u256(0) + u256(64) + u256(59) + ct.slice(2).padEnd(128, "0");
  const fakeLog = { data: logData, topics: [
    TOPIC_MSG,
    "0x" + u256(4),
    "0x" + asAddr("0x" + "33".repeat(20)),
    "0x" + asAddr("0x" + "44".repeat(20))],
    blockNumber: "0x" + (1234).toString(16), logIndex: "0x1", transactionHash: "0xdead" };
  const dm = decodeMsg(fakeLog);
  ok("decodeMsg: id 4", dm.id === 4);
  ok("decodeMsg: from", dm.from === "0x" + "33".repeat(20));
  ok("decodeMsg: to", dm.to === "0x" + "44".repeat(20));
  ok("decodeMsg: paymentId 0", dm.paymentId === 0);
  ok("decodeMsg: ciphertext recupera 59 B", strip0x(dm.ct).length / 2 === 59);
  ok("decodeMsg: bloque", dm.block === 1234);

  // --- crypto: envelope A -> B and back
  const A = nacl.box.keyPair(), Bk = nacl.box.keyPair();
  S.keyPair = A;
  const pubB = bytesToHex(Bk.publicKey);
  const env = seal(pubB, "hola Talk");
  ok("envelope: 57 + len + 16", strip0x(env).length / 2 === 57 + 9 + 16);
  ok("envelope: version 1", hexToBytes(env)[0] === 1);
  ok("envelope: embeds sender", bytesToHex(hexToBytes(env).slice(1, 33)) === bytesToHex(A.publicKey));

  S.keyPair = Bk;
  ok("B decrypts", unseal(env, bytesToHex(A.publicKey)) === "hola Talk");
  S.keyPair = A;
  ok("A re-reads their own", unseal(env, pubB) === "hola Talk");
  S.keyPair = nacl.box.keyPair();
  ok("wrong key -> null", unseal(env, pubB) === null);

  S.keyPair = Bk;
  const bad = hexToBytes(env); bad[bad.length - 1] ^= 0xff;
  ok("tampered envelope -> null", unseal(bytesToHex(bad), bytesToHex(A.publicKey)) === null);

  // --- helpers
  ok("short()", short("0x1234567890abcdef1234567890abcdef12345678") === "0x1234…5678");
  ok("esc() escapes", esc("<b>&") === "&lt;b&gt;&amp;");

  return out;
})();
`;

const ctx = vm.createContext(sandbox);
try {
  vm.runInContext(app + "\n" + test, ctx, { filename: "app.js" });
} catch (e) {
  console.log("LOAD ERROR:", e.message);
  console.log(e.stack.split("\n").slice(0, 8).join("\n"));
  process.exit(1);
}
const results = await sandbox.globalThis.__t;
let pass = 0, fail = 0;
for (const [ok, name] of results) {
  console.log((ok ? "  PASS  " : "  FAIL  ") + name);
  ok ? pass++ : fail++;
}
console.log(`\n${pass}/${results.length} OK`);
process.exit(fail ? 1 : 0);
