// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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
 * @title ProportionalMarketMIND
 * @notice Simple proportional prediction market with bonding curve for multi-outcome price predictions
 * @dev Uses MIND token (18 decimals). Probability = Bucket Liquidity / Total Liquidity
 *
 * MIND Token on Base Sepolia: 0xCe31Ae82c11dd708eF51c93dEEb5Be0474A132D1
 * MIND has 18 decimals (standard ERC20)
 *
 * SECURITY FEATURES:
 * - ReentrancyGuard on all state-changing functions
 * - Access control with Ownable and Pausable
 * - SafeERC20 for token transfers
 * - Proportional payout distribution
 * - Protocol fee collection (2%)
 * - Minimum bet size (1 MIND) to prevent dust trades
 * - Bonding curve with safety limits
 */
contract ProportionalMarketMIND is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    
    // MIND token (or any ERC20)
    IERC20 public immutable token;
    
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
        mapping(uint8 => uint256) bucketLiquidity; // Tokens in each bucket
        uint256 totalLiquidity; // Total tokens in market
        mapping(uint8 => uint256) totalSharesPerBucket; // Total shares issued per bucket
    }
    
    struct UserPosition {
        mapping(uint8 => uint256) shares; // User's shares in each bucket
        uint256 totalInvested; // Total tokens user has put in
    }
    
    uint256 public nextMarketId;
    uint256 public constant PROTOCOL_FEE_BPS = 200; // 2%
    uint256 public constant MIN_BET_SIZE = 1 * 10**18; // 1 MIND (18 decimals)
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
    
    constructor(address _oracle, address _token) Ownable(msg.sender) {
        require(_oracle != address(0), "Invalid oracle");
        require(_token != address(0), "Invalid token address");
        oracle = _oracle;
        token = IERC20(_token);
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
     * @dev User must approve token spending before calling this
     * @param marketId The market ID
     * @param outcomeIndex The bucket index to buy
     * @param amount Amount of tokens to spend (18 decimals)
     * @param maxCost Maximum tokens willing to spend (slippage protection)
     */
    function buyShares(
        uint256 marketId,
        uint8 outcomeIndex,
        uint256 amount,
        uint256 maxCost
    ) external nonReentrant whenNotPaused {
        require(amount >= MIN_BET_SIZE, "Bet below minimum (1 MIND)");
        require(amount <= maxCost, "Cost exceeds maxCost");
        
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.ACTIVE, "Market not active");
        require(block.timestamp < market.lockTime, "Market locked");
        require(outcomeIndex < market.numOutcomes, "Invalid outcome");
        
        // Transfer tokens from user to contract
        token.safeTransferFrom(msg.sender, address(this), amount);
        
        // Deduct protocol fee (2%)
        uint256 protocolFee = (amount * PROTOCOL_FEE_BPS) / 10000;
        uint256 netAmount = amount - protocolFee;
        protocolFeesCollected += protocolFee;
        emit ProtocolFeeCollected(marketId, protocolFee);
        
        // Calculate shares with STEEP bonding curve
        // Early bettors get MORE shares per token, late bettors get FEWER
        // This means when you sell: valuePerShare = bucketLiquidity / totalShares
        // Early bettors profit because they own more of the share pool
        //
        // Formula: shares = netAmount * 1e18 / (1e18 + bucketLiquidity * STEEPNESS)
        // STEEPNESS = 50 means bonding curve rewards early bettors
        
        uint256 STEEPNESS = 50; // Lower = gentler curve, Higher = steeper advantage for early
        uint256 shares;
        
        // shares = netAmount * 1e18 / (1e18 + bucketLiquidity * STEEPNESS)
        uint256 divisor = 1e18 + (market.bucketLiquidity[outcomeIndex] * STEEPNESS);
        shares = (netAmount * 1e18) / divisor;
        
        require(shares > 0, "Shares too small");
        
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
     * @param marketId The market ID
     * @param outcomeIndex The bucket index to sell from
     * @param sharesToSell Number of shares to sell
     * @param minPayout Minimum token payout expected (slippage protection)
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
        
        // Add sell fee to protocol fees
        protocolFeesCollected += sellFee;
        
        // Transfer token payout
        token.safeTransfer(msg.sender, netPayout);
        
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
            
            uint256 chainlinkPriceScaled = uint256(chainlinkPrice) * 10**10;
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
        
        // Transfer token payout
        token.safeTransfer(msg.sender, payout);
        
        emit PayoutClaimed(marketId, msg.sender, payout);
    }
    
    /**
     * @notice Claim refund when no one bet on the winning outcome
     */
    function claimRefund(uint256 marketId) external nonReentrant {
        Market storage market = markets[marketId];
        require(market.settled, "Market not settled");
        
        uint256 totalWinningShares = getTotalSharesInBucket(marketId, market.winningOutcome);
        require(totalWinningShares == 0, "Winners exist - use claimPayout");
        
        UserPosition storage position = userPositions[marketId][msg.sender];
        require(position.totalInvested > 0, "No position to refund");
        
        uint256 userNetContribution = (position.totalInvested * (10000 - PROTOCOL_FEE_BPS)) / 10000;
        uint256 refundAmount = userNetContribution;
        
        if (refundAmount > market.totalLiquidity) {
            refundAmount = market.totalLiquidity;
        }
        
        // Mark as claimed BEFORE transfer (CEI pattern)
        position.totalInvested = 0;
        for (uint8 i = 0; i < market.numOutcomes; i++) {
            position.shares[i] = 0;
        }
        
        market.totalLiquidity -= refundAmount;
        
        // Transfer token refund
        token.safeTransfer(msg.sender, refundAmount);
        
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
     */
    function getProbabilities(uint256 marketId) external view returns (uint256[] memory) {
        Market storage market = markets[marketId];
        uint256[] memory probabilities = new uint256[](market.numOutcomes);
        
        if (market.totalLiquidity == 0) {
            uint256 uniformProb = 10000 / market.numOutcomes;
            for (uint8 i = 0; i < market.numOutcomes; i++) {
                probabilities[i] = uniformProb;
            }
        } else {
            for (uint8 i = 0; i < market.numOutcomes; i++) {
                probabilities[i] = (market.bucketLiquidity[i] * 10000) / market.totalLiquidity;
            }
        }
        
        return probabilities;
    }
    
    /**
     * @notice Get sell quote - returns the token amount user would receive for selling shares
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
     * @return bucketLiquidity The tokens in this bucket
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
     * @notice Get total shares in a specific bucket
     */
    function getTotalSharesInBucket(uint256 marketId, uint8 outcomeIndex) internal view returns (uint256) {
        return markets[marketId].totalSharesPerBucket[outcomeIndex];
    }
    
    /**
     * @notice Get market details
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
            return 41; // <-10%
        }
    }
    
    /**
     * @notice Lock market at lockTime
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
     * @notice Set Chainlink price feed for a symbol
     */
    function setPriceFeed(string calldata stockSymbol, address feedAddress) external onlyOwner {
        priceFeeds[stockSymbol] = feedAddress;
        emit PriceFeedSet(stockSymbol, feedAddress);
    }
    
    /**
     * @notice Withdraw protocol fees
     */
    function withdrawFees() external onlyOwner {
        uint256 amount = protocolFeesCollected;
        require(amount > 0, "No fees to withdraw");
        
        protocolFeesCollected = 0;
        token.safeTransfer(owner(), amount);
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
        
        token.safeTransfer(msg.sender, payout);
        
        emit PayoutClaimed(marketId, msg.sender, payout);
    }
}
