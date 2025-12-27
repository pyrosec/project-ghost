import { Router, Request, Response } from 'express';
import { query, queryOne, logAudit } from '../db';
import { signToken, verifyPassword, hashPassword, generateApiKey, getApiKeyPrefix } from '../auth';
import { authMiddleware } from '../auth/middleware';
import { getExtensionPasswordFromPjsip } from '../asterisk/config-writer';
import { parsePjsipConf } from '../asterisk/config-parser';
import { config } from '../config';
import { logger } from '../logger';
import {
  LoginRequest,
  LoginResponse,
  CreateTokenRequest,
  CreateTokenResponse,
  UserInfo,
  ApiKeyInfo,
  ErrorResponse,
} from '../types/api';

const router = Router();

interface UserRow {
  extension: string;
  password_hash: string;
  display_name: string | null;
  email: string | null;
  is_superuser: boolean;
  is_active: boolean;
}

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { extension, password } = req.body as LoginRequest;

    if (!extension || !password) {
      return res.status(400).json({ error: 'Extension and password required' } as ErrorResponse);
    }

    // Find user in database
    let user = await queryOne<UserRow>(
      'SELECT extension, password_hash, display_name, is_superuser, is_active FROM users WHERE extension = $1',
      [extension]
    );

    let isValid = false;
    let bootstrapped = false;

    if (user) {
      // User exists in database
      if (!user.is_active) {
        logger.warn('Login attempt for disabled user', { extension });
        return res.status(401).json({ error: 'Account is disabled' } as ErrorResponse);
      }

      // Verify password against database hash
      isValid = await verifyPassword(password, user.password_hash);
    } else {
      // User not in database - check pjsip.conf for bootstrap
      logger.info('User not in database, checking pjsip.conf for bootstrap', { extension });

      try {
        // Check if extension exists in pjsip.conf
        const pjsipPassword = await getExtensionPasswordFromPjsip(extension);

        if (pjsipPassword) {
          // Extension exists in pjsip.conf - verify password directly
          if (password === pjsipPassword) {
            isValid = true;
            bootstrapped = true;

            // Get caller ID from pjsip.conf for display name
            const pjsipData = await parsePjsipConf(config.pjsipConf);
            const extData = pjsipData.extensions.get(extension);
            const callerid = extData?.endpoint.callerid || extension;
            const displayName = callerid.replace(/<[^>]+>/, '').trim();

            // Create user in database with hashed password
            const passwordHash = await hashPassword(password);
            const isSuperuser = config.superuserExtensions.includes(extension);

            await query(
              `INSERT INTO users (extension, password_hash, display_name, is_superuser, is_active)
               VALUES ($1, $2, $3, $4, TRUE)
               ON CONFLICT (extension) DO UPDATE SET
                 password_hash = EXCLUDED.password_hash,
                 is_active = TRUE`,
              [extension, passwordHash, displayName, isSuperuser]
            );

            logger.info('Bootstrapped user from pjsip.conf', { extension, displayName });

            // Reload user from database
            user = await queryOne<UserRow>(
              'SELECT extension, password_hash, display_name, is_superuser, is_active FROM users WHERE extension = $1',
              [extension]
            );
          }
        }
      } catch (pjsipError) {
        logger.warn('Failed to check pjsip.conf for bootstrap', { extension, error: pjsipError });
      }
    }

    if (!isValid || !user) {
      logger.warn('Failed login attempt', { extension, bootstrapped });
      await logAudit('login_failed', extension, 'user', extension, { bootstrapped }, req.ip);
      return res.status(401).json({ error: 'Invalid credentials' } as ErrorResponse);
    }

    // Check if superuser (from DB or config)
    const isSuperuser = user.is_superuser || config.superuserExtensions.includes(extension);

    // Generate token
    const token = signToken(extension, isSuperuser);
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

    await logAudit('login_success', extension, 'user', extension, { bootstrapped }, req.ip);

    const response: LoginResponse = {
      token,
      extension,
      is_superuser: isSuperuser,
      expires_at: new Date(decoded.exp * 1000).toISOString(),
    };

    logger.info('User logged in', { extension, bootstrapped });
    res.json(response);
  } catch (error) {
    logger.error('Login error', error);
    res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
});

// POST /api/auth/token - Create API key
router.post('/token', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, expires_in_days } = req.body as CreateTokenRequest;
    const extension = req.user!.extension;

    if (!name) {
      return res.status(400).json({ error: 'Token name required' } as ErrorResponse);
    }

    // Generate API key
    const apiKey = generateApiKey();
    const keyHash = await hashPassword(apiKey);
    const keyPrefix = getApiKeyPrefix(apiKey);

    // Calculate expiry
    let expiresAt: Date | null = null;
    if (expires_in_days) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expires_in_days);
    }

    // Insert into database
    const result = await query<{ id: string }>(
      `INSERT INTO api_keys (extension, key_hash, key_prefix, name, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [extension, keyHash, keyPrefix, name, expiresAt]
    );

    await logAudit('api_key_created', extension, req.user!.authType, extension, { name, keyPrefix }, req.ip);

    const response: CreateTokenResponse = {
      api_key: apiKey,
      key_id: result[0].id,
      name,
      key_prefix: keyPrefix,
      expires_at: expiresAt?.toISOString() || null,
    };

    logger.info('API key created', { extension, name, keyPrefix });
    res.status(201).json(response);
  } catch (error) {
    logger.error('Create token error', error);
    res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
});

// GET /api/auth/me - Get current user info
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const extension = req.user!.extension;

    // Get user info
    const user = await queryOne<UserRow>(
      'SELECT extension, display_name, email, is_superuser FROM users WHERE extension = $1',
      [extension]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' } as ErrorResponse);
    }

    // Get API keys
    const apiKeys = await query<ApiKeyInfo>(
      `SELECT id, name, key_prefix, created_at, last_used_at, expires_at
       FROM api_keys
       WHERE extension = $1 AND revoked_at IS NULL
       ORDER BY created_at DESC`,
      [extension]
    );

    const response: UserInfo = {
      extension: user.extension,
      display_name: user.display_name,
      email: user.email,
      is_superuser: user.is_superuser || config.superuserExtensions.includes(extension),
      api_keys: apiKeys,
    };

    res.json(response);
  } catch (error) {
    logger.error('Get user info error', error);
    res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
});

// DELETE /api/auth/token/:id - Revoke API key
router.delete('/token/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const extension = req.user!.extension;

    // Check ownership (or superuser)
    const key = await queryOne<{ extension: string }>(
      'SELECT extension FROM api_keys WHERE id = $1 AND revoked_at IS NULL',
      [id]
    );

    if (!key) {
      return res.status(404).json({ error: 'API key not found' } as ErrorResponse);
    }

    if (key.extension !== extension && !req.user!.isSuperuser) {
      return res.status(403).json({ error: 'Access denied' } as ErrorResponse);
    }

    // Soft delete
    await query('UPDATE api_keys SET revoked_at = NOW() WHERE id = $1', [id]);

    await logAudit('api_key_revoked', extension, req.user!.authType, key.extension, { key_id: id }, req.ip);

    logger.info('API key revoked', { extension, key_id: id });
    res.status(204).send();
  } catch (error) {
    logger.error('Revoke token error', error);
    res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
});

export default router;
