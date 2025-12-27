import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { logger } from './logger';
import { initializeDatabase } from './db';
import { initializeAmi, closeAmi } from './asterisk/ami';
import { redis } from './redis';
import { authRouter, extensionRouter, logsRouter, statusRouter } from './routes';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));

// Body parsing
app.use(express.json());

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.rateLimitRequests,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip,
    });
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Ready check (includes dependencies)
app.get('/ready', async (req, res) => {
  try {
    await redis.ping();
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: (error as Error).message });
  }
});

// Routes
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/asterisk/extension', extensionRouter);
app.use('/api/logs', logsRouter);
app.use('/api/status', statusRouter);

// Also mount log routes under specific paths for convenience
app.use('/api/asterisk/logs', (req, res, next) => {
  req.url = '/asterisk' + req.url;
  logsRouter(req, res, next);
});
app.use('/api/prosody/logs', (req, res, next) => {
  req.url = '/prosody' + req.url;
  logsRouter(req, res, next);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully`);
  closeAmi();
  redis.disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
async function start() {
  try {
    // Initialize database
    logger.info('Initializing database...');
    await initializeDatabase();

    // Initialize AMI connection (optional, continue if fails)
    try {
      logger.info('Connecting to AMI...');
      await initializeAmi();
    } catch (error) {
      logger.warn('AMI connection failed, continuing without AMI', { error: (error as Error).message });
    }

    // Start HTTP server
    app.listen(config.port, () => {
      logger.info(`ghost-api listening on port ${config.port}`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

start();

export default app;
