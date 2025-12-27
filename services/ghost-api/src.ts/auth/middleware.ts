import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from './jwt';
import { verifyPassword, getApiKeyPrefix } from './password';
import { query, queryOne } from '../db';
import { config } from '../config';
import { logger } from '../logger';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export interface AuthUser {
  extension: string;
  isSuperuser: boolean;
  authType: 'jwt' | 'api_key';
}

interface ApiKeyRow {
  id: string;
  extension: string;
  key_hash: string;
  expires_at: Date | null;
  revoked_at: Date | null;
}

interface UserRow {
  extension: string;
  is_superuser: boolean;
  is_active: boolean;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Authorization header required' });
    return;
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'Invalid authorization format. Use: Bearer <token>' });
    return;
  }

  // Check if it's an API key or JWT
  if (token.startsWith(config.apiKeyPrefix)) {
    // API Key authentication
    const user = await validateApiKey(token);
    if (!user) {
      res.status(401).json({ error: 'Invalid or expired API key' });
      return;
    }
    req.user = user;
  } else {
    // JWT authentication
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Check if user is still active
    const user = await queryOne<UserRow>(
      'SELECT extension, is_superuser, is_active FROM users WHERE extension = $1',
      [payload.sub]
    );

    if (!user || !user.is_active) {
      res.status(401).json({ error: 'User account is disabled' });
      return;
    }

    req.user = {
      extension: payload.sub,
      isSuperuser: payload.is_superuser || config.superuserExtensions.includes(payload.sub),
      authType: 'jwt',
    };
  }

  next();
}

async function validateApiKey(apiKey: string): Promise<AuthUser | null> {
  const prefix = getApiKeyPrefix(apiKey);

  // Find API key by prefix
  const keyRow = await queryOne<ApiKeyRow>(
    `SELECT id, extension, key_hash, expires_at, revoked_at
     FROM api_keys
     WHERE key_prefix = $1 AND revoked_at IS NULL`,
    [prefix]
  );

  if (!keyRow) {
    return null;
  }

  // Check expiry
  if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
    return null;
  }

  // Verify the key hash
  const isValid = await verifyPassword(apiKey, keyRow.key_hash);
  if (!isValid) {
    return null;
  }

  // Update last_used_at
  await query(
    'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
    [keyRow.id]
  );

  // Get user info
  const user = await queryOne<UserRow>(
    'SELECT extension, is_superuser, is_active FROM users WHERE extension = $1',
    [keyRow.extension]
  );

  if (!user || !user.is_active) {
    return null;
  }

  return {
    extension: keyRow.extension,
    isSuperuser: user.is_superuser || config.superuserExtensions.includes(keyRow.extension),
    authType: 'api_key',
  };
}

// Middleware to require superuser
export function requireSuperuser(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user?.isSuperuser) {
    res.status(403).json({ error: 'Superuser access required' });
    return;
  }
  next();
}

// Middleware to require access to specific extension (self or superuser)
export function requireExtensionAccess(extParam: string = 'extension') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const targetExt = req.params[extParam] || req.query[extParam] || req.body?.[extParam];

    if (!targetExt) {
      // If no extension specified, user can only access their own
      req.body = { ...req.body, extension: req.user!.extension };
      next();
      return;
    }

    // Superusers can access any extension
    if (req.user?.isSuperuser) {
      next();
      return;
    }

    // Non-superusers can only access their own extension
    if (targetExt !== req.user?.extension) {
      res.status(403).json({ error: 'Access denied. You can only access your own extension.' });
      return;
    }

    next();
  };
}
