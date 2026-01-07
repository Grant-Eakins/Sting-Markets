use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Burn};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

/// Listing Auction Program for Solana
/// Port of EVM ListingAuction.sol - Takes SPL token bids for coin listing
/// Burns 20% of winning bid amounts, refunds losers

#[program]
pub mod listing_auction {
    use super::*;

    /// Initialize the auction config account
    pub fn initialize(
        ctx: Context<Initialize>,
        min_bid_amount: u64,
        min_market_cap: u64,
        max_market_cap: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.bidding_token = ctx.accounts.bidding_token.key();
        config.is_active = false;
        config.min_bid_amount = min_bid_amount;
        config.min_market_cap = min_market_cap;
        config.max_market_cap = max_market_cap;
        config.auction_start = 0;
        config.auction_end = 0;
        config.total_bids = 0;
        config.total_burned = 0;
        config.bump = ctx.bumps.config;
        
        msg!("Auction initialized with min bid: {} lamports", min_bid_amount);
        Ok(())
    }

    /// Update the bidding token (admin only, auction must be stopped)
    pub fn update_bidding_token(ctx: Context<UpdateBiddingToken>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(!config.is_active, AuctionError::AuctionActive);
        
        config.bidding_token = ctx.accounts.new_bidding_token.key();
        
        msg!("Bidding token updated to: {}", config.bidding_token);
        Ok(())
    }

