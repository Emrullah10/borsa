import pg from 'pg';
import helper from '../../helper/index.js';

const { Pool } = pg;

export function createPostgresPool(url) {
  const pool = new Pool({ connectionString: url, max: 10 });
  pool.on('error', (err) => helper.log.error('Postgres pool error:', err.message));
  helper.log.info('Postgres pool created');
  return pool;
}
