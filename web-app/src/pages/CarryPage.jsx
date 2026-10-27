import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, CircularProgress, Chip, Link } from '@mui/material';
import {
  fetchCarrySummary, fetchCarryOpportunities, fetchCarryRiskEvents,
} from '@api/carryApi.js';
import { COLORS } from '@styles/theme.js';

const REFRESH_MS = 60_000;
const usd = (v) => (v == null ? '—' : `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`);
const pct = (v, d = 1) => (v == null ? '—' : `%${(v * 100).toFixed(d)}`);
const coin = (s) => s.replace(/USDT$/, '');
const qty = (q) => (q >= 100 ? q.toFixed(0) : q >= 1 ? q.toFixed(3) : q.toPrecision(4));
const money = (v) => (v >= 0 ? COLORS.long : COLORS.short);

const REASON_TR = {
  'funding-düştü': 'funding düştü',
  'sıralama-düştü': 'daha iyi fırsat',
  'evren-dışı': 'likidite kaybı',
  'risk-blok': 'borsa duyurusu',
};
const SEVERITY = {
  exit: { label: 'KAPAT', color: COLORS.short },
  block: { label: 'YENİ AÇMA', color: '#f0b429' },
  watch: { label: 'İZLE', color: '#8b949e' },
};

function StatBox({ label, value, color, hint }) {
  return (
    <Box sx={{ bgcolor: '#161b22', border: '1px solid #21262d', borderRadius: '12px', p: 2, minWidth: 140, flex: 1 }}>
      <Typography sx={{ color: '#8b949e', fontSize: '0.7rem', mb: 0.5 }}>{label}</Typography>
      <Typography sx={{ color: color ?? '#e6edf3', fontSize: '1.3rem', fontWeight: 700, fontFamily: 'monospace' }}>{value}</Typography>
      {hint && <Typography sx={{ color: '#8b949e', fontSize: '0.65rem', mt: 0.5 }}>{hint}</Typography>}
    </Box>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography sx={{ color: '#e6edf3', fontWeight: 700, fontSize: '0.95rem' }}>{title}</Typography>
      {subtitle && <Typography sx={{ color: '#8b949e', fontSize: '0.75rem', mb: 1 }}>{subtitle}</Typography>}
      {children}
    </Box>
  );
}

function Table({ head, rows, empty }) {
  if (!rows.length) return <Typography sx={{ color: '#8b949e', fontSize: '0.8rem', py: 1 }}>{empty}</Typography>;
  return (
    <Box sx={{ overflowX: 'auto', border: '1px solid #21262d', borderRadius: '8px' }}>
      <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: 'monospace' }}>
        <thead>
          <tr>{head.map((h) => <Box component="th" key={h} sx={{ textAlign: 'left', color: '#8b949e', fontWeight: 500, p: 1, borderBottom: '1px solid #21262d', whiteSpace: 'nowrap' }}>{h}</Box>)}</tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>{cells.map((c, j) => <Box component="td" key={j} sx={{ p: 1, color: '#c9d1d9', borderBottom: '1px solid #161b22', whiteSpace: 'nowrap' }}>{c}</Box>)}</tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

