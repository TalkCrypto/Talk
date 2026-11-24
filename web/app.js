/* =====================================================================
   Talk — encrypted messaging between wallets, paid in $TALK.
   Free signature → SHA-256 → NaCl box (X25519). The contract only sees bytes.
   ===================================================================== */
"use strict";

/* -------------------------------- config -------------------------------- */
const CFG = Object.assign({}, window.TALK_CONFIG || {});
CFG.chain = Object.assign({
  id: 4663, name: "Robinhood Chain",
  rpc: "https://rpc.mainnet.chain.robinhood.com",
  explorer: "https://robin.etherscan.io", nativeSymbol: "ETH"
}, CFG.chain || {});
CFG.socials = CFG.socials || {};

for (const k of ["token", "inbox"]) {
  const v = localStorage.getItem("talk:cfg:" + k);
  if (v) CFG[k] = v;
}
{
  const fb = localStorage.getItem("talk:cfg:fromBlock");
  if (fb) CFG.fromBlock = Number(fb);
  const r = localStorage.getItem("talk:cfg:rpc");
  if (r) CFG.chain.rpc = r;
  const c = localStorage.getItem("talk:cfg:chainId");
  if (c) CFG.chain.id = Number(c);
}

const SYMBOL = CFG.symbol || "TALK";
const DECIMALS = CFG.decimals || 18;
const UNIT = 10n ** BigInt(DECIMALS);

/* keccak-256 selectors (constants from the Talk ABI) */
const SEL = {
  inboxes: "0x5cdd067d", payments: "0x87d81789", quote: "0x4a5aa711",
  isContact: "0x77e600fd", send: "0xc89acc86", reply: "0xb21faa4a",
  refund: "0x278ecde1", configure: "0xc9119f4b", setPrice: "0x91b7f5ed",
  isExpired: "0xd9548e53", ttl: "0x1575f63e", feeBps: "0xbf333f2c"
};
const ERC20 = { allowance: "0xdd62ed3e", approve: "0x095ea7b3", balanceOf: "0x70a08231" };
const TOPIC_MSG = "0x2096cd4806a6f9634720b2b28d359d46b7292c895b42c68040ffdc1a016268bf";
const TOPIC_SETTLED = "0x0b88c5bd74fc625a4f651904bf835063c6a449220be319924685261fb7709dd5";

const SIG_MSG = "Talk\n\n" +
  "Sign to unlock your encrypted inbox.\n" +
  "This is free: it is not a transaction and costs no gas.\n\n" +
  "Key version: 1";

const RULE_NAME = ["refund it", "I keep it", "split it"];
const STATUS_LABEL = { 0: "—", 1: "in escrow", 2: "settled", 3: "refunded" };

/* ------------------------------- bytes ---------------------------------- */
const strip0x = h => String(h || "").replace(/^0x/i, "").toLowerCase();
const hexToBytes = h => {
  h = strip0x(h); if (h.length % 2) h = "0" + h;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
};
const bytesToHex = b => "0x" + Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
const utf8Hex = s => bytesToHex(new TextEncoder().encode(s));

function sha256Fallback(bytes) {
  const K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  let H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const l = bytes.length, bitLen = l * 8;
  const buf = new Uint8Array((((l + 9 + 63) / 64) | 0) * 64);
  buf.set(bytes); buf[l] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(buf.length - 4, bitLen >>> 0);
  dv.setUint32(buf.length - 8, Math.floor(bitLen / 4294967296));
  const w = new Uint32Array(64), rr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < buf.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rr(w[i-15],7) ^ rr(w[i-15],18) ^ (w[i-15] >>> 3);
      const s1 = rr(w[i-2],17) ^ rr(w[i-2],19) ^ (w[i-2] >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
  }
  const out = new Uint8Array(32), odv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i]);
  return out;
}
async function sha256(bytes) {
  if (globalThis.crypto && crypto.subtle) {
    try { return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)); } catch (_) {}
  }
  return sha256Fallback(bytes);
}

/* --------------------------------- ABI ---------------------------------- */
const pad32 = h => strip0x(h).padStart(64, "0");
const u256 = v => BigInt(v).toString(16).padStart(64, "0");
const asAddr = a => pad32(a);
const words = d => {
  const h = strip0x(d), out = [];
  for (let i = 0; i + 64 <= h.length; i += 64) out.push(h.slice(i, i + 64));
  return out;
};
const wAddr = w => "0x" + w.slice(24);
const wBig = w => BigInt("0x" + (w || "0"));
const dynBytes = hexData => {
  const h = strip0x(hexData), len = h.length / 2;
  return u256(len) + h.padEnd(Math.ceil(len / 32) * 32 * 2, "0");
};

/* -------------------------------- state --------------------------------- */
const S = {
  account: null, keyPair: null, me: null, peers: new Map(), contacts: new Set(),
  convs: [], active: null, msgs: [], all: [], payments: new Map(),
  ttl: 0, feeBps: 0, balance: 0n, price: 0n,
  stats: { total: 0, sent: 0, received: 0, escrowIn: 0n, escrowOut: 0n, earned: 0n, contacts: 0 }
};

const $ = id => document.getElementById(id);
const els = {};
["addr","bal","btnConnect","setupBanner","boxForm","boxActions","boxBadge","btnEdit",
"passAddr","passPrice","passCur","passDesc","passOpen","passRule","passVig","passStub","passBar","passKey",
 "wzDots","wzLbl","wzOpen","wzOpenHint","wzRule","wzPrice","wzPriceVal","wzPresets","wzSim",
 "wzBack","wzNext","convs","msgs","threadTitle","threadMeta","peerAv","composer","text","priceTag",
 "btnSend","threadActions","composerHint","log","cfgToken","cfgInbox","cfgFrom","btnCfg",
 "socials","stBal","stBalSub","stMsgs","stMsgsSub","stEscrow","stEscrowSub","stEarned",
 "stEarnedSub","footMeta","heroCta","heroHow"]
  .forEach(k => els[k] = $(k));

