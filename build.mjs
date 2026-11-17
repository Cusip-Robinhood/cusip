// Multi-page static site builder for CUSIP ($CUSIPS) — https://cusipstocks.com
// Generates 6 standalone HTML pages in site/:
//   1. index.html      — Live SEC Form 4 & Schedule 13D/G Wire + Overview
//   2. gap.html        — 24/7 Off-Hours Arbitrage Scanner & Cluster Buys
//   3. books.html      — Institutional 13F-HR Fund Books & QoQ Redline Diffs
//   4. rebalance.html  — Read-Only Chain 4663 Wallet Scanner & 13F Rebalance Calculator
//   5. directory.html  — Complete 203-Asset CUSIP-to-ERC20 Stock Token Directory
//   6. token.html      — $CUSIPS Utility, Sourcify-Verified CusipRegistry.sol & MCP API

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.join(HERE, "site");
mkdirSync(SITE_DIR, { recursive: true });

const SITE_ORIGIN = "https://cusipstocks.com";
const TOKEN_CA_TEXT = "0x01db7687276EAe013F287edcb904960116462357";
const REGISTRY_ADDR = "0x413c216228d4559daf2af1723a73f16613d586a7";

const NAV_ITEMS = [
  { id: "wire", href: "/", file: "index.html", label: "Form 4 Wire" },
  { id: "gap", href: "/gap", file: "gap.html", label: "24/7 Off-Hours" },
  { id: "books", href: "/books", file: "books.html", label: "13F Fund Books" },
  { id: "rebalance", href: "/rebalance", file: "rebalance.html", label: "Wallet & Rebalance" },
  { id: "directory", href: "/directory", file: "directory.html", label: "203 Stock Tokens" },
  { id: "token", href: "/token", file: "token.html", label: "$CUSIPS & Registry" },
];

