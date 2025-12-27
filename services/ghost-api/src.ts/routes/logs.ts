import { Router, Request, Response } from 'express';
import { authMiddleware, requireSuperuser } from '../auth/middleware';
import { config } from '../config';
import { logger } from '../logger';
import { ErrorResponse } from '../types/api';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { KubeConfig, CoreV1Api, Log } from '@kubernetes/client-node';

const router = Router();

// Apply auth middleware to all routes - all log endpoints require superuser
router.use(authMiddleware);
router.use(requireSuperuser);

// Initialize Kubernetes client
let k8sApi: CoreV1Api | null = null;
let k8sLog: Log | null = null;

try {
  const kc = new KubeConfig();
  if (process.env.KUBERNETES_SERVICE_HOST) {
    kc.loadFromCluster();
  } else {
    kc.loadFromDefault();
  }
  k8sApi = kc.makeApiClient(CoreV1Api);
  k8sLog = new Log(kc);
} catch (error) {
  logger.warn('Kubernetes client not available, log streaming will be limited', { error });
}

interface LogQueryParams {
  lines?: string;
  follow?: string;
  since?: string;
  container?: string;
}

/**
 * Get pod name for a service
 */
async function getPodName(serviceName: string, namespace: string = 'ghost'): Promise<string | null> {
  if (!k8sApi) return null;

  try {
    const response = await k8sApi.listNamespacedPod(
      namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      `app=${serviceName}`
    );

    const pods = response.body.items;
    if (pods.length === 0) return null;

    // Return the first running pod
    const runningPod = pods.find(p => p.status?.phase === 'Running');
    return runningPod?.metadata?.name || pods[0].metadata?.name || null;
  } catch (error) {
    logger.error('Failed to get pod name', { serviceName, error });
    return null;
  }
}

/**
 * Stream logs from a Kubernetes pod
 */
async function streamPodLogs(
  res: Response,
  serviceName: string,
  options: {
    lines?: number;
    follow?: boolean;
    sinceSeconds?: number;
    container?: string;
  }
): Promise<void> {
  const namespace = config.k8sNamespace || 'ghost';
  const podName = await getPodName(serviceName, namespace);

  if (!podName) {
    res.status(404).json({ error: `No running pod found for ${serviceName}` } as ErrorResponse);
    return;
  }

  if (!k8sLog) {
    res.status(500).json({ error: 'Kubernetes log client not available' } as ErrorResponse);
    return;
  }

  try {
    if (options.follow) {
      // Set up SSE for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const containerName = options.container || '';
      await k8sLog.log(
        namespace,
        podName,
        containerName,
        res,
        {
          follow: true,
          tailLines: options.lines || 100,
          sinceSeconds: options.sinceSeconds,
          pretty: true,
        }
      );

      res.on('close', () => {
        logger.info('Log stream closed', { serviceName, podName });
      });
    } else {
      // Fetch logs without streaming
      const logOutput = await k8sApi!.readNamespacedPodLog(
        podName,
        namespace,
        options.container || undefined,
        undefined, // follow
        undefined, // insecureSkipTLSVerifyBackend
        undefined, // limitBytes
        undefined, // pretty
        undefined, // previous
        options.sinceSeconds,
        options.lines || 100,
        undefined  // timestamps
      );

      res.json({
        pod: podName,
        service: serviceName,
        logs: logOutput.body.split('\n').filter((line: string) => line.trim()),
      });
    }
  } catch (error) {
    logger.error('Failed to stream logs', { serviceName, podName, error });
    res.status(500).json({ error: 'Failed to fetch logs', details: (error as Error).message } as ErrorResponse);
  }
}

/**
 * Read logs from a local file (fallback when not in K8s)
 */
async function readLocalLogs(
  logPath: string,
  lines: number = 100
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(logPath)) {
      resolve([`Log file not found: ${logPath}`]);
      return;
    }

    const tail = spawn('tail', ['-n', lines.toString(), logPath]);
    let output = '';
    let errorOutput = '';

    tail.stdout.on('data', (data) => {
      output += data.toString();
    });

    tail.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    tail.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`tail exited with code ${code}: ${errorOutput}`));
      } else {
        resolve(output.split('\n').filter(line => line.trim()));
      }
    });
  });
}

/**
 * Stream logs from a local file
 */
function streamLocalLogs(res: Response, logPath: string): void {
  if (!fs.existsSync(logPath)) {
    res.status(404).json({ error: `Log file not found: ${logPath}` } as ErrorResponse);
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const tail = spawn('tail', ['-f', '-n', '100', logPath]);

  tail.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        res.write(`data: ${line}\n\n`);
      }
    }
  });

  tail.stderr.on('data', (data) => {
    res.write(`event: error\ndata: ${data.toString()}\n\n`);
  });

  res.on('close', () => {
    tail.kill();
    logger.info('Local log stream closed', { logPath });
  });
}