function log(msg, kind = "") {
  if (!els.log) return;
  els.log.className = kind;
  els.log.textContent = msg || "";
}
const short = a => a ? a.slice(0, 6) + "…" + a.slice(-4) : "—";
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fmt(v, opts) {
  const n = Number(v) / Number(UNIT);
  if (n === 0) return "0";
  const o = opts || {};
  if (n < 0.001) return n.toExponential(1);
  const s = n.toLocaleString("en-US", { maximumFractionDigits: o.dp === undefined ? 2 : o.dp });
  return o.sym === false ? s : s + (o.space === false ? "" : " ") + SYMBOL;
}
function compact(v) {
  const n = Number(v) / Number(UNIT);
  if (n === 0) return "0";
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function parseUnits(s) {
  const t = String(s).trim();
  if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") throw new Error("invalid amount: " + s);
  const [i, f = ""] = t.split(".");
  return BigInt(i || "0") * UNIT + BigInt((f + "0".repeat(DECIMALS)).slice(0, DECIMALS));
}

/* --------------------------------- RPC ---------------------------------- */
let rpcId = 1;
async function rpc(method, params) {
  const res = await fetch(CFG.chain.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params })
  });
  if (!res.ok) throw new Error("RPC HTTP " + res.status);
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "RPC error");
  return j.result;
}
const call = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);

const readInbox = a => call(CFG.inbox, SEL.inboxes + asAddr(a)).then(d => {
  const w = words(d);
  return {
    registered: wBig(w[0]) === 1n, open: wBig(w[1]) === 1n,
    rule: Number(wBig(w[2])), encKey: w[3], price: wBig(w[4])
  };
});
const readPayment = id => call(CFG.inbox, SEL.payments + u256(id)).then(d => {
  const w = words(d);
  return {
    id, from: wAddr(w[0]), to: wAddr(w[1]), amount: wBig(w[2]),
    expiresAt: Number(wBig(w[3])), status: Number(wBig(w[4]))
  };
});
const readQuote = (a, b) => call(CFG.inbox, SEL.quote + asAddr(a) + asAddr(b)).then(d => wBig(words(d)[0]));
const readContact = (a, b) => call(CFG.inbox, SEL.isContact + asAddr(a) + asAddr(b)).then(d => wBig(words(d)[0]) === 1n);
const readBalance = a => call(CFG.token, ERC20.balanceOf + asAddr(a)).then(d => wBig(words(d)[0]));

function logsBase() {
  return {
    address: CFG.inbox,
    fromBlock: "0x" + Math.max(0, CFG.fromBlock || 0).toString(16),
    toBlock: "latest"
  };
}
async function readLogs() {
  const me = S.account.toLowerCase();
  const topic = "0x" + strip0x(me).padStart(64, "0");
  const base = logsBase();
  const [sent, recv] = await Promise.all([
    rpc("eth_getLogs", [{ ...base, topics: [TOPIC_MSG, null, topic] }]),
    rpc("eth_getLogs", [{ ...base, topics: [TOPIC_MSG, null, null, topic] }])
  ]);
  const seen = new Set();
  return [...sent, ...recv].filter(l => {
    const k = l.transactionHash + l.logIndex;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  }).map(decodeMsg).sort((x, y) => x.block - y.block || x.logIndex - y.logIndex);
}
async function readSettled() {
  const logs = await rpc("eth_getLogs", [{ ...logsBase(), topics: [TOPIC_SETTLED] }]);
  return logs.map(l => {
    const d = l.data.slice(2);
    return {
      paymentId: Number(BigInt(l.topics[1])),
      toRecipient: BigInt("0x" + d.slice(0, 64)),
      toSender: BigInt("0x" + d.slice(64, 128)),
      fee: BigInt("0x" + d.slice(128, 192))
    };
  });
}
function decodeMsg(l) {
  const body = strip0x(l.data);
  const paymentId = Number(BigInt("0x" + body.slice(0, 64)));
  const len = Number(BigInt("0x" + body.slice(128, 192)));
  return {
    id: Number(BigInt("0x" + strip0x(l.topics[1]))),
    from: "0x" + l.topics[2].slice(26),
    to: "0x" + l.topics[3].slice(26),
    paymentId, ct: "0x" + body.slice(192, 192 + len * 2),
    block: Number(BigInt(l.blockNumber)),
    logIndex: Number(BigInt(l.logIndex)),
    tx: l.transactionHash
  };
}

/* ------------------------------- crypto --------------------------------- */
const keyId = a => "talk:enc:" + a.toLowerCase();

async function deriveKeys(account) {
  const sig = await ethereum.request({ method: "personal_sign", params: [utf8Hex(SIG_MSG), account] });
  const seed = await sha256(hexToBytes(sig));
  const kp = nacl.box.keyPair.fromSecretKey(seed);
  localStorage.setItem(keyId(account), bytesToHex(kp.secretKey));
  return kp;
}
function loadKeys(account) {
  const raw = localStorage.getItem(keyId(account));
  if (!raw) return null;
  try { return nacl.box.keyPair.fromSecretKey(hexToBytes(raw)); } catch (_) { return null; }
}
function seal(peerKey, text) {
  const nonce = nacl.randomBytes(24);
  const box = nacl.box(new TextEncoder().encode(text), nonce, hexToBytes(peerKey), S.keyPair.secretKey);
  const out = new Uint8Array(57 + box.length);
  out[0] = 1;
  out.set(S.keyPair.publicKey, 1);
  out.set(nonce, 33);
  out.set(box, 57);
  return bytesToHex(out);
}
function unseal(ct, peerKey) {
  try {
    const b = hexToBytes(ct);
    if (b[0] !== 1 || !S.keyPair) return null;
    const sender = b.slice(1, 33), nonce = b.slice(33, 57), box = b.slice(57);
    const mine = bytesToHex(sender) === bytesToHex(S.keyPair.publicKey);
    const peer = mine ? (peerKey ? hexToBytes(peerKey) : null) : sender;
    if (!peer) return null;
    const pt = nacl.box.open(box, nonce, peer, S.keyPair.secretKey);
    return pt ? new TextDecoder().decode(pt) : null;
  } catch (_) { return null; }
}
const myPub = () => bytesToHex(S.keyPair.publicKey);

