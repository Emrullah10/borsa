// OpenAI-uyumlu sohbet istemcisi: OpenRouter (varsayılan) ya da local Ollama (/v1). Ek bağımlılık yok.
//
// OpenRouter'da `model: 'openrouter/auto'` + `auto-router` eklentisi: istemi sınıflandırıp görev
// tipine göre modeli seçer, router ücreti yok, seçilen modelin normal fiyatı ödenir. `allowed_models`
// havuzu ucuz + JSON-şema destekli modellerle sınırlar, `cost_tier: 'low'` ucuz banda iter,
// `max_price` her durumda tavan. Yanıttaki `model` alanı hangi modelin cevapladığını söyler.
//
// Tasarım notu: completeJson() ASLA throw etmez — AI ikincil katman; erişilemezse kural katmanı
// tek başına karar verir.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1';
const OLLAMA_URL = 'http://localhost:11434/v1';

export const DEFAULT_ALLOWED_MODELS = [
  'deepseek/deepseek-v4-flash*',
  'deepseek/deepseek-v4.1-flash*',
  'anthropic/claude-haiku-5.5',
  'google/gemini-3.1-flash-lite*',
  'openai/gpt-5-nano',
  'qwen/qwen3.5-flash*',
  'mistralai/mistral-small*',
];

function stripFences(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

export function makeLlmClient({
  provider = 'openrouter', apiKey = '', baseUrl, model, allowedModels = DEFAULT_ALLOWED_MODELS,
  costTier = 'low', log, fetchFn = fetch, timeoutMs = 30_000,
}) {
  const isOpenRouter = provider === 'openrouter';
  const url = `${baseUrl || (isOpenRouter ? OPENROUTER_URL : OLLAMA_URL)}/chat/completions`;
  const resolvedModel = model || (isOpenRouter ? 'openrouter/auto' : 'qwen2.5:latest');
  const enabled = isOpenRouter ? Boolean(apiKey) : true;

  function buildBody({ system, user, schemaName, schema }) {
    const body = {
      model: resolvedModel,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0,
      response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
    };
    if (isOpenRouter) {
      if (resolvedModel === 'openrouter/auto') {
        body.plugins = [{ id: 'auto-router', cost_tier: costTier, allowed_models: allowedModels }];
      }
      body.provider = { require_parameters: true, data_collection: 'deny', max_price: { prompt: 1, completion: 4 } };
      body.usage = { include: true };
    }
    return body;
  }

  // validate(data) → true ise kabul. Dönüş: { ok, data?, model?, costUsd?, error? }
  async function completeJson({ system, user, schemaName, schema, validate = () => true }) {
    if (!enabled) return { ok: false, error: 'devre-dışı (OPENROUTER_API_KEY yok)' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      if (isOpenRouter) headers['X-Title'] = 'borsa-carry';
      const res = await fetchFn(url, {
        method: 'POST', headers, signal: controller.signal,
        body: JSON.stringify(buildBody({ system, user, schemaName, schema })),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error = `HTTP ${res.status}: ${json?.error?.message ?? 'bilinmeyen hata'}`;
        log?.warn(`LLM isteği başarısız — ${error}`);
        return { ok: false, error };
      }
      const content = json?.choices?.[0]?.message?.content ?? '';
      let data;
      try { data = JSON.parse(stripFences(content)); } catch {
        log?.warn(`LLM yanıtı JSON değil (${json.model ?? resolvedModel}): ${content.slice(0, 120)}`);
        return { ok: false, error: 'json-parse', model: json.model };
      }
      if (!validate(data)) return { ok: false, error: 'şema-dışı', model: json.model };
      return { ok: true, data, model: json.model ?? resolvedModel, costUsd: json?.usage?.cost ?? null };
    } catch (err) {
      const error = err.name === 'AbortError' ? `zaman aşımı (${timeoutMs}ms)` : err.message;
      log?.warn(`LLM bağlantı hatası: ${error}`);
      return { ok: false, error };
    } finally {
      clearTimeout(timer);
    }
  }

  return { completeJson, enabled, provider, model: resolvedModel };
}