function renderPage({ pageId, canonicalPath, title, description, heroHtml, mainHtml }) {
  const navLinks = NAV_ITEMS.map(
    (item) =>
      `<a href="${item.href}" class="tab-btn${item.id === pageId ? " active" : ""}">${item.label}</a>`
  ).join("\n        ");

  return `<!DOCTYPE html>
<html lang="en" data-page="${pageId}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${SITE_ORIGIN}${canonicalPath}" />
  <meta property="og:image" content="${SITE_ORIGIN}/og-card.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@cusiprobinhood" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${SITE_ORIGIN}/og-card.png" />
  <link rel="canonical" href="${SITE_ORIGIN}${canonicalPath}" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <!-- Live Institutional Session & Contract Strip -->
  <div class="top-strip">
    <div class="wrap strip-inner">
      <div class="strip-left">
        <span class="pulse-dot"></span>
        <span class="mono-tag">CHAIN 4663 · 24/7 SETTLEMENT</span>
        <span class="sep">|</span>
        <span id="usSessionBadge" class="session-pill">US EQUITIES: CHECKING ET...</span>
        <span class="sep hide-sm">|</span>
        <span class="strip-stat hide-sm"><strong>95.8%</strong> Form 4s filed off-hours</span>
        <span class="sep hide-md">|</span>
        <span class="strip-stat hide-md"><strong>75.3%</strong> 10b5-1 noise stripped</span>
      </div>
      <div class="strip-right">
        <span class="ca-label">$CUSIPS CA:</span>
        <code id="headerCaText" class="ca-code">${TOKEN_CA_TEXT}</code>
        <button id="copyCaBtn" class="btn-micro" type="button">Copy</button>
      </div>
    </div>
  </div>

  <!-- Multi-Page Site Header -->
  <header class="site-header">
    <div class="wrap header-inner">
      <a href="/" class="brand-lockup">
        <img src="/mark.svg" alt="CUSIP mark" class="brand-mark" width="38" height="38" />
        <div>
          <div class="brand-title">CUSIP <span class="brand-ticker">$CUSIPS</span></div>
          <div class="brand-sub">SEC EDGAR AI Indexer · Robinhood Chain</div>
        </div>
      </a>

      <nav class="desk-tabs" aria-label="Primary Navigation">
        ${navLinks}
      </nav>

      <div class="pro-wallet-box">
        <a href="https://x.com/cusiprobinhood" target="_blank" rel="noopener" class="btn-outline">X · @cusiprobinhood</a>
        <a href="https://github.com/Cusip-Robinhood/cusip" target="_blank" rel="noopener" class="btn-outline hide-sm">GitHub</a>
        <div id="proBadge" class="pro-pill locked" title="Hold 500,000 $CUSIPS on Robinhood Chain (read-only balanceOf) to unlock <24h live EDGAR filings & full 13F rebalance execution.">
          FREE · &gt;24H
        </div>
        <button type="button" id="verifyHolderBtn" class="btn-outline">Verify $CUSIPS</button>
      </div>
    </div>
  </header>

  <!-- Shared Non-Custodial Holder Verifier Drawer -->
  <section id="holderDrawer" class="holder-drawer hidden">
    <div class="wrap drawer-inner">
      <div class="drawer-copy">
        <h3>Non-Custodial <code>$CUSIPS</code> Pro Verification</h3>
        <p>Paste any Robinhood Chain wallet or connect MetaMask/Rabby. We only call <code>balanceOf</code> on chain <code>4663</code> — zero approvals, zero signatures, zero custody. Holding <strong>&ge; 500,000 $CUSIPS</strong> (0.05% of supply) unlocks real-time <code>&lt;24h</code> Form 4 signals, full 15-leg 13F rebalance plans, and onchain CIK indexing requests.</p>
      </div>
      <div class="drawer-controls">
        <input id="holderWalletInput" type="text" class="mono-input" placeholder="0x... Robinhood Chain wallet address" spellcheck="false" />
        <button type="button" id="checkBalanceBtn" class="btn-primary">Check Balance</button>
        <button type="button" id="connectWalletBtn" class="btn-secondary">Connect EVM</button>
      </div>
      <div id="holderCheckStatus" class="drawer-status"></div>
    </div>
  </section>

  ${heroHtml}

  <main class="wrap main-desk">
    ${mainHtml}
  </main>

  <footer class="site-footer">
    <div class="wrap footer-inner">
      <p><strong>CUSIP ($CUSIPS)</strong> indexes public SEC EDGAR disclosures (Form 4, Schedule 13D/13G, Form 13F-HR) and maps 9-character CUSIP identifiers to ERC-20 stock tokens on Robinhood Chain (4663). Read-only analytical software; not investment advice. Unaffiliated with the SEC, CUSIP Global Services, Robinhood, or any listed issuer.</p>
      <div class="footer-links">
        <a href="/">Wire</a>
        <a href="/gap">Off-Hours</a>
        <a href="/books">13F Books</a>
        <a href="/rebalance">Rebalance</a>
        <a href="/directory">Directory</a>
        <a href="/token">$CUSIPS</a>
        <a href="https://github.com/Cusip-Robinhood/cusip" target="_blank" rel="noopener">GitHub</a>
        <a href="https://x.com/cusiprobinhood" target="_blank" rel="noopener">X (@cusiprobinhood)</a>
      </div>
    </div>
  </footer>

  <script type="module" src="/app.js"></script>
</body>
</html>
`;
}

