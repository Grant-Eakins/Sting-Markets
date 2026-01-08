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
import { enableAutoCycle, disableAutoCycle } from '../services/auctionAutoCycle';

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
 */
router.post('/enable-auto-cycle', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress || !isAdmin(walletAddress)) {
      return res.status(403).json({ error: 'Unauthorized' });
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

export default router;
