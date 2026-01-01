// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ProportionalMarketUSDCSimple
 * @notice Simplified proportional prediction market with bonding curve for multi-outcome price predictions
 * @dev Uses USDC for betting. Protocol takes 3% fee (no burn mechanism)
 *
 * USDC Token on Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (6 decimals)
 * MockUSDC on Base Sepolia: 0x2A9A8eb5a722053AeF8E98A5E1f0dfDC9CaE5f50
 * 
 * FEE STRUCTURE:
 * - Total fee: 3% (300 BPS) - collected as protocol fees
 *
 * SECURITY FEATURES:
 * - ReentrancyGuard on all state-changing functions
 * - Access control with Ownable and Pausable
 * - SafeERC20 for token transfers
 * - Proportional payout distribution
 * - Minimum bet size (1 USDC) to prevent dust trades
 * - Bonding curve with safety limits
 */
contract ProportionalMarketUSDCSimple is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    
    // USDC token (6 decimals)
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
        mapping(uint8 => uint256) investmentPerOutcome; // Amount invested in each outcome
        mapping(uint8 => uint256) purchaseProbabilityBPS; // Probability (in basis points) when purchased each outcome
    }
    
    uint256 public nextMarketId;
    uint256 public constant PROTOCOL_FEE_BPS = 300; // 3% total protocol fee
    uint256 public constant MIN_BET_SIZE = 1 * 10**6; // 1 USDC (6 decimals)
    uint256 public protocolFeesCollected;
    address public oracle; // Authorized oracle for settlement
    
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
    event MarketLocked(uint256 indexed marketId, uint256 timestamp);
    
    event RefundClaimed(
        uint256 indexed marketId,
        address indexed user,
        uint256 refundAmount
    );
    
    constructor(
        address _oracle, 
        address _usdcToken
    ) Ownable(msg.sender) {
        require(_oracle != address(0), "Invalid oracle");
        require(_usdcToken != address(0), "Invalid USDC address");
        oracle = _oracle;
        token = IERC20(_usdcToken);
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
        require(lockTime < block.timestamp + 365 days, "Lock time too far in future");
        require(settleTime < lockTime + 30 days, "Settle time too far from lock");
        
        uint256 marketId = nextMarketId++;
        marketCounter++;
        
        Market storage market = markets[marketId];
        market.stockSymbol = stockSymbol;
        market.marketId = marketId;
        market.sessionType = sessionType;
        market.status = MarketStatus.ACTIVE;
        market.referencePrice = referencePrice;
        market.lockTime = lockTime;
        market.settleTime = settleTime;
        market.settled = false;
        
        // Intraday: 23 buckets (-10% to +12%), Overnight: 43 buckets (-20% to +22%)
        market.numOutcomes = sessionType == SessionType.INTRADAY ? 23 : 43;
        
        emit MarketCreated(marketId, stockSymbol, sessionType, market.numOutcomes, referencePrice, lockTime, settleTime);
        return marketId;
    }
    
    /**
     * @notice Buy shares in a specific outcome bucket
     */
    function buyShares(
        uint256 marketId,
        uint8 outcomeIndex,
        uint256 amount,
        uint256 maxCost
    ) external nonReentrant whenNotPaused {
        require(amount >= MIN_BET_SIZE, "Bet below minimum (1 USDC)");
        require(amount <= maxCost, "Cost exceeds maxCost");
        
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.ACTIVE, "Market not active");
        require(block.timestamp < market.lockTime, "Market locked");
        require(outcomeIndex < market.numOutcomes, "Invalid outcome");
        require(market.marketId != 0, "Market does not exist");
        
        // Transfer tokens from user to contract
        token.safeTransferFrom(msg.sender, address(this), amount);
        
        // Collect protocol fee (3% total)
        uint256 protocolFee = (amount * PROTOCOL_FEE_BPS) / 10000;
        uint256 netAmount = amount - protocolFee;
        
        protocolFeesCollected += protocolFee;
        emit ProtocolFeeCollected(marketId, protocolFee);
        
        // Calculate shares with bonding curve (STEEPNESS = 10)
        // shares = netAmount * 1e18 / (1e18 + bucketLiquidity * 10)
        uint256 divisor = 1e18 + (market.bucketLiquidity[outcomeIndex] * 10);
        require(divisor > 0, "Divisor overflow");
        uint256 shares = (netAmount * 1e18) / divisor;
        require(shares > 0, "Shares too small");
        
        UserPosition storage position = userPositions[marketId][msg.sender];
        
        // Calculate and store probability BEFORE updating liquidity
        {
            uint256 currentProbabilityBPS = market.totalLiquidity > 0 
                ? (market.bucketLiquidity[outcomeIndex] * 10000) / market.totalLiquidity 
                : 0;
            
            // If user already has position, calculate weighted average
            if (position.shares[outcomeIndex] > 0) {
                uint256 existingInv = position.investmentPerOutcome[outcomeIndex];
                position.purchaseProbabilityBPS[outcomeIndex] = 
                    (existingInv * position.purchaseProbabilityBPS[outcomeIndex] + amount * currentProbabilityBPS) 
                    / (existingInv + amount);
            } else {
                position.purchaseProbabilityBPS[outcomeIndex] = currentProbabilityBPS;
            }
        }
        
        // Update state
        market.bucketLiquidity[outcomeIndex] += netAmount;
        market.totalLiquidity += netAmount;
        market.totalSharesPerBucket[outcomeIndex] += shares;
        
        position.shares[outcomeIndex] += shares;
        position.totalInvested += amount;
        position.investmentPerOutcome[outcomeIndex] += amount;
        
        emit SharesPurchased(marketId, msg.sender, outcomeIndex, shares, amount);
    }
    
    /**
     * @notice Sell shares back to the pool before market locks
     * @dev DISABLED - All positions are locked until settlement
     */
    function sellShares(
        uint256 /* marketId */,
        uint8 /* outcomeIndex */,
        uint256 /* sharesToSell */,
        uint256 /* minPayout */
    ) external pure {
        revert("Selling disabled until settlement");
    }
    
    /**
     * @notice Get current probabilities for all outcomes
     */
    function getProbabilities(uint256 marketId) external view returns (uint256[] memory) {
        Market storage market = markets[marketId];
        require(market.marketId != 0, "Market does not exist");
        
        uint256[] memory probs = new uint256[](market.numOutcomes);
        
        if (market.totalLiquidity == 0) {
            // Equal probability if no bets yet
            uint256 equalProb = 10000 / market.numOutcomes;
            for (uint8 i = 0; i < market.numOutcomes; i++) {
                probs[i] = equalProb;
            }
            return probs;
        }
        
        // Calculate proportional probabilities
        for (uint8 i = 0; i < market.numOutcomes; i++) {
            probs[i] = (market.bucketLiquidity[i] * 10000) / market.totalLiquidity;
        }
        
        return probs;
    }
    
    /**
     * @notice Settle market with final price
     */
    function settleMarket(uint256 marketId, uint256 finalPrice) external nonReentrant {
        require(msg.sender == oracle || msg.sender == owner(), "Not authorized");
        
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.ACTIVE || market.status == MarketStatus.LOCKED, "Invalid status");
        require(!market.settled, "Already settled");
        require(block.timestamp >= market.settleTime, "Too early to settle");
        
        market.finalPrice = finalPrice;
        market.settled = true;
        market.status = MarketStatus.SETTLED;
        
        // Calculate winning bucket
        int256 priceChange = (int256(finalPrice) - int256(market.referencePrice)) * 100 / int256(market.referencePrice);
        uint8 winningBucket = _calculateWinningBucket(priceChange, market.sessionType);
        market.winningOutcome = winningBucket;
        
        emit MarketSettled(marketId, finalPrice, winningBucket);
    }
    
    /**
     * @notice Claim payout after market settles
     */
    function claimPayout(uint256 marketId) external nonReentrant {
        Market storage market = markets[marketId];
        require(market.settled, "Market not settled");
        require(market.status == MarketStatus.SETTLED, "Invalid market status");
        
        UserPosition storage position = userPositions[marketId][msg.sender];
        uint256 userShares = position.shares[market.winningOutcome];
        require(userShares > 0, "No winning shares");
        
        uint256 totalWinningShares = market.totalSharesPerBucket[market.winningOutcome];
        require(totalWinningShares > 0, "No winning shares in bucket");
        
        // Proportional payout
        uint256 payout = (userShares * market.totalLiquidity) / totalWinningShares;
        
        // Clear position
        position.shares[market.winningOutcome] = 0;
        
        // Transfer payout
        token.safeTransfer(msg.sender, payout);
        
        emit PayoutClaimed(marketId, msg.sender, payout);
    }
    
    /**
     * @notice Claim refund if market is cancelled
     */
    function claimRefund(uint256 marketId) external nonReentrant {
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.CANCELLED, "Market not cancelled");
        
        UserPosition storage position = userPositions[marketId][msg.sender];
        uint256 totalInvested = position.totalInvested;
        require(totalInvested > 0, "No investment to refund");
        
        // Calculate refund proportionally to total liquidity
        uint256 refundAmount = 0;
        for (uint8 i = 0; i < market.numOutcomes; i++) {
            uint256 shares = position.shares[i];
            if (shares > 0 && market.totalSharesPerBucket[i] > 0) {
                uint256 outcomeRefund = (shares * market.bucketLiquidity[i]) / market.totalSharesPerBucket[i];
                refundAmount += outcomeRefund;
                position.shares[i] = 0;
            }
        }
        
        require(refundAmount > 0, "No refund available");
        position.totalInvested = 0;
        
        token.safeTransfer(msg.sender, refundAmount);
        emit RefundClaimed(marketId, msg.sender, refundAmount);
    }
    
    /**
     * @notice Lock market (prevent new bets)
     */
    function lockMarket(uint256 marketId) external {
        require(msg.sender == oracle || msg.sender == owner(), "Not authorized");
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.ACTIVE, "Market not active");
        require(block.timestamp >= market.lockTime, "Lock time not reached");
        
        market.status = MarketStatus.LOCKED;
        emit MarketLocked(marketId, block.timestamp);
    }
    
    /**
     * @notice Cancel market and allow refunds
     */
    function cancelMarket(uint256 marketId) external onlyOwner {
        Market storage market = markets[marketId];
        require(!market.settled, "Market already settled");
        require(market.status != MarketStatus.CANCELLED, "Already cancelled");
        
        market.status = MarketStatus.CANCELLED;
    }
    
    /**
     * @notice Update oracle address
     */
    function updateOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Invalid oracle");
        address oldOracle = oracle;
        oracle = newOracle;
        emit OracleUpdated(oldOracle, newOracle);
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
    
    /**
     * @notice Get bucket data for display
     */
    function getBucketData(uint256 marketId, uint8 outcomeIndex) 
        external 
        view 
        returns (uint256 bucketLiquidity, uint256 totalShares) 
    {
        Market storage market = markets[marketId];
        require(market.marketId != 0, "Market does not exist");
        require(outcomeIndex < market.numOutcomes, "Invalid outcome");
        
        return (
            market.bucketLiquidity[outcomeIndex],
            market.totalSharesPerBucket[outcomeIndex]
        );
    }
    
    /**
     * @notice Check if user is eligible for refund
     */
    function isRefundEligible(uint256 marketId) external view returns (bool) {
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.CANCELLED) return false;
        
        UserPosition storage position = userPositions[marketId][msg.sender];
        return position.totalInvested > 0;
    }
    
    /**
     * @notice Calculate winning bucket from price change percentage
     */
    function _calculateWinningBucket(int256 priceChangePercent, SessionType sessionType) 
        private 
        pure 
        returns (uint8) 
    {
        if (sessionType == SessionType.INTRADAY) {
            // Intraday: -10% to +12%, 1% increments, 23 buckets
            if (priceChangePercent <= -10) return 0;
            if (priceChangePercent >= 12) return 22;
            return uint8(int8(priceChangePercent + 10));
        } else {
            // Overnight: -20% to +22%, 1% increments, 43 buckets
            if (priceChangePercent <= -20) return 0;
            if (priceChangePercent >= 22) return 42;
            return uint8(int8(priceChangePercent + 20));
        }
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
}
