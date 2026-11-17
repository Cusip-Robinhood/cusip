// CUSIP Cloudflare Worker — AI/Quant SEC EDGAR Intelligence API, Non-Custodial $CUSIP Balance Verifier,
// Safe Multicall3 Read-Only RPC Proxy, and MCP Tool Manifest on Robinhood Chain (4663).

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-wallet-address",
};

const MULTICALL3_DEFAULT = "0xca11bde05977b3631167028862be2a173976ca11";
const BALANCE_OF_SELECTOR = "0x70a08231";

let cachedIntel = null;
let cachedIntelAt = 0;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...CORS,
      ...extraHeaders,
    },
  });
}

function getLiveUsMarketState(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (k) => parts.find((p) => p.type === k)?.value || "";
  const wk = get("weekday");
  const hr = Number(get("hour"));
  const mn = Number(get("minute"));
  const mins = hr * 60 + mn;
  const etClock = `${wk} ${String(hr).padStart(2, "0")}:${String(mn).padStart(2, "0")} ET`;

  let usSession = "REGULAR";
  if (wk === "Sat" || wk === "Sun") usSession = "WEEKEND";
  else if (mins < 9 * 60 + 30) usSession = "PRE_MARKET";
  else if (mins >= 16 * 60) usSession = "AFTER_HOURS";

  return {
    etClock,
    usSession,
    nasdaqOpen: usSession === "REGULAR",
    robinhoodChainOpen: true, // 24/7 onchain spot settlement on chain 4663
    afterHoursGapActive: usSession !== "REGULAR",
  };
}

async function loadIntelligence(req, env) {
  if (cachedIntel && Date.now() - cachedIntelAt < 60_000) return cachedIntel;
  if (env.__LOCAL_INTEL) {
    cachedIntel = env.__LOCAL_INTEL;
    cachedIntelAt = Date.now();
    return cachedIntel;
  }
  const dataUrl = new URL("/data/intelligence.json", req.url);
  const res = env.ASSETS ? await env.ASSETS.fetch(new Request(dataUrl)) : await fetch(dataUrl);
  if (!res.ok) throw new Error(`Failed to load intelligence dataset (${res.status})`);
  cachedIntel = await res.json();
  cachedIntelAt = Date.now();
  return cachedIntel;
}

async function checkWalletProBalance(wallet, env) {
  const thresholdTokens = Number(env.PRO_THRESHOLD_CUSIP || 500_000);
  const tokenAddr = String(env.CUSIP_TOKEN_ADDRESS || "").trim();
  const cleanWallet = String(wallet || "").trim();

  // Pre-launch preview mode: before $CUSIP CA is bound at T=0, explain clearly and report tokenLaunched=false
  if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddr)) {
    return {
      tokenLaunched: false,
      proUnlocked: false,
      walletValid: /^0x[a-fA-F0-9]{40}$/.test(cleanWallet),
      balanceTokens: 0,
      requiredTokens: thresholdTokens,
    };
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(cleanWallet)) {
    return {
      tokenLaunched: true,
      proUnlocked: false,
      walletValid: false,
      balanceTokens: 0,
      requiredTokens: thresholdTokens,
    };
  }

  try {
    const rpc = env.RH_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
    const padded = cleanWallet.slice(2).toLowerCase().padStart(64, "0");
    const r = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: tokenAddr, data: BALANCE_OF_SELECTOR + padded }, "latest"],
      }),
    });
    const j = await r.json();
    const rawHex = j.result && j.result !== "0x" ? j.result : "0x0";
    const wei = BigInt(rawHex);
    const wholeTokens = Number(wei / 10n ** 15n) / 1000;
    return {
      tokenLaunched: true,
      proUnlocked: wei >= BigInt(thresholdTokens) * 10n ** 18n,
      walletValid: true,
      balanceTokens: wholeTokens,
      requiredTokens: thresholdTokens,
    };
  } catch {
    return {
      tokenLaunched: true,
      proUnlocked: false,
      walletValid: true,
      balanceTokens: 0,
      requiredTokens: thresholdTokens,
    };
  }
}

function redactLiveSignal(sig) {
  return {
    ...sig,
    gated: true,
    cusip: sig.cusip.slice(0, 3) + "••••••",
    symbol: "LOCKED",
    company: "Hold 500K $CUSIP to unlock <24h EDGAR ticker",
    tokenAddress: null,
    owner: sig.role || "Corporate Insider",
    secUrl: null,
  };
}

