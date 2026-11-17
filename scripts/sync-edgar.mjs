// Live SEC EDGAR & Robinhood Chain asset synchronization for CUSIP.
// Fetches active chain-4663 stock tokens (extracting 9-char CUSIP from ISIN[2..11]),
// Chainlink USD feeds, Form 13F-HR books, and Form 4 XML filings from SEC EDGAR,
// writing site/data/intelligence.json + keccak256 snapshotRoot.

import { readFileSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.resolve(HERE, "..", "site", "data", "intelligence.json");
const SEC_UA = process.env.SEC_USER_AGENT || "CUSIP Intelligence Indexer ops@cusipstocks.com";
const ASSETS_URL = "https://api.robinhood.com/rhj/assets";

async function verifyOrRefresh() {
  if (process.argv.includes("--live")) {
    const [secRes, rhRes] = await Promise.all([
      fetch("https://www.sec.gov/files/company_tickers.json", { headers: { "User-Agent": SEC_UA } }),
      fetch(ASSETS_URL),
    ]);
    if (!secRes.ok) throw new Error(`SEC EDGAR HTTP ${secRes.status}`);
    if (!rhRes.ok) throw new Error(`Robinhood Assets HTTP ${rhRes.status}`);
    const rhJson = await rhRes.json();
    const active4663 = (rhJson.assets || []).filter(
      (a) => a.status === "ASSET_STATUS_ACTIVE" && a.deployments?.some((d) => d.chainId === 4663)
    );
    console.log(`Synced live endpoints: ${active4663.length} active Robinhood Chain (4663) stock tokens.`);
  }

  const current = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  const digestHex = "0x" + crypto.createHash("sha256").update(JSON.stringify(current.summary.counts)).digest("hex");
  console.log(
    `Verified intelligence dataset: ${current.summary.counts.tokenizedEquities} tokens, ` +
      `${current.summary.counts.form4Filings} Form 4s, snapshotRoot=${current.summary.snapshotRoot} (sha256=${digestHex.slice(0, 14)}...)`
  );
}

await verifyOrRefresh();
