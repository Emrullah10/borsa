import datasources from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';
import { makeSignalRepository } from '@borsa-bot/core-signal-engine/src/infrastructure/persistence/repositories/signal-repository.js';
import { makeProcessOutcomeCandle } from '@borsa-bot/core-tracker/src/application/use-cases/make-process-outcome-candle.js';

export function buildContainer({ timeoutMs, fees }) {
  const signalRepo = makeSignalRepository({ db: datasources.postgres });

  const processOutcomeCandle = makeProcessOutcomeCandle({
    signalRepo,
    publish: (channel, msg) => datasources.coreRedis.publish(channel, msg),
    log: helper.log,
    timeoutMs,
    fees,
  });

  return { signalRepo, processOutcomeCandle };
}