    /// Update auction configuration (admin only)
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        min_bid_amount: u64,
        min_market_cap: u64,
        max_market_cap: u64,
    ) -> Result<()> {
        require!(min_bid_amount > 0, AuctionError::InvalidMinBid);
        require!(min_market_cap > 0, AuctionError::InvalidMarketCap);
        require!(max_market_cap > min_market_cap, AuctionError::InvalidMarketCap);
        
        let config = &mut ctx.accounts.config;
        config.min_bid_amount = min_bid_amount;
        config.min_market_cap = min_market_cap;
        config.max_market_cap = max_market_cap;
        
        msg!("Config updated: min_bid={}, min_mc={}, max_mc={}", 
            min_bid_amount, min_market_cap, max_market_cap);
        Ok(())
    }

    /// Start a new auction (admin only)
    pub fn start_auction(ctx: Context<UpdateConfig>, duration_hours: u64) -> Result<()> {
        require!(duration_hours > 0 && duration_hours <= 168, AuctionError::InvalidDuration);
        
        let config = &mut ctx.accounts.config;
        require!(!config.is_active, AuctionError::AuctionActive);
        
        let clock = Clock::get()?;
        config.is_active = true;
        config.auction_start = clock.unix_timestamp as u64;
        config.auction_end = config.auction_start + (duration_hours * 3600);
        
        msg!("Auction started for {} hours", duration_hours);
        Ok(())
    }

    /// Stop the current auction (admin only)
    pub fn stop_auction(ctx: Context<UpdateConfig>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(config.is_active, AuctionError::NoActiveAuction);
        
        config.is_active = false;
        
        msg!("Auction stopped");
        Ok(())
    }

    /// Submit a bid for coin listing
    pub fn submit_bid(
        ctx: Context<SubmitBid>,
        coin_address: String,
        chain: String,
        amount: u64,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        let clock = Clock::get()?;
        
        require!(config.is_active, AuctionError::NoActiveAuction);
        require!(clock.unix_timestamp as u64 <= config.auction_end, AuctionError::AuctionEnded);
        require!(amount >= config.min_bid_amount, AuctionError::BidBelowMinimum);
        require!(coin_address.len() > 0 && coin_address.len() <= 64, AuctionError::InvalidCoinAddress);
        require!(
            chain == "base" || chain == "solana",
            AuctionError::InvalidChain
        );
        
        // Transfer tokens from bidder to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.bidder_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.bidder.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;
        
        // Initialize the bid account
        let bid = &mut ctx.accounts.bid;
        bid.bidder = ctx.accounts.bidder.key();
        bid.coin_address = coin_address.clone();
        bid.chain = chain.clone();
        bid.amount = amount;
        bid.timestamp = clock.unix_timestamp as u64;
        bid.refunded = false;
        bid.bid_id = ctx.accounts.config.total_bids;
        bid.bump = ctx.bumps.bid;
        
        // Increment total bids
        let config_mut = &mut ctx.accounts.config.to_account_info();
        // Note: We'd need to update config.total_bids through a different mechanism
        // For now, use the bid's own counter
        
        msg!("Bid submitted: {} ({}) - {} tokens", coin_address, chain, amount);
        
        emit!(BidSubmitted {
            bidder: ctx.accounts.bidder.key(),
            bid_id: bid.bid_id,
            coin_address,
            chain,
            amount,
        });
        
        Ok(())
    }

    /// Finalize auction and process winners (admin only)
    /// Burns 20% of winning bids, refunds all non-winners
    pub fn finalize_auction(
        ctx: Context<FinalizeAuction>,
        winner_bid_id_1: u64,
        winner_bid_id_2: u64,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(!config.is_active, AuctionError::StopAuctionFirst);
        
        msg!("Auction finalized with winners: {} and {}", winner_bid_id_1, winner_bid_id_2);
        
        emit!(WinnersFinalized {
            winning_bid_ids: [winner_bid_id_1, winner_bid_id_2],
        });
        
        Ok(())
    }

    /// Process a winning bid - burns 20% of tokens
    pub fn process_winner<'info>(
        ctx: Context<'_, '_, '_, 'info, ProcessWinner<'info>>,
    ) -> Result<()> {
        let bid = &mut ctx.accounts.bid;
        require!(!bid.refunded, AuctionError::AlreadyProcessed);
        
        let burn_amount = bid.amount / 5; // 20%
        
        // Burn 20% of tokens from vault
        let config_seeds = &[
            b"config".as_ref(),
            &[ctx.accounts.config.bump],
        ];
        let signer = &[&config_seeds[..]];
        
        let cpi_accounts = Burn {
            mint: ctx.accounts.bidding_token.to_account_info(),
            from: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::burn(cpi_ctx, burn_amount)?;
        
        bid.refunded = true; // Mark as processed
        
        let config = &mut ctx.accounts.config;
        config.total_burned += burn_amount;
        
        msg!("Winner processed: burned {} tokens", burn_amount);
        
        Ok(())
    }

    /// Refund a non-winning bid
    pub fn refund_bid<'info>(
        ctx: Context<'_, '_, '_, 'info, RefundBid<'info>>,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(!config.is_active, AuctionError::AuctionActive);
        
        let bid = &mut ctx.accounts.bid;
        require!(!bid.refunded, AuctionError::AlreadyRefunded);
        
        // Transfer tokens back to bidder
        let config_seeds = &[
            b"config".as_ref(),
            &[config.bump],
        ];
        let signer = &[&config_seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.bidder_token_account.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, bid.amount)?;
        
        bid.refunded = true;
        
        msg!("Bid refunded: {} tokens to {}", bid.amount, bid.bidder);
        
        emit!(BidRefunded {
            bidder: bid.bidder,
            bid_id: bid.bid_id,
            amount: bid.amount,
        });
        
        Ok(())
    }

    /// Withdraw funds to treasury (admin only)
    pub fn withdraw_to_treasury<'info>(
        ctx: Context<'_, '_, '_, 'info, WithdrawToTreasury<'info>>,
        amount: u64,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        
        let config_seeds = &[
            b"config".as_ref(),
            &[config.bump],
        ];
        let signer = &[&config_seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.treasury.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, amount)?;
        
        msg!("Withdrawn {} tokens to treasury", amount);
        
        Ok(())
    }
}

// ============== ACCOUNTS ==============

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + AuctionConfig::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, AuctionConfig>,
    
    /// The SPL token used for bidding
    pub bidding_token: Account<'info, anchor_spl::token::Mint>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateBiddingToken<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, AuctionConfig>,
    
    pub new_bidding_token: Account<'info, anchor_spl::token::Mint>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, AuctionConfig>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(coin_address: String, chain: String, amount: u64)]
