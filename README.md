# CUSIP (`$CUSIPS`) — AI SEC EDGAR Indexer on Robinhood Chain

- **Terminal:** https://cusipstocks.com
- **X:** https://x.com/cusiprobinhood
- **Source:** https://github.com/Cusip-Robinhood/cusip

**CUSIP** is an autonomous AI data intelligence and SEC EDGAR indexing engine that resolves public corporate disclosures (**Form 4**, **Schedule 13D/13G**, and **Form 13F-HR**) directly to **203 live ERC-20 stock tokens** on **Robinhood Chain (`4663`)** via their canonical 9-character CUSIP security identifier.

## Why It Matters (Empirical Findings from Indexed Filings)

1. **95.8% Off-Hours Structural Advantage (`252 / 263` Form 4s):** Corporate legal teams submit almost all Form 4 insider disclosures after `16:00 ET` when NYSE and Nasdaq are closed. Matched ERC-20 stock tokens on Robinhood Chain settle 24/7.
2. **75.3% `10b5-1` Noise Stripping (`198 / 263` Form 4s):** Three-quarters of raw Form 4 filings are pre-arranged `Rule 10b5-1` sales scheduled months in advance. CUSIP separates routine sales from discretionary open-market buys (`Code P`) and multi-insider **Cluster Buys** (`$APLD`, `$GLXY`, `$BA`, `$NBIS`).
3. **13F Institutional Sleeve Replication:** Computes exact tokenizable coverage across 6 major 13F books (up to `82.7%` for Appaloosa Management) and calculates read-only `Multicall3` wallet similarity + USD rebalance legs.

## `$CUSIPS` Token Utility & Onchain Architecture

- **Non-Custodial Pro Gate (`500,000 $CUSIPS`, `0.05%` of supply):** Archive filings (`>24h`) are open to everyone. Holding `>= 500,000 $CUSIPS` on Robinhood Chain (checked read-only via `balanceOf`, zero custody or approvals) unlocks `<24h` real-time EDGAR signals, off-hours gap alerts, and full 15-leg 13F rebalance plans.
- **`CusipRegistry.sol` (Sourcify `exact_match` on Chain `4663`):** Stores canonical `bytes9 cusip -> address stockToken` records, cryptographic `keccak256` snapshot attestations (`attestSnapshot`), and the holder-gated `requestCikIndex(cik, is13F, entityName)` + `boostCikPriority` burn queue.
- **AI Agent & MCP Feed (`/v1/mcp/manifest.json`):** Machine-readable JSON & MCP endpoints for autonomous agents querying CUSIP-to-ERC20 mappings, off-hours Form 4 signals, and 13F rebalance plans.

## Repository Structure

```text
contracts/
  CusipRegistry.sol      Onchain CUSIP->ERC20 registry, snapshot attestations & holder CIK queue
  compile.mjs            Compiles with solc 0.8.24 (optimizer 200, viaIR, cancun) for Sourcify v2
  test.mjs               Verifies ABI selectors, EIP-170 size & CUSIP calldata
scripts/
  sync-edgar.mjs         Live SEC EDGAR & Robinhood Chain asset synchronization
worker/
  src/index.js           Cloudflare Worker API (/v1/status, /v1/equities, /v1/signals, /v1/rebalance, /v1/mcp/manifest.json, /rpc)
  dev-server.mjs         Local zero-dependency dev server
  test-api.mjs           API & Freemium gating test suite
site/
  index.html, style.css, app.js   Institutional 5-view terminal UI
brand/
  render-brand.mjs       Generates SVG + PNG brand assets (avatar, X header, OG share card)
```

## Quick Start

```bash
npm run compile       # Compile CusipRegistry.sol
npm test              # Run contract verification tests
npm run build:data    # Build intelligence.json + keccak256 snapshotRoot
npm run brand         # Render SVG/PNG brand assets
npm run dev           # Start local terminal + API on http://localhost:8788
```

## License

MIT
