import { Router, Request, Response } from 'express';
import { query, queryOne, logAudit } from '../db';
import { authMiddleware, requireSuperuser, requireExtensionAccess } from '../auth/middleware';
import { hashPassword, generateRandomPassword } from '../auth/password';
import { redis, keys, getExtensionRedisData, setExtensionRedisData, deleteExtensionRedisData } from '../redis';
import {
  appendExtensionToPjsip,
  removeExtensionFromPjsip,
  updateExtensionPassword,
  updateExtensionCallerid,
  addVoicemailEntry,
  removeVoicemailEntry,
  getExtensionPasswordFromPjsip,
} from '../asterisk/config-writer';
import { reloadAfterConfigChange, isExtensionRegistered } from '../asterisk/ami';
import { parsePjsipConf } from '../asterisk/config-parser';
import { config } from '../config';
import { logger } from '../logger';
import {
  ExtensionInfo,
  CreateExtensionRequest,
  CreateExtensionResponse,
  UpdateExtensionRequest,
  ErrorResponse,
} from '../types/api';
import crypto from 'crypto';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

/**
 * Generate a device ID (MAC-like format)
 */
function generateDeviceId(): string {
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join(':');
}

/**
 * Validate extension format (3-4 digit numbers)
 */
function isValidExtension(ext: string): boolean {
  return /^\d{3,4}$/.test(ext);
}

