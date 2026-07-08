export default {
  port:             { default: 3101, env: 'MARKET_DATA_PORT', type: 'number' },
  nodeEnv:          { default: 'development', env: 'NODE_ENV', type: 'enum', values: ['development', 'production', 'test'] },
  databaseUrl:      { env: 'DATABASE_URL' },
  coreRedisUrl:     { default: 'redis://localhost:6379', env: 'CORE_REDIS_URL' },
  discoveryRedisUrl:{ default: 'redis://localhost:6379', env: 'CORE_DISCOVERY_REDIS_URL' },
};
