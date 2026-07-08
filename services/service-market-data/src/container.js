import datasources from '@borsa-bot/datasource';
import { makeCandleRepository } from '@borsa-bot/core-market-data/src/infrastructure/persistence/repositories/candle-repository.js';
import { makePublisher } from '@borsa-bot/core-market-data/src/application/use-cases/make-publisher.js';

export function buildContainer() {
  const candleRepo = makeCandleRepository({ redis: datasources.coreRedis });
  const publisher = makePublisher({ redis: datasources.coreRedis, candleRepo });

  return { candleRepo, publisher };
}
