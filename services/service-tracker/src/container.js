import datasources from '@borsa-bot/datasource';
import helper from '@borsa-bot/helper';
import { makeSignalRepository } from '@borsa-bot/core-signal-engine/src/infrastructure/persistence/repositories/signal-repository.js';
import { makeProcessOutcomeCandle } from '@borsa-bot/core-tracker/src/application/use-cases/make-process-outcome-candle.js';
import { fetchCandles } from '@borsa-bot/core-backtest/src/infrastructure/fetcher.js';

// C4 (2026-08-20): sinyalin oluşturulduğu andan şimdiye kadar Bitget REST'ten
// 1m mumları çeker — servis restart'ı gibi durumlarda kaçırılan pencereyi
// backfillOutcome'a besler. fetchCandles(symbol, tf, days) days-tabanlı
// olduğu için yaş gün cinsine çevrilip yeterli marjla (min 0.01g ≈ 15dk) çağrılır,
// sonra fromTs'ten sonrası filtrelenir.
async function fetchMissedCandles(symbol, fromTs) {
  const ageDays = Math.max((Date.now() - fromTs) / 86_400_000, 0.01);
  const candles = await fetchCandles(symbol, '1m', ageDays);
  return candles.filter((c) => c.timestamp > fromTs).sort((a, b) => a.timestamp - b.timestamp);
}

export function buildContainer({ timeoutMs, fees }) {
  const signalRepo = makeSignalRepository({ db: datasources.postgres });

  const processOutcomeCandle = makeProcessOutcomeCandle({
    signalRepo,
    publish: (channel, msg) => datasources.coreRedis.publish(channel, msg),
    log: helper.log,
    timeoutMs,
    fees,
    fetchMissedCandles,
  });

  return { signalRepo, processOutcomeCandle };
}
