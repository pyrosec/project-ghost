import { Pool } from 'pg';
import { config } from '../config';
import { logger } from '../logger';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Unexpected database error', err);
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  logger.debug('Executed query', { text, duration, rows: result.rowCount });
  return result.rows as T[];
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}

export async function initializeDatabase(): Promise<void> {
  logger.info('Initializing database schema...');

  // Create users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      extension VARCHAR(10) PRIMARY KEY,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(100),
      email VARCHAR(255),
      is_superuser BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Create api_keys table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      extension VARCHAR(10) NOT NULL REFERENCES users(extension) ON DELETE CASCADE,
      key_hash VARCHAR(255) NOT NULL,
      key_prefix VARCHAR(8) NOT NULL,
      name VARCHAR(100) NOT NULL,
      expires_at TIMESTAMPTZ,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    )
  `);

  // Create audit_log table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      actor_extension VARCHAR(10),
      actor_type VARCHAR(20),
      action VARCHAR(50) NOT NULL,
      target_extension VARCHAR(10),
      target_type VARCHAR(50),
      details JSONB,
      ip_address INET,
      user_agent TEXT
    )
  `);

  // Create indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_api_keys_extension ON api_keys(extension);
    CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys(key_prefix) WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_extension);
  `);

  logger.info('Database schema initialized');
}

export async function logAudit(
  action: string,
  actorExtension: string | null,
  actorType: string,
  targetExtension: string | null,
  details: object,
  ipAddress?: string
): Promise<void> {
  await pool.query(`
    INSERT INTO audit_log (actor_extension, actor_type, action, target_extension, details, ip_address)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [actorExtension, actorType, action, targetExtension, JSON.stringify(details), ipAddress || null]);
}
