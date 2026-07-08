import { createRedisConnection } from './connectors/redis.js';
import { createPostgresPool } from './connectors/postgre.js';

const datasources = {};

export async function createDatasources(config) {
  datasources.coreRedis = createRedisConnection(config.coreRedisUrl);
  datasources.discoveryRedis = createRedisConnection(config.discoveryRedisUrl);
  datasources.postgres = createPostgresPool(config.databaseUrl);

  // Verify postgres connection
  const client = await datasources.postgres.connect();
  await client.query('SELECT 1');
  client.release();

  return datasources;
}

export default datasources;
