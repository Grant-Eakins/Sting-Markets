import { Request, Response, NextFunction } from 'express';

interface TollboothOptions {
  apiKey: string | undefined;
  price: number; // Price per request in USD
  skipRoutes?: string[]; // Routes to skip toll collection
}

interface TollSession {
  balance: number;
  requests: number;
  lastRequest: Date;
}

// In-memory session store (use Redis in production for multi-instance)
const sessions = new Map<string, TollSession>();

/**
 * AgentToll-compatible tollbooth middleware
 * Accepts payments from AI agents for API access
 */
export function tollbooth(options: TollboothOptions) {
  const { apiKey, price, skipRoutes = [] } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip if no API key configured (disabled)
    if (!apiKey) {
      return next();
    }

    // Skip certain routes (health checks, public endpoints)
    if (skipRoutes.some(route => req.path.startsWith(route))) {
      return next();
    }

    // Check for agent toll header
    const agentTollKey = req.headers['x-agenttoll-key'] as string;
    const agentTollPayment = req.headers['x-agenttoll-payment'] as string;

    // If no agent toll headers, allow through (human users)
    if (!agentTollKey) {
      return next();
    }

    // Validate the agent's API key
    if (agentTollKey !== apiKey) {
      return res.status(401).json({
        error: 'Invalid AgentToll API key',
        code: 'INVALID_API_KEY',
      });
    }

    // Get or create session for this agent
    const sessionId = agentTollKey;
    let session = sessions.get(sessionId);

    if (!session) {
      session = {
        balance: 0,
        requests: 0,
        lastRequest: new Date(),
      };
      sessions.set(sessionId, session);
    }

    // Process payment if included
    if (agentTollPayment) {
      const payment = parseFloat(agentTollPayment);
      if (!isNaN(payment) && payment > 0) {
        session.balance += payment;
        console.log(`💰 AgentToll: Received payment of $${payment.toFixed(4)} from agent`);
      }
    }

    // Check if agent has sufficient balance
    if (session.balance < price) {
      return res.status(402).json({
        error: 'Insufficient balance',
        code: 'PAYMENT_REQUIRED',
        required: price,
        balance: session.balance,
        message: `This endpoint costs $${price}. Your balance is $${session.balance.toFixed(4)}. Include payment in x-agenttoll-payment header.`,
      });
    }

    // Deduct the toll
    session.balance -= price;
    session.requests += 1;
    session.lastRequest = new Date();

    // Add toll info to response headers
    res.setHeader('X-AgentToll-Charged', price.toString());
    res.setHeader('X-AgentToll-Balance', session.balance.toFixed(6));
    res.setHeader('X-AgentToll-Requests', session.requests.toString());

    console.log(`🎫 AgentToll: Charged $${price} | Balance: $${session.balance.toFixed(4)} | Requests: ${session.requests}`);

    next();
  };
}

/**
 * Get toll statistics for admin dashboard
 */
export function getTollStats() {
  const stats = {
    activeSessions: sessions.size,
    totalRequests: 0,
    totalRevenue: 0,
    sessions: [] as Array<{
      id: string;
      balance: number;
      requests: number;
      lastRequest: Date;
    }>,
  };

  sessions.forEach((session, id) => {
    stats.totalRequests += session.requests;
    stats.sessions.push({
      id: id.substring(0, 8) + '...',
      balance: session.balance,
      requests: session.requests,
      lastRequest: session.lastRequest,
    });
  });

  return stats;
}

/**
 * Clear all sessions (for testing)
 */
export function clearTollSessions() {
  sessions.clear();
}

export default tollbooth;
