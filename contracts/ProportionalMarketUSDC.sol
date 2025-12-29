// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Uniswap V2 Router interface for swapping USDC → Utility Token
interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    
    function getAmountsOut(uint amountIn, address[] calldata path) 
        external view returns (uint[] memory amounts);
}

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
 * @dev Uses USDC for betting. Protocol takes 3% fee: 2% for protocol, 1% auto-swapped to burn utility token
 *
 * USDC Token on Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (6 decimals)
 * 
 * FEE STRUCTURE:
 * - Total fee: 3% (300 BPS)
 * - 2% protocol fee (collected in USDC for owner)
 * - 1% burn fee (auto-swapped USDC → utility token → burned)
 *
 * SECURITY FEATURES:
 * - ReentrancyGuard on all state-changing functions
 * - Access control with Ownable and Pausable
 * - SafeERC20 for token transfers
 * - Proportional payout distribution
 * - Minimum bet size (1 USDC) to prevent dust trades
 * - Bonding curve with safety limits
 */
contract ProportionalMarketMIND is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    
    // USDC token (6 decimals)
    IERC20 public immutable token;
    
    // Utility token for burning (18 decimals typically)
    IERC20 public immutable utilityToken;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    
    // Uniswap V2 Router for swapping
    IUniswapV2Router public immutable uniswapRouter;
    
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
    uint256 public constant PROTOCOL_FEE_BPS = 200; // 2% for protocol
    uint256 public constant BURN_FEE_BPS = 100; // 1% for burning utility token
    uint256 public constant TOTAL_FEE_BPS = 300; // 3% total
    uint256 public constant MIN_BET_SIZE = 1 * 10**6; // 1 USDC (6 decimals)
    uint256 public constant PRICE_DEVIATION_TOLERANCE_BPS = 10; // 0.1% tolerance for Chainlink validation
    uint256 public protocolFeesCollected;
    uint256 public totalBurned; // Track total utility tokens burned
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
    
    event UtilityTokenBurned(
        uint256 indexed marketId,
        uint256 usdcAmount,
        uint256 tokensBurned
    );
    
    event RefundClaimed(
        uint256 indexed marketId,
        address indexed user,
        uint256 refundAmount
    );
    
    constructor(
        address _oracle, 
        address _usdcToken,
        address _utilityToken,
        address _uniswapRouter
    ) Ownable(msg.sender) {
        require(_oracle != address(0), "Invalid oracle");
        require(_usdcToken != address(0), "Invalid USDC address");
        require(_utilityToken != address(0), "Invalid utility token address");
        require(_uniswapRouter != address(0), "Invalid router address");
        oracle = _oracle;
        token = IERC20(_usdcToken);
        utilityToken = IERC20(_utilityToken);
        uniswapRouter = IUniswapV2Router(_uniswapRouter);
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
        market.numOutcomes = 10; // Meme coin buckets: 5 gain + 5 loss buckets (5% increments up to 20%+)
        market.referencePrice = referencePrice;
        market.lockTime = lockTime;
        market.settleTime = settleTime;
        
        emit MarketCreated(marketId, stockSymbol, sessionType, market.numOutcomes, referencePrice, lockTime, settleTime);
        
        return marketId;
    }
    
    /**
     * @notice Buy shares in an outcome bucket (bonding curve)
     * @param marketId The market ID
     * @param outcomeIndex The bucket index to buy
     * @param amount Amount of tokens to spend
     * @param maxCost Maximum cost willing to pay (slippage protection)
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
        require(market.marketId != 0, "Market does not exist"); // Ensure market was created
        
        // Transfer tokens from user to contract
        token.safeTransferFrom(msg.sender, address(this), amount);
        
        // Split fees: 2% protocol + 1% burn
        uint256 protocolFee = (amount * PROTOCOL_FEE_BPS) / 10000;
        uint256 burnFee = (amount * BURN_FEE_BPS) / 10000;
        uint256 netAmount = amount - protocolFee - burnFee;
        
        protocolFeesCollected += protocolFee;
        emit ProtocolFeeCollected(marketId, protocolFee);
        
        // Auto-swap and burn utility token (1% of bet)
        if (burnFee > 0) {
            _swapAndBurn(burnFee, marketId);
        }
        
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
     * @dev DISABLED - All positions are locked until settlement to ensure liquidity for winners
     *      Users can hedge by buying multiple outcomes but cannot exit early
     */
    function sellShares(
        uint256 /* marketId */,
        uint8 /* outcomeIndex */,
        uint256 /* sharesToSell */,
        uint256 /* minPayout */
    ) external nonReentrant whenNotPaused {
        // Selling is disabled - positions are locked until market settles
        // This ensures all money stays in the pool for winners
        revert("Positions locked until settlement - hedge by buying other outcomes");
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
        require(!market.settled, "Already settled"); // Prevent double settlement
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
        
        // Handle 2-bucket dual-coin markets differently
        if (market.numOutcomes == 2) {
            // For dual-coin battles: finalPrice >= referencePrice means Coin A wins (bucket 0)
            // finalPrice < referencePrice means Coin B wins (bucket 1)
            market.winningOutcome = finalPrice >= market.referencePrice ? 0 : 1;
        } else {
            // For 10-bucket solo markets: use traditional getBucketIndex logic
            int256 priceChangePercent = ((int256(finalPrice) - int256(market.referencePrice)) * 10000) / int256(market.referencePrice);
            market.winningOutcome = getBucketIndex(priceChangePercent, market.sessionType);
        }
        
        emit MarketSettled(marketId, finalPrice, market.winningOutcome);
    }
    
    /**
     * @notice Claim payout for winning shares
     * @dev Uses bonding curve shares - early buyers have more shares = bigger payout
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
        // Early buyers got more shares per dollar via bonding curve, so they get bigger slice
        uint256 payout = (userWinningShares * market.totalLiquidity) / totalWinningShares;
        
        // Mark as claimed BEFORE transfer (CEI pattern)
        position.shares[market.winningOutcome] = 0;
        position.investmentPerOutcome[market.winningOutcome] = 0;
        position.purchaseProbabilityBPS[market.winningOutcome] = 0;
        
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
            position.investmentPerOutcome[i] = 0;
            position.purchaseProbabilityBPS[i] = 0;
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
     * @notice Get a quote for selling shares (view function, no state changes)
     * @dev SELLING IS DISABLED - Returns 0 to indicate positions are locked
     */
    function getSellQuote(
        uint256 /* marketId */, 
        uint8 /* outcomeIndex */, 
        uint256 /* sharesToSell */
    ) external pure returns (uint256 grossPayout, uint256 netPayout, uint256 sellFee) {
        // Selling is disabled - all positions locked until settlement
        return (0, 0, 0);
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
    
    function getBucketIndex(int256 priceChangePercent, SessionType /* sessionType */) public pure returns (uint8) {
        // Meme coin buckets: 10 total buckets (5% increments up to 20%+)
        // Gain buckets (0-4): 20%+, 15-20%, 10-15%, 5-10%, 0-5%
        // Loss buckets (5-9): 0 to -5%, -5 to -10%, -10 to -15%, -15 to -20%, -20%+
        // priceChangePercent is in basis points (100 = 1%)
        
        if (priceChangePercent >= 0) {
            // Gain buckets
            if (priceChangePercent >= 2000) return 0;      // +20%+
            if (priceChangePercent >= 1500) return 1;      // +15% to +20%
            if (priceChangePercent >= 1000) return 2;      // +10% to +15%
            if (priceChangePercent >= 500) return 3;       // +5% to +10%
            return 4;                                       // 0% to +5%
        } else {
            // Loss buckets (priceChangePercent is negative)
            if (priceChangePercent <= -2000) return 9;     // -20%+
            if (priceChangePercent <= -1500) return 8;     // -15% to -20%
            if (priceChangePercent <= -1000) return 7;     // -10% to -15%
            if (priceChangePercent <= -500) return 6;      // -5% to -10%
            return 5;                                       // 0% to -5%
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
     
    
    /**
     * @notice Swap USDC to utility token and burn it
     * @dev Called internally when users place bets (1% burn fee)
     */
    function _swapAndBurn(uint256 usdcAmount, uint256 marketId) private {
        // Approve router to spend USDC (use approve instead of safeApprove to avoid allowance restrictions)
        token.approve(address(uniswapRouter), usdcAmount);
        
        // Set up swap path: USDC → Utility Token
        address[] memory path = new address[](2);
        path[0] = address(token); // USDC
        path[1] = address(utilityToken); // Utility token
        
        try uniswapRouter.swapExactTokensForTokens(
            usdcAmount,
            0, // Accept any amount of utility tokens
            path,
            address(this), // Receive tokens to this contract
            block.timestamp + 300 // 5 minute deadline
        ) returns (uint[] memory amounts) {
            uint256 tokensBought = amounts[1];
            
            // Burn the utility tokens by sending to dead address
            if (tokensBought > 0) {
                utilityToken.safeTransfer(BURN_ADDRESS, tokensBought);
                totalBurned += tokensBought;
                emit UtilityTokenBurned(marketId, usdcAmount, tokensBought);
            }
        } catch {
            // If swap fails (low liquidity, etc.), add to protocol fees instead
            protocolFeesCollected += usdcAmount;
        }
        
        // Reset approval to 0 for security
        token.approve(address(uniswapRouter), 0);
    }
    
    /**
     * @notice View function to estimate burn amount
     */
    function estimateBurnAmount(uint256 usdcAmount) external view returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = address(token);
        path[1] = address(utilityToken);
        
        try uniswapRouter.getAmountsOut(usdcAmount, path) returns (uint[] memory amounts) {
            return amounts[1];
        } catch {
            return 0;
        }
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
     * @dev Redirects to claimPayout to prevent double-claim vulnerability
     */
    function claimWinnings(uint256 marketId) external {
        // Delegate to claimPayout to avoid code duplication and double-claim risk
        this.claimPayout(marketId);
    }
}
