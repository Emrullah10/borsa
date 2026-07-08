import datasources from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';
import { makeSignalRepository } from '@borsa-bot/core-signal-engine/src/infrastructure/persistence/repositories/signal-repository.js';
import { makeProcessCandle } from '@borsa-bot/core-signal-engine/src/application/use-cases/make-process-candle.js';

export async function buildContainer({ confluenceThreshold, takerFee }) {
  const signalRepo = makeSignalRepository({ db: datasources.postgres, takerFee });

  const processCandle = makeProcessCandle({
    signalRepo,
    publish: (channel, msg) => datasources.coreRedis.publish(channel, msg),
    log: helper.log,
    confluenceThreshold,
  });

  return { signalRepo, processCandle };
}
