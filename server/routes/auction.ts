/**
 * Auction API Routes
 */

import { Router, Request, Response } from 'express';
import { 
  getAuctionConfig, 
  updateAuctionConfig, 
  startAuction, 
  stopAuction,
  submitBid,
  getLeaderboard,
  finalizeAuction,
  getUserBids,
  getTopTwoWinners,
} from '../services/listingAuction';
import { enableAutoCycle, disableAutoCycle, triggerAuctionCycleCheck, triggerFinalizeAndCreateMarket } from '../services/auctionAutoCycle';
import { clearOnChainAuctionBids } from '../services/blockchainSync';
import { getSupabase } from '../services/database';
import { getTokenByAddress } from '../services/dexScreenerApi';

const router = Router();

// Admin wallet addresses (same as markets admin)
const ADMIN_WALLETS = [
  '0xb0687ef6ea5906089ec3586f9997764650bf1934',
  '0x6c0512fe7dea0c0d2681c05739171830cd9d9b18',
];

function isAdmin(address: string): boolean {
  return ADMIN_WALLETS.includes(address.toLowerCase());
}

/**
 * GET /api/auction/config
 * Get auction configuration
 */
router.get('/config', async (req: Request, res: Response) => {
  try {
    const config = await getAuctionConfig();
    res.json(config);
  } catch (error: any) {
    console.error('Error getting auction config:', error);
    res.status(500).json({ error: 'Failed to get auction config' });
  }
});

/**
 * POST /api/auction/start
 * Start a new auction (admin only)
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { walletAddress, durationHours = 24 } = req.body;

    if (!walletAddress || !isAdmin(walletAddress)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const success = await startAuction(durationHours);
    
    if (success) {
      const config = await getAuctionConfig();
      res.json({ success: true, config });
    } else {
      res.status(500).json({ error: 'Failed to start auction' });
    }
  } catch (error: any) {
    console.error('Error starting auction:', error);
    res.status(500).json({ error: 'Failed to start auction' });
  }
});

/**
 * POST /api/auction/stop
 * Stop the current auction (admin only)
 */
router.post('/stop', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress || !isAdmin(walletAddress)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const success = await stopAuction();
    res.json({ success });
  } catch (error: any) {
    console.error('Error stopping auction:', error);
    res.status(500).json({ error: 'Failed to stop auction' });
  }
});

/**
 * POST /api/auction/finalize
 * Finalize auction and mark winners (admin only)
 */
router.post('/finalize', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress || !isAdmin(walletAddress)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const result = await finalizeAuction();
    res.json(result);
  } catch (error: any) {
    console.error('Error finalizing auction:', error);
    res.status(500).json({ error: 'Failed to finalize auction' });
  }
});

/**
 * PATCH /api/auction/config
 * Update auction settings (admin only)
 */
router.patch('/config', async (req: Request, res: Response) => {
  try {
    const { walletAddress, ...configUpdates } = req.body;

    if (!walletAddress || !isAdmin(walletAddress)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const success = await updateAuctionConfig(configUpdates);
    
    if (success) {
      const config = await getAuctionConfig();
      res.json({ success: true, config });
    } else {
      res.status(500).json({ error: 'Failed to update config' });
    }
  } catch (error: any) {
    console.error('Error updating auction config:', error);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

/**
 * POST /api/auction/bid
 * Submit a bid
 */
router.post('/bid', async (req: Request, res: Response) => {
  try {
    const { walletAddress, coinContractAddress, chain = 'base', bidAmount, txHash } = req.body;

    if (!walletAddress || !coinContractAddress || !bidAmount || !chain) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['base', 'solana'].includes(chain)) {
      return res.status(400).json({ error: 'Chain must be "base" or "solana"' });
    }

    const result = await submitBid(walletAddress, coinContractAddress, chain, bidAmount, txHash);
    
    if (result.success) {
      res.json({ success: true, bid: result.bid });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    console.error('Error submitting bid:', error);
    res.status(500).json({ error: 'Failed to submit bid' });
  }
});

/**
 * GET /api/auction/leaderboard
 * Get current leaderboard
 */
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const leaderboard = await getLeaderboard(limit);
    res.json(leaderboard);
  } catch (error: any) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

/**
 * GET /api/auction/winners
 * Get top 2 winners
 */
router.get('/winners', async (req: Request, res: Response) => {
  try {
    const winners = await getTopTwoWinners();
    res.json(winners);
  } catch (error: any) {
    console.error('Error getting winners:', error);
    res.status(500).json({ error: 'Failed to get winners' });
  }
});

/**
 * POST /api/auction/toggle-wallet-limit
 * Toggle wallet bet limit on/off (admin only)
 */
router.post('/toggle-wallet-limit', async (req: Request, res: Response) => {
  try {
    const { walletAddress, enabled } = req.body;

    if (!walletAddress || !isAdmin(walletAddress)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const success = await updateAuctionConfig({ enableWalletBetLimit: enabled });
    
    if (success) {
      const config = await getAuctionConfig();
      res.json({ success: true, config });
    } else {
      res.status(500).json({ error: 'Failed to update setting' });
    }
  } catch (error: any) {
    console.error('Error toggling wallet limit:', error);
    res.status(500).json({ error: 'Failed to toggle wallet limit' });
  }
});

/**
 * GET /api/auction/my-bids
 * Get user's bids
 */
router.get('/my-bids', async (req: Request, res: Response) => {
  try {
    const walletAddress = req.query.walletAddress as string;
    
    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    const bids = await getUserBids(walletAddress);
    res.json(bids);
  } catch (error: any) {
    console.error('Error getting user bids:', error);
    res.status(500).json({ error: 'Failed to get user bids' });
  }
});

/**
 * POST /api/auction/enable-auto-cycle
 * Enable auto-cycle mode (admin only)
 * Clears old bids and starts fresh
 */
router.post('/enable-auto-cycle', async (req: Request, res: Response) => {
  try {
    const { walletAddress, clearBids = true } = req.body;

    if (!walletAddress || !isAdmin(walletAddress)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Clear old bids before starting fresh (optional, default true)
    if (clearBids) {
      console.log('🧹 Clearing old auction bids before enabling auto-cycle...');
      await clearOnChainAuctionBids();
    }

    const success = await enableAutoCycle();
    res.json({ success });
  } catch (error: any) {
    console.error('Error enabling auto-cycle:', error);
    res.status(500).json({ error: 'Failed to enable auto-cycle' });
  }
});

/**
 * POST /api/auction/disable-auto-cycle
 * Disable auto-cycle mode (admin only)
 */
router.post('/disable-auto-cycle', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress || !isAdmin(walletAddress)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const success = await disableAutoCycle();
    res.json({ success });
  } catch (error: any) {
    console.error('Error disabling auto-cycle:', error);
    res.status(500).json({ error: 'Failed to disable auto-cycle' });
  }
});

/**
 * POST /api/auction/clear-bids
 * Clear all auction bids on-chain (admin only)
 * Use this to reset the leaderboard for a fresh start
 */
router.post('/clear-bids', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress || !isAdmin(walletAddress)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    console.log('🧹 Admin requested clearing all auction bids...');
    const success = await clearOnChainAuctionBids();
    
    if (success) {
      res.json({ success: true, message: 'All auction bids cleared' });
    } else {
      res.status(500).json({ error: 'Failed to clear bids on-chain' });
    }
  } catch (error: any) {
    console.error('Error clearing bids:', error);
    res.status(500).json({ error: 'Failed to clear bids' });
  }
});

/**
 * GET /api/auction/fallback-queue
 * Get all coins in the fallback queue
 */
router.get('/fallback-queue', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const { data: queue, error } = await supabase
      .from('fallback_coin_queue')
      .select('*')
      .order('added_at', { ascending: true });

    if (error) throw error;

    res.json({ queue: queue || [] });
  } catch (error: any) {
    console.error('Error getting fallback queue:', error);
    res.status(500).json({ error: 'Failed to get fallback queue' });
  }
});

