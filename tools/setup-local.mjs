// Builds realistic state on anvil so the UI can be tested end to end.
import fs from "node:fs";
import path from "node:path";
import { webcrypto, createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nacl = require(path.join(import.meta.dirname, "vendor", "nacl.min.js"));

const RPC = "http://127.0.0.1:8546";
const ROOT = "C:/Users/nonam/Desktop/PROYECTOS/Talk";
const UNIT = 10n ** 18n;

let id = 1;
async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params })
  });
  const j = await r.json();
  if (j.error) throw new Error(method + ": " + j.error.message);
  return j.result;
}
const strip = h => String(h).replace(/^0x/i, "").toLowerCase();
const u256 = v => BigInt(v).toString(16).padStart(64, "0");
const addr = a => strip(a).padStart(64, "0");
const encStr = s => {
  const b = new TextEncoder().encode(s);
  const h = Buffer.from(b).toString("hex");
  return u256(b.length) + h.padEnd(Math.ceil(b.length / 32) * 32 * 2, "0");
};
const encBytes = h => { const x = strip(h); const n = x.length / 2; return u256(n) + x.padEnd(Math.ceil(n / 32) * 32 * 2, "0"); };

async function txRet(from, to, data, gas = 8000000) {
  const tx = { from, data, gas: "0x" + gas.toString(16) };
  if (to) tx.to = to;
  const h = await rpc("eth_sendTransaction", [tx]);
  for (let i = 0; i < 300; i++) {
    const r = await rpc("eth_getTransactionReceipt", [h]);
    if (r) {
      if (r.status !== "0x1") throw new Error("reverted " + h);
      return r;
    }
    await new Promise(z => setTimeout(z, 40));
  }
  throw new Error("timeout");
}

const combined = JSON.parse(fs.readFileSync(ROOT + "/contracts/build/combined.json", "utf8"));
const art = n => {
  for (const [k, v] of Object.entries(combined.contracts)) if (k.endsWith(":" + n)) return "0x" + v.bin;
  throw new Error(n);
};

const acc = await rpc("eth_accounts", []);
const [A, B, C, TREASURY] = acc;

// --- fixed signature -> deterministic key (matches what the browser does with the stub)
const SIG = "0x" + "ab".repeat(64) + "1b";
const seed = new Uint8Array(createHash("sha256").update(Buffer.from(strip(SIG), "hex")).digest());
const kp = nacl.box.keyPair.fromSecretKey(seed);
const encKey = "0x" + Buffer.from(kp.publicKey).toString("hex");

// --- deploy token
const SUPPLY = 1_000_000n * UNIT;
const nameE = encStr("Talk"), symE = encStr("TALK");
const offName = 128, offSym = offName + nameE.length / 2;
const tokenArgs = u256(offName) + u256(offSym) + u256(SUPPLY) + addr(A) + nameE + symE;
const token = (await txRet(A, null, art("TalkToken") + tokenArgs)).contractAddress;

// --- deploy inbox
const inbox = (await txRet(A, null, art("TalkInbox") + addr(token) + addr(TREASURY))).contractAddress;
const block = parseInt((await rpc("eth_blockNumber", [])), 16);

const SEL = {
  transfer: "0xa9059cbb", approve: "0x095ea7b3",
  configure: "0xc9119f4b", send: "0xc89acc86", reply: "0xb21faa4a"
};
const msg = tag => "0x01" + Buffer.from(tag.padEnd(40, ".")).toString("hex");

// --- fund B and C, then approve
for (const who of [B, C]) {
  await txRet(A, token, SEL.transfer + addr(who) + u256(10_000n * UNIT));
  await txRet(who, token, SEL.approve + addr(inbox) + u256(10_000n * UNIT));
}

// --- A activates the inbox: charges 100 TALK, rule "keep it"
await txRet(A, inbox, SEL.configure + u256(0) + u256(1) + strip(encKey).padStart(64, "0") + u256(100n * UNIT));

// --- C activates theirs: 0 (contacts write free after a reply)
await txRet(C, inbox, SEL.configure + u256(0) + u256(1) + strip("0x" + "22".repeat(32)).padStart(64, "0") + u256(0n));

// --- B writes to A paying (stays pending -> the UI should offer "Reply and settle")
await txRet(B, inbox, SEL.send + addr(A) + u256(64) + encBytes(msg("Hola, vi tu token en pons")));

// --- C writes to A paying, A replies: settled and now contacts
await txRet(C, inbox, SEL.send + addr(A) + u256(64) + encBytes(msg("Che, te consulto por el launch")));
const nextId = parseInt(await rpc("eth_call", [{ to: inbox, data: "0x61b8ce8c" }, "latest"]), 16);
await txRet(A, inbox, SEL.reply + u256(nextId - 1) + u256(64) + encBytes(msg("Dale, decime")));

console.log(JSON.stringify({ token, inbox, fromBlock: block, account: A, encKey, sig: SIG }, null, 2));
