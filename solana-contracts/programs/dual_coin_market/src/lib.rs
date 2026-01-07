use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("HmbTLCmaGvZhKnn1Zfa1JVnp7vkMV4DYVxPLWBVoN65L");

/// Dual Coin Prediction Market Program for Solana
/// Port of EVM ProportionalMarketDualCoin.sol
/// Uses native SOL for betting instead of USDC
/// 3% fee: 2% protocol + 1% burn

#[program]
pub mod dual_coin_market {
    use super::*;

    /// Initialize the protocol config
    pub fn initialize(
        ctx: Context<Initialize>,
        max_bet_size: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.oracle = ctx.accounts.authority.key(); // Initially same as authority
        config.next_market_id = 1;
        config.protocol_fees_collected = 0;
        config.total_burned = 0;
        config.max_bet_size = max_bet_size;
        config.min_bet_size = 1_000_000; // 0.001 SOL (lamports)
        config.paused = false;
        config.bump = ctx.bumps.config;
        
        msg!("Protocol initialized with max bet: {} lamports", max_bet_size);
        Ok(())
    }

    /// Update oracle address
    pub fn update_oracle(ctx: Context<UpdateConfig>, new_oracle: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.oracle = new_oracle;
        msg!("Oracle updated to: {}", new_oracle);
        Ok(())
    }