/* -------------------------------- wallet -------------------------------- */
async function ensureChain() {
  const cur = await ethereum.request({ method: "eth_chainId" });
  if (parseInt(cur, 16) === CFG.chain.id) return;
  const hexId = "0x" + CFG.chain.id.toString(16);
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch (e) {
    if (e.code === 4902 || /not added|unrecognized/i.test(e.message || "")) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: hexId, chainName: CFG.chain.name,
          nativeCurrency: { name: CFG.chain.nativeSymbol, symbol: CFG.chain.nativeSymbol, decimals: 18 },
          rpcUrls: [CFG.chain.rpc], blockExplorerUrls: [CFG.chain.explorer]
        }]
      });
    } else throw e;
  }
}
async function sendTx(tx) {
  const data = { from: S.account, to: tx.to, data: tx.data };
  if (tx.value) data.value = "0x" + BigInt(tx.value).toString(16);
  return ethereum.request({ method: "eth_sendTransaction", params: [data] });
}
async function waitTx(hash) {
  for (let i = 0; i < 140; i++) {
    const r = await rpc("eth_getTransactionReceipt", [hash]);
    if (r) {
      if (r.status === "0x0") throw new Error("the transaction reverted");
      return r;
    }
    await new Promise(z => setTimeout(z, 1500));
  }
  throw new Error("timed out waiting for the transaction");
}
async function runTx(label, build) {
  try {
    log(label + "…", "warn");
    const h = await sendTx(build());
    await waitTx(h);
    log(label + " ✔", "ok");
    return true;
  } catch (e) {
    const m = e && (e.code === 4001 || /rejected|denied/i.test(e.message || ""))
      ? "You cancelled in your wallet." : (e.shortMessage || e.message || String(e));
    log("Error: " + m, "err");
    return false;
  }
}

