import fs from "node:fs";

const ROOT = "C:/Users/nonam/Desktop/PROYECTOS/Talk";
const combined = JSON.parse(fs.readFileSync(ROOT + "/contracts/build/combined.json", "utf8"));

const pick = (key) => {
  const entry = Object.entries(combined.contracts).find(([k]) => k.endsWith(":" + key));
  if (!entry) throw new Error("no encontrado: " + key);
  const [, v] = entry;
  const abi = typeof v.abi === "string" ? JSON.parse(v.abi) : v.abi;
  return { abi, bytecode: "0x" + v.bin };
};

const inbox = pick("TalkInbox");
const token = pick("TalkToken");

fs.mkdirSync(ROOT + "/web/abi", { recursive: true });
fs.writeFileSync(ROOT + "/web/abi/TalkInbox.json", JSON.stringify(inbox.abi, null, 2));
fs.writeFileSync(ROOT + "/web/abi/TalkToken.json", JSON.stringify(token.abi, null, 2));

const banner = "// Generado por tools/build-artifacts.mjs — no editar a mano.\n";
const body = "window.TALK_ARTIFACTS = " + JSON.stringify({ inbox, token }, null, 2) + ";\n";
fs.writeFileSync(ROOT + "/web/artifacts.js", banner + body);

console.log("TalkInbox  abi entries:", inbox.abi.length, "bytecode bytes:", (inbox.bytecode.length - 2) / 2);
console.log("TalkToken  abi entries:", token.abi.length, "bytecode bytes:", (token.bytecode.length - 2) / 2);

console.log("\ninbox functions:", inbox.abi.filter(e => e.type === "function").map(e => e.name).join(", "));
console.log("inbox events   :", inbox.abi.filter(e => e.type === "event").map(e => e.name).join(", "));
console.log("inbox errors   :", inbox.abi.filter(e => e.type === "error").map(e => e.name).join(", "));
console.log("token functions:", token.abi.filter(e => e.type === "function").map(e => e.name).join(", "));