// 1. INDEX.HTML — Form 4 & 13D Wire + Overview
writeFileSync(
  path.join(SITE_DIR, "index.html"),
  renderPage({
    pageId: "wire",
    canonicalPath: "/",
    title: "CUSIP ($CUSIPS) — AI SEC EDGAR Indexer & 24/7 Equity Token Terminal on Robinhood Chain",
    description:
      "CUSIP ($CUSIPS) strips out 75.3% 10b5-1 insider noise and resolves SEC Form 4 buys, Cluster Buys, and 13F books by 9-char CUSIP to 203 24/7 stock tokens on Robinhood Chain (4663).",
    heroHtml: `<section class="hero-band">
    <div class="wrap">
      <div class="hero-grid">
        <div class="hero-main">
          <div class="eyebrow">9-CHAR SEC IDENTIFIER &rarr; 24/7 ERC-20 EQUITY CONTRACT</div>
          <h1>Institutional SEC Filings, Resolved to Onchain Stock Tokens.</h1>
          <p class="hero-lead">
            Every US security in an SEC <strong>Form 4</strong> or <strong>13F-HR</strong> carries a 9-character <strong>CUSIP</strong> — the exact identifier embedded inside Robinhood Chain stock tokens. CUSIP strips out pre-scheduled <code>10b5-1</code> insider auto-sales, scores genuine open-market conviction buys, and maps them 1:1 to <strong>203 live ERC-20 stock tokens</strong> trading 24/7 while Nasdaq is closed.
          </p>
          <div class="hero-cta-row">
            <a href="/gap" class="btn-primary">Explore 24/7 Off-Hours Gap &rarr;</a>
            <a href="/rebalance" class="btn-secondary">Scan Wallet vs 13F Books</a>
            <a href="/token" class="btn-outline">$CUSIPS &amp; Verified Registry</a>
          </div>
        </div>
        <div class="kpi-grid">
          <a href="/directory" class="kpi-card link-card">
            <span class="kpi-label">Chain 4663 Stock Tokens</span>
            <strong class="kpi-val">203</strong>
            <span class="kpi-foot">Mapped by 9-char CUSIP + CIK &rarr;</span>
          </a>
          <a href="/gap" class="kpi-card link-card">
            <span class="kpi-label">Off-Hours SEC Filings</span>
            <strong class="kpi-val accent-amber">95.8%</strong>
            <span class="kpi-foot">252 / 263 filed while US closed &rarr;</span>
          </a>
          <a href="/books" class="kpi-card link-card">
            <span class="kpi-label">Appaloosa 13F Onchain</span>
            <strong class="kpi-val accent-emerald">82.7%</strong>
            <span class="kpi-foot">6 billionaire books indexed &rarr;</span>
          </a>
          <a href="/token" class="kpi-card link-card">
            <span class="kpi-label">10b5-1 Noise Stripped</span>
            <strong class="kpi-val">75.3%</strong>
            <span class="kpi-foot">198 auto-sales filtered out &rarr;</span>
          </a>
        </div>
      </div>
    </div>
  </section>`,
    mainHtml: `<div class="toolbar">
      <div class="filter-pills" id="wireFilterGroup">
        <button type="button" class="pill active" data-filter="conviction">Discretionary Buys (Code P)</button>
        <button type="button" class="pill" data-filter="clusters">Cluster Buys (2+ Insiders)</button>
        <button type="button" class="pill" data-filter="stakes">5%+ Stakes (13D / 13G)</button>
        <button type="button" class="pill" data-filter="all">All Filings (incl. 10b5-1)</button>
      </div>
      <div class="search-wrap">
        <input id="wireSearch" type="search" class="mono-input" placeholder="Filter by CUSIP (458140100), ticker ($INTC, $GME), or insider..." />
      </div>
    </div>

    <div class="notice-banner" id="freemiumBanner">
      <div>
        <strong>Freemium Live Gate:</strong> Archive filings (<code>&gt;24h</code>) are 100% open with raw SEC XML &amp; Blockscout contract links. Real-time filings in the newest window carry a <code>PRO &lt;24H</code> lock and unredact automatically when your wallet holds <strong>&ge; 500,000 $CUSIPS</strong>.
      </div>
      <button type="button" class="btn-micro" id="bannerUnlockBtn">Unlock &lt;24h Wire</button>
    </div>

    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>AI Score</th>
            <th>Signal</th>
            <th>CUSIP-9 / Ticker</th>
            <th>Insider / Filer</th>
            <th class="num">Size (USD)</th>
            <th>US Market Session</th>
            <th>Chain 4663 Token &amp; SEC</th>
          </tr>
        </thead>
        <tbody id="wireTableBody"></tbody>
      </table>
    </div>`,
  })
);