/* ------------------------------- socials -------------------------------- */
const ICONS = {
  x: '<svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  telegram: '<svg viewBox="0 0 24 24"><path d="M21.9 4.3 2.9 11.6c-.9.3-.9 1.5 0 1.8l4.7 1.6 1.8 5.5c.2.7 1.2.9 1.7.3l2.6-2.9 4.6 3.4c.6.4 1.4.1 1.6-.6l3.4-15.2c.2-.9-.7-1.6-1.4-1.2zM8.9 14.4l8.6-5.5-6.9 6.6-.3 3z"/></svg>',
  discord: '<svg viewBox="0 0 24 24"><path d="M20.3 4.4A19 19 0 0 0 15.6 3l-.3.6a17 17 0 0 0-6.6 0L8.4 3a19 19 0 0 0-4.7 1.4C.8 9 .1 13.4.4 17.7a19 19 0 0 0 5.8 2.9l.7-1.2c-.6-.2-1.2-.5-1.7-.8l.4-.3a13.6 13.6 0 0 0 11.6 0l.4.3c-.5.3-1.1.6-1.7.8l.7 1.2a19 19 0 0 0 5.8-2.9c.4-5-.7-9.3-2.2-13.3zM8.3 15.2c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm7.4 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>',
  github: '<svg viewBox="0 0 24 24"><path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.9 10.9c.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 1.7 2.7 1.2 3.3.9.1-.7.4-1.2.7-1.5-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11 11 0 0 1 5.9 0C17 4.5 18 4.8 18 4.8c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6A11.5 11.5 0 0 0 23.5 12A11.5 11.5 0 0 0 12 .5z"/></svg>',
  site: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.9a15 15 0 0 0-1.2-3.4A8 8 0 0 1 18.9 8zM12 4.2c.5.7 1 1.9 1.4 3.8h-2.8c.4-1.9.9-3.1 1.4-3.8zM4.3 14a8 8 0 0 1 0-4h3.3a21 21 0 0 0 0 4zm.8 2h2.9c.3 1.2.7 2.4 1.2 3.4A8 8 0 0 1 5.1 16zm2.9-8H5.1a8 8 0 0 1 4.1-3.4A15 15 0 0 0 8 8zM12 19.8c-.5-.7-1-1.9-1.4-3.8h2.8c-.4 1.9-.9 3.1-1.4 3.8zM14.6 14H9.4a19 19 0 0 1 0-4h5.2a19 19 0 0 1 0 4zm.6 5.4c.5-1 .9-2.2 1.2-3.4h2.9a8 8 0 0 1-4.1 3.4zm1.6-5.4a21 21 0 0 0 0-4h3.3a8 8 0 0 1 0 4z"/></svg>'
};
function renderSocials() {
  if (!els.socials) return;
  const order = ["x", "telegram", "discord", "github", "site"];
  const link = CFG.socials || {};
  const label = k =>
    k === "site" ? (link.label || "web")
      : k === "x" ? (link.xHandle || "x")
      : k;
  const items = order.map(k => {
    const url = link[k];
    const inner = `${ICONS[k] || ""}<span>${esc(label(k))}</span>`;
    return url
      ? `<a class="social" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
      : `<span class="social off" title="add your link in config.js">${inner}</span>`;
  });
  els.socials.innerHTML = `<span class="lbl">redes</span>${items.join("")}`;
}

/* -------------------------------- render -------------------------------- */
function renderHeader() {
  if (els.addr) els.addr.innerHTML = S.account ? `<b>${short(S.account)}</b>` : "not connected";
  if (els.bal) els.bal.innerHTML = S.account ? `<b>${compact(S.balance)}</b> ${SYMBOL}` : "—";
}

function renderStats() {
  const st = S.stats;
  if (!S.account) {
    [["stBal", "—"], ["stMsgs", "—"], ["stEscrow", "—"], ["stEarned", "—"]]
      .forEach(([k, v]) => { if (els[k]) els[k].textContent = v; });
    return;
  }
  const set = (k, v) => { if (els[k]) els[k].innerHTML = v; };
  set("stBal", compact(S.balance) + " <small>" + SYMBOL + "</small>");
  set("stMsgs", String(st.total) + " <small>msj</small>");
  set("stEscrow", compact(st.escrowIn + st.escrowOut) + " <small>" + SYMBOL + "</small>");
  set("stEarned", compact(st.earned) + " <small>" + SYMBOL + "</small>");

  if (els.stBalSub) els.stBalSub.textContent = S.me && S.me.registered ? "inbox active" : "inbox not active";
  if (els.stMsgsSub) els.stMsgsSub.textContent = st.sent + " enviados · " + st.received + " recibidos";
  if (els.stEscrowSub) {
    const parts = [];
    if (st.escrowIn > 0n) parts.push("incoming " + fmt(st.escrowIn, { sym: false }));
    if (st.escrowOut > 0n) parts.push("outgoing " + fmt(st.escrowOut, { sym: false }));
    els.stEscrowSub.textContent = parts.length ? parts.join(" · ") : "nothing held";
  }
  if (els.stEarnedSub) els.stEarnedSub.textContent = st.contacts + " contacts · " + (S.feeBps / 100) + "% fee";
}

/* ------------------------------ the wizard ------------------------------ */
const WZ = { step: 1, open: false, rule: 1, price: 120, editing: false };

function wzPrefill(me) {
  WZ.open = !!(me && me.open);
  WZ.rule = me ? me.rule : 1;
  WZ.price = me && me.price > 0n ? Math.min(500, Number(me.price / UNIT)) : 120;
  WZ.step = 1;
  wzSync();
}

function wzShow(n) {
  WZ.step = Math.min(3, Math.max(1, n));
  document.querySelectorAll(".wz-page").forEach(p => {
    p.hidden = Number(p.dataset.p) !== WZ.step;
  });
  els.wzDots?.querySelectorAll(".wz-dot").forEach((d, i) => {
    d.classList.toggle("on", i === WZ.step - 1);
    d.classList.toggle("done", i < WZ.step - 1);
  });
  if (els.wzLbl) els.wzLbl.textContent = "step " + WZ.step + " of 3";
  if (els.wzBack) els.wzBack.disabled = WZ.step === 1;
  if (els.wzNext) els.wzNext.textContent = WZ.step === 3 ? "Save inbox" : "Next";
  wzSync();
}

function wzSync() {
  els.wzOpen?.querySelectorAll(".choice").forEach(b => {
    b.classList.toggle("sel", (b.dataset.v === "1") === WZ.open);
  });
  els.wzRule?.querySelectorAll(".choice").forEach(b => {
    b.classList.toggle("sel", Number(b.dataset.v) === WZ.rule);
  });
  if (els.wzPrice) els.wzPrice.value = String(WZ.price);
  if (els.wzPriceVal) els.wzPriceVal.textContent = String(WZ.price);
  els.wzPresets?.querySelectorAll("button").forEach(b => {
    b.classList.toggle("on", Number(b.dataset.p) === WZ.price);
  });
  if (els.wzOpenHint) {
    els.wzOpenHint.textContent = WZ.open
      ? "With an open inbox, anyone writes for free. Your price stays dormant until you close it."
      : "Strangers pay your price. Contacts always write for free.";
  }
  wzSim();
  renderPass(
    { open: WZ.open, rule: WZ.rule, price: BigInt(WZ.price) * UNIT, registered: !!(S.me && S.me.registered) },
    true
  );
}

function wzSim() {
  if (!els.wzSim) return;
  const amount = BigInt(WZ.price) * UNIT;
  const bps = BigInt(S.feeBps || 500);
  let you = 0n, back = 0n, fee = 0n;

  if (amount > 0n) {
    if (WZ.rule === 0) {
      back = amount;
    } else if (WZ.rule === 1) {
      fee = (amount * bps) / 10000n;
      you = amount - fee;
    } else {
      back = amount / 2n;
      const rest = amount - back;
      fee = (rest * bps) / 10000n;
      you = rest - fee;
    }
  }

  const pct = v => (amount === 0n ? 0 : Number((v * 1000n) / amount) / 10);
  const free = amount === 0n;
  const note = WZ.open
    ? "Open inbox: anyone writes for free. Your price is not charged until you close it."
    : free
      ? "Free: nobody pays to reach you, and contacts stay free forever."
      : WZ.rule === 0
        ? "If you reply, they get it all back — you earn nothing. If they never write again, it still returns."
        : WZ.rule === 1
          ? "If you reply you keep the payment minus 5%. If you don't reply in 72h, all of it goes back."
          : "If you reply, half goes back and you keep the other half minus 5%. If you don't, all of it returns.";

  els.wzSim.innerHTML =
    `<div class="sm-bubble"><div class="who">a stranger</div>` +
    `Hey — saw your token on pons. Wanted to run something by you.</div>` +
    `<div class="sm-line"><span class="sm-k">pays</span>` +
    `<span class="sm-v">${free ? "nothing" : fmt(amount)}</span></div>` +
    (free ? "" :
      `<div class="sm-line"><span class="sm-k">you keep</span><span class="sm-v you">${fmt(you)}</span></div>` +
      `<div class="sm-line"><span class="sm-k">fee</span><span class="sm-v fee">${fmt(fee)}</span></div>` +
      `<div class="sm-line"><span class="sm-k">goes back</span><span class="sm-v">${fmt(back)}</span></div>` +
      `<div class="sm-track">` +
      `<i class="you" style="width:${pct(you)}%"></i>` +
      `<i class="fee" style="width:${pct(fee)}%"></i>` +
      `<i class="back" style="width:${pct(back)}%"></i></div>` +
      `<div class="sm-legend"><s>you</s><s class="f">fee</s><s class="b">goes back</s></div>`) +
    `<div class="sm-note">${note}</div>`;
}

/* ---- pass: the inbox drawn as a ticket ---- */
function barcode(hex) {
  const h = strip0x(hex || "0000");
  const bars = [];
  for (let i = 0; i < Math.min(24, h.length); i++) {
    const v = parseInt(h[i], 16);
    bars.push(`<i style="width:${1 + (v % 3)}px;margin-right:${(v >> 2) & 1 ? 3 : 2}px"></i>`);
  }
  return bars.join("");
}

function renderPass(v, live) {
  if (!els.passPrice) return;
  const box = v || { registered: false, open: false, rule: 1, price: 0n };
  const num = live
    ? String(WZ.price)
    : (box.price > 0n ? fmt(box.price, { sym: false }) : "0");
  const free = num === "0" || box.open;

  els.passPrice.textContent = num;
  if (els.passCur) els.passCur.textContent = SYMBOL;
  if (els.passStub) els.passStub.textContent = num;
  if (els.passAddr) els.passAddr.textContent = S.account ? short(S.account) : "no wallet";
  if (els.passOpen) els.passOpen.textContent = box.open ? "anyone" : "contacts only";
  if (els.passRule) els.passRule.textContent =
    ["full refund", "keep it, less 5%", "split 50/50"][box.rule] || "—";
  if (els.passDesc) {
    els.passDesc.textContent = free
      ? "anyone can message you for free"
      : "per message from a wallet you don't know";
  }
  if (els.passVig) els.passVig.textContent = Math.round((S.ttl || 72 * 3600) / 3600) + " h";

  const key = S.keyPair ? myPub() : (box.encKey || "");
  if (els.passKey) els.passKey.textContent = strip0x(key).slice(0, 10).toUpperCase() || "····";
  if (els.passBar) els.passBar.innerHTML = barcode(key);

  if (els.boxBadge) {
    els.boxBadge.textContent = box.registered ? "active" : "draft";
    els.boxBadge.classList.toggle("on", !!box.registered);
  }
  const passEl = document.getElementById("pass");
  if (passEl) passEl.classList.toggle("draft", !box.registered);
}

function renderBox() {
  if (els.footMeta) {
    els.footMeta.textContent = CFG.inbox
      ? "contract " + short(CFG.inbox) + " · not audited"
      : "not audited";
  }

  if (!S.me) {
    renderPass({ registered: false, open: false, rule: 1, price: 0n }, false);
    if (els.boxForm) els.boxForm.hidden = true;
    if (els.boxActions) els.boxActions.hidden = true;
    return;
  }

  const showWizard = !S.me.registered || WZ.editing;
  if (els.boxForm) els.boxForm.hidden = !showWizard;
  if (els.boxActions) els.boxActions.hidden = showWizard;

  if (showWizard) {
    if (!WZ.ready) { wzPrefill(S.me); WZ.ready = true; }
    wzShow(WZ.step);
  } else {
    renderPass(S.me, false);
  }
}

function renderConvs() {
  if (!els.convs) return;
  if (!S.convs.length) { els.convs.innerHTML = '<div class="empty">nothing yet</div>'; return; }
  els.convs.innerHTML = S.convs.map(c => {
    const on = S.active && S.active.toLowerCase() === c.address ? " on" : "";
    const pv = c.preview ? esc(c.preview.slice(0, 44)) : "· encrypted ·";
    const tag = c.pending ? ' <span class="tag pending">payment</span>' : "";
    return `<div class="conv${on}" data-a="${c.address}">
      <div class="av">${c.address.slice(2, 4).toUpperCase()}</div>
      <div class="min">
        <div class="who">${short(c.address)}${tag}</div>
        <div class="pv">${pv}</div>
      </div></div>`;
  }).join("");
  els.convs.querySelectorAll(".conv").forEach(el => el.onclick = () => openThread(el.dataset.a));
}

/* ---- block timestamps (cached) ---- */
const times = new Map();

async function loadTimes(blocks) {
  const uniq = [...new Set(blocks)].filter(b => b && !times.has(b)).slice(0, 40);
  await Promise.all(uniq.map(async b => {
    try {
      const blk = await rpc("eth_getBlockByNumber", ["0x" + b.toString(16), false]);
      times.set(b, blk ? Number(blk.timestamp) : null);
    } catch (_) { times.set(b, null); }
  }));
}
const tsOf = m => (m.ts ? m.ts : (times.get(m.block) || null));
const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function dayLabel(ts) {
  const d = new Date(ts * 1000), now = new Date();
  if (sameDay(d, now)) return "Today";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
const hhmm = ts => new Date(ts * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dayKey = ts => { const d = new Date(ts * 1000); return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); };

function renderThread() {
  if (!els.msgs) return;

  if (!S.active) {
    if (els.threadTitle) els.threadTitle.textContent = "Conversation";
    if (els.threadMeta) els.threadMeta.textContent = "pick someone to write to";
    if (els.peerAv) els.peerAv.textContent = "—";
    els.msgs.innerHTML = '<div class="empty">pick a conversation</div>';
    if (els.composer) els.composer.hidden = true;
    return;
  }

  const peer = S.peers.get(S.active.toLowerCase());
  const peerKey = peer ? peer.encKey : null;
  const isContact = S.contacts.has(S.active.toLowerCase());

  if (els.peerAv) els.peerAv.textContent = S.active.slice(2, 4).toUpperCase();
  if (els.threadTitle) els.threadTitle.textContent = short(S.active);
  if (els.threadMeta) {
    els.threadMeta.textContent = !peer || !peer.registered
      ? "inbox inactive"
      : isContact ? "contact · free to write" : peer.open ? "open inbox" : "charges " + fmt(peer.price);
  }

  if (!S.msgs.length) {
    els.msgs.innerHTML = '<div class="empty">no messages yet · write the first one</div>';
  } else {
    const me = S.account.toLowerCase();
    const groups = [];
    for (const m of S.msgs) {
      const out = m.from.toLowerCase() === me;
      const g = groups[groups.length - 1];
      if (g && g.out === out) g.items.push(m);
      else groups.push({ out, items: [m] });
    }

    let html = "", lastDay = null;
    for (const g of groups) {
      const first = g.items[0];
      const t0 = tsOf(first);
      if (t0) {
        const k = dayKey(t0);
        if (k !== lastDay) { html += `<div class="day"><span>${dayLabel(t0)}</span></div>`; lastDay = k; }
      }

      const parts = [];
      g.items.forEach((m, i) => {
        const txt = m.plain !== undefined ? m.plain : (S.keyPair ? unseal(m.ct, peerKey) : null);
        parts.push(txt !== null
          ? `<div class="bub">${esc(txt)}</div>`
          : `<div class="bub locked">locked · ${strip0x(m.ct).length / 2} B</div>`);

        const p = S.payments.get(m.paymentId);
        if (p) {
          const cls = p.status === 1 ? "pending" : p.status === 2 ? "settled" : "refunded";
          parts.push(`<span class="paychip ${cls}">${fmt(p.amount)} · ${STATUS_LABEL[p.status]}</span>`);
        }
        if (i === g.items.length - 1) {
          const t = tsOf(m);
          if (t) parts.push(`<div class="bub-meta">${hhmm(t)}</div>`);
        }
      });

      const av = g.out ? "" : `<div class="av">${S.active.slice(2, 4).toUpperCase()}</div>`;
      html += `<div class="grp ${g.out ? "mine" : "theirs"}">${av}<div class="stack">${parts.join("")}</div></div>`;
    }
    els.msgs.innerHTML = html;
  }

  els.msgs.scrollTop = els.msgs.scrollHeight;
  if (els.composer) els.composer.hidden = false;
  renderComposer();
  renderActions();
}

async function renderComposer() {
  const peer = S.peers.get(S.active.toLowerCase());
  if (!peer || !peer.registered) {
    if (els.priceTag) els.priceTag.textContent = "—";
    if (els.btnSend) els.btnSend.disabled = true;
    if (els.composerHint) els.composerHint.textContent = "That wallet has not activated an inbox yet.";
    return;
  }
  if (S.demo) {
    const isContact = S.contacts.has(S.active.toLowerCase());
    S.price = (isContact || peer.open) ? 0n : peer.price;
    if (els.priceTag) els.priceTag.textContent = S.price === 0n ? "free" : fmt(S.price);
    if (els.btnSend) els.btnSend.disabled = false;
    if (els.composerHint) {
      els.composerHint.textContent = S.price === 0n
        ? "Free — you are already contacts, or the inbox is open."
        : "Held in escrow for 72h. If they don't reply, you get it back.";
    }
    return;
  }
  try {
    S.price = await readQuote(S.account, S.active);
    if (els.priceTag) els.priceTag.textContent = S.price === 0n ? "free" : fmt(S.price);
    if (els.btnSend) els.btnSend.disabled = false;
    if (els.composerHint) {
      els.composerHint.textContent = S.price === 0n
        ? "Free — you are already contacts, or the inbox is open."
        : `Held in escrow for ${Math.round(S.ttl / 3600)}h. If they don't reply, you get it back.`;
    }
  } catch (_) {
    if (els.priceTag) els.priceTag.textContent = "—";
  }
}

