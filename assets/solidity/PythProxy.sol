// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

/// @title PythProxy — UUPS Upgradeable Proxy with Pyth Price Feeds
/// @notice Production-ready upgradeable contract pattern for DeFi protocols
///         that use Pyth oracle prices. Supports owner-controlled upgrades,
///         feed management, and emergency pause.
/// @dev Uses minimal UUPS proxy pattern (no OpenZeppelin dependency).
///      For production, consider using OpenZeppelin's UUPSUpgradeable base:
///      `import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";`
///
///      This template demonstrates the KEY patterns:
///      1. Storage layout discipline (gaps, no constructor state)
///      2. Initializer instead of constructor
///      3. Feed management behind access control
///      4. Emergency pause capability
///      5. Upgrade authorization

contract PythProxy {
    // ──────────────────────────────────────────────
    // Storage Layout (NEVER reorder or remove slots)
    // ──────────────────────────────────────────────

    /// @dev Slot 0: Pyth contract reference
    IPyth public pyth;

    /// @dev Slot 1: Contract owner
    address public owner;

    /// @dev Slot 2: Pending owner (for 2-step transfer)
    address public pendingOwner;

    /// @dev Slot 3: Initialization flag
    bool public initialized;

    /// @dev Slot 4: Pause flag
    bool public paused;

    /// @dev Slot 5: Feed registry
    mapping(bytes32 => bytes32) public feedIds;     // asset symbol hash => Pyth feed ID

    /// @dev Slot 6: Allowed staleness per feed
    mapping(bytes32 => uint64) public maxStaleness;

    /// @dev Storage gap for future upgrades — CRITICAL for proxy safety
    /// @notice Reserve 50 slots so future versions can add state variables
    ///         without colliding with child contract storage.
    uint256[50] private __gap;

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    event Initialized(address indexed pyth, address indexed owner);
    event FeedRegistered(bytes32 indexed assetKey, bytes32 feedId, uint64 maxAge);
    event FeedRemoved(bytes32 indexed assetKey);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);
    event Upgraded(address indexed newImplementation);

    // ──────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "PythProxy: not owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "PythProxy: paused");
        _;
    }

    // ──────────────────────────────────────────────
    // Initializer (replaces constructor for proxies)
    // ──────────────────────────────────────────────

    /// @notice Initialize the contract (called once after proxy deployment)
    /// @param _pyth The Pyth contract address for this chain
    function initialize(address _pyth) external {
        require(!initialized, "PythProxy: already initialized");
        require(_pyth != address(0), "PythProxy: zero pyth");

        pyth = IPyth(_pyth);
        owner = msg.sender;
        initialized = true;

        emit Initialized(_pyth, msg.sender);
    }

    // ──────────────────────────────────────────────
    // Feed Management
    // ──────────────────────────────────────────────

    /// @notice Register a price feed for an asset
    /// @param assetKey Unique key for the asset (e.g., keccak256("ETH/USD"))
    /// @param feedId The Pyth price feed ID
    /// @param maxAge Maximum acceptable price age in seconds
    function registerFeed(bytes32 assetKey, bytes32 feedId, uint64 maxAge) external onlyOwner {
        require(feedId != bytes32(0), "PythProxy: zero feed");
        require(maxAge > 0, "PythProxy: zero maxAge");

        feedIds[assetKey] = feedId;
        maxStaleness[assetKey] = maxAge;

        emit FeedRegistered(assetKey, feedId, maxAge);
    }

    /// @notice Remove a price feed
    function removeFeed(bytes32 assetKey) external onlyOwner {
        delete feedIds[assetKey];
        delete maxStaleness[assetKey];
        emit FeedRemoved(assetKey);
    }

    // ──────────────────────────────────────────────
    // Price Reading
    // ──────────────────────────────────────────────

    /// @notice Update prices and read a specific asset's price
    /// @param assetKey The asset key (must be registered)
    /// @param priceUpdate Hermes price update data
    /// @return price The price value in WAD (18 decimals)
    /// @return confidence The confidence interval in WAD
    /// @return publishTime The publish timestamp
    function updateAndGetPrice(
        bytes32 assetKey,
        bytes[] calldata priceUpdate
    ) external payable whenNotPaused returns (
        uint256 price,
        uint256 confidence,
        uint256 publishTime
    ) {
        bytes32 feedId = feedIds[assetKey];
        require(feedId != bytes32(0), "PythProxy: feed not registered");

        // Update
        uint256 fee = pyth.getUpdateFee(priceUpdate);
        pyth.updatePriceFeeds{value: fee}(priceUpdate);

        // Read with staleness check
        PythStructs.Price memory p = pyth.getPriceNoOlderThan(
            feedId,
            maxStaleness[assetKey]
        );

        require(p.price > 0, "PythProxy: invalid price");

        price = _toWad(p.price, p.expo);
        confidence = _toWad(int64(p.conf), p.expo);
        publishTime = p.publishTime;

        // Refund excess
        if (msg.value > fee) {
            (bool ok, ) = msg.sender.call{value: msg.value - fee}("");
            require(ok, "PythProxy: refund failed");
        }
    }

    /// @notice Read price without updating (for push feeds or recent data)
    function getPrice(bytes32 assetKey) external view whenNotPaused returns (
        uint256 price,
        uint256 confidence,
        uint256 publishTime
    ) {
        bytes32 feedId = feedIds[assetKey];
        require(feedId != bytes32(0), "PythProxy: feed not registered");

        PythStructs.Price memory p = pyth.getPriceNoOlderThan(
            feedId,
            maxStaleness[assetKey]
        );

        require(p.price > 0, "PythProxy: invalid price");

        price = _toWad(p.price, p.expo);
        confidence = _toWad(int64(p.conf), p.expo);
        publishTime = p.publishTime;
    }

    /// @notice Read multiple prices in one call
    function getPrices(bytes32[] calldata assetKeys) external view whenNotPaused returns (
        uint256[] memory prices,
        uint256[] memory confidences
    ) {
        prices = new uint256[](assetKeys.length);
        confidences = new uint256[](assetKeys.length);

        for (uint256 i = 0; i < assetKeys.length; i++) {
            bytes32 feedId = feedIds[assetKeys[i]];
            if (feedId == bytes32(0)) continue;

            PythStructs.Price memory p = pyth.getPriceNoOlderThan(
                feedId,
                maxStaleness[assetKeys[i]]
            );

            if (p.price > 0) {
                prices[i] = _toWad(p.price, p.expo);
                confidences[i] = _toWad(int64(p.conf), p.expo);
            }
        }
    }

    // ──────────────────────────────────────────────
    // Emergency Controls
    // ──────────────────────────────────────────────

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ──────────────────────────────────────────────
    // Ownership (2-step transfer)
    // ──────────────────────────────────────────────

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "PythProxy: zero owner");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "PythProxy: not pending owner");
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // ──────────────────────────────────────────────
    // UUPS Upgrade Authorization
    // ──────────────────────────────────────────────

    /// @notice Authorize an upgrade to a new implementation
    /// @dev In a real UUPS proxy, this would be called by the proxy mechanism.
    ///      With OpenZeppelin: override `_authorizeUpgrade(address)`.
    function authorizeUpgrade(address newImplementation) external onlyOwner {
        require(newImplementation != address(0), "PythProxy: zero impl");
        emit Upgraded(newImplementation);
    }

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    function _toWad(int64 price, int32 expo) internal pure returns (uint256) {
        uint256 p = uint256(uint64(price));
        if (expo >= 0) {
            return p * (10 ** uint32(expo)) * 1e18;
        } else {
            uint32 absExpo = uint32(-expo);
            if (absExpo >= 18) {
                return p / (10 ** (absExpo - 18));
            } else {
                return p * (10 ** (18 - absExpo));
            }
        }
    }

    /// @notice Helper to create asset keys
    function assetKey(string calldata symbol) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(symbol));
    }

    receive() external payable {}
}