function computeRebalancePlan(fund, holdingsMapUsd, budgetUsd) {
  const walletTotalUsd = Object.values(holdingsMapUsd).reduce((s, v) => s + Number(v || 0), 0);
  const targetPoolUsd = Math.max(0, walletTotalUsd + Number(budgetUsd || 0));

  // Cosine similarity between wallet weights and fund's normalized onchain sleeve
  let dot = 0;
  let normW = 0;
  let normF = 0;
  for (const [sym, val] of Object.entries(holdingsMapUsd)) {
    const w = walletTotalUsd > 0 ? (Number(val) / walletTotalUsd) * 100 : 0;
    normW += w * w;
  }
  for (const pos of fund.rebalanceSleeve) {
    const fw = pos.normalizedOnchainWeightPct;
    const w = walletTotalUsd > 0 ? (Number(holdingsMapUsd[pos.symbol] || 0) / walletTotalUsd) * 100 : 0;
    dot += w * fw;
    normF += fw * fw;
  }
  const similarityPct =
    normW > 0 && normF > 0 ? Number(((dot / (Math.sqrt(normW) * Math.sqrt(normF))) * 100).toFixed(1)) : 0;

  const legs = fund.rebalanceSleeve.slice(0, 15).map((pos) => {
    const currentUsd = Number(holdingsMapUsd[pos.symbol] || 0);
    const targetUsd = (targetPoolUsd * pos.normalizedOnchainWeightPct) / 100;
    const deltaUsd = targetUsd - currentUsd;
    const estTokens = pos.refPrice && pos.refPrice > 0 ? Number((Math.abs(deltaUsd) / pos.refPrice).toFixed(4)) : null;
    return {
      cusip: pos.cusip,
      symbol: pos.symbol,
      name: pos.name,
      address: pos.address,
      targetWeightPct: Number(pos.normalizedOnchainWeightPct.toFixed(2)),
      currentUsd: Number(currentUsd.toFixed(2)),
      targetUsd: Number(targetUsd.toFixed(2)),
      deltaUsd: Number(deltaUsd.toFixed(2)),
      action: Math.abs(deltaUsd) < 5 ? "HOLD" : deltaUsd > 0 ? "BUY" : "TRIM",
      estTokenDelta: estTokens,
      refPrice: pos.refPrice,
    };
  });

  return {
    fundId: fund.id,
    manager: fund.manager,
    tokenizableCoveragePct: fund.tokenizableCoveragePct,
    walletEquityUsd: Number(walletTotalUsd.toFixed(2)),
    addedBudgetUsd: Number(Number(budgetUsd || 0).toFixed(2)),
    targetTotalUsd: Number(targetPoolUsd.toFixed(2)),
    similarityPct,
    legs,
  };
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(req.url);
    const p = url.pathname;

    try {
      // Safe read-only JSON-RPC forwarder for Multicall3 / CusipRegistry / balanceOf on chain 4663
      if (p === "/rpc" && req.method === "POST") {
        const body = await req.json().catch(() => null);
        if (!body || body.method !== "eth_call" || !Array.isArray(body.params)) {
          return json({ error: "Only eth_call read queries are permitted on /rpc" }, 403);
        }
        const target = String(body.params[0]?.to || "").toLowerCase();
        const allowed = new Set(
          [
            (env.MULTICALL3 || MULTICALL3_DEFAULT).toLowerCase(),
            String(env.CUSIP_REGISTRY_ADDRESS || "").toLowerCase(),
            String(env.CUSIP_TOKEN_ADDRESS || "").toLowerCase(),
          ].filter(Boolean)
        );
        if (!allowed.has(target)) {
          return json({ error: "Target contract not allowlisted on /rpc" }, 403);
        }
        const upstream = await fetch(env.RH_RPC_URL || "https://rpc.mainnet.chain.robinhood.com", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        return new Response(upstream.body, {
          status: upstream.status,
          headers: { "content-type": "application/json", ...CORS },
        });
      }

      if (p === "/v1/status") {
        const intel = await loadIntelligence(req, env);
        const wallet = url.searchParams.get("wallet") || req.headers.get("x-wallet-address") || "";
        const access = await checkWalletProBalance(wallet, env);
        return json({
          ok: true,
          protocol: "CUSIP",
          chainId: Number(env.CHAIN_ID || 4663),
          contracts: {
            cusipToken: env.CUSIP_TOKEN_ADDRESS || null,
            cusipRegistry: env.CUSIP_REGISTRY_ADDRESS || null,
            multicall3: env.MULTICALL3 || "0xcA11bde05977b3631167028862bE2a173976CA11",
          },
          market: getLiveUsMarketState(),
          access,
          summary: intel.summary,
        });
      }

      if (p === "/v1/equities") {
        const intel = await loadIntelligence(req, env);
        const q = (url.searchParams.get("q") || "").trim().toUpperCase();
        let list = intel.equities;
        if (q) {
          list = list.filter(
            (e) =>
              e.symbol.toUpperCase().includes(q) ||
              e.cusip.toUpperCase().includes(q) ||
              e.name.toUpperCase().includes(q) ||
              e.address.toUpperCase() === q
          );
        }
        return json({ count: list.length, equities: list });
      }

      if (p === "/v1/signals") {
        const intel = await loadIntelligence(req, env);
        const wallet = url.searchParams.get("wallet") || req.headers.get("x-wallet-address") || "";
        const access = await checkWalletProBalance(wallet, env);

        const kind = url.searchParams.get("type") || "all"; // buy | sell | stake | all
        const onlyDisc = url.searchParams.get("discretionary") === "true";
        const onlyAfterHours = url.searchParams.get("afterHours") === "true";
        const onlyCluster = url.searchParams.get("cluster") === "true";
        const q = (url.searchParams.get("q") || "").trim().toUpperCase();

        let combined = [...intel.form4Signals, ...intel.stakeSignals];
        if (kind !== "all") combined = combined.filter((s) => s.type === kind);
        if (onlyDisc) combined = combined.filter((s) => s.discretionary);
        if (onlyAfterHours) combined = combined.filter((s) => s.offHours24x7);
        if (onlyCluster) combined = combined.filter((s) => Boolean(s.clusterBuy));
        if (q) {
          combined = combined.filter(
            (s) =>
              s.symbol.toUpperCase().includes(q) ||
              s.cusip.toUpperCase().includes(q) ||
              s.company.toUpperCase().includes(q) ||
              String(s.owner || "").toUpperCase().includes(q)
          );
        }

        const items = combined.map((sig) => {
          if (sig.proLiveWindow && !access.proUnlocked) {
            return redactLiveSignal(sig);
          }
          return { ...sig, gated: false };
        });

        return json({
          access,
          total: items.length,
          gatedLiveCount: items.filter((i) => i.gated).length,
          signals: items,
        });
      }

      if (p === "/v1/funds") {
        const intel = await loadIntelligence(req, env);
        return json({ count: intel.funds.length, funds: intel.funds });
      }

      if (p === "/v1/rebalance" && req.method === "POST") {
        const intel = await loadIntelligence(req, env);
        const body = await req.json().catch(() => ({}));
        const access = await checkWalletProBalance(body.wallet || "", env);
        const holdingsUsd = body.holdingsUsd && typeof body.holdingsUsd === "object" ? body.holdingsUsd : {};
        const budgetUsd = Number(body.budgetUsd ?? 1000);

        const rankings = intel.funds
          .map((f) => computeRebalancePlan(f, holdingsUsd, budgetUsd))
          .sort((a, b) => b.similarityPct - a.similarityPct || b.tokenizableCoveragePct - a.tokenizableCoveragePct);

        const selectedId = body.fundId || rankings[0]?.fundId;
        const selectedPlan = rankings.find((r) => r.fundId === selectedId) || rankings[0];

        return json({
          access,
          similarityLeaderboard: rankings.map((r) => ({
            fundId: r.fundId,
            manager: r.manager,
            similarityPct: r.similarityPct,
            tokenizableCoveragePct: r.tokenizableCoveragePct,
          })),
          // Exact token-by-token trade legs require Pro holder status; non-holders see top similarity & top 2 preview legs
          rebalancePlan: access.proUnlocked
            ? selectedPlan
            : {
                ...selectedPlan,
                proLocked: true,
                legs: selectedPlan.legs.slice(0, 2),
                lockedLegsCount: Math.max(0, selectedPlan.legs.length - 2),
              },
        });
      }

      if (p === "/v1/mcp/manifest.json") {
        return json({
          schema_version: "1.0",
          name: "cusip-edgar-intelligence",
          description:
            "Autonomous AI data & SEC EDGAR indexing server resolving 9-char CUSIP filings (Form 4, 13D/G, 13F-HR) to 24/7 ERC-20 equity tokens on Robinhood Chain (4663).",
          chain_id: 4663,
          tools: [
            {
              name: "resolve_cusip_to_token",
              method: "GET",
              endpoint: "/v1/equities?q={cusip_or_symbol}",
              description: "Maps a 9-char SEC CUSIP or ticker to its ERC-20 contract & Chainlink USD feed on chain 4663.",
            },
            {
              name: "query_edgar_signals",
              method: "GET",
              endpoint: "/v1/signals?type=buy&discretionary=true&afterHours=true&wallet={holder_wallet}",
              description: "Returns scored SEC Form 4 insider buys, Cluster Buys, and after-hours 24/7 gap signals.",
            },
            {
              name: "compute_13f_rebalance",
              method: "POST",
              endpoint: "/v1/rebalance",
              description: "Computes wallet cosine similarity and exact ERC-20 stock token rebalance legs against 13F books.",
            },
          ],
        });
      }

      if (env.ASSETS) {
        if (["/gap", "/books", "/rebalance", "/directory", "/token"].includes(p)) {
          const rewritten = new URL(p + ".html", req.url);
          return env.ASSETS.fetch(new Request(rewritten, req));
        }
        return env.ASSETS.fetch(req);
      }
      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: err.message || "Internal error" }, 500);
    }
  },
};