    /// Update max bet size
    pub fn set_max_bet_size(ctx: Context<UpdateConfig>, new_max_bet: u64) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(new_max_bet >= config.min_bet_size, MarketError::InvalidBetSize);
        config.max_bet_size = new_max_bet;
        msg!("Max bet updated to: {} lamports", new_max_bet);
        Ok(())
    }

    /// Pause/unpause the protocol
    pub fn set_paused(ctx: Context<UpdateConfig>, paused: bool) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.paused = paused;
        msg!("Protocol paused: {}", paused);
        Ok(())
    }

    /// Create a new dual-coin battle market
    pub fn create_market(
        ctx: Context<CreateMarket>,
        market_id: u64,
        coin_a_symbol: String,
        coin_b_symbol: String,
        lock_time: i64,
        settle_time: i64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        let clock = Clock::get()?;
        
        require!(!config.paused, MarketError::ProtocolPaused);
        require!(market_id == config.next_market_id, MarketError::InvalidMarketId);
        require!(lock_time > clock.unix_timestamp, MarketError::InvalidLockTime);
        require!(settle_time > lock_time, MarketError::InvalidSettleTime);
        require!(coin_a_symbol.len() <= 20, MarketError::SymbolTooLong);
        require!(coin_b_symbol.len() <= 20, MarketError::SymbolTooLong);
        
        let market = &mut ctx.accounts.market;
        market.market_id = market_id;
        market.coin_a_symbol = coin_a_symbol.clone();
        market.coin_b_symbol = coin_b_symbol.clone();
        market.status = MarketStatus::Active;
        market.lock_time = lock_time;
        market.settle_time = settle_time;
        market.settled = false;
        market.winning_outcome = 0;
        market.bucket_a_liquidity = 0;
        market.bucket_b_liquidity = 0;
        market.total_liquidity = 0;
        market.bucket_a_shares = 0;
        market.bucket_b_shares = 0;
        market.bump = ctx.bumps.market;
        
        config.next_market_id += 1;
        
        msg!("Market {} created: {} vs {}", market.market_id, coin_a_symbol, coin_b_symbol);
        
        emit!(MarketCreated {
            market_id: market.market_id,
            coin_a_symbol,
            coin_b_symbol,
            lock_time,
            settle_time,
        });
        
        Ok(())
    }

    /// Buy shares betting on Coin A or Coin B
    /// outcomeIndex: 0 = Coin A wins, 1 = Coin B wins
    pub fn buy_shares(
        ctx: Context<BuyShares>,
        outcome_index: u8,
        amount: u64,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        let market = &mut ctx.accounts.market;
        let clock = Clock::get()?;
        
        require!(!config.paused, MarketError::ProtocolPaused);
        require!(amount >= config.min_bet_size, MarketError::BetBelowMinimum);
        require!(amount <= config.max_bet_size, MarketError::BetExceedsMax);
        require!(outcome_index <= 1, MarketError::InvalidOutcome);
        require!(market.status == MarketStatus::Active, MarketError::MarketNotActive);
        require!(clock.unix_timestamp < market.lock_time, MarketError::MarketLocked);
        
        // Transfer SOL from bettor to market vault
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.bettor.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        );
        system_program::transfer(cpi_context, amount)?;
        
        // Calculate fees: 2% protocol + 1% burn = 3% total
        let protocol_fee = amount * 200 / 10000; // 2%
        let burn_fee = amount * 100 / 10000; // 1%
        let net_amount = amount - protocol_fee - burn_fee;
        
        // Add to protocol fees (burn happens on withdrawal for SOL)
        let config_mut = &mut ctx.accounts.config;
        config_mut.protocol_fees_collected += protocol_fee + burn_fee;
        
        // Calculate shares using bonding curve
        // shares = (netAmount * 1e18) / (1e18 + bucketLiquidity * steepness)
        let bucket_liquidity = if outcome_index == 0 {
            market.bucket_a_liquidity
        } else {
            market.bucket_b_liquidity
        };
        
        let steepness: u128 = 10;
        let divisor: u128 = 1_000_000_000_000_000_000u128 + (bucket_liquidity as u128 * steepness);
        let shares: u64 = ((net_amount as u128 * 1_000_000_000_000_000_000u128) / divisor) as u64;
        
        require!(shares > 0, MarketError::SharesTooSmall);
        
        // Update market state
        market.total_liquidity += net_amount;
        if outcome_index == 0 {
            market.bucket_a_liquidity += net_amount;
            market.bucket_a_shares += shares;
        } else {
            market.bucket_b_liquidity += net_amount;
            market.bucket_b_shares += shares;
        }
        
        // Update or create user position
        let position = &mut ctx.accounts.position;
        position.user = ctx.accounts.bettor.key();
        position.market_id = market.market_id;
        if outcome_index == 0 {
            position.shares_a += shares;
        } else {
            position.shares_b += shares;
        }
        position.total_invested += amount;
        position.bump = ctx.bumps.position;
        
        msg!("Bought {} shares on outcome {} for {} lamports", shares, outcome_index, amount);
        
        emit!(SharesPurchased {
            market_id: market.market_id,
            user: ctx.accounts.bettor.key(),
            outcome_index,
            shares,
            cost: amount,
        });
        
        Ok(())
    }

    /// Lock market (prevent new bets)
    pub fn lock_market(ctx: Context<OracleAction>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let clock = Clock::get()?;
        
        require!(market.status == MarketStatus::Active, MarketError::MarketNotActive);
        require!(clock.unix_timestamp >= market.lock_time, MarketError::LockTimeNotReached);
        
        market.status = MarketStatus::Locked;
        
        msg!("Market {} locked", market.market_id);
        emit!(MarketLocked {
            market_id: market.market_id,
            timestamp: clock.unix_timestamp,
        });
        
        Ok(())
    }

    /// Settle market - oracle determines which coin outperformed
    pub fn settle_market(
        ctx: Context<OracleAction>,
        coin_a_won: bool,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let clock = Clock::get()?;
        
        require!(
            market.status == MarketStatus::Active || market.status == MarketStatus::Locked,
            MarketError::InvalidStatus
        );
        require!(!market.settled, MarketError::AlreadySettled);
        require!(clock.unix_timestamp >= market.settle_time, MarketError::TooEarlyToSettle);
        
        market.settled = true;
        market.status = MarketStatus::Settled;
        market.winning_outcome = if coin_a_won { 0 } else { 1 };
        
        let winning_coin = if coin_a_won {
            market.coin_a_symbol.clone()
        } else {
            market.coin_b_symbol.clone()
        };
        
        msg!("Market {} settled: {} wins", market.market_id, winning_coin);
        
        emit!(MarketSettled {
            market_id: market.market_id,
            winning_outcome: market.winning_outcome,
            winning_coin,
        });
        
        Ok(())
    }

    /// Cancel market and allow refunds
    pub fn cancel_market(ctx: Context<AdminAction>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(!market.settled, MarketError::AlreadySettled);
        require!(market.status != MarketStatus::Cancelled, MarketError::AlreadyCancelled);
        
        market.status = MarketStatus::Cancelled;
        
        msg!("Market {} cancelled", market.market_id);
        Ok(())
    }

    /// Claim payout after market settles
    pub fn claim_payout(ctx: Context<ClaimPayout>) -> Result<()> {
        let market = &ctx.accounts.market;
        let position = &mut ctx.accounts.position;
        
        require!(market.settled, MarketError::MarketNotSettled);
        require!(market.status == MarketStatus::Settled, MarketError::InvalidStatus);
        
        let winning_shares = if market.winning_outcome == 0 {
            position.shares_a
        } else {
            position.shares_b
        };
        
        require!(winning_shares > 0, MarketError::NoWinningShares);
        
        let total_winning_shares = if market.winning_outcome == 0 {
            market.bucket_a_shares
        } else {
            market.bucket_b_shares
        };
        
        require!(total_winning_shares > 0, MarketError::NoWinningSharesInBucket);
        
        // Proportional payout: (user shares / total winning shares) * total pool
        let payout = (winning_shares as u128 * market.total_liquidity as u128 / total_winning_shares as u128) as u64;
        
        // Clear position
        if market.winning_outcome == 0 {
            position.shares_a = 0;
        } else {
            position.shares_b = 0;
        }
        
        // Transfer payout from vault to user
        **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= payout;
        **ctx.accounts.user.to_account_info().try_borrow_mut_lamports()? += payout;
        
        msg!("Payout claimed: {} lamports", payout);
        
        emit!(PayoutClaimed {
            market_id: market.market_id,
            user: ctx.accounts.user.key(),
            payout,
        });
        
        Ok(())
    }

    /// Claim refund if market is cancelled
    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        let market = &ctx.accounts.market;
        let position = &mut ctx.accounts.position;
        
        require!(market.status == MarketStatus::Cancelled, MarketError::MarketNotCancelled);
        
        // Calculate proportional refund from both buckets
        let mut total_refund: u64 = 0;
        
        if position.shares_a > 0 && market.bucket_a_shares > 0 {
            total_refund += (position.shares_a as u128 * market.bucket_a_liquidity as u128 / market.bucket_a_shares as u128) as u64;
            position.shares_a = 0;
        }
        
        if position.shares_b > 0 && market.bucket_b_shares > 0 {
            total_refund += (position.shares_b as u128 * market.bucket_b_liquidity as u128 / market.bucket_b_shares as u128) as u64;
            position.shares_b = 0;
        }
        
        require!(total_refund > 0, MarketError::NoRefundAvailable);
        position.total_invested = 0;
        
        // Transfer refund from vault to user
        **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= total_refund;
        **ctx.accounts.user.to_account_info().try_borrow_mut_lamports()? += total_refund;
        
        msg!("Refund claimed: {} lamports", total_refund);
        
        emit!(RefundClaimed {
            market_id: market.market_id,
            user: ctx.accounts.user.key(),
            refund_amount: total_refund,
        });
        
        Ok(())
    }

    /// Withdraw protocol fees
    pub fn withdraw_fees(ctx: Context<WithdrawFees>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        let amount = config.protocol_fees_collected;
        
        require!(amount > 0, MarketError::NoFeesToWithdraw);
        
        config.protocol_fees_collected = 0;
        
        // Transfer fees from vault to authority
        **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.authority.to_account_info().try_borrow_mut_lamports()? += amount;
        
        msg!("Fees withdrawn: {} lamports", amount);
        
        emit!(ProtocolFeeWithdrawn {
            recipient: ctx.accounts.authority.key(),
            amount,
        });
        
        Ok(())
    }
}