export default function CarryPage() {
  const [summary, setSummary] = useState(null);
  const [opps, setOpps] = useState([]);
  const [risks, setRisks] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [s, o, r] = await Promise.all([fetchCarrySummary(), fetchCarryOpportunities(), fetchCarryRiskEvents()]);
    setSummary(s);
    setOpps(o ?? []);
    setRisks(r ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress size={28} /></Box>;
  if (!summary) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography sx={{ color: COLORS.short }}>Taşıma servisine ulaşılamıyor (service-carry, port 3104).</Typography>
      </Box>
    );
  }

  const rules = summary.rules;
  const ret = summary.equityUsd / summary.capitalUsd - 1;

  return (
    <Box sx={{ height: '100%', overflowY: 'auto', p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography sx={{ color: '#e6edf3', fontWeight: 700, fontSize: '1.1rem' }}>Funding Taşıma</Typography>
        <Chip size="small" label={summary.mode === 'paper' ? 'KÂĞIT ÜSTÜ — gerçek para yok' : 'CANLI'}
          sx={{ bgcolor: summary.mode === 'paper' ? '#21262d' : COLORS.short, color: '#e6edf3', fontSize: '0.65rem' }} />
      </Box>
      <Typography sx={{ color: '#8b949e', fontSize: '0.78rem', mb: 2, maxWidth: 820 }}>
        Her pozisyon: aynı coinden <b>spot AL</b> + aynı adet <b>futures SHORT</b>. Fiyat düşse de çıksa da iki taraf
        birbirini götürür; kazanç, futures'ta long'cuların short'çulara ödediği <b>funding</b>'den gelir. Yön tahmini yok.
        Kural: son {rules.lookbackDays} gün yıllık {pct(rules.entryApr, 0)} üstü → aç, {pct(rules.exitApr, 0)} altı → kapat,
        en fazla {rules.slots} coin.
      </Typography>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 3 }}>
        <StatBox label="Özsermaye" value={usd(summary.equityUsd)} hint={`başlangıç ${usd(summary.capitalUsd)}`} />
        <StatBox label="Toplam getiri" value={pct(ret, 2)} color={money(ret)} />
        <StatBox label="Alınan funding" value={usd(summary.fundingTotalUsd)} color={money(summary.fundingTotalUsd)} />
        <StatBox label="Açık pozisyon" value={`${summary.open.length}/${rules.slots}`}
          hint={summary.open.length ? null : 'eşiği geçen coin yok → para nakitte bekliyor'} />
      </Box>

      <Section title="Açık pozisyonlar" subtitle="Net = funding + baz farkı − komisyonlar (şimdi kapatılsa).">
        <Table
          head={['Coin', 'Yapılan', 'Tutar', 'Gün', 'Giriş APR', 'Funding', 'Net']}
          empty="Açık pozisyon yok."
          rows={summary.open.map((p) => [
            coin(p.symbol),
            `${qty(p.qty)} ${coin(p.symbol)} spot al + short`,
            usd(p.notionalUsd),
            p.daysOpen.toFixed(1),
            pct(p.entryApr),
            <span key="f" style={{ color: money(p.pnl.fundingUsd) }}>{usd(p.pnl.fundingUsd)}</span>,
            <span key="n" style={{ color: money(p.pnl.netUsd) }}>{usd(p.pnl.netUsd)}</span>,
          ])}
        />
      </Section>

      <Section title="Fırsatlar (son karar)" subtitle={`Bitget'te spotu ve yeterli likiditesi olan coinler, son ${rules.lookbackDays} günün funding'ine göre.`}>
        <Table
          head={['Coin', `${rules.lookbackDays}g yıllık`, 'Şu anki oran', 'Spot hacim', 'Durum']}
          empty="Henüz karar verilmedi (günlük karar 00:00-08:00 UTC arasında)."
          rows={opps.map((o) => [
            coin(o.symbol),
            <span key="a" style={{ color: o.apr >= rules.entryApr ? COLORS.long : '#c9d1d9' }}>{pct(o.apr)}</span>,
            o.currentRate == null ? '—' : `${(o.currentRate * 100).toFixed(4)}% / ${o.intervalHours}s`,
            `$${(o.spotVolume / 1e6).toFixed(1)}M`,
            summary.open.some((p) => p.symbol === o.symbol) ? 'elde' : o.apr >= rules.entryApr ? 'eşiği geçiyor' : 'eşik altı',
          ])}
        />
      </Section>

      <Section title="Risk bekçisi" subtitle="Bitget duyuruları: delist → pozisyon kapanır, token takası/askı → yeni açılmaz.">
        <Table
          head={['Ne zaman', 'Coin', 'Karar', 'Özet']}
          empty="Evrendeki coinlerle ilgili duyuru yok."
          rows={risks.slice(0, 15).map((e) => [
            new Date(e.annTime).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }),
            e.symbols.map(coin).join(', '),
            <span key="s" style={{ color: SEVERITY[e.severity]?.color }}>{SEVERITY[e.severity]?.label ?? e.severity}</span>,
            <Link key="l" href={e.annUrl} target="_blank" rel="noreferrer" sx={{ color: '#58a6ff' }}>
              {(e.summary ?? e.annTitle).slice(0, 90)}
            </Link>,
          ])}
        />
      </Section>

      <Section title="Kapanan pozisyonlar">
        <Table
          head={['Coin', 'Gün', 'Neden', 'Funding', 'Baz', 'Komisyon', 'Net']}
          empty="Henüz kapanan pozisyon yok."
          rows={summary.closed.slice(0, 30).map((p) => [
            coin(p.symbol),
            p.daysOpen.toFixed(1),
            REASON_TR[p.closeReason] ?? p.closeReason,
            usd(p.pnl.fundingUsd),
            usd(p.pnl.basisUsd),
            usd(-p.pnl.feesUsd),
            <span key="n" style={{ color: money(p.pnl.netUsd) }}>{usd(p.pnl.netUsd)}</span>,
          ])}
        />
      </Section>
    </Box>
  );
}