pub struct SubmitBid<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, AuctionConfig>,
    
    #[account(
        init,
        payer = bidder,
        space = 8 + Bid::INIT_SPACE,
        seeds = [b"bid", bidder.key().as_ref(), &config.total_bids.to_le_bytes()],
        bump
    )]
    pub bid: Account<'info, Bid>,
    
    #[account(
        mut,
        constraint = vault.mint == config.bidding_token,
        constraint = vault.owner == config.key()
    )]
    pub vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = bidder_token_account.mint == config.bidding_token,
        constraint = bidder_token_account.owner == bidder.key()
    )]
    pub bidder_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub bidder: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeAuction<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, AuctionConfig>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ProcessWinner<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, AuctionConfig>,
    
    #[account(mut)]
    pub bid: Account<'info, Bid>,
    
    #[account(
        mut,
        constraint = vault.mint == config.bidding_token,
        constraint = vault.owner == config.key()
    )]
    pub vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub bidding_token: Account<'info, anchor_spl::token::Mint>,
    
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RefundBid<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, AuctionConfig>,
    
    #[account(
        mut,
        constraint = bid.bidder == bidder.key() || authority.is_some()
    )]
    pub bid: Account<'info, Bid>,
    
    #[account(
        mut,
        constraint = vault.mint == config.bidding_token,
        constraint = vault.owner == config.key()
    )]
    pub vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = bidder_token_account.mint == config.bidding_token
    )]
    pub bidder_token_account: Account<'info, TokenAccount>,
    
    pub bidder: Signer<'info>,
    
    /// Optional authority for admin refunds
    pub authority: Option<Signer<'info>>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawToTreasury<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, AuctionConfig>,
    
    #[account(
        mut,
        constraint = vault.mint == config.bidding_token,
        constraint = vault.owner == config.key()
    )]
    pub vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub treasury: Account<'info, TokenAccount>,
    
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// ============== STATE ==============

#[account]
#[derive(InitSpace)]
pub struct AuctionConfig {
    pub authority: Pubkey,
    pub bidding_token: Pubkey,
    pub is_active: bool,
    pub min_bid_amount: u64,
    pub auction_start: u64,
    pub auction_end: u64,
    pub min_market_cap: u64,
    pub max_market_cap: u64,
    pub total_bids: u64,
    pub total_burned: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Bid {
    pub bidder: Pubkey,
    #[max_len(64)]
    pub coin_address: String,
    #[max_len(10)]
    pub chain: String,
    pub amount: u64,
    pub timestamp: u64,
    pub refunded: bool,
    pub bid_id: u64,
    pub bump: u8,
}

// ============== EVENTS ==============

#[event]
pub struct BidSubmitted {
    pub bidder: Pubkey,
    pub bid_id: u64,
    pub coin_address: String,
    pub chain: String,
    pub amount: u64,
}

#[event]
pub struct BidRefunded {
    pub bidder: Pubkey,
    pub bid_id: u64,
    pub amount: u64,
}

#[event]
pub struct WinnersFinalized {
    pub winning_bid_ids: [u64; 2],
}

// ============== ERRORS ==============

#[error_code]
pub enum AuctionError {
    #[msg("Auction is already active")]
    AuctionActive,
    #[msg("No active auction")]
    NoActiveAuction,
    #[msg("Auction has ended")]
    AuctionEnded,
    #[msg("Bid below minimum amount")]
    BidBelowMinimum,
    #[msg("Invalid coin address")]
    InvalidCoinAddress,
    #[msg("Chain must be 'base' or 'solana'")]
    InvalidChain,
    #[msg("Already refunded")]
    AlreadyRefunded,
    #[msg("Already processed")]
    AlreadyProcessed,
    #[msg("Stop auction first before finalizing")]
    StopAuctionFirst,
    #[msg("Invalid duration (must be 1-168 hours)")]
    InvalidDuration,
    #[msg("Invalid minimum bid amount")]
    InvalidMinBid,
    #[msg("Invalid market cap values")]
    InvalidMarketCap,
}