// ============== ACCOUNTS ==============

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + ProtocolConfig::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, ProtocolConfig>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, ProtocolConfig>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct CreateMarket<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, ProtocolConfig>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [b"market", market_id.to_le_bytes().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyShares<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProtocolConfig>,
    
    #[account(
        mut,
        seeds = [b"market", market.market_id.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    
    #[account(
        init_if_needed,
        payer = bettor,
        space = 8 + UserPosition::INIT_SPACE,
        seeds = [b"position", market.key().as_ref(), bettor.key().as_ref()],
        bump
    )]
    pub position: Account<'info, UserPosition>,
    
    /// CHECK: Vault PDA to hold market funds
    #[account(
        mut,
        seeds = [b"vault", market.key().as_ref()],
        bump
    )]
    pub vault: AccountInfo<'info>,
    
    #[account(mut)]
    pub bettor: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct OracleAction<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        constraint = config.oracle == oracle.key() || config.authority == oracle.key()
    )]
    pub config: Account<'info, ProtocolConfig>,
    
    #[account(
        mut,
        seeds = [b"market", market.market_id.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    
    pub oracle: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminAction<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, ProtocolConfig>,
    
    #[account(
        mut,
        seeds = [b"market", market.market_id.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
    #[account(
        seeds = [b"market", market.market_id.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    
    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), user.key().as_ref()],
        bump = position.bump,
        constraint = position.user == user.key()
    )]
    pub position: Account<'info, UserPosition>,
    
    /// CHECK: Vault PDA holding market funds
    #[account(
        mut,
        seeds = [b"vault", market.key().as_ref()],
        bump
    )]
    pub vault: AccountInfo<'info>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    #[account(
        seeds = [b"market", market.market_id.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    
    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), user.key().as_ref()],
        bump = position.bump,
        constraint = position.user == user.key()
    )]
    pub position: Account<'info, UserPosition>,
    
    /// CHECK: Vault PDA holding market funds
    #[account(
        mut,
        seeds = [b"vault", market.key().as_ref()],
        bump
    )]
    pub vault: AccountInfo<'info>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, ProtocolConfig>,
    
    /// CHECK: Main vault holding protocol fees
    #[account(mut)]
    pub vault: AccountInfo<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

