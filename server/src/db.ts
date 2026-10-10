import pg from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: config.DATABASE_SSL_MODE === 'verify-full'
    ? { rejectUnauthorized: true, ...(config.DATABASE_SSL_CA ? { ca: config.DATABASE_SSL_CA.replace(/\\n/g, '\n') } : {}) }
    : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (error) => {
  logger.error('Unexpected idle PostgreSQL client error', error);
});