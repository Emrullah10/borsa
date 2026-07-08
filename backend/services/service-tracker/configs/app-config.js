export default {
  port:              { default: 3104, env: 'TRACKER_PORT', type: 'number' },
  nodeEnv:           { default: 'development', env: 'NODE_ENV' },
  coreRedisUrl:      { default: 'redis://localhost:6379', env: 'CORE_REDIS_URL' },
  discoveryRedisUrl: { default: 'redis://localhost:6379', env: 'CORE_DISCOVERY_REDIS_URL' },
  databaseUrl:       { default: 'postgres://botuser:botpass@localhost:5432/borsabot', env: 'DATABASE_URL' },
  // Sinyal kaç saat sonra timeout sayılır
  timeoutHours:      { default: 4, env: 'TRACKER_TIMEOUT_HOURS', type: 'number' },
  // Pending outcome'ları DB'den kaç saniyede bir tazele
  refreshIntervalSec: { default: 30, env: 'TRACKER_REFRESH_SEC', type: 'number' },
};
