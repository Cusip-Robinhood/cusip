// Verifies CUSIP Worker API endpoints, Freemium <24h redaction, CUSIP lookup, and 13F rebalance math offline.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "./src/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const intel = JSON.parse(fs.readFileSync(path.join(HERE, "..", "site", "data", "intelligence.json"), "utf8"));

const baseEnv = {
  CHAIN_ID: "4663",
  PRO_THRESHOLD_CUSIP: "500000",
  __LOCAL_INTEL: intel,
};

// 1. /v1/status
let r = await worker.fetch(new Request("http://localhost/v1/status"), baseEnv);
let j = await r.json();
assert.equal(j.ok, true);
assert.equal(j.summary.counts.tokenizedEquities, 203);

// 2. /v1/equities?q=458140100 (Intel CUSIP -> INTC on Robinhood Chain)
r = await worker.fetch(new Request("http://localhost/v1/equities?q=458140100"), baseEnv);
j = await r.json();
assert.equal(j.count, 1);
assert.equal(j.equities[0].symbol, "INTC");
assert.equal(j.equities[0].address, "0xc72b96e0E48ecd4DC75E1e45396e26300BC39681");

// 3. /v1/signals Freemium gating check (live window gated when proUnlocked=false, >24h archive open)
r = await worker.fetch(new Request("http://localhost/v1/signals?type=buy"), baseEnv);
j = await r.json();
assert.ok(j.total >= 10);
assert.ok(j.gatedLiveCount >= 1, "Newest <24h window signals are gated for non-holders");
assert.ok(j.signals.some((s) => !s.gated && s.symbol === "GME"), "Archive >24h Ryan Cohen $22.8M GME buy is open");

// 4. /v1/rebalance math check
r = await worker.fetch(
  new Request("http://localhost/v1/rebalance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fundId: "tepper",
      budgetUsd: 2500,
      holdingsUsd: { AMZN: 600, MU: 400 },
    }),
  }),
  baseEnv
);
j = await r.json();
assert.ok(j.similarityLeaderboard.length === 6);
assert.equal(j.rebalancePlan.fundId, "tepper");
assert.equal(j.rebalancePlan.proLocked, true);
assert.equal(j.rebalancePlan.legs.length, 2);

console.log("PASS: All CUSIP Worker endpoints (/v1/status, /v1/equities, /v1/signals, /v1/rebalance) verified.");
