import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, CircularProgress, Divider, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { fetchStats, fetchBreakdown } from '@api/statsApi.js';
import { COLORS } from '@styles/theme.js';
import { wilsonInterval } from '@features/stats/utils/wilsonInterval.js';
import { avgRInterval } from '@features/stats/utils/avgRInterval.js';

const DAY_OPTIONS = [7, 14, 30];

// Mum kapanışı kirliliği bug'ı (bkz. cerebrum.md 2026-08-21) bu tarihten önce
// üretilen tüm göstergeleri (ADX/RSI/ATR) kirletiyordu. O tarihten önceki
// istatistikler artık var olmayan bir sistemi anlatıyor — güvenilmez.
const CLEAN_DATA_SINCE = new Date('2026-08-21T21:25:00');

function daysSinceCleanFix() {
  return Math.max(0, Math.floor((Date.now() - CLEAN_DATA_SINCE.getTime()) / 86_400_000));
}
const BREAKDOWN_OPTIONS = [
  { value: 'regime', label: 'Rejim' },
  { value: 'tf', label: 'TF' },
  { value: 'direction', label: 'Yön' },
  { value: 'hour', label: 'Saat' },
];

function StatBox({ label, value, color }) {
  return (
    <Box
      sx={{
        bgcolor: '#161b22',
        border: '1px solid #21262d',
        borderRadius: '12px',
        p: 2,
        minWidth: 100,
        flex: 1,
      }}
    >
      <Typography sx={{ color: '#8b949e', fontSize: '0.7rem', mb: 0.5 }}>{label}</Typography>
      <Typography sx={{ color: color ?? '#e6edf3', fontSize: '1.3rem', fontWeight: 700, fontFamily: 'monospace' }}>
        {value ?? '—'}
      </Typography>
    </Box>
  );
}

function pfColor(pf) {
  if (pf == null) return '#8b949e';
  if (pf >= 1.5) return COLORS.long;
  if (pf >= 1.0) return '#f0b429';
  return COLORS.short;
}

function wrColor(wr) {
  if (wr == null) return '#8b949e';
  if (wr >= 55) return COLORS.long;
  if (wr >= 45) return '#f0b429';
  return COLORS.short;
}