// 2. GAP.HTML — 24/7 Off-Hours Arbitrage Scanner
writeFileSync(
  path.join(SITE_DIR, "gap.html"),
  renderPage({
    pageId: "gap",
    canonicalPath: "/gap.html",
    title: "24/7 Off-Hours SEC EDGAR Gap Scanner — CUSIP ($CUSIPS)",
    description:
      "252 of 263 recent Form 4 filings dropped after NYSE/Nasdaq closed. Inspect off-hours executive buys & multi-insider Cluster Buys matched to 24/7 stock tokens on Robinhood Chain.",
    heroHtml: `<section class="page-banner">
    <div class="wrap banner-flex">
      <div>
        <div class="eyebrow">STRUCTURAL VENUE EDGE · AFTER 16:00 ET</div>
        <h1>24/7 Off-Hours EDGAR Arbitrage Window</h1>
        <p class="hero-lead">Corporate legal desks submit Form 4 and Schedule 13D disclosures after the <code>16:00 ET</code> closing bell. Traditional equity venues freeze until <code>09:30 ET</code> (or Monday morning), while Robinhood Chain ERC-20 stock tokens settle spot swaps 24/7.</p>
      </div>
      <div class="gap-callout">
        <span class="mono-tag">EMPIRICAL WINDOW</span>
        <strong>252 of 263 (95.8%)</strong> recent Form 4 filings hit SEC EDGAR outside regular US market hours.
      </div>
    </div>
  </section>`,
    mainHtml: `<h2 class="sec-h2">Multi-Executive Cluster Buys (14-Day Window)</h2>
    <div class="cluster-cards" id="clusterSpotlight"></div>

    <h2 class="sec-h2">Off-Hours Discretionary Filings (Nasdaq Closed &middot; Chain 4663 Open)</h2>
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Accepted (ET)</th>
            <th>Nasdaq State</th>
            <th>Signal</th>
            <th>CUSIP-9 / Ticker</th>
            <th>Executive &amp; Role</th>
            <th class="num">Open-Market USD</th>
            <th>24/7 Onchain Contract</th>
          </tr>
        </thead>
        <tbody id="gapTableBody"></tbody>
      </table>
    </div>`,
  })
);

// 3. BOOKS.HTML — Institutional 13F-HR Fund Books
writeFileSync(
  path.join(SITE_DIR, "books.html"),
  renderPage({
    pageId: "books",
    canonicalPath: "/books.html",
    title: "SEC Form 13F-HR Institutional Fund Books & Redline Diffs — CUSIP ($CUSIPS)",
    description:
      "Track Appaloosa (David Tepper), Duquesne (Stan Druckenmiller), Pershing Square, Berkshire Hathaway, ARK, and Bridgewater 13F holdings matched by CUSIP to Robinhood Chain stock tokens.",
    heroHtml: `<section class="page-banner">
    <div class="wrap banner-flex">
      <div>
        <div class="eyebrow">SEC FORM 13F-HR · QUARTER-OVER-QUARTER REDLINE</div>
        <h1>Institutional Hedge Fund Books on Chain 4663</h1>
        <p class="hero-lead">Every reported spot equity position across six major institutional managers, matched by 9-character CUSIP to Robinhood Chain ERC-20 stock tokens with quarter-over-quarter <code>NEW / ADD / TRIM / EXIT</code> diffs.</p>
      </div>
      <a href="/rebalance" class="btn-primary">Mirror a Fund with Your Wallet &rarr;</a>
    </div>
  </section>`,
    mainHtml: `<div class="fund-selector" id="fundSelector"></div>
    <div id="fundDetailHeader" class="fund-summary-bar"></div>

    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>CUSIP-9</th>
            <th>Issuer</th>
            <th class="num">Book Weight</th>
            <th class="num">Position Value</th>
            <th>QoQ Redline</th>
            <th>Chain 4663 Stock Token</th>
          </tr>
        </thead>
        <tbody id="fundHoldingsBody"></tbody>
      </table>
    </div>

    <div id="fundExitsBox" class="exits-panel"></div>`,
  })
);

