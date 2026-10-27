export default {
  port:              { default: 3104, env: 'CARRY_PORT', type: 'number' },
  nodeEnv:           { default: 'development', env: 'NODE_ENV' },
  coreRedisUrl:      { default: 'redis://localhost:6379', env: 'CORE_REDIS_URL' },
  discoveryRedisUrl: { default: 'redis://localhost:6379', env: 'CORE_DISCOVERY_REDIS_URL' },
  databaseUrl:       { default: 'postgres://botuser:botpass@localhost:5432/borsabot', env: 'DATABASE_URL' },
  // 'live' bilinçli olarak YOK: emir gönderen kod yok, kâğıt dönemi kapıyı geçmeden yazılmayacak.
  mode:              { default: 'paper', env: 'CARRY_MODE', type: 'enum', values: ['paper'] },
  capitalUsd:        { default: 1000, env: 'CARRY_PAPER_CAPITAL', type: 'number' },
  aiProvider:        { default: 'none', env: 'AI_PROVIDER', type: 'enum', values: ['openrouter', 'ollama', 'none'] },
  openrouterApiKey:  { default: '', env: 'OPENROUTER_API_KEY' },
  aiModel:           { default: '', env: 'AI_MODEL' },             // boş → openrouter/auto
  aiAllowedModels:   { default: '', env: 'AI_ALLOWED_MODELS' },    // virgüllü; boş → varsayılan ucuz havuz
  aiBaseUrl:         { default: '', env: 'AI_BASE_URL' },
  telegramBotToken:  { env: 'TELEGRAM_BOT_TOKEN', default: '' },
  telegramChatId:    { env: 'TELEGRAM_CHAT_ID', default: '' },
  tickIntervalSec:   { default: 300, env: 'CARRY_TICK_SEC', type: 'number' },
  sentinelIntervalMin: { default: 10, env: 'CARRY_SENTINEL_MIN', type: 'number' },
};