// GET /api/asterisk/extension/info - Get extension info
router.get('/info', requireExtensionAccess(), async (req: Request, res: Response) => {
  try {
    const extension = (req.query.extension as string) || req.user!.extension;

    if (!isValidExtension(extension)) {
      return res.status(400).json({ error: 'Invalid extension format' } as ErrorResponse);
    }

    // Get Redis data
    const redisData = await getExtensionRedisData(extension);

    // Get PJSIP config data
    const pjsipData = await parsePjsipConf(config.pjsipConf);
    const pjsipExt = pjsipData.extensions.get(extension);

    if (!pjsipExt && !redisData.devices.length) {
      return res.status(404).json({ error: 'Extension not found' } as ErrorResponse);
    }

    // Check registration status
    const registered = await isExtensionRegistered(extension);

    // Get blacklist
    const blacklistKeys = await redis.keys(`blacklist.${extension}.*`);
    const blacklist = blacklistKeys.map(k => k.split('.')[2]);

    const response: ExtensionInfo = {
      extension,
      callerid: pjsipExt?.endpoint.callerid || '',
      context: pjsipExt?.endpoint.context || 'from-internal',
      did: redisData.did,
      devices: redisData.devices,
      voicemail_enabled: true, // Default, could check voicemail.conf
      settings: {
        fallback: redisData.fallback,
        sms_fallback: redisData.smsFallback,
        is_superuser: config.superuserExtensions.includes(extension) || redisData.isSuperuser,
      },
      blacklist,
    };

    res.json(response);
  } catch (error) {
    logger.error('Get extension info error', error);
    res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
});

// GET /api/asterisk/extension/list - List all extensions (superuser only)
router.get('/list', requireSuperuser, async (req: Request, res: Response) => {
  try {
    // Get all extensions from PJSIP config
    const pjsipData = await parsePjsipConf(config.pjsipConf);
    const extensions: string[] = [];

    for (const [name, section] of pjsipData.sections) {
      // Only include endpoint sections that are not templates
      if (
        (section.type === 'endpoint' || section.properties.get('_template')?.includes('endpoint')) &&
        !name.endsWith('!')
      ) {
        extensions.push(name);
      }
    }

    // Get users from database
    const users = await query<{ extension: string; display_name: string | null; is_active: boolean }>(
      'SELECT extension, display_name, is_active FROM users ORDER BY extension'
    );

    const userMap = new Map(users.map(u => [u.extension, u]));

    const result = await Promise.all(
      extensions.map(async ext => {
        const redisData = await getExtensionRedisData(ext);
        const user = userMap.get(ext);
        const registered = await isExtensionRegistered(ext);

        return {
          extension: ext,
          display_name: user?.display_name || null,
          is_active: user?.is_active ?? true,
          did: redisData.did,
          registered,
          devices_count: redisData.devices.length,
        };
      })
    );

    res.json({ extensions: result });
  } catch (error) {
    logger.error('List extensions error', error);
    res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
});

// POST /api/asterisk/extension/create - Create new extension (superuser only)
router.post('/create', requireSuperuser, async (req: Request, res: Response) => {
  try {
    const body = req.body as CreateExtensionRequest;
    const { extension, callerid, did, context, voicemail } = body;

    // Validate extension
    if (!extension || !isValidExtension(extension)) {
      return res.status(400).json({ error: 'Invalid extension format (3-4 digits)' } as ErrorResponse);
    }

    if (!callerid) {
      return res.status(400).json({ error: 'Caller ID required' } as ErrorResponse);
    }

    // Check if extension already exists
    const pjsipData = await parsePjsipConf(config.pjsipConf);
    if (pjsipData.sections.has(extension)) {
      return res.status(409).json({ error: 'Extension already exists' } as ErrorResponse);
    }

    // Generate password
    const sipPassword = body.password || generateRandomPassword(16);
    const userPassword = body.password || generateRandomPassword(12);
    const userPasswordHash = await hashPassword(userPassword);

    // Generate device ID
    const deviceId = generateDeviceId();

    // 1. Add to pjsip.conf
    await appendExtensionToPjsip({
      extension,
      password: sipPassword,
      callerid,
      context: context || 'from-internal',
      mailbox: voicemail?.enabled !== false ? extension : undefined,
    });

    // 2. Add voicemail if enabled
    if (voicemail?.enabled !== false) {
      const vmPassword = voicemail?.password || extension;
      await addVoicemailEntry({
        extension,
        password: vmPassword,
        name: callerid.replace(/<[^>]+>/, '').trim(),
        email: voicemail?.email,
      });
    }

    // 3. Set up Redis keys
    await setExtensionRedisData(extension, {
      deviceId,
      did: did || undefined,
      isSuperuser: false,
    });

    // 4. Create user in database
    await query(
      `INSERT INTO users (extension, password_hash, display_name, is_superuser, is_active)
       VALUES ($1, $2, $3, FALSE, TRUE)
       ON CONFLICT (extension) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         is_active = TRUE`,
      [extension, userPasswordHash, callerid.replace(/<[^>]+>/, '').trim()]
    );

    // 5. Reload Asterisk
    await reloadAfterConfigChange();

    // 6. Audit log
    await logAudit('extension_created', req.user!.extension, req.user!.authType, extension, {
      callerid,
      did,
      context,
      voicemail_enabled: voicemail?.enabled !== false,
    }, req.ip);

    const response: CreateExtensionResponse = {
      extension,
      password: userPassword,
      sip_username: extension,
      created: true,
    };

    logger.info('Extension created', { extension, by: req.user!.extension });
    res.status(201).json(response);
  } catch (error) {
    logger.error('Create extension error', error);
    res.status(500).json({ error: 'Internal server error', details: (error as Error).message } as ErrorResponse);
  }
});

// PUT /api/asterisk/extension/update - Update extension
router.put('/update', requireExtensionAccess(), async (req: Request, res: Response) => {
  try {
    const body = req.body as UpdateExtensionRequest;
    const extension = body.extension || req.user!.extension;

    if (!isValidExtension(extension)) {
      return res.status(400).json({ error: 'Invalid extension format' } as ErrorResponse);
    }

    // Check if extension exists
    const pjsipData = await parsePjsipConf(config.pjsipConf);
    if (!pjsipData.sections.has(extension)) {
      return res.status(404).json({ error: 'Extension not found' } as ErrorResponse);
    }

    const changes: string[] = [];

    // Update password in pjsip.conf
    if (body.password) {
      await updateExtensionPassword(extension, body.password);

      // Also update user password in database
      const passwordHash = await hashPassword(body.password);
      await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE extension = $2', [
        passwordHash,
        extension,
      ]);
      changes.push('password');
    }

    // Update callerid
    if (body.callerid) {
      await updateExtensionCallerid(extension, body.callerid);
      changes.push('callerid');
    }

    // Update DID in Redis
    if (body.did !== undefined) {
      await setExtensionRedisData(extension, {
        did: body.did || undefined,
      });
      changes.push('did');
    }

    // Update settings in Redis
    if (body.settings) {
      if (body.settings.fallback !== undefined) {
        if (body.settings.fallback) {
          await redis.set(keys.fallback(extension), body.settings.fallback);
        } else {
          await redis.del(keys.fallback(extension));
        }
        changes.push('fallback');
      }

      if (body.settings.sms_fallback !== undefined) {
        if (body.settings.sms_fallback) {
          await redis.set(keys.smsFallback(extension), body.settings.sms_fallback);
        } else {
          await redis.del(keys.smsFallback(extension));
        }
        changes.push('sms_fallback');
      }
    }

    // Update blacklist
    if (body.blacklist) {
      if (body.blacklist.add) {
        for (const number of body.blacklist.add) {
          await redis.set(keys.blacklist(extension, number), '1');
        }
        changes.push('blacklist_add');
      }

      if (body.blacklist.remove) {
        for (const number of body.blacklist.remove) {
          await redis.del(keys.blacklist(extension, number));
        }
        changes.push('blacklist_remove');
      }
    }

    // Reload Asterisk if config changed
    if (changes.includes('password') || changes.includes('callerid')) {
      await reloadAfterConfigChange();
    }

    // Audit log
    await logAudit('extension_updated', req.user!.extension, req.user!.authType, extension, { changes }, req.ip);

    logger.info('Extension updated', { extension, changes, by: req.user!.extension });
    res.json({ success: true, changes });
  } catch (error) {
    logger.error('Update extension error', error);
    res.status(500).json({ error: 'Internal server error', details: (error as Error).message } as ErrorResponse);
  }
});