// 4. REBALANCE.HTML — Read-Only Wallet Match & 13F Rebalance Builder
writeFileSync(
  path.join(SITE_DIR, "rebalance.html"),
  renderPage({
    pageId: "rebalance",
    canonicalPath: "/rebalance.html",
    title: "Wallet Match & 13F Rebalance Calculator — CUSIP ($CUSIPS)",
    description:
      "Scan any Robinhood Chain wallet via read-only Multicall3 across 203 stock tokens, measure cosine similarity to billionaire 13F books, and compute exact USD rebalance legs.",
    heroHtml: `<section class="page-banner">
    <div class="wrap">
      <div class="eyebrow">READ-ONLY MULTICALL3 · ZERO SIGNATURES REQUIRED</div>
      <h1>Wallet Similarity &amp; 13F Sleeve Rebalancer</h1>
      <p class="hero-lead">Reads all 203 ERC-20 stock-token balances on Robinhood Chain in a single <code>Multicall3</code> read call, scores your wallet's cosine similarity against 6 institutional 13F books, and computes exact token-by-token <code>BUY / TRIM</code> deltas.</p>
    </div>
  </section>`,
    mainHtml: `<div class="rebalance-controls">
      <div class="field-group grow">
        <label for="scanWalletInput">Robinhood Chain Wallet (Read-Only) or Preset Demo</label>
        <div class="input-row">
          <input id="scanWalletInput" type="text" class="mono-input" placeholder="0x... paste any wallet on chain 4663" spellcheck="false" />
          <button type="button" id="runWalletScanBtn" class="btn-primary">Scan Chain 4663</button>
          <button type="button" id="loadSampleWalletBtn" class="btn-secondary">Simulate $4.2K Tech Bag</button>
        </div>
      </div>
      <div class="field-group">
        <label for="targetFundSelect">Target 13F Sleeve</label>
        <select id="targetFundSelect" class="mono-select"></select>
      </div>
      <div class="field-group">
        <label for="extraBudgetInput">Added Capital (USD)</label>
        <input id="extraBudgetInput" type="number" class="mono-input w-sm" value="2500" min="0" step="100" />
      </div>
    </div>

    <div id="walletScanStatus" class="scan-status"></div>
    <div class="similarity-grid" id="similarityGrid"></div>

    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Action</th>
            <th>CUSIP-9 / Token</th>
            <th class="num">Target 13F Sleeve %</th>
            <th class="num">Current USD</th>
            <th class="num">Target USD</th>
            <th class="num">Rebalance Delta</th>
            <th>ERC-20 Contract</th>
          </tr>
        </thead>
        <tbody id="rebalanceTableBody"></tbody>
      </table>
    </div>`,
  })
);

// 5. DIRECTORY.HTML — Complete 203-Asset CUSIP Directory
writeFileSync(
  path.join(SITE_DIR, "directory.html"),
  renderPage({
    pageId: "directory",
    canonicalPath: "/directory.html",
    title: "203 Robinhood Chain Stock Tokens Mapped by 9-Char CUSIP — CUSIP ($CUSIPS)",
    description:
      "Search all 203 tokenized equities on Robinhood Chain (4663) by 9-character SEC CUSIP, ticker, SEC CIK, Chainlink USD oracle feed, and ERC-20 contract address.",
    heroHtml: `<section class="page-banner">
    <div class="wrap banner-flex">
      <div>
        <div class="eyebrow">CANONICAL CROSS-REFERENCE · CHAIN ID 4663</div>
        <h1>203 Stock Tokens Mapped by 9-Char CUSIP</h1>
        <p class="hero-lead">Every active tokenized equity and ETF on Robinhood Chain cross-referenced with its 9-character CUSIP security code, 10-digit SEC Central Index Key (<code>CIK</code>), Chainlink USD oracle proxy, and Blockscout contract.</p>
      </div>
      <input id="dirSearchInput" type="search" class="mono-input w-md" placeholder="Search 203 assets (NVDA, 67066G104, 0x...)" />
    </div>
  </section>`,
    mainHtml: `<div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>CUSIP-9</th>
            <th>Ticker</th>
            <th>Issuer / Asset</th>
            <th>SEC CIK</th>
            <th class="num">Ref Price</th>
            <th>Chainlink Feed</th>
            <th>Robinhood Chain ERC-20</th>
          </tr>
        </thead>
        <tbody id="directoryTableBody"></tbody>
      </table>
    </div>`,
  })
);

