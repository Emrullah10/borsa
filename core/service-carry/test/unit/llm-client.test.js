import { describe, it, expect, vi } from 'vitest';
import { makeLlmClient, DEFAULT_ALLOWED_MODELS } from '../../src/infrastructure/llm-client.js';

const log = { warn: vi.fn() };
const okResponse = (content, extra = {}) => vi.fn().mockResolvedValue({
  ok: true, status: 200, json: async () => ({ model: 'deepseek/deepseek-v4-flash', choices: [{ message: { content } }], usage: { cost: 0.00012 }, ...extra }),
});
const args = { system: 's', user: 'u', schemaName: 'x', schema: { type: 'object' } };

describe('llm-client', () => {
  it('OpenRouter: auto router + ucuz model havuzu + fiyat tavanı + veri toplamayan sağlayıcı', async () => {
    const fetchFn = okResponse('{"a":1}');
    const llm = makeLlmClient({ apiKey: 'k', log, fetchFn });
    await llm.completeJson(args);
    const [url, init] = fetchFn.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer k');
    expect(body.model).toBe('openrouter/auto');
    expect(body.plugins).toEqual([{ id: 'auto-router', cost_tier: 'low', allowed_models: DEFAULT_ALLOWED_MODELS }]);
    expect(body.provider).toMatchObject({ require_parameters: true, data_collection: 'deny', max_price: { prompt: 1, completion: 4 } });
    expect(body.response_format.type).toBe('json_schema');
  });

  it('seçilen modeli ve maliyeti döndürür, ```json çitini temizler', async () => {
    const llm = makeLlmClient({ apiKey: 'k', log, fetchFn: okResponse('```json\n{"a":1}\n```') });
    const r = await llm.completeJson(args);
    expect(r).toEqual({ ok: true, data: { a: 1 }, model: 'deepseek/deepseek-v4-flash', costUsd: 0.00012 });
  });

  it('sabit model verilirse auto-router eklentisi gönderilmez', async () => {
    const fetchFn = okResponse('{}');
    await makeLlmClient({ apiKey: 'k', model: 'openai/gpt-5-nano', log, fetchFn }).completeJson(args);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).plugins).toBeUndefined();
  });

  it('Ollama: anahtarsız çalışır, OpenRouter alanları gönderilmez', async () => {
    const fetchFn = okResponse('{}');
    const llm = makeLlmClient({ provider: 'ollama', log, fetchFn });
    expect(llm.enabled).toBe(true);
    await llm.completeJson(args);
    const [url, init] = fetchFn.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(body.model).toBe('qwen2.5:latest');
    expect(body.plugins).toBeUndefined();
    expect(body.provider).toBeUndefined();
  });

  it('anahtar yoksa istek atmaz', async () => {
    const fetchFn = vi.fn();
    const r = await makeLlmClient({ apiKey: '', log, fetchFn }).completeJson(args);
    expect(r.ok).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('ağ hatasında, HTTP hatasında, bozuk JSON\'da ve şema dışı yanıtta ASLA throw etmez', async () => {
    const boom = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    expect((await makeLlmClient({ apiKey: 'k', log, fetchFn: boom }).completeJson(args)).ok).toBe(false);
    const http = vi.fn().mockResolvedValue({ ok: false, status: 402, json: async () => ({ error: { message: 'kredi yok' } }) });
    expect(await makeLlmClient({ apiKey: 'k', log, fetchFn: http }).completeJson(args)).toEqual({ ok: false, error: 'HTTP 402: kredi yok' });
    expect((await makeLlmClient({ apiKey: 'k', log, fetchFn: okResponse('merhaba') }).completeJson(args)).error).toBe('json-parse');
    const r = await makeLlmClient({ apiKey: 'k', log, fetchFn: okResponse('{"a":1}') }).completeJson({ ...args, validate: () => false });
    expect(r.error).toBe('şema-dışı');
  });
});
