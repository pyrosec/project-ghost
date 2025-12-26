import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ghost:ghost@postgres:5432/ghost',
});

export async function initAccessLogTable() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS access_log (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        source_ip VARCHAR(45),
        user_agent TEXT,
        path VARCHAR(2048),
        method VARCHAR(10),
        referer TEXT,
        country VARCHAR(2),
        headers JSONB
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_access_log_timestamp ON access_log(timestamp DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_access_log_path ON access_log(path)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_access_log_source_ip ON access_log(source_ip)
    `);
  } finally {
    client.release();
  }
}

export async function logAccess(data: {
  sourceIp: string;
  userAgent: string;
  path: string;
  method: string;
  referer?: string;
  country?: string;
  headers?: Record<string, string>;
}) {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO access_log (source_ip, user_agent, path, method, referer, country, headers)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        data.sourceIp,
        data.userAgent,
        data.path,
        data.method,
        data.referer || null,
        data.country || null,
        data.headers ? JSON.stringify(data.headers) : null,
      ]
    );
  } finally {
    client.release();
  }
}

export async function getAccessLogs(limit = 100, offset = 0) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM access_log ORDER BY timestamp DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export default pool;