// 6. TOKEN.HTML — $CUSIPS Utility, Verified CusipRegistry.sol & MCP API
writeFileSync(
  path.join(SITE_DIR, "token.html"),
  renderPage({
    pageId: "token",
    canonicalPath: "/token.html",
    title: "$CUSIPS Token Utility, Sourcify CusipRegistry.sol & MCP API — CUSIP",
    description:
      "Inspect $CUSIPS holder mechanics (500,000 $CUSIPS non-custodial Pro gate), Sourcify exact_match verified CusipRegistry.sol on Robinhood Chain (4663), and AI/MCP endpoints.",
    heroHtml: `<section class="page-banner">
    <div class="wrap">
      <div class="eyebrow">NON-CUSTODIAL UTILITY · SOURCIFY EXACT_MATCH ON CHAIN 4663</div>
      <h1><code>$CUSIPS</code> Token Mechanics &amp; Onchain Registry</h1>
      <p class="hero-lead">Zero staking lockups, zero token approvals for terminal access. Pro intelligence features check your live <code>$CUSIPS</code> balance directly on Robinhood Chain via <code>balanceOf</code>, while <code>CusipRegistry.sol</code> anchors CUSIP mappings and holder CIK requests onchain.</p>
    </div>
  </section>`,
    mainHtml: `<div class="registry-grid">
      <div class="card">
        <div class="eyebrow">WHY TRADERS &amp; QUANTS HOLD $CUSIPS</div>
        <h2>Four Concrete Holder Edges</h2>
        <ul class="spec-list">
          <li><strong>1. Real-Time &lt;24h EDGAR Wire &amp; Off-Hours Alerts:</strong> Guests browse the verified <code>&gt;24h</code> archive free. Holding <strong>500,000 $CUSIPS</strong> (<code>0.05%</code> of 1B fixed supply, verified read-only via <code>balanceOf</code>) unlocks zero-delay Form 4 filings and off-hours gap signals the moment they hit EDGAR.</li>
          <li><strong>2. Full 15-Leg 13F Rebalance Matrix:</strong> Unlocks all token-by-token <code>BUY / TRIM</code> deltas and share-multiplier adjustments on <a href="/rebalance">Wallet &amp; Rebalance</a>.</li>
          <li><strong>3. Onchain <code>CusipRegistry.sol</code> CIK Queue:</strong> Holders invoke <code>requestCikIndex(cik, is13F, entityName)</code> directly on chain <code>4663</code> (and optionally burn <code>$CUSIPS</code> to <code>0x...dEaD</code> via <code>boostCikPriority</code>) to enqueue new hedge funds or issuers into our EDGAR indexer.</li>
          <li><strong>4. AI Agent &amp; MCP Data Endpoints:</strong> Autonomous trading agents query <code>/v1/equities</code>, <code>/v1/signals</code>, and <code>/v1/mcp/manifest.json</code> directly with holder wallet verification for machine-readable EDGAR conviction feeds.</li>
        </ul>

        <div class="contract-meta-box">
          <div><span>$CUSIPS Token (4663):</span> <code id="regTokenCa">${TOKEN_CA_TEXT}</code></div>
          <div><span>CusipRegistry (Sourcify exact_match):</span> <a href="https://robinhoodchain.blockscout.com/address/${REGISTRY_ADDR}" target="_blank" rel="noopener"><code id="regContractAddr">${REGISTRY_ADDR}</code></a> &middot; <a href="https://repo.sourcify.dev/4663/${REGISTRY_ADDR}" target="_blank" rel="noopener">Sourcify Proof</a></div>
          <div><span>Snapshot Root (keccak256):</span> <code id="regSnapshotRoot">Loading...</code></div>
        </div>
      </div>

      <div class="card">
        <div class="eyebrow">ONCHAIN HOLDER QUEUE · CUSIPREGISTRY.SOL</div>
        <h2>Enqueue SEC CIK Onchain</h2>
        <p class="card-sub">Submit any 10-digit SEC Central Index Key (e.g. <code>0001061768</code> Baupost, <code>0001037389</code> Renaissance, <code>0001167483</code> Tiger Global) directly to <code>CusipRegistry.requestCikIndex</code> on Robinhood Chain.</p>

        <form id="cikRequestForm" class="stack-form">
          <label>
            <span>SEC CIK Number</span>
            <input id="cikNumberInput" type="text" class="mono-input" placeholder="0001037389" required />
          </label>
          <label>
            <span>Fund or Issuer Name</span>
            <input id="cikNameInput" type="text" class="mono-input" placeholder="Renaissance Technologies LLC" required maxlength="80" />
          </label>
          <label class="row-check">
            <input id="cikIs13FInput" type="checkbox" checked />
            <span>Institutional 13F-HR Manager (uncheck for Corporate Form 4 Issuer)</span>
          </label>
          <button type="submit" class="btn-primary">Submit Onchain via Wallet (4663)</button>
          <div id="cikTxStatus" class="drawer-status"></div>
        </form>

        <div class="api-box">
          <div class="eyebrow">AI AGENT &amp; MCP ENDPOINTS</div>
          <pre class="code-block">GET  /v1/status
GET  /v1/equities?q=458140100
GET  /v1/signals?type=buy&amp;discretionary=true&amp;wallet=0x...
POST /v1/rebalance
GET  /v1/mcp/manifest.json</pre>
        </div>
      </div>
    </div>`,
  })
);

console.log("Built 6 standalone HTML pages -> site/{index,gap,books,rebalance,directory,token}.html");
