import { Router, Request, Response } from 'express';
import { authMiddleware, requireSuperuser } from '../auth/middleware';
import { redis } from '../redis';
import { logger } from '../logger';
import { ErrorResponse } from '../types/api';
import http from 'http';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);
router.use(requireSuperuser);

interface OpenVPNClient {
  common_name: string;
  real_address: string;
  bytes_received: number;
  bytes_sent: number;
  connected_since: string;
}

interface OpenVPNRoute {
  virtual_address: string;
  common_name: string;
  real_address: string;
  last_ref: string;
}

interface OpenVPNStatus {
  updated: string | null;
  clients: OpenVPNClient[];
  routes: OpenVPNRoute[];
  global_stats: Record<string, string>;
  error?: string;
}

/**
 * Fetch OpenVPN status from the status server
 */
async function fetchOpenVPNStatus(): Promise<OpenVPNStatus> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'openvpn',
        port: 8081,
        path: '/status',
        method: 'GET',
        timeout: 5000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Failed to parse OpenVPN status'));
          }
        });
      }
    );

    req.on('error', (e) => reject(e));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('OpenVPN status request timeout'));
    });
    req.end();
  });
}

// GET /api/status/openvpn - Get OpenVPN connected clients and status
router.get('/openvpn', async (req: Request, res: Response) => {
  try {
    const status = await fetchOpenVPNStatus();
    res.json(status);
  } catch (error) {
    logger.error('Failed to fetch OpenVPN status', { error });
    res.status(500).json({
      error: 'Failed to fetch OpenVPN status',
      details: (error as Error).message,
    } as ErrorResponse);
  }
});

// GET /api/status/sms-pipeline - Get SMS pipeline last processing time
router.get('/sms-pipeline', async (req: Request, res: Response) => {
  try {
    const lastTime = await redis.get('last-time');
    const lastTimeNum = Number(lastTime) || 0;
    const nowSeconds = Math.floor(Date.now() / 1000);

    res.json({
      last_time: lastTimeNum,
      last_time_iso: lastTimeNum ? new Date(lastTimeNum * 1000).toISOString() : null,
      behind_seconds: lastTimeNum ? nowSeconds - lastTimeNum : null,
      behind_human: lastTimeNum ? formatDuration(nowSeconds - lastTimeNum) : null,
    });
  } catch (error) {
    logger.error('Failed to get SMS pipeline status', { error });
    res.status(500).json({ error: 'Failed to get SMS pipeline status' } as ErrorResponse);
  }
});

// POST /api/status/sms-pipeline - Set SMS pipeline last processing time
router.post('/sms-pipeline', async (req: Request, res: Response) => {
  try {
    const { time } = req.body;

    if (time === undefined) {
      return res.status(400).json({ error: 'time parameter required' } as ErrorResponse);
    }

    const newTime = Number(time);
    if (isNaN(newTime) || newTime < 0) {
      return res.status(400).json({ error: 'Invalid time value' } as ErrorResponse);
    }

    await redis.set('last-time', String(newTime));

    logger.info('SMS pipeline last-time updated', { newTime, by: req.user?.extension });

    res.json({
      success: true,
      last_time: newTime,
      last_time_iso: new Date(newTime * 1000).toISOString(),
    });
  } catch (error) {
    logger.error('Failed to set SMS pipeline time', { error });
    res.status(500).json({ error: 'Failed to set SMS pipeline time' } as ErrorResponse);
  }
});

// GET /api/status/redis/:key - Get any Redis key value (superuser only)
router.get('/redis/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;

    // Validate key format (prevent injection)
    if (!/^[a-zA-Z0-9_:.-]+$/.test(key)) {
      return res.status(400).json({ error: 'Invalid key format' } as ErrorResponse);
    }

    const value = await redis.get(key);
    const ttl = await redis.ttl(key);

    res.json({
      key,
      value,
      ttl: ttl >= 0 ? ttl : null,
      exists: value !== null,
    });
  } catch (error) {
    logger.error('Failed to get Redis key', { error });
    res.status(500).json({ error: 'Failed to get Redis key' } as ErrorResponse);
  }
});

// PUT /api/status/redis/:key - Set a Redis key value (superuser only)
router.put('/redis/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value, ttl } = req.body;

    // Validate key format
    if (!/^[a-zA-Z0-9_:.-]+$/.test(key)) {
      return res.status(400).json({ error: 'Invalid key format' } as ErrorResponse);
    }

    if (value === undefined) {
      return res.status(400).json({ error: 'value parameter required' } as ErrorResponse);
    }

    if (ttl && ttl > 0) {
      await redis.setex(key, ttl, String(value));
    } else {
      await redis.set(key, String(value));
    }

    logger.info('Redis key updated', { key, by: req.user?.extension });

    res.json({
      success: true,
      key,
      value: String(value),
      ttl: ttl || null,
    });
  } catch (error) {
    logger.error('Failed to set Redis key', { error });
    res.status(500).json({ error: 'Failed to set Redis key' } as ErrorResponse);
  }
});

/**
 * Format seconds into human-readable duration
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export default router;
