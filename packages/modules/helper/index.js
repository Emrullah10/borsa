function timestamp() {
  return new Date().toISOString();
}

const log = {
  info:  (...args) => console.log(`[${timestamp()}] INFO `, ...args),
  warn:  (...args) => console.warn(`[${timestamp()}] WARN `, ...args),
  error: (...args) => console.error(`[${timestamp()}] ERROR`, ...args),
  debug: (...args) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[${timestamp()}] DEBUG`, ...args);
    }
  },
};

function exitOnError(error) {
  if (error) log.error('Critical error, stopping service:', error);
  process.exit(1);
}

function appStarted(config) {
  log.info(`Service ready — port: ${config.port}, env: ${config.nodeEnv}`);
}

export default { log, exitOnError, appStarted };