function renderActions() {
  if (!els.threadActions) return;
  els.threadActions.innerHTML = "";
  const me = S.account.toLowerCase();
  const incoming = S.msgs.find(m => {
    const p = S.payments.get(m.paymentId);
    return p && p.status === 1 && p.to.toLowerCase() === me;
  });
  const outgoing = S.msgs.find(m => {
    const p = S.payments.get(m.paymentId);
    return p && p.status === 1 && p.from.toLowerCase() === me;
  });

  if (incoming) {
    const p = S.payments.get(incoming.paymentId);
    const b = document.createElement("button");
    b.className = "solid sm";
    b.textContent = "Reply and settle " + fmt(p.amount);
    b.onclick = () => doSend(p.id);
    els.threadActions.appendChild(b);
  }
  if (outgoing) {
    const p = S.payments.get(outgoing.paymentId);
    const expired = p.expiresAt * 1000 <= Date.now();
    const b = document.createElement("button");
    b.className = "sm";
    b.textContent = expired
      ? "Refund " + fmt(p.amount)
      : "in escrow until " + new Date(p.expiresAt * 1000).toLocaleString();
    b.disabled = !expired;
    b.onclick = () => doRefund(p.id);
    els.threadActions.appendChild(b);
  }
}

/* ------------------------------- actions -------------------------------- */
async function refresh() {
  if (!S.account) return;
  const me = S.account.toLowerCase();

  S.me = await readInbox(me);
  S.balance = await readBalance(me);
  renderHeader();
  renderBox();

  S.all = await readLogs();

  const peers = new Set();
  for (const m of S.all) peers.add((m.from.toLowerCase() === me ? m.to : m.from).toLowerCase());
  S.peers = new Map();
  S.contacts = new Set();
  for (const a of peers) {
    S.peers.set(a, await readInbox(a));
    try { if (await readContact(me, a)) S.contacts.add(a); } catch (_) {}
  }

  S.payments = new Map();
  for (const m of S.all) {
    if (m.paymentId > 0 && !S.payments.has(m.paymentId)) {
      S.payments.set(m.paymentId, await readPayment(m.paymentId));
    }
  }

  // dashboard metrics
  let earned = 0n, escrowIn = 0n, escrowOut = 0n, sent = 0, received = 0;
  const mine = new Set();
  for (const [id, p] of S.payments) {
    if (p.to.toLowerCase() === me) {
      mine.add(id);
      if (p.status === 1) escrowIn += p.amount;
    }
    if (p.from.toLowerCase() === me) {
      mine.add(id);
      if (p.status === 1) escrowOut += p.amount;
    }
  }
  try {
    for (const s of await readSettled()) {
      if (mine.has(s.paymentId)) earned += s.toRecipient;
    }
  } catch (_) {}
  for (const m of S.all) {
    if (m.from.toLowerCase() === me) sent++; else received++;
  }
  S.stats = {
    total: S.all.length, sent, received, escrowIn, escrowOut, earned,
    contacts: S.contacts.size
  };

  S.convs = [...S.peers.entries()].map(([address]) => {
    const thread = S.all.filter(m =>
      (m.from.toLowerCase() === me && m.to.toLowerCase() === address) ||
      (m.to.toLowerCase() === me && m.from.toLowerCase() === address));
    const last = thread[thread.length - 1];
    return {
      address,
      preview: last && S.keyPair ? unseal(last.ct, S.peers.get(address).encKey) : null,
      pending: thread.some(m => {
        const p = S.payments.get(m.paymentId);
        return p && p.status === 1;
      }),
      count: thread.length
    };
  }).sort((a, b) => b.count - a.count);

  renderStats();
  renderConvs();
  if (S.active) await openThread(S.active);
  log(S.all.length + " messages · " + S.convs.length + " conversations", "ok");
}

