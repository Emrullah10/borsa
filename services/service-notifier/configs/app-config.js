export default {
  port:              { default: 3103, env: 'NOTIFIER_PORT', type: 'number' },
  nodeEnv:           { default: 'development', env: 'NODE_ENV' },
  coreRedisUrl:      { default: 'redis://localhost:6379', env: 'CORE_REDIS_URL' },
  discoveryRedisUrl: { default: 'redis://localhost:6379', env: 'CORE_DISCOVERY_REDIS_URL' },
  databaseUrl:       { default: 'postgres://botuser:botpass@localhost:5432/borsabot', env: 'DATABASE_URL' },
  gmailUser:         { env: 'GMAIL_USER', default: '' },
  gmailAppPassword:  { env: 'GMAIL_APP_PASSWORD', default: '' },
  emailTo:           { env: 'EMAIL_TO', default: '' },
};
