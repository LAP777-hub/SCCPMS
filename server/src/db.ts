import pg from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';
import { isVercelRuntime, manageDatabasePool } from './runtime.js';
import { databaseOptions } from './database-ssl.js';

const { Pool } = pg;

export const pool = new Pool({
  ...databaseOptions(config),
  max: isVercelRuntime ? 3 : 10,
  idleTimeoutMillis: isVercelRuntime ? 5_000 : 30_000,
  connectionTimeoutMillis: 10_000,
});

manageDatabasePool(pool);

pool.on('error', (error) => {
  logger.error('Unexpected idle PostgreSQL client error', error);
});