async function openThread(addr) {
  S.active = addr;
  const me = S.account.toLowerCase();
  S.msgs = (S.all || []).filter(m =>
    (m.from.toLowerCase() === me && m.to.toLowerCase() === addr.toLowerCase()) ||
    (m.to.toLowerCase() === me && m.from.toLowerCase() === addr.toLowerCase()));
  try { await loadTimes(S.msgs.map(m => m.block)); } catch (_) {}
  renderConvs();
  renderThread();
}

async function doSave() {
  if (!S.keyPair) { log("Unlock your inbox first.", "err"); return; }
  try {
    const price = BigInt(WZ.price) * UNIT;
    const data = SEL.configure + u256(WZ.open ? 1 : 0) + u256(WZ.rule) + asAddr(myPub()) + u256(price);
    if (await runTx("Saving inbox", () => ({ to: CFG.inbox, data }))) {
      WZ.editing = false;
      WZ.ready = false;
      await refresh();
      renderThread();
    }
  } catch (e) { log("error: " + e.message, "err"); }
}

async function doSend(paymentId) {
  const text = els.text.value.trim();
  if (!text) return;
  const peer = S.active.toLowerCase();
  try {
    const cfg = S.peers.get(peer);
    if (!cfg || !cfg.registered) throw new Error("that wallet has no inbox");
    const ct = seal(cfg.encKey, text);

    if (paymentId) {
      const data = SEL.reply + u256(paymentId) + u256(2 * 32) + dynBytes(ct);
      if (await runTx("Replying", () => ({ to: CFG.inbox, data }))) {
        els.text.value = "";
        await refresh();
        renderThread();
      }
      return;
    }

    const price = S.price || 0n;
    if (price > 0n) {
      const allowed = wBig(words(await call(CFG.token, ERC20.allowance + asAddr(S.account) + asAddr(CFG.inbox)))[0]);
      if (allowed < price) {
        log("Approving " + fmt(price) + " — exact amount only…", "warn");
        if (!await runTx("Approving", () => ({
          to: CFG.token, data: ERC20.approve + asAddr(CFG.inbox) + u256(price)
        }))) return;
      }
    }

    const data = SEL.send + asAddr(peer) + u256(2 * 32) + dynBytes(ct);
    if (await runTx(price > 0n ? "Sending · " + fmt(price) + " into escrow" : "Sending",
        () => ({ to: CFG.inbox, data }))) {
      els.text.value = "";
      await refresh();
      renderThread();
    }
  } catch (e) { log("error: " + (e.shortMessage || e.message || e), "err"); }
}

