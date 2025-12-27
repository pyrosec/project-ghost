import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../logger';

export const redis = new Redis(config.redisUri);

redis.on('error', (err) => {
  logger.error('Redis connection error', err);
});

redis.on('connect', () => {
  logger.info('Connected to Redis');
});

// Redis key patterns for extensions
export const keys = {
  deviceList: (ext: string) => `devicelist.${ext}`,
  extForDevice: (deviceId: string) => `extfordevice.${deviceId}`,
  didFor: (ext: string) => `didfor.${ext}`,
  extFor: (did: string) => `extfor.${did}`,
  fallback: (ext: string) => `fallback.${ext}`,
  smsFallback: (ext: string) => `sms-fallback.${ext}`,
  superuser: (ext: string) => `superuser.${ext}`,
  blacklist: (ext: string, number: string) => `blacklist.${ext}.${number}`,
  blacklistPattern: (ext: string) => `blacklist.${ext}.*`,
  voipPassthrough: (ext: string) => `voip-passthrough.${ext}`,
  ghostem: (ext: string) => `ghostem.${ext}`,
};

export interface ExtensionRedisData {
  devices: string[];
  did: string | null;
  fallback: string | null;
  smsFallback: string | null;
  isSuperuser: boolean;
  blacklist: string[];
}

export async function getExtensionRedisData(ext: string): Promise<ExtensionRedisData> {
  const [deviceHash, did, fallback, smsFallback, superuser] = await Promise.all([
    redis.hgetall(keys.deviceList(ext)),
    redis.get(keys.didFor(ext)),
    redis.get(keys.fallback(ext)),
    redis.get(keys.smsFallback(ext)),
    redis.get(keys.superuser(ext)),
  ]);

  // Get blacklist entries
  const blacklistKeys = await redis.keys(keys.blacklistPattern(ext));
  const blacklist = blacklistKeys.map(k => k.split('.').pop()!);

  return {
    devices: Object.keys(deviceHash),
    did,
    fallback,
    smsFallback,
    isSuperuser: superuser === '1',
    blacklist,
  };
}

export async function setExtensionRedisData(
  ext: string,
  data: Partial<{
    deviceId: string;
    did: string;
    fallback: string;
    smsFallback: string;
    isSuperuser: boolean;
  }>
): Promise<void> {
  const pipeline = redis.pipeline();

  if (data.deviceId) {
    pipeline.hset(keys.deviceList(ext), data.deviceId, '1');
    pipeline.set(keys.extForDevice(data.deviceId), ext);
  }

  if (data.did) {
    pipeline.set(keys.didFor(ext), data.did);
    pipeline.set(keys.extFor(data.did), ext);
  }

  if (data.fallback !== undefined) {
    if (data.fallback) {
      pipeline.set(keys.fallback(ext), data.fallback);
    } else {
      pipeline.del(keys.fallback(ext));
    }
  }

  if (data.smsFallback !== undefined) {
    if (data.smsFallback) {
      pipeline.set(keys.smsFallback(ext), data.smsFallback);
    } else {
      pipeline.del(keys.smsFallback(ext));
    }
  }

  if (data.isSuperuser !== undefined) {
    if (data.isSuperuser) {
      pipeline.set(keys.superuser(ext), '1');
    } else {
      pipeline.del(keys.superuser(ext));
    }
  }

  await pipeline.exec();
}

export async function deleteExtensionRedisData(ext: string): Promise<void> {
  // Get all device IDs for this extension
  const devices = await redis.hgetall(keys.deviceList(ext));
  const did = await redis.get(keys.didFor(ext));

  const pipeline = redis.pipeline();

  // Delete device mappings
  pipeline.del(keys.deviceList(ext));
  for (const deviceId of Object.keys(devices)) {
    pipeline.del(keys.extForDevice(deviceId));
  }

  // Delete DID mappings
  if (did) {
    pipeline.del(keys.didFor(ext));
    pipeline.del(keys.extFor(did));
  }

  // Delete other keys
  pipeline.del(keys.fallback(ext));
  pipeline.del(keys.smsFallback(ext));
  pipeline.del(keys.superuser(ext));
  pipeline.del(keys.voipPassthrough(ext));
  pipeline.del(keys.ghostem(ext));

  // Delete blacklist entries
  const blacklistKeys = await redis.keys(keys.blacklistPattern(ext));
  for (const key of blacklistKeys) {
    pipeline.del(key);
  }

  await pipeline.exec();
}

export async function addToBlacklist(ext: string, number: string): Promise<void> {
  await redis.set(keys.blacklist(ext, number), '1');
}

export async function removeFromBlacklist(ext: string, number: string): Promise<void> {
  await redis.del(keys.blacklist(ext, number));
}