/**
 * POST /api/auction/fallback-queue
 * Add a coin to the fallback queue (admin only)
 */
router.post('/fallback-queue', async (req: Request, res: Response) => {
  try {
    const { walletAddress, contractAddress } = req.body;

    if (!walletAddress || !isAdmin(walletAddress)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!contractAddress) {
      return res.status(400).json({ error: 'Contract address required' });
    }

    // Fetch token info from DexScreener
    const token = await getTokenByAddress(contractAddress);
    if (!token) {
      return res.status(404).json({ error: 'Token not found on DexScreener' });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    // Check if already in queue
    const { data: existing } = await supabase
      .from('fallback_coin_queue')
      .select('id')
      .ilike('contract_address', contractAddress)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Coin already in queue' });
    }

    // Add to queue
    const { data: newEntry, error } = await supabase
      .from('fallback_coin_queue')
      .insert({
        contract_address: contractAddress,
        symbol: token.symbol,
        name: token.name,
        image_url: token.imageUrl,
        added_by: walletAddress,
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, coin: newEntry });
  } catch (error: any) {
    console.error('Error adding to fallback queue:', error);
    res.status(500).json({ error: 'Failed to add coin to queue' });
  }
});

/**
 * DELETE /api/auction/fallback-queue/:id
 * Remove a coin from the fallback queue (admin only)
 */
router.delete('/fallback-queue/:id', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;
    const { id } = req.params;

    if (!walletAddress || !isAdmin(walletAddress)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const { error } = await supabase
      .from('fallback_coin_queue')
      .delete()
      .eq('id', parseInt(id));

    if (error) throw error;

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error removing from fallback queue:', error);
    res.status(500).json({ error: 'Failed to remove coin from queue' });
  }
});

// ============================================
// TEST ENDPOINTS (for testing auto-cycle)
// ============================================

/**
 * POST /api/auction/admin/trigger-cycle-check
 * Manually trigger auction cycle check (bypasses enabled check)
 */
router.post('/admin/trigger-cycle-check', async (req: Request, res: Response) => {
  try {
    const walletAddress = req.body?.walletAddress;

    if (!walletAddress || !isAdmin(walletAddress)) {
      return res.status(403).json({ error: 'Unauthorized - walletAddress required' });
    }

    console.log('🧪 Admin triggering auction cycle check...');
    const result = await triggerAuctionCycleCheck();
    
    res.json({
      success: result.triggered,
      message: result.message,
    });
  } catch (error: any) {
    console.error('Error triggering cycle check:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auction/admin/trigger-finalize
 * Manually trigger auction finalization and new market creation
 * This is what happens at the end of each cycle
 */
router.post('/admin/trigger-finalize', async (req: Request, res: Response) => {
  try {
    const walletAddress = req.body?.walletAddress;

    if (!walletAddress || !isAdmin(walletAddress)) {
      return res.status(403).json({ error: 'Unauthorized - walletAddress required' });
    }

    console.log('🧪 Admin triggering auction finalization...');
    const result = await triggerFinalizeAndCreateMarket();
    
    res.json({
      success: result.triggered,
      message: result.message,
    });
  } catch (error: any) {
    console.error('Error triggering finalization:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