async function doRefund(id) {
  const data = SEL.refund + u256(id);
  if (await runTx("Refunding", () => ({ to: CFG.inbox, data }))) {
    await refresh();
    renderThread();
  }
}

/* --------------------------------- demo --------------------------------- */
/* ?demo=1 — preview with sample data, no wallet and no deployment. */
function setupDemo() {
  const ME = "0x9f3c2a7e15b84d0c6e2f9a1b3d5c7e8f0a2b4c6d";
  const P1 = "0x4a1e8c9d2b6f3a5c7e9d1b3f5a7c9e1d3b5f7a9c";
  const P2 = "0x8b2d4f6a8c0e2d4f6a8c0e2d4f6a8c0e2d4f6a8";
  const now = Math.floor(Date.now() / 1000);

  S.account = ME;
  S.keyPair = nacl.box.keyPair();
  S.ttl = 72 * 3600;
  S.feeBps = 500;
  S.balance = 12480n * UNIT;
  S.me = {
    registered: true, open: false, rule: 1, price: 120n * UNIT,
    encKey: bytesToHex(S.keyPair.publicKey)
  };
  S.peers = new Map([
    [P1.toLowerCase(), { registered: true, open: false, rule: 1, encKey: bytesToHex(nacl.box.keyPair().publicKey), price: 100n * UNIT }],
    [P2.toLowerCase(), { registered: true, open: true, rule: 2, encKey: bytesToHex(nacl.box.keyPair().publicKey), price: 0n }]
  ]);
  S.contacts = new Set([P2.toLowerCase()]);
  S.payments = new Map([
    [7, { id: 7, from: P1, to: ME, amount: 100n * UNIT, expiresAt: now + 50 * 3600, status: 1 }],
    [6, { id: 6, from: ME, to: P2, amount: 40n * UNIT, expiresAt: now - 3600, status: 2 }]
  ]);

  let block = 12345210;
  let t = now - 26 * 3600;
  const stamp = () => (t += 3600 + Math.floor(Math.random() * 1200));
  S.all = [
    { id: 1, from: P1, to: ME, paymentId: 7, block: block++, logIndex: 0, tx: "0x1", ts: stamp(),
      plain: "Hey — saw your token on pons. Interested in next week's launch." },
    { id: 2, from: ME, to: P2, paymentId: 0, block: block++, logIndex: 0, tx: "0x2", ts: stamp(),
      plain: "Are we still on for yesterday's thing? Sending the updated deck." },
    { id: 3, from: P2, to: ME, paymentId: 6, block: block++, logIndex: 0, tx: "0x3", ts: stamp(),
      plain: "Sure. I'll take a look and get back to you. Thanks for the payment — you didn't have to." },
    { id: 4, from: ME, to: P1, paymentId: 0, block: block++, logIndex: 0, tx: "0x4", ts: stamp(),
      plain: "Perfect — holding 3 slots for you. I can send the contract over if you want to review it." },
    { id: 5, from: P1, to: ME, paymentId: 0, block: block++, logIndex: 0, tx: "0x5", ts: stamp(),
      plain: "Send it. I'll ping you here if anything comes up." }
  ];
  S.stats = {
    total: S.all.length, sent: 2, received: 3,
    escrowIn: 100n * UNIT, escrowOut: 0n, earned: 285n * UNIT, contacts: 1
  };
  S.demo = true;

  const meL = ME.toLowerCase();
  S.convs = [...S.peers.entries()].map(([address]) => {
    const thread = S.all.filter(m =>
      (m.from.toLowerCase() === meL && m.to.toLowerCase() === address) ||
      (m.to.toLowerCase() === meL && m.from.toLowerCase() === address));
    const last = thread[thread.length - 1];
    return {
      address, preview: last ? last.plain : null, count: thread.length,
      pending: thread.some(m => {
        const p = S.payments.get(m.paymentId);
        return p && p.status === 1;
      })
    };
  }).sort((a, b) => b.count - a.count);

  renderSocials();
  renderHeader();
  renderStats();
  renderConvs();
  openThread(P1);

  // ?demo=wizard → shows the wizard as it looks on a fresh inbox
  if (new URLSearchParams(location.search).get("demo") === "wizard") {
    S.me.registered = false;
    WZ.ready = false;
    renderBox();
    log("Wizard preview · this is how a new inbox gets activated", "warn");
    return;
  }
  renderBox();
  log("Sample data preview · connect your wallet to use the real inbox", "warn");
}