// GET /api/asterisk/logs - Get Asterisk logs
router.get('/asterisk', async (req: Request, res: Response) => {
  try {
    const { lines, follow, since } = req.query as LogQueryParams;
    const numLines = parseInt(lines || '100', 10);
    const shouldFollow = follow === 'true' || follow === '1';
    const sinceSeconds = since ? parseInt(since, 10) : undefined;

    if (k8sApi && k8sLog) {
      await streamPodLogs(res, 'asterisk', {
        lines: numLines,
        follow: shouldFollow,
        sinceSeconds,
      });
    } else {
      // Local file fallback
      const logPath = path.join(config.asteriskConfigPath, '..', 'log', 'asterisk', 'full');

      if (shouldFollow) {
        streamLocalLogs(res, logPath);
      } else {
        const logs = await readLocalLogs(logPath, numLines);
        res.json({ logs });
      }
    }
  } catch (error) {
    logger.error('Get Asterisk logs error', error);
    res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
});

// GET /api/prosody/logs - Get Prosody logs
router.get('/prosody', async (req: Request, res: Response) => {
  try {
    const { lines, follow, since } = req.query as LogQueryParams;
    const numLines = parseInt(lines || '100', 10);
    const shouldFollow = follow === 'true' || follow === '1';
    const sinceSeconds = since ? parseInt(since, 10) : undefined;

    if (k8sApi && k8sLog) {
      await streamPodLogs(res, 'prosody', {
        lines: numLines,
        follow: shouldFollow,
        sinceSeconds,
      });
    } else {
      // Local file fallback
      const logPath = '/var/log/prosody/prosody.log';

      if (shouldFollow) {
        streamLocalLogs(res, logPath);
      } else {
        const logs = await readLocalLogs(logPath, numLines);
        res.json({ logs });
      }
    }
  } catch (error) {
    logger.error('Get Prosody logs error', error);
    res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
});

// GET /api/logs/openvpn - Get OpenVPN logs
router.get('/openvpn', async (req: Request, res: Response) => {
  try {
    const { lines, follow, since } = req.query as LogQueryParams;
    const numLines = parseInt(lines || '100', 10);
    const shouldFollow = follow === 'true' || follow === '1';
    const sinceSeconds = since ? parseInt(since, 10) : undefined;

    if (k8sApi && k8sLog) {
      await streamPodLogs(res, 'openvpn', {
        lines: numLines,
        follow: shouldFollow,
        sinceSeconds,
      });
    } else {
      // Local file fallback
      const logPath = '/var/log/openvpn/openvpn.log';

      if (shouldFollow) {
        streamLocalLogs(res, logPath);
      } else {
        const logs = await readLocalLogs(logPath, numLines);
        res.json({ logs });
      }
    }
  } catch (error) {
    logger.error('Get OpenVPN logs error', error);
    res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
});

// GET /api/logs/sms-pipeline - Get SMS Pipeline logs
router.get('/sms-pipeline', async (req: Request, res: Response) => {
  try {
    const { lines, follow, since } = req.query as LogQueryParams;
    const numLines = parseInt(lines || '100', 10);
    const shouldFollow = follow === 'true' || follow === '1';
    const sinceSeconds = since ? parseInt(since, 10) : undefined;

    if (k8sApi && k8sLog) {
      await streamPodLogs(res, 'sms-pipeline', {
        lines: numLines,
        follow: shouldFollow,
        sinceSeconds,
      });
    } else {
      res.json({ logs: ['sms-pipeline local logs not available'] });
    }
  } catch (error) {
    logger.error('Get SMS Pipeline logs error', error);
    res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
});

// GET /api/ghost-api/logs - Get ghost-api logs (self)
router.get('/ghost-api', async (req: Request, res: Response) => {
  try {
    const { lines, follow, since } = req.query as LogQueryParams;
    const numLines = parseInt(lines || '100', 10);
    const shouldFollow = follow === 'true' || follow === '1';
    const sinceSeconds = since ? parseInt(since, 10) : undefined;

    if (k8sApi && k8sLog) {
      await streamPodLogs(res, 'ghost-api', {
        lines: numLines,
        follow: shouldFollow,
        sinceSeconds,
      });
    } else {
      // When running locally, just return recent log messages
      res.json({ logs: ['ghost-api local logs not available in file form'] });
    }
  } catch (error) {
    logger.error('Get ghost-api logs error', error);
    res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
});

// GET /api/logs/:service - Generic log endpoint for any service
router.get('/:service', async (req: Request, res: Response) => {
  try {
    const { service } = req.params;
    const { lines, follow, since, container } = req.query as LogQueryParams;
    const numLines = parseInt(lines || '100', 10);
    const shouldFollow = follow === 'true' || follow === '1';
    const sinceSeconds = since ? parseInt(since, 10) : undefined;

    // Validate service name (alphanumeric and hyphens only)
    if (!/^[a-z0-9-]+$/.test(service)) {
      return res.status(400).json({ error: 'Invalid service name' } as ErrorResponse);
    }

    if (k8sApi && k8sLog) {
      await streamPodLogs(res, service, {
        lines: numLines,
        follow: shouldFollow,
        sinceSeconds,
        container,
      });
    } else {
      res.status(400).json({ error: 'Kubernetes not available, only specific log endpoints work' } as ErrorResponse);
    }
  } catch (error) {
    logger.error('Get service logs error', error);
    res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
});

export default router;
