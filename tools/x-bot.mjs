#!/usr/bin/env node
/**
 * X bot — posts to X from the command line.
 *
 * The credential never lives in this repo. Put it in `.env` (ignored by git):
 *
 *   X_BOT_TOKEN=...
 *
 * Usage:
 *   node tools/x-bot.mjs --dry "text"        # shows what would be sent, needs no token
 *   node tools/x-bot.mjs "text"              # actually posts
 *   node tools/x-bot.mjs --file post.txt     # posts the contents of a file
 *
 * Exit codes: 0 ok, 1 configuration error, 2 the API rejected it.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "..");

function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const argv = process.argv.slice(2);
const dry = argv.includes("--dry");
const fileIdx = argv.indexOf("--file");

let text;
if (fileIdx >= 0) {
  text = fs.readFileSync(argv[fileIdx + 1], "utf8").trim();
} else {
  text = argv.filter(a => !a.startsWith("--")).join(" ").trim();
}

if (!text) {
  console.error("No text. Usage: node tools/x-bot.mjs [--dry] \"text\" | --file post.txt");
  process.exit(1);
}

const env = { ...loadEnv(), ...process.env };
const token = env.X_BOT_TOKEN;

console.log("chars:", text.length);
if (text.length > 280) console.warn("warning: over 280 characters — X may reject it");
console.log("----\n" + text + "\n----");

if (dry) {
  console.log("dry run: nothing was sent.");
  process.exit(0);
}

if (!token) {
  console.error("X_BOT_TOKEN is not set. Put it in .env (never in the repo).");
  process.exit(1);
}

const res = await fetch("https://api.x.com/2/tweets", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + token,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ text })
});

const body = await res.text();
if (!res.ok) {
  console.error("X rejected it:", res.status, body.slice(0, 400));
  process.exit(2);
}

let id = null;
try { id = JSON.parse(body)?.data?.id; } catch (_) {}
console.log("posted" + (id ? ": https://x.com/i/status/" + id : ""));
