// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/**
 * @title CusipRegistry
 * @notice On-chain CUSIP-to-ERC20 stock token directory, cryptographic SEC EDGAR filing
 *         snapshot attestations, and $CUSIP holder-gated CIK indexing queue on Robinhood Chain (4663).
 */
contract CusipRegistry {
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant MAX_PRO_THRESHOLD = 5_000_000 ether; // Hard cap: max 0.5% of 1B supply

    struct EquityRecord {
        address stockToken;     // Robinhood Chain (4663) ERC-20 equity token
        address chainlinkFeed;  // Optional USD 8-decimal Chainlink feed on 4663
        uint40 cik;             // SEC Central Index Key (10-digit integer)
        bytes8 symbol;          // ASCII ticker, e.g. "NVDA", "INTC", "GME"
        bool active;
    }

    struct FilingAttestation {
        bytes32 snapshotRoot;       // keccak256 digest of indexed Form 4 + 13F batch
        uint64 attestedAt;          // Block timestamp on Robinhood Chain
        uint64 latestFilingTs;      // Newest SEC EDGAR acceptance timestamp in batch
        uint32 form4Count;          // Total open-market Form 4 filings in window
        uint32 discretionaryBuys;   // Non-10b5-1 open-market insider buys (Code P)
        uint32 afterHoursSignals;   // Filings accepted outside 09:30-16:00 ET
        string datasetRef;          // Verifiable URI / version tag
    }

    struct CikIndexRequest {
        uint40 cik;
        bool is13F;                 // true = 13F institutional manager, false = Form 4 issuer
        bool isIndexed;             // Marked true once EDGAR daemon ingests the CIK
        uint32 requestCount;        // Distinct holder requests
        uint64 firstRequestedAt;
        uint64 lastUpdatedAt;
        address lastRequester;
        uint256 burnedBoost;        // Optional $CUSIP burned to DEAD to prioritize this CIK
        string entityName;
    }

    address public owner;
    address public indexer;
    address public cusipToken;      // Bound once at $CUSIP launch on Pons
    uint256 public minProBalance;   // Default 500,000 $CUSIP (0.05% of 1B supply)
    uint256 public totalRegistryBurned;

    mapping(bytes9 => EquityRecord) public equitiesByCusip;
    mapping(bytes8 => bytes9) public cusipBySymbol;
    bytes9[] public registeredCusips;

    FilingAttestation[] public attestations;

    mapping(uint40 => uint256) public cikSlotPlusOne; // 1-based index into cikQueue
    CikIndexRequest[] public cikQueue;

    error Unauthorized();
    error ZeroAddress();
    error TokenAlreadyBound();
    error ThresholdTooHigh();
    error InsufficientCusipBalance(uint256 held, uint256 required);
    error InvalidInput();
    error BurnTransferFailed();

    event CusipTokenBound(address indexed token, uint256 minProBalance);
    event MinProBalanceUpdated(uint256 oldThreshold, uint256 newThreshold);
    event IndexerUpdated(address indexed oldIndexer, address indexed newIndexer);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event EquityRegistered(bytes9 indexed cusip, bytes8 indexed symbol, address indexed stockToken, uint40 cik, address feed);
    event SnapshotAttested(
        uint256 indexed attestationId,
        bytes32 indexed snapshotRoot,
        uint32 form4Count,
        uint32 discretionaryBuys,
        uint32 afterHoursSignals,
        uint64 latestFilingTs
    );
    event CikIndexRequested(
        uint40 indexed cik,
        address indexed requester,
        bool is13F,
        string entityName,
        uint256 holderBalance
    );
    event CikPriorityBoosted(uint40 indexed cik, address indexed burner, uint256 burnedAmount, uint256 totalCikBurned);
    event CikMarkedIndexed(uint40 indexed cik);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyIndexerOrOwner() {
        if (msg.sender != owner && msg.sender != indexer) revert Unauthorized();
        _;
    }

    constructor() {
        owner = msg.sender;
        indexer = msg.sender;
        minProBalance = 500_000 ether;
    }

    /**
     * @notice One-time immutable binding of the $CUSIP token address after Pons curve deployment.
     */
    function bindCusipToken(address token) external onlyOwner {
        if (cusipToken != address(0)) revert TokenAlreadyBound();
        if (token == address(0)) revert ZeroAddress();
        cusipToken = token;
        emit CusipTokenBound(token, minProBalance);
    }

    function setMinProBalance(uint256 newThreshold) external onlyOwner {
        if (newThreshold > MAX_PRO_THRESHOLD) revert ThresholdTooHigh();
        uint256 old = minProBalance;
        minProBalance = newThreshold;
        emit MinProBalanceUpdated(old, newThreshold);
    }

    function setIndexer(address newIndexer) external onlyOwner {
        if (newIndexer == address(0)) revert ZeroAddress();
        address old = indexer;
        indexer = newIndexer;
        emit IndexerUpdated(old, newIndexer);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address old = owner;
        owner = newOwner;
        emit OwnershipTransferred(old, newOwner);
    }

    /**
     * @notice Registers or updates a batch of 9-character CUSIP -> Robinhood Chain stock token mappings.
     */
    function registerEquityBatch(
        bytes9[] calldata cusips,
        bytes8[] calldata symbols,
        address[] calldata stockTokens,
        uint40[] calldata ciks,
        address[] calldata feeds
    ) external onlyIndexerOrOwner {
        uint256 len = cusips.length;
        if (
            len == 0 ||
            len != symbols.length ||
            len != stockTokens.length ||
            len != ciks.length ||
            len != feeds.length
        ) revert InvalidInput();

        for (uint256 i = 0; i < len; ++i) {
            bytes9 c = cusips[i];
            if (c == bytes9(0) || stockTokens[i] == address(0)) revert InvalidInput();
            if (equitiesByCusip[c].stockToken == address(0)) {
                registeredCusips.push(c);
            }
            equitiesByCusip[c] = EquityRecord({
                stockToken: stockTokens[i],
                chainlinkFeed: feeds[i],
                cik: ciks[i],
                symbol: symbols[i],
                active: true
            });
            if (symbols[i] != bytes8(0)) {
                cusipBySymbol[symbols[i]] = c;
            }
            emit EquityRegistered(c, symbols[i], stockTokens[i], ciks[i], feeds[i]);
        }
    }

    /**
     * @notice Anchors a cryptographic digest of the latest SEC EDGAR Form 4 & 13F intelligence snapshot.
     */
    function attestSnapshot(
        bytes32 snapshotRoot,
        uint64 latestFilingTs,
        uint32 form4Count,
        uint32 discretionaryBuys,
        uint32 afterHoursSignals,
        string calldata datasetRef
    ) external onlyIndexerOrOwner returns (uint256 attestationId) {
        if (snapshotRoot == bytes32(0)) revert InvalidInput();
        attestationId = attestations.length;
        attestations.push(
            FilingAttestation({
                snapshotRoot: snapshotRoot,
                attestedAt: uint64(block.timestamp),
                latestFilingTs: latestFilingTs,
                form4Count: form4Count,
                discretionaryBuys: discretionaryBuys,
                afterHoursSignals: afterHoursSignals,
                datasetRef: datasetRef
            })
        );
        emit SnapshotAttested(
            attestationId,
            snapshotRoot,
            form4Count,
            discretionaryBuys,
            afterHoursSignals,
            latestFilingTs
        );
    }

    /**
     * @notice Verifies whether a wallet qualifies for CUSIP Pro live terminal access.
     */
    function checkProAccess(address account)
        public
        view
        returns (bool hasPro, uint256 balance, uint256 required)
    {
        required = minProBalance;
        if (cusipToken == address(0)) {
            return (false, 0, required);
        }
        balance = IERC20Minimal(cusipToken).balanceOf(account);
        hasPro = balance >= required;
    }

    /**
     * @notice Holder-gated on-chain queue: any wallet holding >= minProBalance $CUSIP can enqueue
     *         an institutional 13F manager CIK or corporate issuer CIK for live EDGAR indexing.
     */
    function requestCikIndex(
        uint40 cik,
        bool is13F,
        string calldata entityName
    ) external returns (uint256 queueIndex) {
        if (cik == 0 || bytes(entityName).length == 0 || bytes(entityName).length > 80) {
            revert InvalidInput();
        }
        uint256 held = 0;
        if (cusipToken != address(0)) {
            held = IERC20Minimal(cusipToken).balanceOf(msg.sender);
            if (held < minProBalance) {
                revert InsufficientCusipBalance(held, minProBalance);
            }
        } else if (msg.sender != owner && msg.sender != indexer) {
            revert InsufficientCusipBalance(0, minProBalance);
        }

        uint256 slotPlusOne = cikSlotPlusOne[cik];
        if (slotPlusOne == 0) {
            queueIndex = cikQueue.length;
            cikSlotPlusOne[cik] = queueIndex + 1;
            cikQueue.push(
                CikIndexRequest({
                    cik: cik,
                    is13F: is13F,
                    isIndexed: false,
                    requestCount: 1,
                    firstRequestedAt: uint64(block.timestamp),
                    lastUpdatedAt: uint64(block.timestamp),
                    lastRequester: msg.sender,
                    burnedBoost: 0,
                    entityName: entityName
                })
            );
        } else {
            queueIndex = slotPlusOne - 1;
            CikIndexRequest storage req = cikQueue[queueIndex];
            req.requestCount += 1;
            req.lastUpdatedAt = uint64(block.timestamp);
            req.lastRequester = msg.sender;
        }

        emit CikIndexRequested(cik, msg.sender, is13F, entityName, held);
    }

    /**
     * @notice Optional priority burn: sends `burnAmount` of $CUSIP directly to 0x...dEaD to boost a CIK's priority.
     */
    function boostCikPriority(uint40 cik, uint256 burnAmount) external {
        if (cusipToken == address(0) || burnAmount == 0) revert InvalidInput();
        uint256 slotPlusOne = cikSlotPlusOne[cik];
        if (slotPlusOne == 0) revert InvalidInput();

        bool ok = IERC20Minimal(cusipToken).transferFrom(msg.sender, DEAD, burnAmount);
        if (!ok) revert BurnTransferFailed();

        CikIndexRequest storage req = cikQueue[slotPlusOne - 1];
        req.burnedBoost += burnAmount;
        req.lastUpdatedAt = uint64(block.timestamp);
        totalRegistryBurned += burnAmount;

        emit CikPriorityBoosted(cik, msg.sender, burnAmount, req.burnedBoost);
    }

    function markCikIndexed(uint40 cik) external onlyIndexerOrOwner {
        uint256 slotPlusOne = cikSlotPlusOne[cik];
        if (slotPlusOne == 0) revert InvalidInput();
        cikQueue[slotPlusOne - 1].isIndexed = true;
        cikQueue[slotPlusOne - 1].lastUpdatedAt = uint64(block.timestamp);
        emit CikMarkedIndexed(cik);
    }

    function resolveSymbol(bytes8 symbol) external view returns (bytes9 cusip, EquityRecord memory rec) {
        cusip = cusipBySymbol[symbol];
        rec = equitiesByCusip[cusip];
    }

    function registeredCusipCount() external view returns (uint256) {
        return registeredCusips.length;
    }

    function attestationCount() external view returns (uint256) {
        return attestations.length;
    }

    function latestAttestation() external view returns (FilingAttestation memory att, bool exists) {
        uint256 len = attestations.length;
        if (len == 0) return (att, false);
        return (attestations[len - 1], true);
    }

    function cikQueueLength() external view returns (uint256) {
        return cikQueue.length;
    }
}
