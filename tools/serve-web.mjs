import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = "C:/Users/nonam/Desktop/PROYECTOS/Talk/web";
const PORT = Number(process.env.PORT || 8100);

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
};

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(req.url.split("?")[0]); }
  catch (_) { res.writeHead(400).end("bad request"); return; }
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, p);
  if (!path.resolve(file).startsWith(path.resolve(ROOT))) { res.writeHead(403).end("forbidden"); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" }).end(buf);
  });
}).listen(PORT, "127.0.0.1", () => console.log("Talk web → http://127.0.0.1:" + PORT));
