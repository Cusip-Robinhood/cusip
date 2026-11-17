// Local Node HTTP server wrapping worker/src/index.js + static files in ../site for instant local dev & testing.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "./src/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(HERE, "..", "site");
const PORT = Number(process.env.PORT || 8788);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp4": "video/mp4",
};

const env = {
  CHAIN_ID: "4663",
  RH_RPC_URL: "https://rpc.mainnet.chain.robinhood.com",
  MULTICALL3: "0xcA11bde05977b3631167028862bE2a173976CA11",
  CUSIP_REGISTRY_ADDRESS: process.env.CUSIP_REGISTRY_ADDRESS || "",
  CUSIP_TOKEN_ADDRESS: process.env.CUSIP_TOKEN_ADDRESS || "",
  PRO_THRESHOLD_CUSIP: "500000",
  __LOCAL_INTEL: JSON.parse(fs.readFileSync(path.join(SITE_DIR, "data", "intelligence.json"), "utf8")),
  ASSETS: {
    async fetch(req) {
      const u = new URL(req.url);
      let rel = decodeURIComponent(u.pathname);
      if (rel === "/") rel = "/index.html";
      const filePath = path.resolve(SITE_DIR, "." + rel);
      if (!filePath.startsWith(SITE_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        return new Response("Not found", { status: 404 });
      }
      const ext = path.extname(filePath).toLowerCase();
      return new Response(fs.readFileSync(filePath), {
        status: 200,
        headers: { "content-type": MIME[ext] || "application/octet-stream" },
      });
    },
  },
};

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const fullUrl = `http://localhost:${PORT}${req.url}`;
  const webReq = new Request(fullUrl, {
    method: req.method,
    headers: req.headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
  });
  const webRes = await worker.fetch(webReq, env);
  res.writeHead(webRes.status, Object.fromEntries(webRes.headers.entries()));
  const buf = Buffer.from(await webRes.arrayBuffer());
  res.end(buf);
});

server.listen(PORT, () => {
  console.log(`CUSIP local server listening at http://localhost:${PORT}`);
});
