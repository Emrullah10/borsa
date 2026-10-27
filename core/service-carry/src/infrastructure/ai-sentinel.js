import { matchAnnouncement, maxSeverity, SEVERITY_ORDER } from '../domain/announcement-rules.js';

// Risk bekçisi: kural katmanı + (varsa) AI ikinci görüş. AI yön/fiyat tahmini YAPMAZ; yalnız
// "bu duyuru elimdeki coin için ne anlama geliyor" sorusunu cevaplar ve sade Türkçe özet yazar.
// AI yalnız ciddiyeti YÜKSELTEBİLİR (kural 'exit' dediyse 'none'a indiremez).

const SYSTEM = `You are a risk officer for a delta-neutral crypto funding-carry book on Bitget
(each position = long spot + short USDT-M perpetual of the same coin, equal quantity).
Classify how an exchange announcement affects the listed coins. Severity:
- "exit": position must be closed soon (delisting of spot OR perp, trading termination, forced settlement).
- "block": do not open new positions (token swap/migration/rebrand, deposit/withdrawal suspension, trading halt).
- "watch": informational but relevant (funding interval/cap change, leverage or margin tier change).
- "none": irrelevant to these coins.
Only list coins from the provided list. Write "summary_tr" in plain Turkish, one sentence, max 160 chars.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['severity', 'affected_symbols', 'summary_tr'],
  properties: {
    severity: { type: 'string', enum: ['none', 'watch', 'block', 'exit'] },
    affected_symbols: { type: 'array', items: { type: 'string' } },
    summary_tr: { type: 'string' },
  },
};

const isValid = (d) => d && SEVERITY_ORDER.includes(d.severity)
  && Array.isArray(d.affected_symbols) && typeof d.summary_tr === 'string';

export function makeAiSentinel({ llm }) {
  // ann: Bitget duyuru objesi, watched: açık pozisyonlar + adaylar
  // Dönüş: { symbols, severity, ruleSeverity, aiSeverity, summary, model, costUsd }
  async function assess(ann, watched) {
    const rule = matchAnnouncement(ann, watched);
    if (!rule.symbols.length) return { ...rule, ruleSeverity: 'none', aiSeverity: null, summary: null };

    const ai = await llm.completeJson({
      system: SYSTEM,
      user: `Coins: ${rule.symbols.join(', ')}\nAnnouncement type: ${ann.annType}/${ann.annSubType}\nTitle: ${ann.annTitle}`,
      schemaName: 'carry_risk',
      schema: SCHEMA,
      validate: isValid,
    });

    let severity = rule.severity;
    let symbols = rule.symbols;
    if (ai.ok) {
      severity = maxSeverity(rule.severity, ai.data.severity);
      // AI'ın eklediği coin'ler yalnız izlenen listedeyse kabul (uydurma sembol yok).
      const extra = ai.data.affected_symbols.filter((s) => watched.has(s) && !symbols.includes(s));
      symbols = [...symbols, ...extra];
    }
    return {
      symbols,
      severity,
      ruleSeverity: rule.severity,
      aiSeverity: ai.ok ? ai.data.severity : null,
      summary: ai.ok ? ai.data.summary_tr : null,
      model: ai.model ?? null,
      costUsd: ai.costUsd ?? null,
    };
  }

  return { assess };
}
