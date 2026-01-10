// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ListingAuction
 * @notice Auction system for coin listing bids using USDC
 * @dev Token address is configurable by owner, allowing migration from testnet to mainnet
 * @dev Winning bid amounts are vaulted (kept in contract) for treasury withdrawal
 */
contract ListingAuction is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Bid {
        address bidder;
        string coinContractAddress;
        string chain; // "base" or "solana"
        uint256 amount;
        uint256 timestamp;
        bool refunded;
    }

    struct AuctionConfig {
        bool isActive;
        uint256 minBidAmount;
        uint256 auctionStart;
        uint256 auctionEnd;
        uint256 minMarketCap;
        uint256 maxMarketCap;
    }

    // Configurable token address - owner can update for mainnet migration
    IERC20 public biddingToken;
    
    AuctionConfig public config;
    Bid[] public bids;
    mapping(address => uint256[]) public bidsByAddress;
    // Track the highest bid per coin (coinAddress hash => bidId)
    mapping(bytes32 => uint256) public highestBidPerCoin;
    // Track if a coin has any bids
    mapping(bytes32 => bool) public coinHasBids;
    
    uint256 public totalVaulted; // Track total tokens vaulted from winning bids
    
    // Events
    event TokenUpdated(address indexed oldToken, address indexed newToken);
    event AuctionStarted(uint256 startTime, uint256 endTime, uint256 minBid);
    event AuctionStopped(uint256 timestamp);
    event BidSubmitted(
        address indexed bidder, 
        uint256 indexed bidId, 
        string coinAddress, 
        string chain, 
        uint256 amount
    );
    event BidRefunded(address indexed bidder, uint256 indexed bidId, uint256 amount);
    event ConfigUpdated(uint256 minBid, uint256 minMarketCap, uint256 maxMarketCap);
    event WinnersFinalized(uint256[] winningBidIds, uint256 totalVaulted);
    event TokensVaulted(uint256 amount);

    constructor(address _biddingToken) Ownable(msg.sender) {
        require(_biddingToken != address(0), "Invalid token address");
        biddingToken = IERC20(_biddingToken);
        
        // Default config - adjust minBidAmount based on token decimals
        // USDC has 6 decimals, so 100 USDC = 100 * 10**6
        // MIND has 18 decimals, so 100 MIND = 100 * 10**18
        config.minBidAmount = 100 * 10**6; // 100 USDC default (6 decimals)
        config.minMarketCap = 500000; // $500k default
        config.maxMarketCap = 50000000; // $50M default
    }

    /**
     * @notice Update the bidding token address (for mainnet migration)
     * @param _newToken New ERC20 token address
     */
    function updateBiddingToken(address _newToken) external onlyOwner {
        require(_newToken != address(0), "Invalid token address");
        require(!config.isActive, "Cannot change token during active auction");
        
        address oldToken = address(biddingToken);
        biddingToken = IERC20(_newToken);
        
        emit TokenUpdated(oldToken, _newToken);
    }

    /**
     * @notice Update auction configuration
     */
    function updateConfig(
        uint256 _minBidAmount,
        uint256 _minMarketCap,
        uint256 _maxMarketCap
    ) external onlyOwner {
        require(_minBidAmount > 0, "Min bid must be > 0");
        require(_minMarketCap > 0, "Min market cap must be > 0");
        require(_maxMarketCap > _minMarketCap, "Max must be > min");
        
        config.minBidAmount = _minBidAmount;
        config.minMarketCap = _minMarketCap;
        config.maxMarketCap = _maxMarketCap;
        
        emit ConfigUpdated(_minBidAmount, _minMarketCap, _maxMarketCap);
    }

    /**
     * @notice Start a new auction
     * @param durationHours How long the auction runs
     */
    function startAuction(uint256 durationHours) external onlyOwner {
        require(!config.isActive, "Auction already active");
        require(durationHours > 0 && durationHours <= 168, "Duration must be 1-168 hours");
        
        config.isActive = true;
        config.auctionStart = block.timestamp;
        config.auctionEnd = block.timestamp + (durationHours * 1 hours);
        
        emit AuctionStarted(config.auctionStart, config.auctionEnd, config.minBidAmount);
    }

    /**
     * @notice Stop the current auction
     */
    function stopAuction() external onlyOwner {
        require(config.isActive, "No active auction");
        config.isActive = false;
        emit AuctionStopped(block.timestamp);
    }

    /**
     * @notice Submit a bid for coin listing
     * @param coinAddress Contract address of the coin to list
     * @param chain "base" or "solana"
     * @param amount Amount of tokens to bid
     * @dev If the coin already has a bid, the new bid must be higher than the existing highest bid
     */
    function submitBid(
        string calldata coinAddress,
        string calldata chain,
        uint256 amount
    ) external nonReentrant {
        require(config.isActive, "No active auction");
        require(block.timestamp <= config.auctionEnd, "Auction has ended");
        require(amount >= config.minBidAmount, "Bid below minimum");
        require(bytes(coinAddress).length > 0, "Invalid coin address");
        require(
            keccak256(bytes(chain)) == keccak256(bytes("base")) || 
            keccak256(bytes(chain)) == keccak256(bytes("solana")),
            "Chain must be 'base' or 'solana'"
        );

        // Check if this coin already has bids - new bid must be higher
        bytes32 coinHash = keccak256(abi.encodePacked(coinAddress));
        if (coinHasBids[coinHash]) {
            uint256 existingHighestBidId = highestBidPerCoin[coinHash];
            require(
                amount > bids[existingHighestBidId].amount,
                "Bid must be higher than existing bid for this coin"
            );
        }

        // Transfer tokens from bidder to contract
        biddingToken.safeTransferFrom(msg.sender, address(this), amount);

        // Record the bid
        uint256 bidId = bids.length;
        bids.push(Bid({
            bidder: msg.sender,
            coinContractAddress: coinAddress,
            chain: chain,
            amount: amount,
            timestamp: block.timestamp,
            refunded: false
        }));

        bidsByAddress[msg.sender].push(bidId);
        
        // Update highest bid tracking for this coin
        highestBidPerCoin[coinHash] = bidId;
        coinHasBids[coinHash] = true;

        emit BidSubmitted(msg.sender, bidId, coinAddress, chain, amount);
    }

    /**
     * @notice Get leaderboard (top bids sorted by amount)
     * @param limit Maximum number of bids to return
     */
    function getLeaderboard(uint256 limit) external view returns (
        uint256[] memory bidIds,
        address[] memory bidders,
        string[] memory coinAddresses,
        string[] memory chains,
        uint256[] memory amounts
    ) {
        uint256 totalBids = bids.length;
        if (totalBids == 0) {
            return (new uint256[](0), new address[](0), new string[](0), new string[](0), new uint256[](0));
        }

        // Create array of indices for sorting
        uint256[] memory indices = new uint256[](totalBids);
        for (uint256 i = 0; i < totalBids; i++) {
            indices[i] = i;
        }

        // Simple bubble sort by amount (descending)
        for (uint256 i = 0; i < totalBids; i++) {
            for (uint256 j = i + 1; j < totalBids; j++) {
                if (bids[indices[j]].amount > bids[indices[i]].amount) {
                    uint256 temp = indices[i];
                    indices[i] = indices[j];
                    indices[j] = temp;
                }
            }
        }

        // Return top N results
        uint256 resultCount = totalBids < limit ? totalBids : limit;
        bidIds = new uint256[](resultCount);
        bidders = new address[](resultCount);
        coinAddresses = new string[](resultCount);
        chains = new string[](resultCount);
        amounts = new uint256[](resultCount);

        for (uint256 i = 0; i < resultCount; i++) {
            uint256 idx = indices[i];
            bidIds[i] = idx;
            bidders[i] = bids[idx].bidder;
            coinAddresses[i] = bids[idx].coinContractAddress;
            chains[i] = bids[idx].chain;
            amounts[i] = bids[idx].amount;
        }

        return (bidIds, bidders, coinAddresses, chains, amounts);
    }

    /**
     * @notice Finalize auction and mark top 2 bids as winners
     * @param winningBidIds Array of winning bid IDs (top 2)
     * @dev Automatically refunds all non-winning bids, vaults 100% of winning bid amounts
     * @dev Validates that the two winning bids are for different coins
     */
    function finalizeAuction(uint256[] calldata winningBidIds) external onlyOwner nonReentrant {
        require(!config.isActive, "Stop auction first");
        require(winningBidIds.length == 2, "Must select exactly 2 winners");
        require(bids.length >= 2, "Not enough bids");

        // Validate winning bid IDs
        for (uint256 i = 0; i < winningBidIds.length; i++) {
            require(winningBidIds[i] < bids.length, "Invalid bid ID");
        }

        // Ensure the two winning bids are for DIFFERENT coins
        require(
            keccak256(bytes(bids[winningBidIds[0]].coinContractAddress)) != 
            keccak256(bytes(bids[winningBidIds[1]].coinContractAddress)),
            "Winners must be different coins"
        );

        uint256 totalVaultAmount = 0;

        // Automatically refund all non-winning bids
        for (uint256 i = 0; i < bids.length; i++) {
            // Check if this is a winning bid
            bool isWinner = false;
            for (uint256 j = 0; j < winningBidIds.length; j++) {
                if (i == winningBidIds[j]) {
                    isWinner = true;
                    break;
                }
            }

            if (isWinner) {
                // For winning bids: vault 100% of the amount (stays in contract)
                totalVaultAmount += bids[i].amount;
                // Tokens stay in contract - no transfer needed
            } else if (!bids[i].refunded) {
                // For non-winning bids: refund the full amount
                bids[i].refunded = true;
                biddingToken.safeTransfer(bids[i].bidder, bids[i].amount);
                emit BidRefunded(bids[i].bidder, i, bids[i].amount);
            }
        }

        totalVaulted += totalVaultAmount;
        emit TokensVaulted(totalVaultAmount);
        emit WinnersFinalized(winningBidIds, totalVaultAmount);
    }

    /**
     * @notice Refund a non-winning bid
     * @param bidId ID of the bid to refund
     */
    function refundBid(uint256 bidId) external nonReentrant {
        require(bidId < bids.length, "Invalid bid ID");
        Bid storage bid = bids[bidId];
        
        require(!config.isActive, "Auction still active");
        require(msg.sender == bid.bidder || msg.sender == owner(), "Not authorized");
        require(!bid.refunded, "Already refunded");

        bid.refunded = true;
        biddingToken.safeTransfer(bid.bidder, bid.amount);

        emit BidRefunded(bid.bidder, bidId, bid.amount);
    }

    /**
     * @notice Batch refund multiple bids (owner only)
     */
    function batchRefund(uint256[] calldata bidIds) external onlyOwner nonReentrant {
        require(!config.isActive, "Auction still active");
        
        for (uint256 i = 0; i < bidIds.length; i++) {
            uint256 bidId = bidIds[i];
            require(bidId < bids.length, "Invalid bid ID");
            
            Bid storage bid = bids[bidId];
            if (!bid.refunded) {
                bid.refunded = true;
                biddingToken.safeTransfer(bid.bidder, bid.amount);
                emit BidRefunded(bid.bidder, bidId, bid.amount);
            }
        }
    }

    /**
     * @notice Get all bids by a specific address
     */
    function getBidsByAddress(address bidder) external view returns (uint256[] memory) {
        return bidsByAddress[bidder];
    }

    /**
     * @notice Get total number of bids
     */
    function getTotalBids() external view returns (uint256) {
        return bids.length;
    }

    /**
     * @notice Get bid details
     */
    function getBid(uint256 bidId) external view returns (
        address bidder,
        string memory coinAddress,
        string memory chain,
        uint256 amount,
        uint256 timestamp,
        bool refunded
    ) {
        require(bidId < bids.length, "Invalid bid ID");
        Bid memory bid = bids[bidId];
        return (bid.bidder, bid.coinContractAddress, bid.chain, bid.amount, bid.timestamp, bid.refunded);
    }

    /**
     * @notice Withdraw winning bid tokens to treasury (owner only)
     * @param amount Amount to withdraw
     */
    function withdrawToTreasury(uint256 amount) external onlyOwner nonReentrant {
        require(amount <= biddingToken.balanceOf(address(this)), "Insufficient balance");
        biddingToken.safeTransfer(owner(), amount);
    }

    /**
     * @notice Get current vault balance (tokens held in contract)
     * @return balance Current token balance in the contract
     * @return vaulted Total amount vaulted from winning bids (historical)
     */
    function getVaultBalance() external view returns (uint256 balance, uint256 vaulted) {
        return (biddingToken.balanceOf(address(this)), totalVaulted);
    }

    /**
     * @notice Emergency withdraw - only if no active auction (safety measure)
     */
    function emergencyWithdraw() external onlyOwner nonReentrant {
        require(!config.isActive, "Cannot withdraw during active auction");
        uint256 balance = biddingToken.balanceOf(address(this));
        if (balance > 0) {
            biddingToken.safeTransfer(owner(), balance);
        }
    }

    /**
     * @notice Clear all bids after auction is finalized (for next cycle)
     * @dev Only call after finalizeAuction has been called and all refunds processed
     * @dev This resets the auction state for a fresh start
     */
    function clearBids() external onlyOwner {
        require(!config.isActive, "Cannot clear during active auction");
        
        // Clear the bids array by resetting length
        // Note: This doesn't clear storage slots but makes them inaccessible
        delete bids;
        
        // We cannot easily clear mappings in Solidity, but since bids array is reset,
        // old bidsByAddress entries will reference invalid indices (which is fine)
        // highestBidPerCoin and coinHasBids will be stale but get overwritten on new bids
        
        emit AuctionCleared(block.timestamp, bids.length);
    }

    event AuctionCleared(uint256 timestamp, uint256 previousBidCount);
}