// ============== STATE ==============

#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    pub authority: Pubkey,
    pub oracle: Pubkey,
    pub next_market_id: u64,
    pub protocol_fees_collected: u64,
    pub total_burned: u64,
    pub max_bet_size: u64,
    pub min_bet_size: u64,
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub market_id: u64,
    #[max_len(20)]
    pub coin_a_symbol: String,
    #[max_len(20)]
    pub coin_b_symbol: String,
    pub status: MarketStatus,
    pub lock_time: i64,
    pub settle_time: i64,
    pub settled: bool,
    pub winning_outcome: u8, // 0 = Coin A, 1 = Coin B
    pub bucket_a_liquidity: u64,
    pub bucket_b_liquidity: u64,
    pub total_liquidity: u64,
    pub bucket_a_shares: u64,
    pub bucket_b_shares: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserPosition {
    pub user: Pubkey,
    pub market_id: u64,
    pub shares_a: u64,
    pub shares_b: u64,
    pub total_invested: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketStatus {
    Active,
    Locked,
    Settled,
    Cancelled,
}

// ============== EVENTS ==============

#[event]
pub struct MarketCreated {
    pub market_id: u64,
    pub coin_a_symbol: String,
    pub coin_b_symbol: String,
    pub lock_time: i64,
    pub settle_time: i64,
}

#[event]
pub struct SharesPurchased {
    pub market_id: u64,
    pub user: Pubkey,
    pub outcome_index: u8,
    pub shares: u64,
    pub cost: u64,
}

#[event]
pub struct MarketLocked {
    pub market_id: u64,
    pub timestamp: i64,
}

#[event]
pub struct MarketSettled {
    pub market_id: u64,
    pub winning_outcome: u8,
    pub winning_coin: String,
}

#[event]
pub struct PayoutClaimed {
    pub market_id: u64,
    pub user: Pubkey,
    pub payout: u64,
}

#[event]
pub struct RefundClaimed {
    pub market_id: u64,
    pub user: Pubkey,
    pub refund_amount: u64,
}

#[event]
pub struct ProtocolFeeWithdrawn {
    pub recipient: Pubkey,
    pub amount: u64,
}

// ============== ERRORS ==============

#[error_code]
pub enum MarketError {
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Bet below minimum")]
    BetBelowMinimum,
    #[msg("Bet exceeds maximum")]
    BetExceedsMax,
    #[msg("Invalid outcome (must be 0 or 1)")]
    InvalidOutcome,
    #[msg("Market is not active")]
    MarketNotActive,
    #[msg("Market is locked")]
    MarketLocked,
    #[msg("Market not settled")]
    MarketNotSettled,
    #[msg("Already settled")]
    AlreadySettled,
    #[msg("Already cancelled")]
    AlreadyCancelled,
    #[msg("Invalid status")]
    InvalidStatus,
    #[msg("Too early to settle")]
    TooEarlyToSettle,
    #[msg("Lock time not reached")]
    LockTimeNotReached,
    #[msg("Invalid lock time")]
    InvalidLockTime,
    #[msg("Invalid settle time")]
    InvalidSettleTime,
    #[msg("No winning shares")]
    NoWinningShares,
    #[msg("No winning shares in bucket")]
    NoWinningSharesInBucket,
    #[msg("Shares too small")]
    SharesTooSmall,
    #[msg("No refund available")]
    NoRefundAvailable,
    #[msg("Market not cancelled")]
    MarketNotCancelled,
    #[msg("No fees to withdraw")]
    NoFeesToWithdraw,
    #[msg("Invalid bet size")]
    InvalidBetSize,
    #[msg("Symbol too long")]
    SymbolTooLong,
    #[msg("Invalid market ID")]
    InvalidMarketId,
}
