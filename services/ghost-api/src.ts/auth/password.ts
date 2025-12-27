import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { config } from '../config';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(24);
  return config.apiKeyPrefix + randomBytes.toString('base64url');
}

export function getApiKeyPrefix(apiKey: string): string {
  // Get first 8 chars after the prefix for identification
  const withoutPrefix = apiKey.replace(config.apiKeyPrefix, '');
  return withoutPrefix.substring(0, 8);
}

export function generateDeviceId(): string {
  // Generate MAC-like device ID
  const bytes = crypto.randomBytes(6);
  return bytes.toString('hex').toUpperCase().match(/.{2}/g)!.join('');
}

export function generateVoicemailPin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export function generateRandomPassword(length: number = 14): string {
  const charset = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let password = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }
  return password;
}
