// Zero-dependency Node server for Railway (or any Node host).
// Serves /public and routes /api/* to the handlers in /api (if present).
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = existsSync(path.join(ROOT, "public")) ? path.join(ROOT, "public") : ROOT;
const PORT = process.env.PORT || 3000;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".json": "application/json", ".webp": "image/webp" };

function readBody(req) {
  return new Promise(resolve => {
    let data = ""; req.on("data", c => { data += c; if (data.length > 200000) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
  });
}

function wrap(res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); return res; };
  return res;
}

const handlers = {};
async function getHandler(name) {
  if (!/^[a-z]+$/.test(name)) return null;
  if (handlers[name]) return handlers[name];
  const file = path.join(ROOT, "api", name + ".js");
  if (!existsSync(file)) return null;
  handlers[name] = (await import(pathToFileURL(file).href)).default;
  return handlers[name];
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (url.pathname.startsWith("/api/")) {
      const h = await getHandler(url.pathname.slice(5).replace(/\/$/, ""));
      if (!h) return wrap(res).status(404).json({ error: "Not found" });
      req.body = req.method === "POST" ? await readBody(req) : {};
      return await h(req, wrap(res));
    }
    let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
    if (!file.startsWith(PUBLIC)) { res.statusCode = 403; return res.end(); }
    try { if ((await stat(file)).isDirectory()) file = path.join(file, "index.html"); }
    catch { file = path.join(PUBLIC, "index.html"); }
    const buf = await readFile(file);
    res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
    res.setHeader("Cache-Control", file.endsWith(".html") ? "no-cache" : "public, max-age=86400");
    res.end(buf);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) { res.statusCode = 500; res.end("Server error"); }
  }
}).listen(PORT, () => console.log("B Plumbing site running on port " + PORT));
