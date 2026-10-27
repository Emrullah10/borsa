import helper from '@borsa-bot/helper';
import { makeBitgetPublic } from '@borsa-bot/core-carry/src/infrastructure/bitget-public.js';
import { makeLlmClient, DEFAULT_ALLOWED_MODELS } from '@borsa-bot/core-carry/src/infrastructure/llm-client.js';
import { makeAiSentinel } from '@borsa-bot/core-carry/src/infrastructure/ai-sentinel.js';
import { makeCarryRepository } from '@borsa-bot/core-carry/src/infrastructure/repositories/carry-repository.js';
import { makeCarryEngine } from '@borsa-bot/core-carry/src/application/carry-engine.js';
import { makeFundingStoreRepository } from '@borsa-bot/core-carry/src/infrastructure/repositories/funding-store-repository.js';
import { makeTelegramSender } from '@borsa-bot/core-carry/src/infrastructure/telegram-sender.js';

export function buildContainer({ config, db }) {
  const log = helper.log;
  const allowed = config.aiAllowedModels ? config.aiAllowedModels.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_ALLOWED_MODELS;
  const llm = config.aiProvider === 'none'
    ? { completeJson: async () => ({ ok: false, error: 'AI_PROVIDER=none' }), enabled: false, provider: 'none', model: null }
    : makeLlmClient({
      provider: config.aiProvider, apiKey: config.openrouterApiKey, baseUrl: config.aiBaseUrl,
      model: config.aiModel, allowedModels: allowed, log,
    });
  const telegram = makeTelegramSender({ botToken: config.telegramBotToken, chatId: config.telegramChatId, log });
  const repo = makeCarryRepository({ db });
  const engine = makeCarryEngine({
    bitget: makeBitgetPublic(),
    repo,
    fundingStore: makeFundingStoreRepository({ db }),
    sentinel: makeAiSentinel({ llm }),
    notify: (text) => telegram.send(text),
    log,
    mode: config.mode,
    capitalUsd: config.capitalUsd,
  });
  return { engine, repo, llm, telegram };
}
