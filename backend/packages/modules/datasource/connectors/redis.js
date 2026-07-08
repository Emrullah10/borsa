import Redis from 'ioredis';
import helper from '../../helper/index.js';

export function createRedisConnection(url, db = 0) {
  const client = new Redis(url, {
    db,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 15000);
      helper.log.warn(`Redis reconnect attempt #${times}, retrying in ${delay}ms...`);
      return delay;
    },
    maxRetriesPerRequest: 3,
  });

  client.on('connect', () => helper.log.info('Redis connected:', url));
  client.on('error', (err) => helper.log.error('Redis error:', err.message));
  return client;
}
