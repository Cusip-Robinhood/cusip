// CUSIP ($CUSIP) Frontend Terminal — SEC EDGAR AI Signal Desk, 24/7 Off-Hours Gap Scanner,
// 13F Institutional Redline Books, Multicall3 Read-Only Wallet Rebalancer, and Onchain CusipRegistry Queue.

const EMBEDDED_CUSIP_CA = "";
const EMBEDDED_REGISTRY_ADDR = "";
const CHAIN_ID_HEX = "0x1237"; // 4663 Robinhood Chain
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const PRO_THRESHOLD = 500_000;

const state = {
  intel: null,
  status: null,
  activeView: "wire",
  wireFilter: "conviction",
  wireQuery: "",
  dirQuery: "",
  selectedFundId: "tepper",
  holderWallet: localStorage.getItem("cusip_holder_wallet") || "",
  proUnlocked: false,
  holderBalance: 0,
  scannedHoldingsUsd: { NVDA: 1450, AMZN: 1120, MU: 940, INTC: 690 },
  scannedLabel: "Demo Portfolio ($4,200 across NVDA, AMZN, MU, INTC)",
};

const fmtUsd = (n) => {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (Math.abs(v) >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (Math.abs(v) >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  return "$" + v.toFixed(0);
};

const fmtCusip = (c) => {
  const s = String(c || "");
  if (s.length === 9 && !s.includes("•")) {
    return `${s.slice(0, 6)}-${s.slice(6, 8)}-${s.slice(8)}`;
  }
  return s;
};

const shortAddr = (a) => (a && a.length === 42 ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function updateUsClockBanner(marketFromApi) {
  const el = document.getElementById("usSessionBadge");
  if (!el) return;
  if (marketFromApi) {
    const open = marketFromApi.nasdaqOpen;
    el.className = "session-pill" + (open ? " open" : "");
    el.textContent = open
      ? `NYSE/NASDAQ OPEN (${marketFromApi.etClock})`
      : `US CLOSED (${marketFromApi.etClock}) · 4663 LIVE`;
    return;
  }
  el.textContent = "ROBINHOOD CHAIN 4663: 24/7 ACTIVE";
}

function syncContractDisplays() {
  const ca = EMBEDDED_CUSIP_CA || state.status?.contracts?.cusipToken || "";
  const reg = EMBEDDED_REGISTRY_ADDR || state.status?.contracts?.cusipRegistry || "";
  const displayCa = /^0x[a-fA-F0-9]{40}$/.test(ca) ? ca : "ANNOUNCING AT PONS LAUNCH";

  document.getElementById("headerCaText").textContent = displayCa;
  document.getElementById("regTokenCa").textContent = displayCa;
  document.getElementById("regContractAddr").textContent = /^0x[a-fA-F0-9]{40}$/.test(reg)
    ? reg
    : "Ready for Sourcify deploy on chain 4663";
}

function syncProBadge() {
  const badge = document.getElementById("proBadge");
  const banner = document.getElementById("freemiumBanner");
  if (state.proUnlocked) {
    badge.className = "pro-pill unlocked";
    badge.textContent = `PRO UNLOCKED (${Math.round(state.holderBalance).toLocaleString()} $CUSIP)`;
    if (banner) banner.style.display = "none";
  } else {
    badge.className = "pro-pill locked";
    badge.textContent = "FREE TIER · >24H ARCHIVE";
    if (banner) banner.style.display = "flex";
  }
}

function renderWireTable() {
  const tbody = document.getElementById("wireTableBody");
  if (!state.intel || !tbody) return;

  let rows = [...state.intel.form4Signals, ...state.intel.stakeSignals];
  if (state.wireFilter === "conviction") {
    rows = rows.filter((r) => r.type === "buy" && r.discretionary);
  } else if (state.wireFilter === "clusters") {
    rows = rows.filter((r) => Boolean(r.clusterBuy));
  } else if (state.wireFilter === "stakes") {
    rows = rows.filter((r) => r.type === "stake");
  }

  const q = state.wireQuery.trim().toUpperCase();
  if (q) {
    rows = rows.filter(
      (r) =>
        r.symbol.toUpperCase().includes(q) ||
        r.cusip.toUpperCase().includes(q) ||
        r.company.toUpperCase().includes(q) ||
        String(r.owner || "").toUpperCase().includes(q)
    );
  }

  rows.sort((a, b) => {
    if (state.wireFilter === "conviction" || state.wireFilter === "clusters") {
      return b.convictionScore - a.convictionScore || b.valueUsd - a.valueUsd;
    }
    return String(b.filedDate).localeCompare(String(a.filedDate)) || b.valueUsd - a.valueUsd;
  });

  tbody.innerHTML = rows
    .slice(0, 80)
    .map((sig) => {
      const isGated = sig.proLiveWindow && !state.proUnlocked;
      let sigHtml = "";
      if (sig.type === "buy") {
        sigHtml = `<span class="sig-tag sig-buy">OPEN-MKT BUY</span>`;
        if (sig.clusterBuy) {
          sigHtml += `<span class="sig-tag sig-cluster">CLUSTER (${sig.clusterBuy.distinctInsiders})</span>`;
        }
      } else if (sig.type === "stake") {
        sigHtml = `<span class="sig-tag sig-stake">SEC ${esc(sig.form)} &gt;5%</span>`;
      } else if (sig.planned10b51) {
        sigHtml = `<span class="sig-tag sig-10b51">10b5-1 AUTO-SELL</span>`;
      } else {
        sigHtml = `<span class="sig-tag sig-sell">UNPLANNED SELL</span>`;
      }

      if (isGated) {
        return `<tr class="gated-row">
          <td><span class="score-badge score-high">${sig.convictionScore}</span></td>
          <td>${sigHtml} <span class="sig-tag sig-lock">PRO &lt;24H</span></td>
          <td>
            <span class="sym-strong">LOCKED TICKER</span>
            <span class="cusip-chip">${esc(sig.cusip.slice(0, 3))}•••-••-•</span>
          </td>
          <td>
            <strong>${esc(sig.role || "Corporate Insider")}</strong>
            <span class="cusip-chip">Filed ${esc(sig.filedDate)}</span>
          </td>
          <td class="num">${sig.valueUsd > 0 ? fmtUsd(sig.valueUsd) : "5%+ Stake"}</td>
          <td><span class="mono-tag">${esc(sig.session)} (${esc(sig.etTime)})</span></td>
          <td><button type="button" class="btn-micro js-open-drawer">Hold 500K $CUSIP</button></td>
        </tr>`;
      }

      const scoreCls = sig.convictionScore >= 75 ? "score-badge score-high" : "score-badge";
      const priceNote = sig.price > 0 ? `@ $${sig.price.toFixed(2)}` : "";
      const explorerUrl = `https://robinhoodchain.blockscout.com/token/${sig.tokenAddress}`;
      return `<tr>
        <td><span class="${scoreCls}">${sig.convictionScore}</span></td>
        <td>${sigHtml}</td>
        <td>
          <span class="sym-strong">$${esc(sig.symbol)}</span>
          <span class="cusip-chip">${esc(fmtCusip(sig.cusip))} · ${esc(sig.company)}</span>
        </td>
        <td>
          <strong>${esc(sig.owner)}</strong>
          <span class="cusip-chip">${esc(sig.role)} · Filed ${esc(sig.filedDate)}</span>
        </td>
        <td class="num">
          <strong>${sig.valueUsd > 0 ? fmtUsd(sig.valueUsd) : "5%+ Stake"}</strong>
          <span class="cusip-chip">${esc(priceNote)}</span>
        </td>
        <td>
          <span class="${sig.offHours24x7 ? "accent-amber" : ""}" style="font-family:var(--mono);font-size:12px;">
            ${sig.offHours24x7 ? "OFF-HOURS" : "REGULAR"} · ${esc(sig.etTime)}
          </span>
        </td>
        <td style="font-family:var(--mono);font-size:12px;white-space:nowrap;">
          <a href="${explorerUrl}" target="_blank" rel="noopener">${shortAddr(sig.tokenAddress)}</a>
          &middot;
          <a href="${esc(sig.secUrl)}" target="_blank" rel="noopener">SEC XML</a>
        </td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".js-open-drawer").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("holderDrawer").classList.remove("hidden");
      document.getElementById("holderWalletInput").focus();
    });
  });
}

function renderGapScanner() {
  const tbody = document.getElementById("gapTableBody");
  const clusterWrap = document.getElementById("clusterSpotlight");
  if (!state.intel || !tbody) return;

  // Render Cluster Buy spotlight cards
  const byCluster = new Map();
  for (const s of state.intel.form4Signals) {
    if (s.type === "buy" && s.clusterBuy && !byCluster.has(s.symbol)) {
      byCluster.set(s.symbol, s);
    }
  }
  clusterWrap.innerHTML = [...byCluster.values()]
    .map(
      (c) => `<div class="cluster-card">
        <span class="mono-tag">CLUSTER CONVICTION · CUSIP ${esc(fmtCusip(c.cusip))}</span>
        <h3>$${esc(c.symbol)} — ${esc(c.company)}</h3>
        <div><strong>${fmtUsd(c.clusterBuy.totalClusterUsd)}</strong> combined across <strong>${c.clusterBuy.count}</strong> open-market insider buy filings.</div>
        <p>Token on Chain 4663: <a href="https://robinhoodchain.blockscout.com/token/${c.tokenAddress}" target="_blank" rel="noopener"><code>${shortAddr(c.tokenAddress)}</code></a></p>
      </div>`
    )
    .join("");

  const offHoursRows = state.intel.form4Signals
    .filter((s) => s.offHours24x7 && (!s.planned10b51 || s.type === "buy"))
    .sort((a, b) => (a.type === "buy" ? -1 : 1) - (b.type === "buy" ? -1 : 1) || b.valueUsd - a.valueUsd);

  tbody.innerHTML = offHoursRows
    .slice(0, 45)
    .map((s) => {
      const isGated = s.proLiveWindow && !state.proUnlocked;
      if (isGated) {
        return `<tr class="gated-row">
          <td style="font-family:var(--mono)">${esc(s.filedDate)} · ${esc(s.etTime)}</td>
          <td><span class="sig-tag sig-lock">NASDAQ CLOSED</span></td>
          <td><span class="sig-tag ${s.type === "buy" ? "sig-buy" : "sig-sell"}">${s.type.toUpperCase()}</span> <span class="sig-tag sig-lock">PRO &lt;24H</span></td>
          <td><span class="sym-strong">LOCKED</span> <span class="cusip-chip">${esc(s.cusip.slice(0, 3))}•••</span></td>
          <td>${esc(s.role)}</td>
          <td class="num">${fmtUsd(s.valueUsd)}</td>
          <td><span class="mono-tag">Hold 500K $CUSIP</span></td>
        </tr>`;
      }
      return `<tr>
        <td style="font-family:var(--mono)">${esc(s.filedDate)} · ${esc(s.etTime)}</td>
        <td><span class="session-pill">CLOSED (${esc(s.session)})</span></td>
        <td><span class="sig-tag ${s.type === "buy" ? "sig-buy" : "sig-sell"}">${s.type === "buy" ? "OPEN-MKT BUY" : "DISCRETIONARY SELL"}</span></td>
        <td><span class="sym-strong">$${esc(s.symbol)}</span> <span class="cusip-chip">${esc(fmtCusip(s.cusip))} · ${esc(s.company)}</span></td>
        <td><strong>${esc(s.owner)}</strong> <span class="cusip-chip">${esc(s.role)}</span></td>
        <td class="num"><strong>${fmtUsd(s.valueUsd)}</strong></td>
        <td style="font-family:var(--mono);font-size:12px;">
          <a href="https://robinhoodchain.blockscout.com/token/${s.tokenAddress}" target="_blank" rel="noopener">${shortAddr(s.tokenAddress)}</a>
          &middot; <a href="${esc(s.secUrl)}" target="_blank" rel="noopener">Form 4</a>
        </td>
      </tr>`;
    })
    .join("");
}

function renderFundBooks() {
  if (!state.intel) return;
  const selector = document.getElementById("fundSelector");
  const header = document.getElementById("fundDetailHeader");
  const tbody = document.getElementById("fundHoldingsBody");
  const exitsBox = document.getElementById("fundExitsBox");

  const funds = state.intel.funds;
  const active = funds.find((f) => f.id === state.selectedFundId) || funds[0];

  selector.innerHTML = funds
    .map(
      (f) => `<button type="button" class="fund-btn ${f.id === active.id ? "active" : ""}" data-fund="${esc(f.id)}">
        <span class="f-mgr">${esc(f.manager)}</span>
        <span class="cusip-chip">${esc(f.firm)}</span>
        <span class="f-cov">${f.tokenizableCoveragePct.toFixed(1)}% Onchain Replicable</span>
      </button>`
    )
    .join("");

  selector.querySelectorAll(".fund-btn").forEach((b) => {
    b.addEventListener("click", () => {
      state.selectedFundId = b.dataset.fund;
      renderFundBooks();
    });
  });

  header.innerHTML = `
    <div><strong>${esc(active.firm)}</strong> · CIK <code>${esc(active.cik)}</code></div>
    <div>13F Equity Book: <strong>${fmtUsd(active.totalAumUsd)}</strong> (${active.positionCount} positions)</div>
    <div>Period: <strong>${esc(active.period)}</strong> (Filed ${esc(active.filed)})</div>
    <div><a href="${esc(active.secUrl)}" target="_blank" rel="noopener">Raw SEC 13F-HR XML &rarr;</a></div>
  `;

  tbody.innerHTML = active.holdings
    .map((h) => {
      let chgHtml = `<span class="cusip-chip">HOLD</span>`;
      if (h.change?.type === "new") chgHtml = `<span class="sig-tag sig-buy">NEW POSITION</span>`;
      else if (h.change?.type === "add") chgHtml = `<span class="sig-tag sig-buy">ADD +${h.change.pct}%</span>`;
      else if (h.change?.type === "trim") chgHtml = `<span class="sig-tag sig-sell">TRIM ${h.change.pct}%</span>`;

      const tokCell = h.token
        ? `<a href="https://robinhoodchain.blockscout.com/token/${h.token.address}" target="_blank" rel="noopener"><strong>$${esc(h.token.symbol)}</strong> · ${shortAddr(h.token.address)}</a>`
        : `<span class="cusip-chip">Not yet tokenized on 4663</span>`;

      return `<tr>
        <td style="font-family:var(--mono)">${esc(fmtCusip(h.cusip))}</td>
        <td><strong>${esc(h.issuer)}</strong></td>
        <td class="num"><strong>${h.weightPct.toFixed(2)}%</strong></td>
        <td class="num">${fmtUsd(h.valueUsd)}</td>
        <td>${chgHtml}</td>
        <td style="font-family:var(--mono);font-size:12px;">${tokCell}</td>
      </tr>`;
    })
    .join("");

  if (active.exits?.length) {
    exitsBox.innerHTML =
      `<strong>Quarter Full Exits (100% Closed in Latest 13F):</strong> ` +
      active.exits
        .map((e) => `${esc(e.issuer)} (${fmtUsd(e.priorValueUsd)}${e.token ? ` · $${esc(e.token.symbol)}` : ""})`)
        .join(" &bull; ");
  } else {
    exitsBox.innerHTML = `<strong>Quarter Full Exits:</strong> None reported in top holdings.`;
  }
}

async function renderRebalanceView() {
  if (!state.intel) return;
  const sel = document.getElementById("targetFundSelect");
  if (!sel.options.length) {
    sel.innerHTML = state.intel.funds
      .map((f) => `<option value="${esc(f.id)}">${esc(f.manager)} (${f.tokenizableCoveragePct}% onchain)</option>`)
      .join("");
    sel.value = "tepper";
  }

  const budgetUsd = Number(document.getElementById("extraBudgetInput").value || 0);
  const fundId = sel.value || "tepper";
  document.getElementById("walletScanStatus").textContent = `Active input: ${state.scannedLabel}`;

  // Compute locally using the same deterministic cosine + sleeve formula (or API when online)
  const funds = state.intel.funds;
  const holdingsUsd = state.scannedHoldingsUsd;
  const walletTotal = Object.values(holdingsUsd).reduce((s, v) => s + Number(v || 0), 0);
  const targetPool = Math.max(0, walletTotal + budgetUsd);

  const scored = funds
    .map((f) => {
      let dot = 0, nW = 0, nF = 0;
      for (const v of Object.values(holdingsUsd)) {
        const w = walletTotal > 0 ? (Number(v) / walletTotal) * 100 : 0;
        nW += w * w;
      }
      for (const pos of f.rebalanceSleeve) {
        const fw = pos.normalizedOnchainWeightPct;
        const w = walletTotal > 0 ? (Number(holdingsUsd[pos.symbol] || 0) / walletTotal) * 100 : 0;
        dot += w * fw;
        nF += fw * fw;
      }
      const sim = nW > 0 && nF > 0 ? (dot / (Math.sqrt(nW) * Math.sqrt(nF))) * 100 : 0;
      return { fund: f, sim };
    })
    .sort((a, b) => b.sim - a.sim);

  document.getElementById("similarityGrid").innerHTML = scored
    .map(
      ({ fund, sim }) => `<div class="kpi-card" style="cursor:pointer" data-pick="${esc(fund.id)}">
        <span class="kpi-label">${esc(fund.manager)}</span>
        <strong class="kpi-val ${sim >= 40 ? "accent-emerald" : ""}">${sim.toFixed(1)}% Match</strong>
        <span class="kpi-foot">${fund.tokenizableCoveragePct}% book on 4663</span>
      </div>`
    )
    .join("");

  document.querySelectorAll("#similarityGrid [data-pick]").forEach((el) => {
    el.addEventListener("click", () => {
      sel.value = el.dataset.pick;
      renderRebalanceView();
    });
  });

  const chosen = funds.find((f) => f.id === fundId) || funds[0];
  const legs = chosen.rebalanceSleeve.slice(0, 15);
  const tbody = document.getElementById("rebalanceTableBody");

  tbody.innerHTML = legs
    .map((pos, idx) => {
      const lockedLeg = !state.proUnlocked && idx >= 3;
      const cur = Number(holdingsUsd[pos.symbol] || 0);
      const tgt = (targetPool * pos.normalizedOnchainWeightPct) / 100;
      const delta = tgt - cur;
      const action = Math.abs(delta) < 5 ? "HOLD" : delta > 0 ? "BUY" : "TRIM";

      if (lockedLeg) {
        return `<tr class="gated-row">
          <td><span class="sig-tag sig-lock">PRO LEG #${idx + 1}</span></td>
          <td><span class="sym-strong">LOCKED SLEEVE POSITION</span> <span class="cusip-chip">${esc(pos.cusip.slice(0, 3))}•••-••-•</span></td>
          <td class="num">${pos.normalizedOnchainWeightPct.toFixed(2)}%</td>
          <td class="num">—</td>
          <td class="num">${fmtUsd(tgt)}</td>
          <td class="num"><span class="mono-tag">Hold 500K $CUSIP</span></td>
          <td>—</td>
        </tr>`;
      }

      const actCls = action === "BUY" ? "sig-buy" : action === "TRIM" ? "sig-sell" : "sig-10b51";
      return `<tr>
        <td><span class="sig-tag ${actCls}">${action}</span></td>
        <td><span class="sym-strong">$${esc(pos.symbol)}</span> <span class="cusip-chip">${esc(fmtCusip(pos.cusip))} · ${esc(pos.name)}</span></td>
        <td class="num">${pos.normalizedOnchainWeightPct.toFixed(2)}%</td>
        <td class="num">${fmtUsd(cur)}</td>
        <td class="num">${fmtUsd(tgt)}</td>
        <td class="num"><strong>${delta >= 0 ? "+" : "-"}${fmtUsd(Math.abs(delta))}</strong></td>
        <td style="font-family:var(--mono);font-size:12px;">
          <a href="https://robinhoodchain.blockscout.com/token/${pos.address}" target="_blank" rel="noopener">${shortAddr(pos.address)}</a>
        </td>
      </tr>`;
    })
    .join("");
}

async function scanLiveChain4663Wallet(addr) {
  const clean = String(addr || "").trim();
  const statusEl = document.getElementById("walletScanStatus");
  if (!/^0x[a-fA-F0-9]{40}$/.test(clean)) {
    statusEl.textContent = "Enter a valid 42-character 0x address on Robinhood Chain.";
    return;
  }
  statusEl.textContent = `Scanning 203 stock-token balances on Robinhood Chain (4663) via Multicall3...`;

  try {
    // Build Multicall3 aggregate3(Call3[]) calldata for balanceOf(clean) across all 203 stock tokens
    const equities = state.intel.equities;
    const paddedWallet = clean.slice(2).toLowerCase().padStart(64, "0");
    const callDataHex = "70a08231" + paddedWallet; // 36 bytes

    // Encode aggregate3((address target, bool allowFailure, bytes callData)[])
    const countHex = equities.length.toString(16).padStart(64, "0");
    let heads = "";
    let tails = "";
    let tailOffset = equities.length * 32;
    for (const eq of equities) {
      heads += tailOffset.toString(16).padStart(64, "0");
      const targetSlot = eq.address.slice(2).toLowerCase().padStart(64, "0");
      const allowSlot = "1".padStart(64, "0");
      const bytesOffsetSlot = (96).toString(16).padStart(64, "0");
      const bytesLenSlot = (36).toString(16).padStart(64, "0");
      const bytesPadded = callDataHex.padEnd(128, "0");
      const tupleHex = targetSlot + allowSlot + bytesOffsetSlot + bytesLenSlot + bytesPadded;
      tails += tupleHex;
      tailOffset += tupleHex.length / 2;
    }
    const fullCalldata = "0x82ad56cb" + (32).toString(16).padStart(64, "0") + countHex + heads + tails;

    const rpcRes = await fetch("/rpc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: MULTICALL3, data: fullCalldata }, "latest"],
      }),
    });
    const rpcJson = await rpcRes.json();
    if (!rpcJson.result || rpcJson.result === "0x") throw new Error("Empty Multicall3 response");

    // Decode Result[](bool success, bytes returnData)
    const raw = rpcJson.result.slice(2);
    const arrOffset = parseInt(raw.slice(0, 64), 16) * 2;
    const arrLen = parseInt(raw.slice(arrOffset, arrOffset + 64), 16);
    const foundUsd = {};
    let nonZeroCount = 0;

    for (let i = 0; i < arrLen; i++) {
      const elemRel = parseInt(raw.slice(arrOffset + 64 + i * 64, arrOffset + 128 + i * 64), 16) * 2;
      const elemPos = arrOffset + 64 + elemRel;
      const ok = parseInt(raw.slice(elemPos, elemPos + 64), 16) === 1;
      const bytesRel = parseInt(raw.slice(elemPos + 64, elemPos + 128), 16) * 2;
      const bytesLen = parseInt(raw.slice(elemPos + bytesRel, elemPos + bytesRel + 64), 16);
      if (ok && bytesLen >= 32) {
        const valHex = raw.slice(elemPos + bytesRel + 64, elemPos + bytesRel + 128);
        const wei = BigInt("0x" + valHex);
        if (wei > 0n) {
          const shares = (Number(wei / 10n ** 14n) / 10000) * (equities[i].multiplier || 1);
          const px = equities[i].refPrice || 100;
          foundUsd[equities[i].symbol] = Number((shares * px).toFixed(2));
          nonZeroCount++;
        }
      }
    }

    state.scannedHoldingsUsd = foundUsd;
    state.scannedLabel =
      nonZeroCount > 0
        ? `Live Wallet ${shortAddr(clean)} (${nonZeroCount} stock-token positions found on chain 4663)`
        : `Live Wallet ${shortAddr(clean)} ($0 current stock tokens — pure fresh capital allocation)`;
    renderRebalanceView();
  } catch (err) {
    statusEl.textContent = `RPC scan note: ${err.message}. Showing simulated portfolio.`;
  }
}

function renderDirectory() {
  const tbody = document.getElementById("directoryTableBody");
  if (!state.intel || !tbody) return;
  document.getElementById("regSnapshotRoot").textContent = state.intel.summary.snapshotRoot;

  const q = state.dirQuery.trim().toUpperCase();
  let rows = state.intel.equities;
  if (q) {
    rows = rows.filter(
      (e) =>
        e.symbol.toUpperCase().includes(q) ||
        e.cusip.toUpperCase().includes(q) ||
        e.name.toUpperCase().includes(q) ||
        e.address.toUpperCase().includes(q) ||
        String(e.cik || "").includes(q)
    );
  }

  tbody.innerHTML = rows
    .slice(0, 120)
    .map(
      (e) => `<tr>
        <td style="font-family:var(--mono)">${esc(fmtCusip(e.cusip))}</td>
        <td><strong class="sym-strong">$${esc(e.symbol)}</strong></td>
        <td>${esc(e.name)}</td>
        <td style="font-family:var(--mono);color:var(--muted)">${esc(e.cik || "ETF/Trust")}</td>
        <td class="num">${e.refPrice ? "$" + e.refPrice.toFixed(2) : "—"}</td>
        <td style="font-family:var(--mono);font-size:12px;">${e.feed ? shortAddr(e.feed) : "Filing mark"}</td>
        <td style="font-family:var(--mono);font-size:12px;">
          <a href="https://robinhoodchain.blockscout.com/token/${e.address}" target="_blank" rel="noopener">${shortAddr(e.address)}</a>
        </td>
      </tr>`
    )
    .join("");
}

async function verifyHolderAddress(addr) {
  const statusEl = document.getElementById("holderCheckStatus");
  const clean = String(addr || "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(clean)) {
    statusEl.textContent = "Please enter a valid 0x wallet address.";
    return;
  }
  statusEl.textContent = "Checking $CUSIP balance on Robinhood Chain (4663)...";
  try {
    const r = await fetch(`/v1/status?wallet=${encodeURIComponent(clean)}`);
    const j = await r.json();
    state.holderWallet = clean;
    localStorage.setItem("cusip_holder_wallet", clean);
    state.proUnlocked = Boolean(j.access?.proUnlocked);
    state.holderBalance = Number(j.access?.balanceTokens || 0);
    syncProBadge();
    renderWireTable();
    renderGapScanner();
    renderRebalanceView();

    if (!j.access?.tokenLaunched) {
      statusEl.textContent = `Wallet ${shortAddr(clean)} saved. $CUSIP launches on Pons shortly — Pro threshold (500,000 $CUSIP) activates automatically once the token contract is bound.`;
    } else if (state.proUnlocked) {
      statusEl.textContent = `Verified: ${state.holderBalance.toLocaleString()} $CUSIP held (>= ${PRO_THRESHOLD.toLocaleString()}). Real-time <24h EDGAR wire & full 13F rebalance unlocked.`;
    } else {
      statusEl.textContent = `Balance: ${state.holderBalance.toLocaleString()} $CUSIP. Hold >= ${PRO_THRESHOLD.toLocaleString()} $CUSIP on Robinhood Chain to unlock real-time <24h filings.`;
    }
  } catch (err) {
    statusEl.textContent = `Verification check error: ${err.message}`;
  }
}

function switchView(viewName) {
  state.activeView = viewName;
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === viewName);
  });
  document.querySelectorAll(".desk-view").forEach((sec) => {
    sec.classList.toggle("active", sec.id === `view-${viewName}`);
  });
  history.replaceState(null, "", `#${viewName}`);
}

async function init() {
  // Tab routing
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  const initialHash = location.hash.replace("#", "");
  if (["wire", "gap", "books", "rebalance", "registry"].includes(initialHash)) {
    switchView(initialHash);
  }

  // Copy CA
  document.getElementById("copyCaBtn").addEventListener("click", async () => {
    const text = document.getElementById("headerCaText").textContent.trim();
    await navigator.clipboard.writeText(text).catch(() => {});
    const btn = document.getElementById("copyCaBtn");
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = "Copy"), 1400);
  });

  // Holder Drawer
  const toggleDrawer = () => document.getElementById("holderDrawer").classList.toggle("hidden");
  document.getElementById("verifyHolderBtn").addEventListener("click", toggleDrawer);
  document.getElementById("bannerUnlockBtn").addEventListener("click", () => {
    document.getElementById("holderDrawer").classList.remove("hidden");
    document.getElementById("holderWalletInput").focus();
  });

  document.getElementById("checkBalanceBtn").addEventListener("click", () => {
    verifyHolderAddress(document.getElementById("holderWalletInput").value);
  });

  document.getElementById("connectWalletBtn").addEventListener("click", async () => {
    if (!window.ethereum) {
      document.getElementById("holderCheckStatus").textContent = "No injected EVM wallet detected — paste any 0x address above (no signature needed).";
      return;
    }
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (accounts?.[0]) {
      document.getElementById("holderWalletInput").value = accounts[0];
      verifyHolderAddress(accounts[0]);
    }
  });

  // Wire filters
  document.querySelectorAll("#wireFilterGroup .pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("#wireFilterGroup .pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      state.wireFilter = pill.dataset.filter;
      renderWireTable();
    });
  });
  document.getElementById("wireSearch").addEventListener("input", (e) => {
    state.wireQuery = e.target.value;
    renderWireTable();
  });

  // Rebalance controls
  document.getElementById("targetFundSelect").addEventListener("change", renderRebalanceView);
  document.getElementById("extraBudgetInput").addEventListener("input", renderRebalanceView);
  document.getElementById("runWalletScanBtn").addEventListener("click", () => {
    scanLiveChain4663Wallet(document.getElementById("scanWalletInput").value);
  });
  document.getElementById("loadSampleWalletBtn").addEventListener("click", () => {
    state.scannedHoldingsUsd = { NVDA: 1450, AMZN: 1120, MU: 940, INTC: 690 };
    state.scannedLabel = "Demo Portfolio ($4,200 across NVDA, AMZN, MU, INTC)";
    renderRebalanceView();
  });

  // Directory search
  document.getElementById("dirSearchInput").addEventListener("input", (e) => {
    state.dirQuery = e.target.value;
    renderDirectory();
  });

  // Onchain CusipRegistry.requestCikIndex(uint40 cik, bool is13F, string entityName)
  document.getElementById("cikRequestForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById("cikTxStatus");
    const regAddr = EMBEDDED_REGISTRY_ADDR || state.status?.contracts?.cusipRegistry || "";
    if (!/^0x[a-fA-F0-9]{40}$/.test(regAddr)) {
      statusEl.textContent = "CusipRegistry contract address will be active once deployed on chain 4663.";
      return;
    }
    if (!window.ethereum) {
      statusEl.textContent = "Connect an EVM wallet on Robinhood Chain (4663) to submit an onchain CIK request.";
      return;
    }
    try {
      const cikInt = BigInt(String(document.getElementById("cikNumberInput").value).replace(/\D/g, ""));
      const is13F = document.getElementById("cikIs13FInput").checked;
      const nameStr = document.getElementById("cikNameInput").value.trim();
      const nameBytes = new TextEncoder().encode(nameStr);
      const nameHex = [...nameBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
      const paddedName = nameHex.padEnd(Math.ceil(nameHex.length / 64) * 64 || 64, "0");

      // Selector for requestCikIndex(uint40,bool,string): 0x5337cf22 (verified from CusipRegistry.json)
      const data =
        "0x5337cf22" +
        cikInt.toString(16).padStart(64, "0") +
        (is13F ? "1" : "0").padStart(64, "0") +
        (96).toString(16).padStart(64, "0") +
        nameBytes.length.toString(16).padStart(64, "0") +
        paddedName;

      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_ID_HEX }],
      }).catch(() => {});

      const [from] = await window.ethereum.request({ method: "eth_requestAccounts" });
      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from, to: regAddr, data }],
      });
      statusEl.innerHTML = `Submitted onchain: <a href="https://robinhoodchain.blockscout.com/tx/${txHash}" target="_blank" rel="noopener">${shortAddr(txHash)}</a>`;
    } catch (err) {
      statusEl.textContent = `Transaction aborted: ${err.message}`;
    }
  });

  // Load dataset + live API status
  const [intelRes, statusRes] = await Promise.all([
    fetch("/data/intelligence.json"),
    fetch("/v1/status" + (state.holderWallet ? `?wallet=${encodeURIComponent(state.holderWallet)}` : "")).catch(() => null),
  ]);
  state.intel = await intelRes.json();
  if (statusRes?.ok) {
    state.status = await statusRes.json();
    state.proUnlocked = Boolean(state.status.access?.proUnlocked);
    state.holderBalance = Number(state.status.access?.balanceTokens || 0);
    updateUsClockBanner(state.status.market);
  } else {
    updateUsClockBanner(null);
  }

  if (state.holderWallet) {
    document.getElementById("holderWalletInput").value = state.holderWallet;
  }

  syncContractDisplays();
  syncProBadge();
  renderWireTable();
  renderGapScanner();
  renderFundBooks();
  renderRebalanceView();
  renderDirectory();
}

init();