// DELETE /api/asterisk/extension/delete - Delete extension (superuser only)
router.delete('/delete', requireSuperuser, async (req: Request, res: Response) => {
  try {
    const extension = (req.query.extension as string) || (req.body as { extension?: string }).extension;

    if (!extension || !isValidExtension(extension)) {
      return res.status(400).json({ error: 'Invalid extension format' } as ErrorResponse);
    }

    // Check if extension exists
    const pjsipData = await parsePjsipConf(config.pjsipConf);
    if (!pjsipData.sections.has(extension)) {
      return res.status(404).json({ error: 'Extension not found' } as ErrorResponse);
    }

    // 1. Remove from pjsip.conf
    await removeExtensionFromPjsip(extension);

    // 2. Remove voicemail entry
    await removeVoicemailEntry(extension);

    // 3. Remove Redis keys
    await deleteExtensionRedisData(extension);

    // 4. Soft-delete user in database
    await query('UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE extension = $1', [extension]);

    // 5. Revoke all API keys
    await query('UPDATE api_keys SET revoked_at = NOW() WHERE extension = $1 AND revoked_at IS NULL', [extension]);

    // 6. Reload Asterisk
    await reloadAfterConfigChange();

    // 7. Audit log
    await logAudit('extension_deleted', req.user!.extension, req.user!.authType, extension, {}, req.ip);

    logger.info('Extension deleted', { extension, by: req.user!.extension });
    res.status(204).send();
  } catch (error) {
    logger.error('Delete extension error', error);
    res.status(500).json({ error: 'Internal server error', details: (error as Error).message } as ErrorResponse);
  }
});

// GET /api/asterisk/extension/blacklist - Get blacklist for extension
router.get('/blacklist', requireExtensionAccess(), async (req: Request, res: Response) => {
  try {
    const extension = (req.query.extension as string) || req.user!.extension;

    const blacklistKeys = await redis.keys(`blacklist.${extension}.*`);
    const blacklist = blacklistKeys.map(k => k.split('.')[2]);

    res.json({ extension, blacklist });
  } catch (error) {
    logger.error('Get blacklist error', error);
    res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
});

// POST /api/asterisk/extension/blacklist/add - Add number to blacklist
router.post('/blacklist/add', requireExtensionAccess(), async (req: Request, res: Response) => {
  try {
    const { extension: ext, number } = req.body as { extension?: string; number: string };
    const extension = ext || req.user!.extension;

    if (!number) {
      return res.status(400).json({ error: 'Number required' } as ErrorResponse);
    }

    await redis.set(keys.blacklist(extension, number), '1');

    await logAudit('blacklist_add', req.user!.extension, req.user!.authType, extension, { number }, req.ip);

    logger.info('Number added to blacklist', { extension, number });
    res.json({ success: true, extension, number });
  } catch (error) {
    logger.error('Add to blacklist error', error);
    res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
});

// DELETE /api/asterisk/extension/blacklist/remove - Remove number from blacklist
router.delete('/blacklist/remove', requireExtensionAccess(), async (req: Request, res: Response) => {
  try {
    const extension = (req.query.extension as string) || req.user!.extension;
    const number = req.query.number as string;

    if (!number) {
      return res.status(400).json({ error: 'Number required' } as ErrorResponse);
    }

    await redis.del(keys.blacklist(extension, number));

    await logAudit('blacklist_remove', req.user!.extension, req.user!.authType, extension, { number }, req.ip);

    logger.info('Number removed from blacklist', { extension, number });
    res.status(204).send();
  } catch (error) {
    logger.error('Remove from blacklist error', error);
    res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
});

export default router;
