import { describe, it, expect, vi } from 'vitest';
import { makeAiSentinel } from '../../src/infrastructure/ai-sentinel.js';

const watched = new Set(['NEXUSDT', 'WLDUSDT', 'SOLUSDT']);
const llmReturning = (res) => ({ completeJson: vi.fn().mockResolvedValue(res) });

describe('ai-sentinel', () => {
  it('izlenen coin geçmeyen duyuruda AI hiç çağrılmaz (maliyet 0)', async () => {
    const llm = llmReturning({ ok: true, data: { severity: 'exit', affected_symbols: [], summary_tr: '' } });
    const r = await makeAiSentinel({ llm }).assess({ annTitle: 'Streamer program' }, watched);
    expect(r.severity).toBe('none');
    expect(llm.completeJson).not.toHaveBeenCalled();
  });

  it('AI ciddiyeti yükseltebilir (watch → block) ve Türkçe özeti taşır', async () => {
    const llm = llmReturning({ ok: true, model: 'deepseek/x', data: { severity: 'block', affected_symbols: ['WLDUSDT'], summary_tr: 'WLD için token takası var.' } });
    const r = await makeAiSentinel({ llm }).assess({ annTitle: 'Notice about WLD network upgrade' }, watched);
    expect(r).toMatchObject({ severity: 'block', ruleSeverity: 'watch', aiSeverity: 'block', summary: 'WLD için token takası var.', model: 'deepseek/x' });
  });

  it('AI kuralın exit kararını DÜŞÜREMEZ', async () => {
    const llm = llmReturning({ ok: true, data: { severity: 'none', affected_symbols: [], summary_tr: 'önemsiz' } });
    const r = await makeAiSentinel({ llm }).assess({ annTitle: 'Bitget to delist NEXUSDT futures' }, watched);
    expect(r.severity).toBe('exit');
  });

  it('AI erişilemezse kural kararı tek başına geçerli', async () => {
    const llm = llmReturning({ ok: false, error: 'zaman aşımı' });
    const r = await makeAiSentinel({ llm }).assess({ annTitle: 'Bitget to delist NEXUSDT futures' }, watched);
    expect(r).toMatchObject({ severity: 'exit', aiSeverity: null, summary: null });
  });

  it('AI\'ın uydurduğu, izlenmeyen sembol kabul edilmez', async () => {
    const llm = llmReturning({ ok: true, data: { severity: 'exit', affected_symbols: ['NEXUSDT', 'FAKEUSDT', 'SOLUSDT'], summary_tr: 'x' } });
    const r = await makeAiSentinel({ llm }).assess({ annTitle: 'Bitget to delist NEXUSDT futures' }, watched);
    expect(r.symbols).toEqual(['NEXUSDT', 'SOLUSDT']);
  });
});
