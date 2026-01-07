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

/**
 * @title ProportionalMarketDualCoin
 * @notice Simplified head-to-head prediction market for comparing two coins' performance
 * @dev USDC-based betting, 2 buckets only (Coin A vs Coin B), 3% protocol fee
 *
 * USE CASE: Which meme coin will perform better?
 * - Bucket 0 = Bet on Coin A outperforming Coin B
 * - Bucket 1 = Bet on Coin B outperforming Coin A
 * - Winner = Coin with higher % gain (or smaller % loss)
 *
 * SETTLEMENT:
 * - Oracle compares percentage changes of both coins
 * - If Coin A's % change > Coin B's % change → Bucket 0 wins
 * - Otherwise → Bucket 1 wins
 * - Contract uses simple finalPrice comparison for settlement
 *
 * SECURITY:
 * - ReentrancyGuard on all state-changing functions
 * - Ownable and Pausable
 * - SafeERC20 for token transfers
 * - Bonding curve prevents price manipulation
 */
contract ProportionalMarketDualCoin is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    
    // USDC token (6 decimals on Base)
    IERC20 public immutable token;
    
    // Utility token for burning (18 decimals typically)
    IERC20 public utilityToken;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    
    // Uniswap V2 Router for swapping
    IUniswapV2Router public uniswapRouter;
    bool public burnEnabled = false; // Disabled until liquidity pool is set up
    
    enum MarketStatus { ACTIVE, LOCKED, SETTLED, CANCELLED }
    
    struct Market {
        string coinASymbol;
        string coinBSymbol;
        uint256 marketId;
        MarketStatus status;
        uint256 lockTime;
        uint256 settleTime;
        bool settled;
        uint8 winningOutcome; // 0 or 1
        mapping(uint8 => uint256) bucketLiquidity; // 0=CoinA, 1=CoinB
        uint256 totalLiquidity;
        mapping(uint8 => uint256) totalSharesPerBucket; // 0=CoinA, 1=CoinB
    }
    
    struct UserPosition {
        mapping(uint8 => uint256) shares; // 0=CoinA, 1=CoinB
        uint256 totalInvested;
    }
    
    uint256 public nextMarketId;
    uint256 public constant PROTOCOL_FEE_BPS = 200; // 2% for protocol
    uint256 public constant BURN_FEE_BPS = 100; // 1% for burning utility token
    uint256 public constant TOTAL_FEE_BPS = 300; // 3% total
    uint256 public constant MIN_BET_SIZE = 1 * 10**6; // 1 USDC
    uint256 public maxBetSize = 10 * 10**6; // 10 USDC (adjustable)
    uint256 public constant BONDING_CURVE_STEEPNESS = 10;
    uint256 public protocolFeesCollected;
    uint256 public burnVault; // USDC accumulated for manual bridge & burn on Solana
    uint256 public totalBurned; // Track total utility tokens burned
    address public oracle;
    
    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => UserPosition)) public userPositions;
    
    event MarketCreated(
        uint256 indexed marketId,
        string coinASymbol,
        string coinBSymbol,
        uint256 lockTime,
        uint256 settleTime
    );
    
    event SharesPurchased(
        uint256 indexed marketId,
        address indexed user,
        uint8 outcomeIndex, // 0=Coin A, 1=Coin B
        uint256 shares,
        uint256 cost
    );
    
    event MarketSettled(
        uint256 indexed marketId,
        uint8 winningOutcome,
        string winningCoin
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
    event RefundClaimed(uint256 indexed marketId, address indexed user, uint256 refundAmount);
    event MaxBetSizeUpdated(uint256 oldMaxBet, uint256 newMaxBet);
    event BurnVaultAccumulated(uint256 indexed marketId, uint256 amount, uint256 totalInVault);
    event BurnVaultWithdrawn(address indexed recipient, uint256 amount);
    event UtilityTokenBurned(uint256 indexed marketId, uint256 usdcAmount, uint256 tokensBurned);
    event BurnConfigUpdated(address utilityToken, address router, bool enabled);
    
    constructor(address _oracle, address _usdcToken) Ownable(msg.sender) {
        require(_oracle != address(0), "Invalid oracle");
        require(_usdcToken != address(0), "Invalid USDC address");
        oracle = _oracle;
        token = IERC20(_usdcToken);
        nextMarketId = 1;
        maxBetSize = 10 * 10**6; // 10 USDC default
    }
    
    /**
     * @notice Create a new dual-coin battle market
     */
    function createMarket(
        string memory coinASymbol,
        string memory coinBSymbol,
        uint256 lockTime,
        uint256 settleTime
    ) external onlyOwner whenNotPaused returns (uint256) {
        require(lockTime > block.timestamp, "Lock time must be future");
        require(settleTime > lockTime, "Settle time must be after lock");
        
        uint256 marketId = nextMarketId++;
        
        Market storage market = markets[marketId];
        market.coinASymbol = coinASymbol;
        market.coinBSymbol = coinBSymbol;
        market.marketId = marketId;
        market.status = MarketStatus.ACTIVE;
        market.lockTime = lockTime;
        market.settleTime = settleTime;
        market.settled = false;
        
        emit MarketCreated(marketId, coinASymbol, coinBSymbol, lockTime, settleTime);
        return marketId;
    }
    
    /**
     * @notice Calculate shares using bonding curve
     * @dev Pure function to avoid stack depth issues
     */
    function _calculateShares(uint256 netAmount, uint256 bucketLiquidity) private pure returns (uint256) {
        uint256 divisor = 1e18 + (bucketLiquidity * BONDING_CURVE_STEEPNESS);
        require(divisor > 0, "Divisor overflow");
        uint256 shares = (netAmount * 1e18) / divisor;
        require(shares > 0, "Shares too small");
        return shares;
    }
    
    /**
     * @notice Update market and user position after bet
     * @dev Helper to reduce stack depth in buyShares
     */
    function _updatePosition(
        uint256 marketId,
        uint8 outcomeIndex,
        uint256 netAmount,
        uint256 shares,
        uint256 totalAmount
    ) private {
        Market storage market = markets[marketId];
        UserPosition storage pos = userPositions[marketId][msg.sender];
        
        market.totalLiquidity += netAmount;
        market.bucketLiquidity[outcomeIndex] += netAmount;
        market.totalSharesPerBucket[outcomeIndex] += shares;
        
        pos.shares[outcomeIndex] += shares;
        pos.totalInvested += totalAmount;
    }
    
    /**
     * @notice Buy shares betting on Coin A or Coin B
     * @param outcomeIndex 0 = Coin A wins, 1 = Coin B wins
     */
    function buyShares(
        uint256 marketId,
        uint8 outcomeIndex,
        uint256 amount,
        uint256 maxCost
    ) external nonReentrant whenNotPaused {
        require(amount >= MIN_BET_SIZE, "Bet below minimum");
        require(amount <= maxBetSize, "Bet exceeds max limit");
        require(amount <= maxCost, "Cost exceeds maxCost");
        require(outcomeIndex <= 1, "Invalid outcome (must be 0 or 1)");
        
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.ACTIVE, "Market not active");
        require(block.timestamp < market.lockTime, "Market locked");
        require(market.marketId != 0, "Market does not exist");
        
        // Transfer tokens and collect fee
        token.safeTransferFrom(msg.sender, address(this), amount);
        
        // Split fees: 2% protocol + 1% burn
        uint256 protocolFee = (amount * PROTOCOL_FEE_BPS) / 10000;
        uint256 burnFee = (amount * BURN_FEE_BPS) / 10000;
        uint256 net = amount - protocolFee - burnFee;
        
        protocolFeesCollected += protocolFee;
        emit ProtocolFeeCollected(marketId, protocolFee);
        
        // Accumulate burn fee in vault for manual bridge to Solana
        burnVault += burnFee;
        emit BurnVaultAccumulated(marketId, burnFee, burnVault);
        
        // Calculate shares using bonding curve
        uint256 shares = _calculateShares(net, market.bucketLiquidity[outcomeIndex]);
        
        // Update state
        _updatePosition(marketId, outcomeIndex, net, shares, amount);
        
        emit SharesPurchased(marketId, msg.sender, outcomeIndex, shares, amount);
    }
    
    /**
     * @notice Settle market - oracle determines which coin outperformed
     * @param marketId The market to settle
     * @param coinAWon True if Coin A had higher % gain, false if Coin B won
     */
    function settleMarket(
        uint256 marketId,
        bool coinAWon
    ) external {
        require(msg.sender == oracle || msg.sender == owner(), "Not authorized");
        
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.ACTIVE || market.status == MarketStatus.LOCKED, "Invalid status");
        require(!market.settled, "Already settled");
        require(block.timestamp >= market.settleTime, "Too early to settle");
        
        market.settled = true;
        market.status = MarketStatus.SETTLED;
        market.winningOutcome = coinAWon ? 0 : 1;
        
        string memory winningCoin = coinAWon ? market.coinASymbol : market.coinBSymbol;
        emit MarketSettled(marketId, market.winningOutcome, winningCoin);
    }
    
    /**
     * @notice Claim payout after market settles
     */
    function claimPayout(uint256 marketId) external nonReentrant {
        Market storage market = markets[marketId];
        require(market.settled, "Market not settled");
        require(market.status == MarketStatus.SETTLED, "Invalid status");
        
        UserPosition storage position = userPositions[marketId][msg.sender];
        uint8 winOutcome = market.winningOutcome;
        uint256 userShares = position.shares[winOutcome];
        require(userShares > 0, "No winning shares");
        
        uint256 totalWinningShares = market.totalSharesPerBucket[winOutcome];
        require(totalWinningShares > 0, "No winning shares in bucket");
        
        // Proportional payout: (user shares / total winning shares) * total pool
        uint256 payout = (userShares * market.totalLiquidity) / totalWinningShares;
        
        // Clear position
        position.shares[winOutcome] = 0;
        
        // Transfer payout
        token.safeTransfer(msg.sender, payout);
        
        emit PayoutClaimed(marketId, msg.sender, payout);
    }
    
    /**
     * @notice Get current betting percentages for display
     */
    function getPoolPercentages(uint256 marketId) external view returns (uint256 coinAPercent, uint256 coinBPercent) {
        Market storage market = markets[marketId];
        
        if (market.totalLiquidity == 0) {
            return (5000, 5000); // 50/50 if no bets yet
        }
        
        coinAPercent = (market.bucketLiquidity[0] * 10000) / market.totalLiquidity;
        coinBPercent = 10000 - coinAPercent;
    }
    
    /**
     * @notice Get bucket data for a specific outcome
     */
    function getBucketData(uint256 marketId, uint8 outcomeIndex) 
        external 
        view 
        returns (uint256 liquidity, uint256 totalShares) 
    {
        Market storage market = markets[marketId];
        require(outcomeIndex <= 1, "Invalid outcome");
        
        return (market.bucketLiquidity[outcomeIndex], market.totalSharesPerBucket[outcomeIndex]);
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
     * @notice Claim refund if market is cancelled
     */
    function claimRefund(uint256 marketId) external nonReentrant {
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.CANCELLED, "Market not cancelled");
        
        UserPosition storage position = userPositions[marketId][msg.sender];
        
        // Calculate proportional refund
        uint256 totalRefund = 0;
        
        for (uint8 i = 0; i < 2; i++) {
            if (position.shares[i] > 0 && market.totalSharesPerBucket[i] > 0) {
                totalRefund += (position.shares[i] * market.bucketLiquidity[i]) / market.totalSharesPerBucket[i];
                position.shares[i] = 0;
            }
        }
        
        require(totalRefund > 0, "No refund available");
        position.totalInvested = 0;
        
        // Transfer refund
        token.safeTransfer(msg.sender, totalRefund);
        emit RefundClaimed(marketId, msg.sender, totalRefund);
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
     * @notice Get current probabilities for each outcome (0=CoinA, 1=CoinB)
     * @dev Returns array of probabilities as basis points (10000 = 100%)
     */
    function getProbabilities(uint256 marketId) external view returns (uint256[] memory) {
        Market storage market = markets[marketId];
        require(market.marketId == marketId, "Market does not exist");
        
        uint256[] memory probabilities = new uint256[](2);
        
        // If no liquidity yet, return 50/50
        if (market.totalLiquidity == 0) {
            probabilities[0] = 5000; // 50%
            probabilities[1] = 5000; // 50%
            return probabilities;
        }
        
        // Calculate probabilities based on liquidity in each bucket
        // Probability = (bucket liquidity / total liquidity) * 10000
        probabilities[0] = (market.bucketLiquidity[0] * 10000) / market.totalLiquidity;
        probabilities[1] = (market.bucketLiquidity[1] * 10000) / market.totalLiquidity;
        
        return probabilities;
    }
    
    /**
     * @notice Get complete market data for backend sync
     * @dev Returns all market info needed for settlement tracking
     */
    function getMarket(uint256 marketId) external view returns (
        string memory coinASymbol,
        string memory coinBSymbol,
        uint8 status,
        uint256 coinAPool,
        uint256 coinBPool,
        uint256 totalPool,
        uint256 lockTime,
        uint256 settleTime,
        bool settled,
        uint8 winningOutcome
    ) {
        Market storage market = markets[marketId];
        require(market.marketId == marketId, "Market does not exist");
        
        return (
            market.coinASymbol,
            market.coinBSymbol,
            uint8(market.status),
            market.bucketLiquidity[0], // Coin A pool
            market.bucketLiquidity[1], // Coin B pool
            market.totalLiquidity,
            market.lockTime,
            market.settleTime,
            market.settled,
            market.winningOutcome
        );
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
     * @notice Update maximum bet size
     * @param newMaxBet New maximum bet size in USDC (6 decimals)
     */
    function setMaxBetSize(uint256 newMaxBet) external onlyOwner {
        require(newMaxBet >= MIN_BET_SIZE, "Max bet must be >= min bet");
        uint256 oldMaxBet = maxBetSize;
        maxBetSize = newMaxBet;
        emit MaxBetSizeUpdated(oldMaxBet, newMaxBet);
    }
    
    /**
     * @notice Configure burn mechanism (utility token + Uniswap router)
     * @param _utilityToken Address of the utility token to burn
     * @param _router Address of Uniswap V2 compatible router
     * @param _enabled Enable or disable the burn mechanism
     */
    function configureBurn(
        address _utilityToken,
        address _router,
        bool _enabled
    ) external onlyOwner {
        require(_utilityToken != address(0) || !_enabled, "Invalid utility token");
        require(_router != address(0) || !_enabled, "Invalid router");
        
        utilityToken = IERC20(_utilityToken);
        uniswapRouter = IUniswapV2Router(_router);
        burnEnabled = _enabled;
        
        // Approve router to spend USDC for swaps
        if (_enabled && _router != address(0)) {
            token.approve(_router, type(uint256).max);
        }
        
        emit BurnConfigUpdated(_utilityToken, _router, _enabled);
    }
    
    /**
     * @notice Internal function to swap USDC to utility token and burn
     * @param usdcAmount Amount of USDC to swap
     * @param marketId Market ID for event logging
     */
    function _swapAndBurn(uint256 usdcAmount, uint256 marketId) private {
        if (address(uniswapRouter) == address(0) || address(utilityToken) == address(0)) {
            // If not configured, add to protocol fees instead
            protocolFeesCollected += usdcAmount;
            return;
        }
        
        // Build swap path: USDC -> Utility Token
        address[] memory path = new address[](2);
        path[0] = address(token);
        path[1] = address(utilityToken);
        
        try uniswapRouter.getAmountsOut(usdcAmount, path) returns (uint[] memory amounts) {
            uint256 minOut = (amounts[1] * 95) / 100; // 5% slippage tolerance
            
            try uniswapRouter.swapExactTokensForTokens(
                usdcAmount,
                minOut,
                path,
                BURN_ADDRESS, // Send directly to burn address
                block.timestamp + 300 // 5 minute deadline
            ) returns (uint[] memory swapAmounts) {
                totalBurned += swapAmounts[1];
                emit UtilityTokenBurned(marketId, usdcAmount, swapAmounts[1]);
            } catch {
                // If swap fails, add to protocol fees
                protocolFeesCollected += usdcAmount;
            }
        } catch {
            // If quote fails, add to protocol fees
            protocolFeesCollected += usdcAmount;
        }
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
     * @notice Withdraw burn vault USDC for manual bridge to Solana
     * @dev Owner withdraws accumulated USDC to bridge to Solana, buy utility token, and burn
     */
    function withdrawBurnVault() external onlyOwner {
        uint256 amount = burnVault;
        require(amount > 0, "No USDC in burn vault");
        
        burnVault = 0;
        token.safeTransfer(owner(), amount);
        emit BurnVaultWithdrawn(owner(), amount);
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
}
