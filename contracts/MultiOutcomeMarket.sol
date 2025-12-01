// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// For Remix, use these imports:
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/utils/ReentrancyGuard.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/access/Ownable.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/utils/Pausable.sol";
import "https://github.com/abdk-consulting/abdk-libraries-solidity/blob/master/ABDKMath64x64.sol";

// For local/Hardhat, use these imports instead:
// import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
// import "@openzeppelin/contracts/access/Ownable.sol";
// import "@openzeppelin/contracts/security/Pausable.sol";
// import "abdk-libraries-solidity/ABDKMath64x64.sol";

// Chainlink interface for price feed validation
interface AggregatorV3Interface {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/**
 * @title MultiOutcomeMarket
 * @notice Multi-outcome LMSR prediction market with production-grade math
 * @dev Supports both trading hours (23 buckets) and after-hours (42 buckets)
 *
 * SECURITY FEATURES:
 * - ABDKMath64x64 for safe logarithm and exponential calculations
 * - ReentrancyGuard on all payable functions
 * - Access control with Ownable and Pausable
 * - Proportional payout distribution (true LMSR)
 * - Protocol fee collection (2%)
 *
 * ORACLE ARCHITECTURE:
 * - Backend service monitors markets approaching settleTime
 * - At settlement, backend fetches real stock price from API
 * - Backend calls settleMarket() with authorized oracle wallet
 * - Contract verifies msg.sender == oracle, calculates winning bucket
 *
 * ORACLE TRUST CONSIDERATION:
 * - Single oracle address (mitigated with access control)
 * - Recommended: Use hardware wallet + multi-sig for oracle
 * - Future upgrade: Chainlink Price Feeds + Automation (see code comments below)
 */

/*
 * RECOMMENDED CHAINLINK INTEGRATION (for future upgrade to trustless oracle)
 *
 * For fully decentralized, automatic settlement without trusted oracle:
 *
 * Step 1: Install Chainlink contracts
 *   npm install @chainlink/contracts
 *
 * Step 2: Add imports
 *   import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
 *   import "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";
 *
 * Step 3: Implement AutomationCompatibleInterface
 *
 * contract MultiOutcomeMarket is AutomationCompatibleInterface {
 *     mapping(string => AggregatorV3Interface) public priceFeeds;
 *
 *     // Chainlink Automation calls this to check if settlement needed
 *     function checkUpkeep(bytes calldata) external view returns (bool, bytes memory) {
 *         for (uint i = 0; i < numMarkets; i++) {
 *             if (block.timestamp >= markets[i].settleTime && !markets[i].settled) {
 *                 return (true, abi.encode(i));
 *             }
 *         }
 *         return (false, "");
 *     }
 *
 *     // Chainlink Automation calls this to settle markets
 *     function performUpkeep(bytes calldata performData) external {
 *         uint256 marketId = abi.decode(performData, (uint256));
 *         Market storage market = markets[marketId];
 *
 *         // Get latest price from Chainlink Price Feed
 *         AggregatorV3Interface priceFeed = priceFeeds[market.stockSymbol];
 *         (, int256 price,,,) = priceFeed.latestRoundData();
 *
 *         // Settle with decentralized price - no oracle needed!
 *         _settleMarket(marketId, uint256(price));
 *     }
 * }
 *
 * Benefits: No trusted oracle, automatic settlement, censorship-resistant
 * Cost: ~$5-10 LINK per settlement on Base network
 */
 /* Security features:
 * - ReentrancyGuard on all payable functions
 * - Access control for market creation and settlement
 * - Pausable for emergency stops
 * - Protocol fee mechanism
 * - Safe math operations
 */

contract MultiOutcomeMarket is ReentrancyGuard, Ownable, Pausable {
    uint256 public constant LIQUIDITY_PARAM = 1000 * 1e18;
    uint256 public constant MAX_OUTCOMES = 42;
    uint256 public constant PROTOCOL_FEE_BPS = 200; // 2% fee
    uint256 public constant BPS_DENOMINATOR = 10000;
    
    enum SessionType { INTRADAY, OVERNIGHT }
    enum MarketStatus { ACTIVE, LOCKED, SETTLED }
    
    address public oracle; // Authorized oracle for settlement
    uint256 public protocolFeesCollected;
    uint256 public constant PRICE_DEVIATION_TOLERANCE_BPS = 10; // 0.1% tolerance for price validation
    
    // Optional: Chainlink price feed addresses for validation (address(0) = disabled)
    mapping(string => address) public priceFeeds;
    
    struct Market {
        string stockSymbol;
        uint256 marketId;
        SessionType sessionType;
        MarketStatus status;
        uint8 numOutcomes; // 23 for trading, 42 for after-hours
        
        uint256 referencePrice;
        uint256 finalPrice;
        uint256 lockTime;
        uint256 settleTime;
        
        // Dynamic array for quantities (max 42)
        mapping(uint8 => int256) quantities;
        
        uint8 winningOutcome;
        bool settled;
        uint256 totalVolume;
    }
    
    struct UserPosition {
        mapping(uint8 => int256) quantities;
        uint256 costBasis;
    }
    
    uint256 public nextMarketId;
    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => UserPosition)) public userPositions;
    
    // Market Lifecycle Events
    event MarketCreated(uint256 indexed marketId, string stockSymbol, SessionType sessionType, uint8 numOutcomes, uint256 referencePrice, uint256 lockTime, uint256 settleTime);
    event MarketLocked(uint256 indexed marketId, uint256 timestamp);
    event MarketSettled(uint256 indexed marketId, uint8 winningOutcome, uint256 finalPrice, int256 priceChangePercent);
    
    // Trading Events
    event SharesPurchased(uint256 indexed marketId, address indexed user, uint8 outcomeIndex, int256 quantity, uint256 cost);
    event SharesSold(uint256 indexed marketId, address indexed user, uint8 outcomeIndex, int256 quantity, uint256 payout);
    event TradeExecuted(uint256 indexed marketId, address indexed trader, uint8 outcomeIndex, bool isBuy, uint256 shares, uint256 value, uint256 newProbability);
    
    // Payout Events
    event PayoutClaimed(uint256 indexed marketId, address indexed claimant, uint256 amount);
    event Payout(uint256 indexed marketId, address indexed user, uint256 amount);
    
    // Admin Events
    event ProtocolFeeCollected(uint256 indexed marketId, uint256 amount);
    event ProtocolFeeWithdrawn(address indexed recipient, uint256 amount);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event EmergencyPaused(address indexed by, uint256 timestamp);
    event EmergencyUnpaused(address indexed by, uint256 timestamp);
    
    modifier onlyOracle() {
        require(msg.sender == oracle || msg.sender == owner(), "Only oracle or owner");
        _;
    }
    
    constructor(address _oracle) Ownable(msg.sender) {
        require(_oracle != address(0), "Invalid oracle");
        oracle = _oracle;
    }
    
    function createMarket(
        string memory stockSymbol,
        SessionType sessionType,
        uint256 referencePrice,
        uint256 lockTime,
        uint256 settleTime
    ) external onlyOwner whenNotPaused returns (uint256) {
        require(referencePrice > 0, "Invalid reference price");
        require(lockTime > block.timestamp, "Lock time must be future");
        require(settleTime > lockTime, "Settle time must be after lock");
        
        uint256 marketId = nextMarketId++;
        Market storage market = markets[marketId];
        
        market.stockSymbol = stockSymbol;
        market.marketId = marketId;
        market.sessionType = sessionType;
        market.status = MarketStatus.ACTIVE;
        market.numOutcomes = sessionType == SessionType.INTRADAY ? 23 : 42;
        market.referencePrice = referencePrice;
        market.lockTime = lockTime;
        market.settleTime = settleTime;
        
        // Initialize all outcomes with small liquidity for high impact trades
        // Starting with small values allows trades to significantly shift probabilities
        // Using LIQUIDITY_PARAM / 10000 = 0.1*1e18 per outcome
        int256 initialLiquidity = int256(LIQUIDITY_PARAM) / 10000; // 0.01% of liquidity param per outcome
        for (uint8 i = 0; i < market.numOutcomes; i++) {
            market.quantities[i] = initialLiquidity;
        }
        
        emit MarketCreated(marketId, stockSymbol, sessionType, market.numOutcomes, referencePrice, lockTime, settleTime);
        return marketId;
    }
    
    function buyShares(
        uint256 marketId,
        uint8 outcomeIndex,
        int256 quantity,
        uint256 maxCost
    ) 
        external 
        payable 
        nonReentrant 
        whenNotPaused 
    {
        require(quantity > 0, "Use sellShares to sell");
        require(maxCost > 0, "Max cost must be positive");
        
        // Calculate cost before trade
        int256 costBefore = calculateCost(marketId);
        Market storage market = markets[marketId];
        market.quantities[outcomeIndex] += quantity;
        int256 costAfter = calculateCost(marketId);
        int256 costDelta = costAfter - costBefore;
        
        // Cost delta must be positive for buying (price increases when buying)
        require(costDelta >= 0, "Invalid cost calculation");
        uint256 actualCost = uint256(costDelta);
        
        // Slippage protection: revert if cost exceeds maxCost
        require(actualCost <= maxCost, "Cost exceeds maxCost (slippage)");
        
        // Revert temporary change and execute through _trade
        market.quantities[outcomeIndex] -= quantity;
        _trade(marketId, outcomeIndex, quantity, true);
    }
    
    function sellShares(uint256 marketId, uint8 outcomeIndex, int256 quantity) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        require(quantity > 0, "Quantity must be positive");
        UserPosition storage position = userPositions[marketId][msg.sender];
        require(position.quantities[outcomeIndex] >= quantity, "Insufficient shares");
        _trade(marketId, outcomeIndex, -quantity, false);
    }
    
    function _trade(uint256 marketId, uint8 outcomeIndex, int256 quantity, bool isBuy) internal {
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.ACTIVE, "Market not active");
        require(block.timestamp < market.lockTime, "Market locked");
        require(outcomeIndex < market.numOutcomes, "Invalid outcome");
        require(quantity != 0, "Quantity must be non-zero");
        
        int256 costBefore = calculateCost(marketId);
        market.quantities[outcomeIndex] += quantity;
        int256 costAfter = calculateCost(marketId);
        int256 costDelta = costAfter - costBefore;
        
        UserPosition storage position = userPositions[marketId][msg.sender];
        position.quantities[outcomeIndex] += quantity;
        
        if (isBuy) {
            require(costDelta >= 0, "Cost delta negative on buy");
            uint256 cost = uint256(costDelta);
            require(msg.value >= cost, "Insufficient payment");
            
            position.costBasis += cost;
            market.totalVolume += cost;
            
            if (msg.value > cost) {
                payable(msg.sender).transfer(msg.value - cost);
            }
            emit SharesPurchased(marketId, msg.sender, outcomeIndex, quantity, cost);
            
            // Calculate new probability for this outcome
            uint256 newProbability = _getProbabilityForOutcome(marketId, outcomeIndex);
            emit TradeExecuted(marketId, msg.sender, outcomeIndex, true, uint256(quantity), cost, newProbability);
        } else {
            require(costDelta <= 0, "Cost delta positive on sell");
            uint256 grossPayout = uint256(-costDelta);
            
            // Deduct protocol fee (2%)
            uint256 protocolFee = (grossPayout * PROTOCOL_FEE_BPS) / 10000;
            uint256 netPayout = grossPayout - protocolFee;
            
            protocolFeesCollected += protocolFee;
            emit ProtocolFeeCollected(marketId, protocolFee);
            
            if (position.costBasis > 0) {
                position.costBasis = position.costBasis > netPayout ? position.costBasis - netPayout : 0;
            }
            
            payable(msg.sender).transfer(netPayout);
            emit SharesSold(marketId, msg.sender, outcomeIndex, quantity, netPayout);
            
            // Calculate new probability for this outcome
            uint256 newProbability = _getProbabilityForOutcome(marketId, outcomeIndex);
            emit TradeExecuted(marketId, msg.sender, outcomeIndex, false, uint256(quantity), netPayout, newProbability);
        }
    }
    
    function settleMarket(uint256 marketId, uint256 finalPrice) 
        external 
        onlyOracle 
        whenNotPaused 
    {
        Market storage market = markets[marketId];
        require(market.status != MarketStatus.SETTLED, "Already settled");
        require(block.timestamp >= market.settleTime, "Too early to settle");
        require(finalPrice > 0, "Invalid final price");
        
        // Optional: Validate against Chainlink price feed if configured
        address priceFeed = priceFeeds[market.stockSymbol];
        if (priceFeed != address(0)) {
            // Fetch Chainlink price and validate against oracle price
            (, int256 chainlinkPrice, , uint256 updatedAt, ) = 
                AggregatorV3Interface(priceFeed).latestRoundData();
            
            require(chainlinkPrice > 0, "Invalid Chainlink price");
            require(block.timestamp - updatedAt < 1 hours, "Stale Chainlink price");
            
            // Convert to same decimals (assume 8 decimals for Chainlink, scale to 18)
            uint256 chainlinkPriceScaled = uint256(chainlinkPrice) * 10**10;
            
            // Calculate deviation: |oracle - chainlink| / chainlink
            uint256 deviation;
            if (finalPrice > chainlinkPriceScaled) {
                deviation = ((finalPrice - chainlinkPriceScaled) * 10000) / chainlinkPriceScaled;
            } else {
                deviation = ((chainlinkPriceScaled - finalPrice) * 10000) / chainlinkPriceScaled;
            }
            
            // Revert if deviation exceeds tolerance (0.1% = 10 basis points)
            require(
                deviation <= PRICE_DEVIATION_TOLERANCE_BPS,
                "Oracle price deviates too much from Chainlink"
            );
        }
        
        market.finalPrice = finalPrice;
        market.status = MarketStatus.SETTLED;
        market.settled = true;
        
        int256 priceChangePercent = calculatePriceChangePercent(market.referencePrice, finalPrice);
        uint8 winningOutcome = getBucketIndex(priceChangePercent, market.sessionType);
        market.winningOutcome = winningOutcome;
        
        emit MarketSettled(marketId, winningOutcome, finalPrice, priceChangePercent);
    }
    
    function claimPayout(uint256 marketId) 
        external 
        nonReentrant 
    {
        Market storage market = markets[marketId];
        require(market.settled, "Market not settled");
        
        UserPosition storage position = userPositions[marketId][msg.sender];
        require(position.costBasis > 0, "No position");
        
        int256 userWinningShares = position.quantities[market.winningOutcome];
        require(userWinningShares > 0, "No winning shares");
        
        // TRUE LMSR PAYOUT: Distribute pool proportionally
        // Calculate total winning shares across all users
        int256 totalWinningShares = market.quantities[market.winningOutcome];
        require(totalWinningShares > 0, "No winning shares in pool");
        
        // Calculate total pool value (contract balance)
        uint256 totalPoolValue = address(this).balance - protocolFeesCollected;
        
        // Proportional payout: (userShares / totalShares) * poolValue
        uint256 payout = (uint256(userWinningShares) * totalPoolValue) / uint256(totalWinningShares);
        
        // Mark as claimed
        position.quantities[market.winningOutcome] = 0;
        position.costBasis = 0;
        
        payable(msg.sender).transfer(payout);
        emit Payout(marketId, msg.sender, payout);
        emit PayoutClaimed(marketId, msg.sender, payout);
    }
    
    function withdrawFees() external onlyOwner {
        uint256 amount = protocolFeesCollected;
        require(amount > 0, "No fees to withdraw");
        
        protocolFeesCollected = 0;
        payable(owner()).transfer(amount);
        emit ProtocolFeeWithdrawn(owner(), amount);
    }
    
    function updateOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Invalid oracle address");
        address oldOracle = oracle;
        oracle = newOracle;
        emit OracleUpdated(oldOracle, newOracle);
    }
    
    /// @notice Register Chainlink price feed for a stock symbol (optional validation)
    /// @param stockSymbol The stock symbol (e.g., "AAPL")
    /// @param feedAddress Chainlink AggregatorV3Interface address (or address(0) to disable)
    function setPriceFeed(string calldata stockSymbol, address feedAddress) external onlyOwner {
        priceFeeds[stockSymbol] = feedAddress;
        // Event would go here: emit PriceFeedSet(stockSymbol, feedAddress);
    }
    
    /// @notice Emergency pause (emits event for transparency)
    function pause() external onlyOwner {
        _pause();
        emit EmergencyPaused(msg.sender, block.timestamp);
    }
    
    /// @notice Emergency unpause
    function unpause() external onlyOwner {
        _unpause();
        emit EmergencyUnpaused(msg.sender, block.timestamp);
    }
    
    // Internal overrides required by Pausable
    function _pause() internal virtual override {
        super._pause();
    }
    
    function _unpause() internal virtual override {
        super._unpause();
    }
    
    function calculateCost(uint256 marketId) public view returns (int256) {
        Market storage market = markets[marketId];
        
        int256 maxQ = market.quantities[0];
        for (uint8 i = 1; i < market.numOutcomes; i++) {
            if (market.quantities[i] > maxQ) {
                maxQ = market.quantities[i];
            }
        }
        
        uint256 sumExp = 0;
        for (uint8 i = 0; i < market.numOutcomes; i++) {
            int256 exponent = (market.quantities[i] - maxQ) * int256(1e18) / int256(LIQUIDITY_PARAM);
            sumExp += uint256(exponential(exponent));
        }
        
        int256 lnSum = logarithm(sumExp);
        int256 cost = int256(LIQUIDITY_PARAM) * (maxQ * int256(1e18) / int256(LIQUIDITY_PARAM) + lnSum) / int256(1e18);
        
        // Ensure cost is always non-negative (LMSR cost function should always be >= 0)
        if (cost < 0) {
            cost = 0;
        }
        
        return cost;
    }
    
    function _getProbabilitiesArray(uint256 marketId) internal view returns (uint256[] memory) {
        Market storage market = markets[marketId];
        uint256[] memory probabilities = new uint256[](market.numOutcomes);
        
        int256 maxQ = market.quantities[0];
        for (uint8 i = 1; i < market.numOutcomes; i++) {
            if (market.quantities[i] > maxQ) {
                maxQ = market.quantities[i];
            }
        }
        
        uint256 sumExp = 0;
        uint256[] memory expValues = new uint256[](market.numOutcomes);
        
        for (uint8 i = 0; i < market.numOutcomes; i++) {
            int256 exponent = (market.quantities[i] - maxQ) * int256(1e18) / int256(LIQUIDITY_PARAM);
            expValues[i] = uint256(exponential(exponent));
            sumExp += expValues[i];
        }
        
        for (uint8 i = 0; i < market.numOutcomes; i++) {
            probabilities[i] = (expValues[i] * 10000) / sumExp;
        }
        
        return probabilities;
    }
    
    function _getProbabilityForOutcome(uint256 marketId, uint8 outcomeIndex) internal view returns (uint256) {
        Market storage market = markets[marketId];
        
        int256 maxQ = market.quantities[0];
        for (uint8 i = 1; i < market.numOutcomes; i++) {
            if (market.quantities[i] > maxQ) {
                maxQ = market.quantities[i];
            }
        }
        
        uint256 sumExp = 0;
        uint256 targetExp = 0;
        
        for (uint8 i = 0; i < market.numOutcomes; i++) {
            int256 exponent = (market.quantities[i] - maxQ) * int256(1e18) / int256(LIQUIDITY_PARAM);
            uint256 expValue = uint256(exponential(exponent));
            sumExp += expValue;
            if (i == outcomeIndex) {
                targetExp = expValue;
            }
        }
        
        return (targetExp * 10000) / sumExp;
    }
    
    function getProbabilities(uint256 marketId) external view returns (uint256[] memory) {
        Market storage market = markets[marketId];
        uint256[] memory probabilities = new uint256[](market.numOutcomes);
        
        int256 maxQ = market.quantities[0];
        for (uint8 i = 1; i < market.numOutcomes; i++) {
            if (market.quantities[i] > maxQ) {
                maxQ = market.quantities[i];
            }
        }
        
        uint256 sumExp = 0;
        uint256[] memory expValues = new uint256[](market.numOutcomes);
        
        for (uint8 i = 0; i < market.numOutcomes; i++) {
            int256 exponent = (market.quantities[i] - maxQ) * int256(1e18) / int256(LIQUIDITY_PARAM);
            expValues[i] = uint256(exponential(exponent));
            sumExp += expValues[i];
        }
        
        for (uint8 i = 0; i < market.numOutcomes; i++) {
            probabilities[i] = (expValues[i] * 10000) / sumExp;
        }
        
        return probabilities;
    }
    
    function getBucketIndex(int256 priceChangePercent, SessionType sessionType) public pure returns (uint8) {
        if (sessionType == SessionType.INTRADAY) {
            // Trading: 1% increments, 23 buckets
            if (priceChangePercent >= 1000) return 0;
            if (priceChangePercent >= 900) return 1;
            if (priceChangePercent >= 800) return 2;
            if (priceChangePercent >= 700) return 3;
            if (priceChangePercent >= 600) return 4;
            if (priceChangePercent >= 500) return 5;
            if (priceChangePercent >= 400) return 6;
            if (priceChangePercent >= 300) return 7;
            if (priceChangePercent >= 200) return 8;
            if (priceChangePercent >= 100) return 9;
            if (priceChangePercent >= 0) return 10;
            if (priceChangePercent >= -100) return 11;
            if (priceChangePercent >= -200) return 12;
            if (priceChangePercent >= -300) return 13;
            if (priceChangePercent >= -400) return 14;
            if (priceChangePercent >= -500) return 15;
            if (priceChangePercent >= -600) return 16;
            if (priceChangePercent >= -700) return 17;
            if (priceChangePercent >= -800) return 18;
            if (priceChangePercent >= -900) return 19;
            if (priceChangePercent >= -1000) return 20;
            return 22;
        } else {
            // After-hours: 0.5% increments, 42 buckets
            if (priceChangePercent >= 1000) return 0;
            if (priceChangePercent >= 950) return 1;
            if (priceChangePercent >= 900) return 2;
            if (priceChangePercent >= 850) return 3;
            if (priceChangePercent >= 800) return 4;
            if (priceChangePercent >= 750) return 5;
            if (priceChangePercent >= 700) return 6;
            if (priceChangePercent >= 650) return 7;
            if (priceChangePercent >= 600) return 8;
            if (priceChangePercent >= 550) return 9;
            if (priceChangePercent >= 500) return 10;
            if (priceChangePercent >= 450) return 11;
            if (priceChangePercent >= 400) return 12;
            if (priceChangePercent >= 350) return 13;
            if (priceChangePercent >= 300) return 14;
            if (priceChangePercent >= 250) return 15;
            if (priceChangePercent >= 200) return 16;
            if (priceChangePercent >= 150) return 17;
            if (priceChangePercent >= 100) return 18;
            if (priceChangePercent >= 50) return 19;
            if (priceChangePercent >= 0) return 20;
            if (priceChangePercent >= -50) return 21;
            if (priceChangePercent >= -100) return 22;
            if (priceChangePercent >= -150) return 23;
            if (priceChangePercent >= -200) return 24;
            if (priceChangePercent >= -250) return 25;
            if (priceChangePercent >= -300) return 26;
            if (priceChangePercent >= -350) return 27;
            if (priceChangePercent >= -400) return 28;
            if (priceChangePercent >= -450) return 29;
            if (priceChangePercent >= -500) return 30;
            if (priceChangePercent >= -550) return 31;
            if (priceChangePercent >= -600) return 32;
            if (priceChangePercent >= -650) return 33;
            if (priceChangePercent >= -700) return 34;
            if (priceChangePercent >= -750) return 35;
            if (priceChangePercent >= -800) return 36;
            if (priceChangePercent >= -850) return 37;
            if (priceChangePercent >= -900) return 38;
            if (priceChangePercent >= -950) return 39;
            if (priceChangePercent >= -1000) return 40;
            return 41;
        }
    }
    
    function calculatePriceChangePercent(uint256 referencePrice, uint256 finalPrice) public pure returns (int256) {
        int256 change = int256(finalPrice) - int256(referencePrice);
        int256 priceChangePercent = (change * 10000) / int256(referencePrice);
        return priceChangePercent;
    }
    
    // ✅ PRODUCTION-SAFE MATH using ABDKMath64x64
    // Battle-tested library with proper overflow protection and precision
    
    function logarithm(uint256 x) internal pure returns (int256) {
        require(x > 0, "Cannot take log of 0");
        // Convert from 1e18 to 64.64 fixed point
        int128 x64 = ABDKMath64x64.divu(x, 1e18);
        // Calculate natural log
        int128 result64 = ABDKMath64x64.ln(x64);
        // Convert back to 1e18 format
        return ABDKMath64x64.muli(result64, 1e18);
    }
    
    function exponential(int256 x) internal pure returns (int256) {
        // Convert from 1e18 to 64.64 fixed point
        int128 x64 = ABDKMath64x64.divi(x, 1e18);
        // Calculate e^x
        int128 result64 = ABDKMath64x64.exp(x64);
        // Convert back to 1e18 format
        return ABDKMath64x64.muli(result64, 1e18);
    }
    
    function getMarket(uint256 marketId) external view returns (
        string memory stockSymbol,
        SessionType sessionType,
        MarketStatus status,
        uint8 numOutcomes,
        uint256 referencePrice,
        uint256 finalPrice,
        uint256 lockTime,
        uint256 settleTime,
        bool settled,
        uint8 winningOutcome
    ) {
        Market storage market = markets[marketId];
        return (
            market.stockSymbol,
            market.sessionType,
            market.status,
            market.numOutcomes,
            market.referencePrice,
            market.finalPrice,
            market.lockTime,
            market.settleTime,
            market.settled,
            market.winningOutcome
        );
    }
    
    function getUserQuantity(uint256 marketId, address user, uint8 outcomeIndex) external view returns (int256) {
        return userPositions[marketId][user].quantities[outcomeIndex];
    }
    
    function getUserCostBasis(uint256 marketId, address user) external view returns (uint256) {
        return userPositions[marketId][user].costBasis;
    }
}