/* -------------------------------- boot ---------------------------------- */
async function connect() {
  if (!CFG.inbox || !CFG.token) {
    if (els.setupBanner) els.setupBanner.hidden = false;
    log("Contracts are not configured yet — deploy first.", "err");
    return;
  }
  if (!window.ethereum) {
    log("No wallet detected in this browser.", "err");
    return;
  }
  try {
    log("Connecting…");
    await ensureChain();
    const [acc] = await ethereum.request({ method: "eth_requestAccounts" });
    S.account = acc;

    S.ttl = Number(wBig(words(await call(CFG.inbox, SEL.ttl))[0]));
    S.feeBps = Number(wBig(words(await call(CFG.inbox, SEL.feeBps))[0]));

    S.keyPair = loadKeys(acc);
    if (!S.keyPair) {
      log("Sign the message in your wallet — free, no gas…", "warn");
      S.keyPair = await deriveKeys(acc);
    }

    if (els.btnConnect) {
      els.btnConnect.textContent = "Re-firmar";
      els.btnConnect.onclick = async () => {
        try { S.keyPair = await deriveKeys(S.account); log("Key regenerated ✔", "ok"); await refresh(); }
        catch (e) { log("Cancelled.", "err"); }
      };
    }

    await refresh();
    log("Connected · " + (S.feeBps / 100) + "% fee · " + Math.round(S.ttl / 3600) + "h escrow", "ok");
  } catch (e) {
    log("error: " + (e.shortMessage || e.message || e), "err");
  }
}

function initConfigPanel() {
  if (!els.btnCfg) return;
  els.cfgToken.value = CFG.token || "";
  els.cfgInbox.value = CFG.inbox || "";
  els.cfgFrom.value = CFG.fromBlock || "";
  els.btnCfg.onclick = () => {
    localStorage.setItem("talk:cfg:token", els.cfgToken.value.trim());
    localStorage.setItem("talk:cfg:inbox", els.cfgInbox.value.trim());
    localStorage.setItem("talk:cfg:fromBlock", els.cfgFrom.value.trim() || "0");
    location.reload();
  };
}

function initHero() {
  if (els.heroCta) els.heroCta.onclick = () => {
    document.getElementById("mail")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  if (els.heroHow) els.heroHow.onclick = () => {
    const box = document.getElementById("howBox");
    if (box) { box.remove(); return; }
    const d = document.createElement("div");
    d.id = "howBox";
    d.className = "hint";
    d.style.maxWidth = "52ch";
    d.innerHTML =
      "<b>1.</b> You activate your inbox with one free signature — not a transaction.<br>" +
      "<b>2.</b> You set a price in $TALK. A stranger pays to reach you.<br>" +
      "<b>3.</b> The payment sits in the contract, not with you: release it by replying within 72h, or it returns.<br>" +
      "<b>4.</b> After you reply you are contacts — writing is free from then on.";
    document.querySelector(".hero .actions")?.after(d);
  };
}

function initWizard() {
  els.wzOpen?.querySelectorAll(".choice").forEach(b => {
    b.onclick = () => { WZ.open = b.dataset.v === "1"; wzSync(); };
  });
  els.wzRule?.querySelectorAll(".choice").forEach(b => {
    b.onclick = () => { WZ.rule = Number(b.dataset.v); wzSync(); };
  });
  if (els.wzPrice) els.wzPrice.oninput = () => { WZ.price = Number(els.wzPrice.value); wzSync(); };
  els.wzPresets?.querySelectorAll("button").forEach(b => {
    b.onclick = () => { WZ.price = Number(b.dataset.p); wzSync(); };
  });
  if (els.wzBack) els.wzBack.onclick = () => wzShow(WZ.step - 1);
  if (els.wzNext) els.wzNext.onclick = () => {
    if (WZ.step < 3) { wzShow(WZ.step + 1); return; }
    doSave();
  };
  if (els.btnEdit) els.btnEdit.onclick = () => {
    WZ.editing = true;
    WZ.ready = false;
    renderBox();
  };
}

function init() {
  renderSocials();
  renderHeader();
  renderStats();
  initConfigPanel();
  initHero();
  initWizard();
  if (new URLSearchParams(location.search).has("demo")) { setupDemo(); return; }
  if (els.setupBanner) els.setupBanner.hidden = !!(CFG.inbox && CFG.token);
  if (els.btnConnect) els.btnConnect.onclick = connect;
  if (els.btnSend) els.btnSend.onclick = () => doSend(null);
  if (els.text) els.text.addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doSend(null); }
  });
  if (window.ethereum) {
    ethereum.on?.("accountsChanged", () => location.reload());
    ethereum.on?.("chainChanged", () => location.reload());
  }
}

document.addEventListener("DOMContentLoaded", init);


