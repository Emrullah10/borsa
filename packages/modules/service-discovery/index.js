import helper from '../helper/index.js';

const HEARTBEAT_INTERVAL_MS = 3000;
const SERVICE_TTL_S = 10;

export function createServiceDiscovery(redisClient, serviceName, meta = {}) {
  const key = `service:${serviceName}`;

  async function register() {
    const data = {
      name: serviceName,
      ...meta,
      registeredAt: Date.now(),
    };
    await redisClient.setex(key, SERVICE_TTL_S, JSON.stringify(data));
    helper.log.info(`Service-discovery: ${serviceName} registered`);
  }

  function startHeartbeat() {
    const interval = setInterval(async () => {
      try {
        await redisClient.expire(key, SERVICE_TTL_S);
      } catch (err) {
        helper.log.warn('Heartbeat error:', err.message);
      }
    }, HEARTBEAT_INTERVAL_MS);
    interval.unref();
    return interval;
  }

  async function discover(name) {
    const raw = await redisClient.get(`service:${name}`);
    return raw ? JSON.parse(raw) : null;
  }

  return { register, startHeartbeat, discover };
}