export default function StatsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [breakdownBy, setBreakdownBy] = useState('regime');
  const [breakdown, setBreakdown] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await fetchStats(days);
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 60_000); // 1 dk'da bir yenile
    return () => { cancelled = true; clearInterval(id); };
  }, [days]);

  useEffect(() => {
    let cancelled = false;
    async function loadBreakdown() {
      const result = await fetchBreakdown(breakdownBy, days);
      if (!cancelled) setBreakdown(result);
    }
    loadBreakdown();
    return () => { cancelled = true; };
  }, [breakdownBy, days]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress size={32} sx={{ color: '#58a6ff' }} />
      </Box>
    );
  }

  if (!data) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Typography sx={{ color: '#8b949e' }}>Veri alınamadı</Typography>
      </Box>
    );
  }

  const { stats: s, topSymbols } = data;
  const pf = s.profit_factor != null ? parseFloat(s.profit_factor) : null;
  const pfAfterFee = s.profit_factor_after_fee != null ? parseFloat(s.profit_factor_after_fee) : null;
  const wr = s.win_rate != null ? parseFloat(s.win_rate) : null;
  const wrInclTimeout = s.win_rate_incl_timeout != null ? parseFloat(s.win_rate_incl_timeout) : null;
  const resolvedN = s.resolved_n != null ? parseInt(s.resolved_n, 10) : 0;
  const wrCI = resolvedN > 0 && wr != null ? wilsonInterval(Math.round((wr / 100) * resolvedN), resolvedN) : null;
  const avgR = s.avg_r != null ? parseFloat(s.avg_r) : null;
  const avgRFee = s.avg_r_after_fee != null ? parseFloat(s.avg_r_after_fee) : null;
  const avgSimR = s.avg_sim_r != null ? parseFloat(s.avg_sim_r) : null;
  const timeoutRate = s.timeout_rate != null ? parseFloat(s.timeout_rate) : null;
  // Kârı belirleyen asıl metrik: gerçekçi giriş (kayma) + fee dahil ortalama R.
  // Win rate tanımlayıcıdır, karar metriği DEĞİLDİR.
  const simRCI = avgRInterval({
    avgR: avgSimR,
    tpHit: parseInt(s.tp_hit ?? 0, 10),
    slHit: parseInt(s.sl_hit ?? 0, 10),
    timeout: parseInt(s.timeout ?? 0, 10),
  });
  const longWr = s.total_long > 0 ? ((s.long_tp / (s.long_tp + s.long_sl)) * 100).toFixed(1) : null;
  const shortWr = s.total_short > 0 ? ((s.short_tp / (s.short_tp + s.short_sl)) * 100).toFixed(1) : null;

  return (
    <Box sx={{ p: 2, height: '100%', overflowY: 'auto', color: '#e6edf3' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>
          İstatistikler — Son {days} Gün
        </Typography>
        <ToggleButtonGroup
          size="small"
          value={days}
          exclusive
          onChange={(_e, val) => val != null && setDays(val)}
        >
          {DAY_OPTIONS.map((d) => (
            <ToggleButton key={d} value={d} sx={{ color: '#8b949e', fontSize: '0.75rem', px: 1.5 }}>
              {d}g
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {days > daysSinceCleanFix() && (
        <Typography sx={{ color: '#f0b429', fontSize: '0.72rem', mb: 1.5, bgcolor: '#2a1f00', border: '1px solid #6e4b00', borderRadius: '8px', px: 1.5, py: 1 }}>
          ⚠️ Bu pencere, mum kapanışı kirliliği düzeltmesinden ({CLEAN_DATA_SINCE.toLocaleDateString('tr-TR')}) önceki veriyi de içeriyor —
          o tarihten önce ADX/RSI/ATR sapıyordu, o dönemin win-rate'i güncel sistemi yansıtmaz.
          Sadece son {daysSinceCleanFix()} güne bakmak daha güvenilir.
        </Typography>
      )}

      {/* KARAR METRİĞİ — gerçekçi giriş + fee + çıkış kayması dahil işlem başına R.
          Win rate değil BU sayı kârlılığı belirler; alt sınır > 0 olmadan edge kanıtlanmış sayılmaz. */}
      {simRCI && (
        <Box sx={{
          mb: 2, px: 2, py: 1.5, borderRadius: '10px',
          bgcolor: simRCI.provenPositive ? '#0d2818' : '#1c1a08',
          border: `1px solid ${simRCI.provenPositive ? '#2ea043' : '#6e4b00'}`,
        }}>
          <Typography sx={{ fontSize: '0.72rem', color: '#8b949e', mb: 0.5 }}>
            İşlem başına gerçekçi kâr (giriş/çıkış kayması + fee dahil)
          </Typography>
          <Typography sx={{ fontWeight: 700, fontSize: '1.4rem', color: avgSimR > 0 ? COLORS.long : COLORS.short }}>
            {avgSimR > 0 ? '+' : ''}{avgSimR?.toFixed(4)} R
            <Typography component="span" sx={{ fontSize: '0.8rem', color: '#8b949e', ml: 1 }}>
              (%95: {simRCI.low > 0 ? '+' : ''}{simRCI.low.toFixed(4)} → {simRCI.high > 0 ? '+' : ''}{simRCI.high.toFixed(4)})
            </Typography>
          </Typography>
          <Typography sx={{ fontSize: '0.72rem', color: simRCI.provenPositive ? '#3fb950' : '#f0b429', mt: 0.5 }}>
            {simRCI.provenPositive
              ? `✓ Edge istatistiksel olarak kanıtlandı (n=${simRCI.n}) — alt sınır sıfırın üstünde.`
              : `⚠ Edge HENÜZ kanıtlanmadı (n=${simRCI.n}) — güven aralığı sıfırı kapsıyor, yani bu kâr şansa da bağlı olabilir. Daha çok işlem gerekiyor.`}
          </Typography>
        </Box>
      )}

      {/* Ana metrikler */}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
        <StatBox label="Toplam" value={s.total} />
        <StatBox label="TP Hit" value={s.tp_hit} color={COLORS.long} />
        <StatBox label="SL Hit" value={s.sl_hit} color={COLORS.short} />
        <StatBox label="Bekleyen" value={s.pending} color="#58a6ff" />
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 0.5 }}>
        <StatBox
          label={`Win Rate (n=${resolvedN})`}
          value={wr != null ? `%${wr}` : '—'}
          color={wrColor(wr)}
        />
        <StatBox
          label="Win Rate (timeout dahil)"
          value={wrInclTimeout != null ? `%${wrInclTimeout}` : '—'}
          color={wrColor(wrInclTimeout)}
        />
        <StatBox label="Profit Factor" value={pf != null ? pf.toFixed(2) : '—'} color={pfColor(pf)} />
        <StatBox label="Profit Factor (fee dahil)" value={pfAfterFee != null ? pfAfterFee.toFixed(2) : '—'} color={pfColor(pfAfterFee)} />
        <StatBox label="Ort. Confluence" value={s.avg_confluence != null ? `%${s.avg_confluence}` : '—'} />
      </Box>
      {wrCI && (
        <Typography sx={{ color: '#8b949e', fontSize: '0.72rem', mb: 2 }}>
          %95 güven aralığı: %{wrCI.low.toFixed(1)} – %{wrCI.high.toFixed(1)}
          {resolvedN < 100 ? ' — örneklem küçük, aralık geniş, dikkatli yorumlayın' : ''}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
        <StatBox
          label="Avg R/işlem"
          value={avgR != null ? (avgR > 0 ? `+${avgR.toFixed(3)}R` : `${avgR.toFixed(3)}R`) : '—'}
          color={avgR != null ? (avgR >= 0 ? COLORS.long : COLORS.short) : undefined}
        />
        <StatBox
          label="Avg R (fee sonrası)"
          value={avgRFee != null ? (avgRFee > 0 ? `+${avgRFee.toFixed(3)}R` : `${avgRFee.toFixed(3)}R`) : '—'}
          color={avgRFee != null ? (avgRFee >= 0 ? COLORS.long : COLORS.short) : undefined}
        />
        <StatBox
          label="Avg Sim R (paper)"
          value={avgSimR != null ? (avgSimR > 0 ? `+${avgSimR.toFixed(3)}R` : `${avgSimR.toFixed(3)}R`) : '—'}
          color={avgSimR != null ? (avgSimR >= 0 ? COLORS.long : COLORS.short) : undefined}
        />
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
        <StatBox label="Ort. TP süresi" value={s.avg_min_to_tp != null ? `${s.avg_min_to_tp} dk` : '—'} />
        <StatBox label="Ort. SL süresi" value={s.avg_min_to_sl != null ? `${s.avg_min_to_sl} dk` : '—'} />
        <StatBox
          label="Timeout %"
          value={timeoutRate != null ? `%${timeoutRate}` : '—'}
          color={timeoutRate != null && timeoutRate > 20 ? COLORS.short : undefined}
        />
        <StatBox label="Tie-break" value={s.tie_breaks ?? 0} />
      </Box>

      <Divider sx={{ borderColor: '#21262d', my: 2 }} />

      {/* Yön bazlı */}
      <Typography sx={{ color: '#8b949e', fontSize: '0.8rem', mb: 1 }}>Yön Analizi</Typography>
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <Box sx={{ bgcolor: '#161b22', border: '1px solid #21262d', borderRadius: '12px', p: 2, flex: 1, minWidth: 120 }}>
          <Typography sx={{ color: COLORS.long, fontSize: '0.75rem', mb: 0.5 }}>🟢 LONG</Typography>
          <Typography sx={{ fontSize: '1.1rem', fontWeight: 700 }}>{s.total_long} sinyal</Typography>
          <Typography sx={{ fontSize: '0.8rem', color: wrColor(parseFloat(longWr)) }}>
            {longWr != null ? `%${longWr} kazanma` : 'veri yok'}
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#8b949e' }}>
            {s.long_tp}✓ {s.long_sl}✗
          </Typography>
        </Box>
        <Box sx={{ bgcolor: '#161b22', border: '1px solid #21262d', borderRadius: '12px', p: 2, flex: 1, minWidth: 120 }}>
          <Typography sx={{ color: COLORS.short, fontSize: '0.75rem', mb: 0.5 }}>🔴 SHORT</Typography>
          <Typography sx={{ fontSize: '1.1rem', fontWeight: 700 }}>{s.total_short} sinyal</Typography>
          <Typography sx={{ fontSize: '0.8rem', color: wrColor(parseFloat(shortWr)) }}>
            {shortWr != null ? `%${shortWr} kazanma` : 'veri yok'}
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#8b949e' }}>
            {s.short_tp}✓ {s.short_sl}✗
          </Typography>
        </Box>
      </Box>

      {/* TF bazlı */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <StatBox label="1m Sinyal" value={s.tf_1m} />
        <StatBox label="5m Sinyal" value={s.tf_5m} />
      </Box>

      {/* Coin bazlı */}
      {topSymbols && topSymbols.length > 0 && (
        <>
          <Divider sx={{ borderColor: '#21262d', my: 2 }} />
          <Typography sx={{ color: '#8b949e', fontSize: '0.8rem', mb: 0.5 }}>
            En İyi Coinler (min. 3 sonuç)
          </Typography>
          {/* Bu liste kendi verisi üzerinde sıralanıp seçiliyor (win_rate DESC, min n=3).
              n=3'te %100 görmek istatistiksel bir bulgu değil, seçim yanlılığının
              kaçınılmaz sonucu. Az örneklemli satırlar soluk gösteriliyor. */}
          <Typography sx={{ color: '#6e7681', fontSize: '0.68rem', mb: 1, fontStyle: 'italic' }}>
            ⚠ Bu sıralama kendi verisiyle seçildiği için yanlıdır — n&lt;20 olan satırlar
            (soluk gösterilenler) şansa bağlıdır, coin seçimi için kullanmayın.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {topSymbols.map((sym) => {
              const symWr = parseFloat(sym.win_rate);
              const symN = parseInt(sym.total ?? 0, 10);
              const noisy = symN < 20;
              return (
                <Box
                  key={sym.symbol}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    bgcolor: '#161b22',
                    border: '1px solid #21262d',
                    borderRadius: '8px',
                    px: 1.5,
                    py: 0.75,
                    opacity: noisy ? 0.45 : 1,
                  }}
                >
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>{sym.symbol}</Typography>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    <Typography sx={{ color: '#8b949e', fontSize: '0.75rem' }}>
                      {sym.tp_hit}✓ {sym.sl_hit}✗ {noisy && <span style={{ color: '#6e7681' }}>(n={symN})</span>}
                    </Typography>
                    <Typography sx={{ color: noisy ? '#6e7681' : wrColor(symWr), fontSize: '0.85rem', fontWeight: 700 }}>
                      %{symWr}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </>
      )}

      {/* Kırılım */}
      <Divider sx={{ borderColor: '#21262d', my: 2 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Typography sx={{ color: '#8b949e', fontSize: '0.8rem' }}>Kırılım</Typography>
        <ToggleButtonGroup
          size="small"
          value={breakdownBy}
          exclusive
          onChange={(_e, val) => val != null && setBreakdownBy(val)}
        >
          {BREAKDOWN_OPTIONS.map((opt) => (
            <ToggleButton key={opt.value} value={opt.value} sx={{ color: '#8b949e', fontSize: '0.7rem', px: 1.25 }}>
              {opt.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
      {breakdown?.breakdown?.length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {breakdown.breakdown.map((row) => {
            const rowWr = row.win_rate != null ? parseFloat(row.win_rate) : null;
            return (
              <Box
                key={row.bucket}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  bgcolor: '#161b22',
                  border: '1px solid #21262d',
                  borderRadius: '8px',
                  px: 1.5,
                  py: 0.75,
                }}
              >
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>{String(row.bucket)}</Typography>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                  <Typography sx={{ color: '#8b949e', fontSize: '0.75rem' }}>
                    {row.total} sinyal · {row.tp_hit}✓ {row.sl_hit}✗
                  </Typography>
                  <Typography sx={{ color: wrColor(rowWr), fontSize: '0.85rem', fontWeight: 700 }}>
                    {rowWr != null ? `%${rowWr}` : '—'}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      ) : (
        <Typography sx={{ color: '#8b949e', fontSize: '0.8rem' }}>Kırılım verisi yok</Typography>
      )}
    </Box>
  );
}
