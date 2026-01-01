import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth/middleware';
import { redis } from '../redis';
import { logger } from '../logger';
import { config } from '../config';
import { ErrorResponse } from '../types/api';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

router.use(authMiddleware);

const OVPN_TEMPLATE = `client
dev tun
proto tcp
http-proxy pyrosec.is 8880
remote pyrosec.is 1194
resolv-retry infinite
nobind
persist-key
persist-tun
<dh>
{{DH_PARAMS}}
</dh>
<ca>
{{CA_CERT}}
</ca>
<cert>
{{CLIENT_CERT}}
</cert>
<key>
{{CLIENT_KEY}}
</key>
remote-cert-tls server
<tls-auth>
{{TLS_AUTH}}
</tls-auth>
key-direction 1
cipher AES-256-CBC
data-ciphers AES-256-CBC
verb 3
`;

interface CertIssueRequest {
  username: string;
}

interface CertIssueResponse {
  username: string;
  ovpn_config: string;
  expires_at: string;
}

async function runCommand(cmd: string, args: string[], options?: { input?: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    if (options?.input) {
      proc.stdin.write(options.input);
      proc.stdin.end();
    }

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

async function readPkiFile(filename: string): Promise<string> {
  const filepath = path.join(config.openvpnPkiPath, 'pki', filename);
  return fs.promises.readFile(filepath, 'utf-8');
}

async function fileExists(filename: string): Promise<boolean> {
  try {
    await fs.promises.access(path.join(config.openvpnPkiPath, 'pki', filename));
    return true;
  } catch {
    return false;
  }
}

// POST /api/openvpn/issue-cert - Issue a new OpenVPN client certificate (superuser only)
router.post('/issue-cert', async (req: Request, res: Response) => {
  try {
    const { username } = req.body as CertIssueRequest;
    const extension = req.user?.extension;

    if (!username) {
      return res.status(400).json({ error: 'username parameter required' } as ErrorResponse);
    }

    // Validate username format (alphanumeric, underscores, hyphens only)
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({ error: 'Invalid username format. Use only alphanumeric characters, underscores, and hyphens.' } as ErrorResponse);
    }

    // Check superuser status from Redis
    const superuserKey = `superuser.${extension}`;
    const isSuperuser = await redis.get(superuserKey);

    if (isSuperuser !== '1') {
      logger.warn('Non-superuser attempted to issue certificate', { extension, username });
      return res.status(403).json({ error: 'Superuser access required. Contact administrator.' } as ErrorResponse);
    }

    // Check CA encryption key is configured
    if (!config.caEncryptionKey) {
      logger.error('CA_ENCRYPTION_KEY not configured');
      return res.status(500).json({ error: 'Certificate authority not configured' } as ErrorResponse);
    }

    logger.info('Issuing OpenVPN certificate', { username, by: extension });

    const pkiPath = path.join(config.openvpnPkiPath, 'pki');
    const privateDir = path.join(pkiPath, 'private');
    const issuedDir = path.join(pkiPath, 'issued');
    const reqsDir = path.join(pkiPath, 'reqs');

    // Ensure directories exist
    await fs.promises.mkdir(privateDir, { recursive: true });
    await fs.promises.mkdir(issuedDir, { recursive: true });
    await fs.promises.mkdir(reqsDir, { recursive: true });

    const keyPath = path.join(privateDir, `${username}.key`);
    const reqPath = path.join(reqsDir, `${username}.req`);
    const certPath = path.join(issuedDir, `${username}.crt`);
    const caKeyPath = path.join(privateDir, 'ca.key');
    const caCertPath = path.join(pkiPath, 'ca.crt');

    // Check if cert already exists
    if (await fileExists(`issued/${username}.crt`)) {
      logger.info('Certificate already exists, returning existing cert', { username });
    } else {
      // Generate client private key (no passphrase for client convenience)
      await runCommand('openssl', [
        'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048',
        '-out', keyPath
      ]);

      // Generate CSR
      await runCommand('openssl', [
        'req', '-new', '-key', keyPath,
        '-out', reqPath,
        '-subj', `/CN=${username}`
      ]);

      // Sign with CA (825 days validity like EasyRSA default)
      await runCommand('openssl', [
        'x509', '-req', '-in', reqPath,
        '-CA', caCertPath,
        '-CAkey', caKeyPath,
        '-CAcreateserial',
        '-out', certPath,
        '-days', '825',
        '-sha256',
        '-passin', `pass:${config.caEncryptionKey}`,
        '-extfile', '/dev/stdin',
        '-extensions', 'client_ext'
      ], {
        input: `[client_ext]\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature\nextendedKeyUsage=clientAuth\n`
      });

      logger.info('Certificate generated successfully', { username });
    }

    // Read all required files for .ovpn
    const [dhParams, caCert, clientCert, clientKey, tlsAuth] = await Promise.all([
      readPkiFile('dh.pem'),
      readPkiFile('ca.crt'),
      readPkiFile(`issued/${username}.crt`),
      readPkiFile(`private/${username}.key`),
      readPkiFile('ta.key'),
    ]);

    // Build the .ovpn config
    const ovpnConfig = OVPN_TEMPLATE
      .replace('{{DH_PARAMS}}', dhParams.trim())
      .replace('{{CA_CERT}}', caCert.trim())
      .replace('{{CLIENT_CERT}}', clientCert.trim())
      .replace('{{CLIENT_KEY}}', clientKey.trim())
      .replace('{{TLS_AUTH}}', tlsAuth.trim());

    // Calculate expiration (825 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 825);

    logger.info('Certificate issued successfully', { username, by: extension, expires_at: expiresAt.toISOString() });

    res.json({
      username,
      ovpn_config: ovpnConfig,
      expires_at: expiresAt.toISOString(),
    } as CertIssueResponse);
  } catch (error) {
    logger.error('Failed to issue certificate', { error });
    res.status(500).json({ error: 'Failed to issue certificate', details: (error as Error).message } as ErrorResponse);
  }
});

// GET /api/openvpn/certs - List issued certificates (superuser only)
router.get('/certs', async (req: Request, res: Response) => {
  try {
    const extension = req.user?.extension;

    // Check superuser status from Redis
    const superuserKey = `superuser.${extension}`;
    const isSuperuser = await redis.get(superuserKey);

    if (isSuperuser !== '1') {
      return res.status(403).json({ error: 'Superuser access required' } as ErrorResponse);
    }

    const issuedDir = path.join(config.openvpnPkiPath, 'pki', 'issued');

    if (!fs.existsSync(issuedDir)) {
      return res.json({ certificates: [] });
    }

    const files = await fs.promises.readdir(issuedDir);
    const certificates = files
      .filter(f => f.endsWith('.crt') && f !== 'server.crt')
      .map(f => f.replace('.crt', ''));

    res.json({ certificates });
  } catch (error) {
    logger.error('Failed to list certificates', { error });
    res.status(500).json({ error: 'Failed to list certificates' } as ErrorResponse);
  }
});

// DELETE /api/openvpn/certs/:username - Revoke a certificate (superuser only)
router.delete('/certs/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const extension = req.user?.extension;

    // Validate username format
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({ error: 'Invalid username format' } as ErrorResponse);
    }

    // Prevent revoking server cert
    if (username === 'server' || username === 'ca') {
      return res.status(400).json({ error: 'Cannot revoke system certificates' } as ErrorResponse);
    }

    // Check superuser status from Redis
    const superuserKey = `superuser.${extension}`;
    const isSuperuser = await redis.get(superuserKey);

    if (isSuperuser !== '1') {
      return res.status(403).json({ error: 'Superuser access required' } as ErrorResponse);
    }

    logger.info('Revoking OpenVPN certificate', { username, by: extension });

    const pkiPath = path.join(config.openvpnPkiPath, 'pki');
    const certPath = path.join(pkiPath, 'issued', `${username}.crt`);
    const keyPath = path.join(pkiPath, 'private', `${username}.key`);
    const reqPath = path.join(pkiPath, 'reqs', `${username}.req`);

    // Check if certificate exists
    if (!fs.existsSync(certPath)) {
      return res.status(404).json({ error: `Certificate for ${username} not found` } as ErrorResponse);
    }

    // Remove certificate files (simple revocation)
    const filesToRemove = [certPath, keyPath, reqPath];
    for (const file of filesToRemove) {
      try {
        await fs.promises.unlink(file);
      } catch (e) {
        // Ignore if file doesn't exist
      }
    }

    logger.info('Certificate revoked successfully', { username, by: extension });

    res.json({ success: true, message: `Certificate for ${username} revoked` });
  } catch (error) {
    logger.error('Failed to revoke certificate', { error });
    res.status(500).json({ error: 'Failed to revoke certificate', details: (error as Error).message } as ErrorResponse);
  }
});

export default router;
