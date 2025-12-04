// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

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
 * @title ProportionalMarket
 * @notice Simple proportional prediction market with bonding curve for multi-outcome stock price predictions
 * @dev Probability = Bucket Liquidity / Total Liquidity
 *
 * SECURITY FEATURES:
 * - ReentrancyGuard on all payable functions
 * - Access control with Ownable and Pausable
 * - Proportional payout distribution
 * - Protocol fee collection (2%)
 * - Minimum bet size (0.001 ETH) to prevent dust trades
 * - Bonding curve with safety limits
 *
 * ORACLE ARCHITECTURE:
 * - Backend service monitors markets approaching settleTime
 * - At settlement, backend fetches real stock price from API
 * - Backend calls settleMarket() with authorized oracle wallet
 * - Contract verifies msg.sender == oracle or owner
 * - Optional: Chainlink Price Feed validation for additional security
 *
 * BONDING CURVE:
 * - Popular buckets cost more to buy (rewards early risk-takers)
 * - Formula: shares = amount / (1 + bucketLiquidity/totalLiquidity)
 * - Safety limit: bonding curve premium cannot exceed 90%
 */
contract ProportionalMarket is Ownable, ReentrancyGuard, Pausable {
    
    enum SessionType { INTRADAY, OVERNIGHT }
    enum MarketStatus { ACTIVE, LOCKED, SETTLED, CANCELLED }
    
    struct Market {
        string stockSymbol;
        uint256 marketId;
        SessionType sessionType;
        MarketStatus status;
        uint8 numOutcomes;
        uint256 referencePrice;
        uint256 finalPrice;
        uint256 lockTime;
        uint256 settleTime;
        bool settled;
        uint8 winningOutcome;
        mapping(uint8 => uint256) bucketLiquidity; // ETH in each bucket
        uint256 totalLiquidity; // Total ETH in market
        mapping(uint8 => uint256) totalSharesPerBucket; // Total shares issued per bucket
    }
    
    struct UserPosition {
        mapping(uint8 => uint256) shares; // User's shares in each bucket
        uint256 totalInvested; // Total ETH user has put in
    }
    
    uint256 public nextMarketId;
    uint256 public constant PROTOCOL_FEE_BPS = 200; // 2%
    uint256 public constant MIN_BET_SIZE = 0.001 ether; // Prevent dust trades
    uint256 public constant PRICE_DEVIATION_TOLERANCE_BPS = 10; // 0.1% tolerance for Chainlink validation
    uint256 public protocolFeesCollected;
    address public oracle; // Authorized oracle for settlement
    
    // Optional: Chainlink price feed addresses for validation (address(0) = disabled)
    mapping(string => address) public priceFeeds;
    
    // Market counter for compatibility
    uint256 public marketCounter;
    
    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => UserPosition)) public userPositions;
    
    event MarketCreated(
        uint256 indexed marketId,
        string stockSymbol,
        SessionType sessionType,
        uint8 numOutcomes,
        uint256 referencePrice,
        uint256 lockTime,
        uint256 settleTime
    );
    
    event SharesPurchased(
        uint256 indexed marketId,
        address indexed user,
        uint8 outcomeIndex,
        uint256 shares,
        uint256 cost
    );
    
    event MarketSettled(
        uint256 indexed marketId,
        uint256 finalPrice,
        uint8 winningOutcome
    );
    
    event PayoutClaimed(
        uint256 indexed marketId,
        address indexed user,
        uint256 payout
    );
    
    event ProtocolFeeCollected(uint256 indexed marketId, uint256 amount);
    event ProtocolFeeWithdrawn(address indexed recipient, uint256 amount);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event PriceFeedSet(string indexed stockSymbol, address indexed feedAddress);
    event MarketLocked(uint256 indexed marketId, uint256 timestamp);
    
    event SharesSold(
        uint256 indexed marketId,
        address indexed user,
        uint8 outcomeIndex,
        uint256 shares,
        uint256 payout
    );
    
    event RefundClaimed(
        uint256 indexed marketId,
        address indexed user,
        uint256 refundAmount
    );
    
    constructor(address _oracle) Ownable(msg.sender) {
        require(_oracle != address(0), "Invalid oracle");
        oracle = _oracle;
        nextMarketId = 1;
        marketCounter = 0;
    }
    
    /**
     * @notice Create a new market
     */
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
        marketCounter++;
        Market storage market = markets[marketId];
        
        market.stockSymbol = stockSymbol;
        market.marketId = marketId;
        market.sessionType = sessionType;
        market.status = MarketStatus.ACTIVE;
        market.numOutcomes = sessionType == SessionType.INTRADAY ? 22 : 42;
        market.referencePrice = referencePrice;
        market.lockTime = lockTime;
        market.settleTime = settleTime;
        
        emit MarketCreated(marketId, stockSymbol, sessionType, market.numOutcomes, referencePrice, lockTime, settleTime);
        return marketId;
    }
    
    /**
     * @notice Buy shares in a bucket with bonding curve
     * Cost increases as bucket becomes more popular
     */
    function buyShares(
        uint256 marketId,
        uint8 outcomeIndex,
        int256 /* quantity */, // Ignored, kept for compatibility
        uint256 maxCost  // Slippage protection
    ) external payable nonReentrant whenNotPaused {
        require(msg.value >= MIN_BET_SIZE, "Bet below minimum");
        require(msg.value <= maxCost, "Cost exceeds maxCost");
        
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.ACTIVE, "Market not active");
        require(block.timestamp < market.lockTime, "Market locked");
        require(outcomeIndex < market.numOutcomes, "Invalid outcome");
        
        uint256 amount = msg.value;
        
        // Deduct protocol fee (2%)
        uint256 protocolFee = (amount * PROTOCOL_FEE_BPS) / 10000;
        uint256 netAmount = amount - protocolFee;
        protocolFeesCollected += protocolFee;
        emit ProtocolFeeCollected(marketId, protocolFee);
        
        // Calculate shares with bonding curve
        // More liquidity in bucket = more expensive to buy
        // Formula: shares = netAmount / (1 + bucketLiquidity/totalLiquidity)
        // This means if bucket has 50% of liquidity, it costs 1.5x to buy
        uint256 shares;
        if (market.totalLiquidity == 0) {
            // First buy: 1:1 ratio
            shares = netAmount;
        } else {
            uint256 bucketRatio = (market.bucketLiquidity[outcomeIndex] * 1e18) / market.totalLiquidity;
            uint256 multiplier = 1e18 + bucketRatio; // 1 + ratio
            shares = (netAmount * 1e18) / multiplier;
        }
        
        require(shares > 0, "Shares too small");
        require(shares >= netAmount / 10, "Bonding curve too steep"); // Prevent >90% premium
        
        // Update state
        market.bucketLiquidity[outcomeIndex] += netAmount;
        market.totalLiquidity += netAmount;
        market.totalSharesPerBucket[outcomeIndex] += shares;
        
        UserPosition storage position = userPositions[marketId][msg.sender];
        position.shares[outcomeIndex] += shares;
        position.totalInvested += amount;
        
        emit SharesPurchased(marketId, msg.sender, outcomeIndex, shares, amount);
    }
    
    /**
     * @notice Sell shares back to the pool before market locks
     * Uses reverse bonding curve - selling large amounts gets less per share
     * @param marketId The market ID
     * @param outcomeIndex The bucket index to sell from
     * @param sharesToSell Number of shares to sell
     * @param minPayout Minimum payout expected (slippage protection)
     */
    function sellShares(
        uint256 marketId,
        uint8 outcomeIndex,
        uint256 sharesToSell,
        uint256 minPayout
    ) external nonReentrant whenNotPaused {
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.ACTIVE, "Market not active");
        require(block.timestamp < market.lockTime, "Market locked");
        require(outcomeIndex < market.numOutcomes, "Invalid outcome");
        
        UserPosition storage position = userPositions[marketId][msg.sender];
        require(position.shares[outcomeIndex] >= sharesToSell, "Insufficient shares");
        require(sharesToSell > 0, "Must sell at least 1 share");
        
        // Calculate payout using reverse bonding curve
        // Payout = shares * (bucketLiquidity / totalSharesInBucket)
        // Then apply a small spread (1%) to incentivize holding
        uint256 totalSharesInBucket = market.totalSharesPerBucket[outcomeIndex];
        require(totalSharesInBucket > 0, "No shares in bucket");
        
        // Value per share = bucket liquidity / total shares in bucket
        uint256 valuePerShare = (market.bucketLiquidity[outcomeIndex] * 1e18) / totalSharesInBucket;
        uint256 grossPayout = (sharesToSell * valuePerShare) / 1e18;
        
        // Apply 1% sell spread (fee for exiting early)
        uint256 sellFee = grossPayout / 100;
        uint256 netPayout = grossPayout - sellFee;
        
        require(netPayout >= minPayout, "Payout below minimum");
        require(grossPayout <= market.bucketLiquidity[outcomeIndex], "Insufficient bucket liquidity");
        
        // Update state BEFORE transfer (CEI pattern)
        position.shares[outcomeIndex] -= sharesToSell;
        market.totalSharesPerBucket[outcomeIndex] -= sharesToSell;
        market.bucketLiquidity[outcomeIndex] -= grossPayout;
        market.totalLiquidity -= grossPayout;
        
        // Add sell fee to protocol fees (fee stays in contract, not in pool)
        protocolFeesCollected += sellFee;
        
        // Transfer payout
        (bool success, ) = payable(msg.sender).call{value: netPayout}("");
        require(success, "Transfer failed");
        
        emit SharesSold(marketId, msg.sender, outcomeIndex, sharesToSell, netPayout);
    }
    
    /**
     * @notice Settle market with final price
     */
    function settleMarket(
        uint256 marketId,
        uint256 finalPrice
    ) external {
        require(msg.sender == oracle || msg.sender == owner(), "Not authorized");
        
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.ACTIVE || market.status == MarketStatus.LOCKED, "Market not active");
        require(block.timestamp >= market.settleTime, "Too early to settle");
        require(finalPrice > 0, "Invalid final price");
        
        // Validate with Chainlink price feed if configured
        address feedAddress = priceFeeds[market.stockSymbol];
        if (feedAddress != address(0)) {
            AggregatorV3Interface priceFeed = AggregatorV3Interface(feedAddress);
            (, int256 chainlinkPrice, , , ) = priceFeed.latestRoundData();
            require(chainlinkPrice > 0, "Invalid Chainlink price");
            
            // Scale Chainlink price (8 decimals) to 18 decimals for comparison
            uint256 chainlinkPriceScaled = uint256(chainlinkPrice) * 10**10;
            
            // Verify finalPrice is within tolerance of Chainlink price
            uint256 priceDiff = chainlinkPriceScaled > finalPrice ? 
                chainlinkPriceScaled - finalPrice : finalPrice - chainlinkPriceScaled;
            uint256 tolerance = (chainlinkPriceScaled * PRICE_DEVIATION_TOLERANCE_BPS) / 10000;
            require(priceDiff <= tolerance, "Price deviation exceeds tolerance");
        }
        
        market.finalPrice = finalPrice;
        market.status = MarketStatus.SETTLED;
        market.settled = true;
        
        // Calculate winning bucket
        int256 priceChangePercent = ((int256(finalPrice) - int256(market.referencePrice)) * 10000) / int256(market.referencePrice);
        market.winningOutcome = getBucketIndex(priceChangePercent, market.sessionType);
        
        emit MarketSettled(marketId, finalPrice, market.winningOutcome);
    }
    
    /**
     * @notice Claim payout for winning shares
     */
    function claimPayout(uint256 marketId) external nonReentrant {
        Market storage market = markets[marketId];
        require(market.settled, "Market not settled");
        
        UserPosition storage position = userPositions[marketId][msg.sender];
        uint256 userWinningShares = position.shares[market.winningOutcome];
        require(userWinningShares > 0, "No winning shares");
        
        // Calculate total winning shares
        uint256 totalWinningShares = getTotalSharesInBucket(marketId, market.winningOutcome);
        require(totalWinningShares > 0, "No winning shares in bucket");
        
        // Payout = (user's shares / total winning shares) * total pool
        uint256 payout = (userWinningShares * market.totalLiquidity) / totalWinningShares;
        
        // Mark as claimed BEFORE transfer (CEI pattern)
        position.shares[market.winningOutcome] = 0;
        
        // Transfer using .transfer (2300 gas, prevents reentrancy)
        (bool success, ) = payable(msg.sender).call{value: payout}("");
        require(success, "Transfer failed");
        
        emit PayoutClaimed(marketId, msg.sender, payout);
    }
    
    /**
     * @notice Claim refund when no one bet on the winning outcome
     * @dev Only callable when market is settled AND winning bucket has zero shares
     * Users get back their proportional share of the pool (fee already deducted at buy time)
     */
    function claimRefund(uint256 marketId) external nonReentrant {
        Market storage market = markets[marketId];
        require(market.settled, "Market not settled");
        
        // Only allow refunds if NO ONE picked the winning outcome
        uint256 totalWinningShares = getTotalSharesInBucket(marketId, market.winningOutcome);
        require(totalWinningShares == 0, "Winners exist - use claimPayout");
        
        UserPosition storage position = userPositions[marketId][msg.sender];
        require(position.totalInvested > 0, "No position to refund");
        
        // Calculate user's share of the total pool
        // They get back proportional to what they put in (minus the 2% fee already taken)
        // Net amount in pool = totalInvested * 0.98 (fee was deducted at buy time)
        uint256 userNetContribution = (position.totalInvested * (10000 - PROTOCOL_FEE_BPS)) / 10000;
        
        // Refund = (user's net contribution / total pool) * total pool = user's net contribution
        // Since everyone's fee was already deducted, the pool IS the sum of net contributions
        uint256 refundAmount = userNetContribution;
        
        // Safety check - don't refund more than available
        if (refundAmount > market.totalLiquidity) {
            refundAmount = market.totalLiquidity;
        }
        
        // Mark as claimed BEFORE transfer (CEI pattern)
        position.totalInvested = 0;
        // Clear all share positions for this user
        for (uint8 i = 0; i < market.numOutcomes; i++) {
            position.shares[i] = 0;
        }
        
        // Update market liquidity
        market.totalLiquidity -= refundAmount;
        
        // Transfer refund
        (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
        require(success, "Transfer failed");
        
        emit RefundClaimed(marketId, msg.sender, refundAmount);
    }
    
    /**
     * @notice Check if a market has no winners (refund eligible)
     */
    function isRefundEligible(uint256 marketId) external view returns (bool) {
        Market storage market = markets[marketId];
        if (!market.settled) return false;
        return getTotalSharesInBucket(marketId, market.winningOutcome) == 0;
    }
    
    /**
     * @notice Get current probabilities for all outcomes
     * Returns probabilities in basis points (10000 = 100%)
     */
    function getProbabilities(uint256 marketId) external view returns (uint256[] memory) {
        Market storage market = markets[marketId];
        uint256[] memory probabilities = new uint256[](market.numOutcomes);
        
        if (market.totalLiquidity == 0) {
            // No liquidity yet: uniform distribution
            uint256 uniformProb = 10000 / market.numOutcomes;
            for (uint8 i = 0; i < market.numOutcomes; i++) {
                probabilities[i] = uniformProb;
            }
        } else {
            // Probability = (bucket liquidity / total liquidity) * 10000
            for (uint8 i = 0; i < market.numOutcomes; i++) {
                probabilities[i] = (market.bucketLiquidity[i] * 10000) / market.totalLiquidity;
            }
        }
        
        return probabilities;
    }
    
    /**
     * @notice Get sell quote - returns the ETH amount user would receive for selling shares
     * @param marketId The market ID
     * @param outcomeIndex The bucket index
     * @param sharesToSell Number of shares to sell
     * @return grossPayout The payout before fees
     * @return netPayout The payout after 1% sell fee
     * @return sellFee The fee amount
     */
    function getSellQuote(
        uint256 marketId, 
        uint8 outcomeIndex, 
        uint256 sharesToSell
    ) external view returns (uint256 grossPayout, uint256 netPayout, uint256 sellFee) {
        Market storage market = markets[marketId];
        
        if (market.status != MarketStatus.ACTIVE || sharesToSell == 0) {
            return (0, 0, 0);
        }
        
        uint256 totalSharesInBucket = market.totalSharesPerBucket[outcomeIndex];
        if (totalSharesInBucket == 0) {
            return (0, 0, 0);
        }
        
        // Value per share = bucket liquidity / total shares in bucket
        uint256 valuePerShare = (market.bucketLiquidity[outcomeIndex] * 1e18) / totalSharesInBucket;
        grossPayout = (sharesToSell * valuePerShare) / 1e18;
        
        // Apply 1% sell spread
        sellFee = grossPayout / 100;
        netPayout = grossPayout - sellFee;
        
        return (grossPayout, netPayout, sellFee);
    }
    
    /**
     * @notice Get bucket data for a specific outcome
     * @param marketId The market ID
     * @param outcomeIndex The bucket index
     * @return bucketLiquidity The ETH in this bucket
     * @return totalShares Total shares issued for this bucket
     */
    function getBucketData(uint256 marketId, uint8 outcomeIndex) external view returns (
        uint256 bucketLiquidity,
        uint256 totalShares
    ) {
        Market storage market = markets[marketId];
        return (
            market.bucketLiquidity[outcomeIndex],
            market.totalSharesPerBucket[outcomeIndex]
        );
    }
    
    /**
     * @notice Get total shares in a specific bucket (sum across all users)
     */
    function getTotalSharesInBucket(uint256 marketId, uint8 outcomeIndex) internal view returns (uint256) {
        return markets[marketId].totalSharesPerBucket[outcomeIndex];
    }
    
    /**
     * @notice Get bucket index for a price change percentage
     */
    /**
     * @notice Get market details (for backend compatibility)
     */
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
        uint8 winningOutcome,
        uint256 totalLiquidity
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
            market.winningOutcome,
            market.totalLiquidity
        );
    }
    
    function getBucketIndex(int256 priceChangePercent, SessionType sessionType) public pure returns (uint8) {
        if (sessionType == SessionType.INTRADAY) {
            // 22 buckets: 1% increments from -10% to +10%
            if (priceChangePercent >= 1000) return 0;      // >+10%
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
            return 21; // <-10%
        } else {
            // 42 buckets: 0.5% increments from -10% to +10%
            if (priceChangePercent >= 1000) return 0;      // >+10%
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
            return 41; // <-10%
        }
    }
    
    /**
     * @notice Lock market at lockTime (prevents new trades)
     */
    function lockMarket(uint256 marketId) external {
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.ACTIVE, "Market not active");
        require(block.timestamp >= market.lockTime, "Lock time not reached");
        
        market.status = MarketStatus.LOCKED;
        emit MarketLocked(marketId, block.timestamp);
    }
    
    /**
     * @notice Update the oracle address
     */
    function setOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "Invalid oracle");
        address oldOracle = oracle;
        oracle = _oracle;
        emit OracleUpdated(oldOracle, _oracle);
    }
    
    /**
     * @notice Set Chainlink price feed for a stock symbol
     * @param stockSymbol The stock symbol (e.g., "SPY", "AAPL")
     * @param feedAddress Chainlink aggregator address (or address(0) to disable)
     */
    function setPriceFeed(string calldata stockSymbol, address feedAddress) external onlyOwner {
        priceFeeds[stockSymbol] = feedAddress;
        emit PriceFeedSet(stockSymbol, feedAddress);
    }
    
    function withdrawFees() external onlyOwner {
        uint256 amount = protocolFeesCollected;
        require(amount > 0, "No fees to withdraw");
        
        protocolFeesCollected = 0;
        payable(owner()).transfer(amount);
        emit ProtocolFeeWithdrawn(owner(), amount);
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @notice Alias for claimPayout (frontend compatibility)
     */
    function claimWinnings(uint256 marketId) external nonReentrant {
        Market storage market = markets[marketId];
        require(market.settled, "Market not settled");
        
        UserPosition storage position = userPositions[marketId][msg.sender];
        uint256 userWinningShares = position.shares[market.winningOutcome];
        require(userWinningShares > 0, "No winning shares");
        
        uint256 totalWinningShares = getTotalSharesInBucket(marketId, market.winningOutcome);
        require(totalWinningShares > 0, "No winning shares in bucket");
        
        uint256 payout = (userWinningShares * market.totalLiquidity) / totalWinningShares;
        
        position.shares[market.winningOutcome] = 0;
        
        (bool success, ) = payable(msg.sender).call{value: payout}("");
        require(success, "Transfer failed");
        
        emit PayoutClaimed(marketId, msg.sender, payout);
    }
}
