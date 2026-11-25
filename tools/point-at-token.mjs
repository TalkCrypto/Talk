#!/usr/bin/env node
/**
 * Point Talk at the token that Pons deploys.
 *
 * Pons creates the contract, so the official $TALK has an address we only learn at launch.
 * The inbox stores its token as immutable, so it has to be deployed *after* that address exists.
 * This tool does the two things that must happen together:
 *
 *   1. verifies the address really is an ERC-20 on Robinhood Chain (symbol, decimals, supply)
 *   2. rewrites web/config.js, and prints the exact constructor arguments for the new inbox
 *
 * Usage:
 *   node tools/point-at-token.mjs --token 0x… [--treasury 0x…] [--inbox 0x…] [--dry]
 *
 * Nothing is written unless verification passes, and --dry never writes.
 */
import fs from "node:fs";
import path from "node:path";

const RPC = "https://rpc.mainnet.chain.robinhood.com";
const ROOT = path.resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "..");
const CONFIG = path.join(ROOT, "web", "config.js");

const SEL = {
  symbol: "0x95d89b41", decimals: "0x313ce567", totalSupply: "0x18160ddd",
  balanceOf: "0x70a08231", code: null
};

const argv = process.argv.slice(2);
const arg = name => {
  const i = argv.indexOf("--" + name);
  return i >= 0 ? argv[i + 1] : null;
};
const dry = argv.includes("--dry");

const token = arg("token");
const treasury = arg("treasury");
const inbox = arg("inbox");

if (!token || !/^0x[0-9a-fA-F]{40}$/.test(token)) {
  console.error("Usage: node tools/point-at-token.mjs --token 0x… [--treasury 0x…] [--inbox 0x…] [--dry]");
  process.exit(1);
}

let id = 1;
async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params })
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

const word = (hex, i) => BigInt("0x" + (hex.replace(/^0x/, "").slice(i * 64, i * 64 + 64) || "0"));

function decodeString(hex) {
  const h = hex.replace(/^0x/, "");
  if (h.length < 128) return "";
  const len = Number(BigInt("0x" + h.slice(64, 128)));
  const data = h.slice(128, 128 + len * 2);
  return Buffer.from(data, "hex").toString("utf8").replace(/\0+$/, "");
}

const pad = a => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");

console.log("verifying", token, "on chain 4663…");

const code = await rpc("eth_getCode", [token, "latest"]);
if (!code || code === "0x") {
  console.error("✗ that address has no contract on Robinhood Chain. Wrong network or not deployed yet?");
  process.exit(2);
}
console.log("  contract code :", (code.length - 2) / 2, "bytes");

const [symHex, decHex, supHex] = await Promise.all([
  rpc("eth_call", [{ to: token, data: SEL.symbol }, "latest"]),
  rpc("eth_call", [{ to: token, data: SEL.decimals }, "latest"]),
  rpc("eth_call", [{ to: token, data: SEL.totalSupply }, "latest"])
]);

const symbol = decodeString(symHex);
const decimals = Number(word(decHex, 0));
const supply = Number(word(supHex, 0)) / 10 ** decimals;

console.log("  symbol        :", symbol || "(empty)");
console.log("  decimals      :", decimals);
console.log("  total supply  :", supply.toLocaleString("en-US"));

if (!symbol) {
  console.error("✗ the contract does not answer symbol(). Is it an ERC-20?");
  process.exit(3);
}

// the inbox stores the token address forever: encode the constructor arguments here, once.
const encoded = treasury
  ? "0x" + pad(token) + pad(treasury)
  : "(pass --treasury 0x… to get the constructor arguments)";

console.log("\nconstructor arguments for TalkInbox(token, treasury):");
console.log("  " + encoded);

if (dry) {
  console.log("\n--dry: config.js untouched.");
  process.exit(0);
}

let cfg = fs.readFileSync(CONFIG, "utf8");
const before = cfg;

cfg = cfg.replace(/token:\s*"0x[0-9a-fA-F]*"/, `token: "${token}"`);
if (inbox) cfg = cfg.replace(/inbox:\s*"0x[0-9a-fA-F]*"/, `inbox: "${inbox}"`);
cfg = cfg.replace(/inboxAbi:\s*\d+/, "inboxAbi: 2");
cfg = cfg.replace(/fromBlock:\s*\d+/, "fromBlock: 0");

if (inbox) {
  // we know where the inbox starts only once it exists
  cfg = cfg.replace(/fromBlock:\s*0/, "fromBlock: 0");
}

if (cfg === before) {
  console.error("✗ config.js did not change — check its shape.");
  process.exit(4);
}

fs.writeFileSync(CONFIG, cfg, "utf8");
console.log("\n✓ web/config.js updated: token, inboxAbi = 2, fromBlock reset");

console.log(`
next steps
  1. deploy TalkInbox with the arguments above
  2. run: node tools/point-at-token.mjs --token ${token} --treasury <multisig> --inbox <new inbox>
     (or set inbox once by hand and put the real fromBlock in)
  3. deploy the site
`);
