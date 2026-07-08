import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, Button, Chip, IconButton, CircularProgress } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AiComment from './AiComment.jsx';
import { COLORS } from '../theme.js';
import { analyzeSignal } from '../api/aiApi.js';
import { fetchPrice } from '../api/marketApi.js';
import { generateAiComment } from '../utils/aiComment.js';
import { getEntryValidity } from '../utils/entryValidity.js';
import { useStore } from '../store/useStore.js';

const FLIP_DURATION = 500; // ms

const cardStyles = `
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-20px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes glow {
  0%, 100% { box-shadow: 0 0 0 transparent; }
  40% { box-shadow: 0 0 16px rgba(38, 166, 154, 0.4); }
}
.signal-card-new {
  animation: slideDown 0.4s ease forwards, glow 0.8s ease forwards;
}
`;

function getFilledDots(score) {
  if (score >= 0.87) return 5;
  if (score >= 0.74) return 4;
  return 3;
}

function DotScore({ score }) {
  const filled = getFilledDots(score);
  return (
    <Box sx={{ display: 'flex', gap: 0.3 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Typography
          key={i}
          sx={{ fontSize: '10px', color: i <= filled ? COLORS.long : '#444c56', lineHeight: 1 }}
        >
          ●
        </Typography>
      ))}
    </Box>
  );
}

function pctDiff(from, to) {
  return (((to - from) / from) * 100).toFixed(2);
}

export default function SignalCard({ signal, isNew }) {
  const [flipped, setFlipped] = useState(false);
  const [aiText, setAiText] = useState(null);
  const [loading, setLoading] = useState(false);
  const [animated, setAnimated] = useState(isNew);
  const [refreshing, setRefreshing] = useState(false);
  const fetchedRef = useRef(false);

  // Fiyat merkezi poller'dan (SignalGrid) store'a yazılıyor — buradan oku
  const livePrice = useStore((s) => s.prices[signal.symbol] ?? null);
  const setPrice = useStore((s) => s.setPrice);
  const markMissed = useStore((s) => s.markMissed);

  // Uç fiyat: sinyal süresince long'da görülen en yüksek, short'ta en düşük
  // Fiyat uzaklaşıp geri dönse bile "giriş kaçtı" kararı kalıcı olsun
  const extremePriceRef = useRef(null);
  useEffect(() => {
    if (livePrice == null) return;
    extremePriceRef.current =
      signal.direction === 'long'
        ? Math.max(extremePriceRef.current ?? livePrice, livePrice)
        : Math.min(extremePriceRef.current ?? livePrice, livePrice);
  }, [livePrice, signal.direction]);

  const validity = getEntryValidity(signal, extremePriceRef.current);
  useEffect(() => {
    if (validity.state === 'missed') markMissed(signal.id);
  }, [validity.state, signal.id, markMissed]);

  // Manuel yenileme butonu
  const refreshPrice = useCallback(async () => {
    setRefreshing(true);
    const p = await fetchPrice(signal.symbol);
    if (p != null) setPrice(signal.symbol, p);
    setRefreshing(false);
  }, [signal.symbol, setPrice]);

  // Remove new animation after 800ms
  useEffect(() => {
    if (isNew) {
      const t = setTimeout(() => setAnimated(false), 800);
      return () => clearTimeout(t);
    }
  }, [isNew]);

  async function handleFlip() {
    setFlipped(true);
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      setLoading(true);
      try {
        const result = await analyzeSignal(signal);
        setAiText(result != null ? result : generateAiComment(signal));
      } catch {
        setAiText(generateAiComment(signal));
      } finally {
        setLoading(false);
      }
    }
  }

  const isLong = signal.direction === 'long';
  const stopPct = pctDiff(signal.entryPrice, signal.stopPrice);
  const targetPct = pctDiff(signal.entryPrice, signal.targetPrice);
  const snap = signal.indicatorsSnapshot;

  // Anlık fiyatın giriş fiyatına göre durumu (long'da artış = kârda, short'ta tersi)
  const liveDiff = livePrice != null ? Number(pctDiff(signal.entryPrice, livePrice)) : null;
  const inProfit = liveDiff != null && (isLong ? liveDiff >= 0 : liveDiff <= 0);
  const liveColor = liveDiff == null ? '#8b949e' : inProfit ? COLORS.long : COLORS.short;

  return (
    <>
      <style>{cardStyles}</style>
      <Box
        className={animated ? 'signal-card-new' : undefined}
        sx={{
          perspective: '1000px',
          width: '100%',
          opacity: validity.state === 'missed' ? 0.6 : 1,
          transition: 'opacity 0.3s',
        }}
      >
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            transformStyle: 'preserve-3d',
            transition: `transform ${FLIP_DURATION}ms`,
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* FRONT — relative so card height follows content */}
          <Box
            sx={{
              position: 'relative',
              width: '100%',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              background: COLORS.panel,
              border: '1px solid #21262d',
              borderRadius: '16px',
              p: 2,
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
            }}
          >
            {/* Header: symbol + direction badge */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontWeight: 700, color: '#e6edf3', fontSize: '1rem' }}>
                {signal.symbol}
              </Typography>
              <Chip
                label={isLong ? '🟢 LONG' : '🔴 SHORT'}
                size="small"
                sx={{
                  bgcolor: isLong ? COLORS.long : COLORS.short,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                }}
              />
            </Box>

            {/* Giriş geçersizlik uyarısı */}
            {validity.state === 'missed' && (
              <Box
                sx={{
                  bgcolor: '#2a1f00',
                  border: '1px solid #6e4b00',
                  borderRadius: '8px',
                  px: 1.25,
                  py: 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                }}
              >
                <Typography sx={{ fontSize: '0.8rem' }}>⚠️</Typography>
                <Box>
                  <Typography sx={{ color: '#f0b429', fontSize: '0.75rem', fontWeight: 700, lineHeight: 1.2 }}>
                    GİRİŞ KAÇTI
                  </Typography>
                  <Typography sx={{ color: '#8b7430', fontSize: '0.7rem', lineHeight: 1.2 }}>
                    {validity.reason === 'time' ? 'Süre doldu' : 'Fiyat uzaklaştı'}
                  </Typography>
                </Box>
              </Box>
            )}

            {/* Confluence */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ color: '#8b949e', fontSize: '0.75rem' }}>Güven:</Typography>
              <Typography sx={{ color: '#e6edf3', fontWeight: 600, fontSize: '0.85rem' }}>
                %{Math.round(signal.confluenceScore * 100)}
              </Typography>
              <DotScore score={signal.confluenceScore} />
            </Box>

            {/* Anlık fiyat */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                bgcolor: '#0d1117',
                border: '1px solid #21262d',
                borderRadius: '8px',
                px: 1.25,
                py: 0.5,
              }}
            >
              <Typography sx={{ color: '#8b949e', fontSize: '0.75rem' }}>Güncel</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography sx={{ color: liveColor, fontSize: '0.9rem', fontWeight: 700, fontFamily: 'monospace' }}>
                  {livePrice != null ? livePrice.toFixed(4) : '—'}
                </Typography>
                {liveDiff != null && (
                  <Typography sx={{ color: liveColor, fontSize: '0.75rem' }}>
                    ({liveDiff > 0 ? '+' : ''}{liveDiff}%)
                  </Typography>
                )}
                <IconButton
                  size="small"
                  onClick={refreshPrice}
                  disabled={refreshing}
                  sx={{ color: '#8b949e', p: 0.25, '&:hover': { color: '#58a6ff' } }}
                >
                  {refreshing
                    ? <CircularProgress size={12} sx={{ color: '#58a6ff' }} />
                    : <RefreshIcon sx={{ fontSize: '0.9rem' }} />}
                </IconButton>
              </Box>
            </Box>

            {/* Price levels */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ color: '#8b949e', fontSize: '0.8rem' }}>Giriş</Typography>
                <Typography sx={{ color: '#e6edf3', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                  {signal.entryPrice.toFixed(4)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ color: '#8b949e', fontSize: '0.8rem' }}>Stop</Typography>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Typography sx={{ color: '#e6edf3', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                    {signal.stopPrice.toFixed(4)}
                  </Typography>
                  <Typography sx={{ color: COLORS.short, fontSize: '0.75rem' }}>
                    ({stopPct}%)
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ color: '#8b949e', fontSize: '0.8rem' }}>Hedef</Typography>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Typography sx={{ color: '#e6edf3', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                    {signal.targetPrice.toFixed(4)}
                  </Typography>
                  <Typography sx={{ color: COLORS.long, fontSize: '0.75rem' }}>
                    (+{targetPct}%)
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ color: '#8b949e', fontSize: '0.8rem' }}>R/R</Typography>
                <Typography sx={{ color: '#e6edf3', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                  {signal.rrRatio.toFixed(1)}
                </Typography>
              </Box>
            </Box>

            {/* Flip button */}
            <Box sx={{ mt: 'auto' }}>
              <Button
                size="small"
                variant="outlined"
                onClick={handleFlip}
                sx={{
                  borderColor: '#30363d',
                  color: '#8b949e',
                  fontSize: '0.75rem',
                  '&:hover': { borderColor: '#58a6ff', color: '#58a6ff' },
                }}
              >
                Çevir ↻
              </Button>
            </Box>
          </Box>

          {/* BACK */}
          <Box
            sx={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              background: COLORS.panel,
              border: '1px solid #21262d',
              borderRadius: '16px',
              p: 2,
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
            }}
          >
            <Typography sx={{ fontWeight: 700, color: '#e6edf3', fontSize: '0.95rem', flexShrink: 0 }}>
              🤖 AI Yorumu
            </Typography>

            {/* Kaydırılabilir içerik alanı */}
            <Box sx={{ flex: 1, overflowY: 'auto', pr: 0.5, minHeight: 0,
              '&::-webkit-scrollbar': { width: '4px' },
              '&::-webkit-scrollbar-track': { background: 'transparent' },
              '&::-webkit-scrollbar-thumb': { background: '#30363d', borderRadius: '2px' },
            }}>
              {loading ? (
                <Typography sx={{ color: '#8b949e', fontStyle: 'italic', fontSize: '0.85rem' }}>
                  Analiz yapılıyor...
                </Typography>
              ) : (
                <AiComment text={aiText ?? ''} />
              )}

              {/* Indicator badges */}
              {snap && (
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
                  <Chip
                    label={`RSI ${snap.rsi != null ? snap.rsi.toFixed(0) : '—'}`}
                    size="small"
                    sx={{ bgcolor: '#21262d', color: '#c9d1d9', fontSize: '0.7rem' }}
                  />
                  <Chip
                    label={`MACD ${snap.macd?.histogram > 0 ? '+' : '-'}`}
                    size="small"
                    sx={{ bgcolor: '#21262d', color: '#c9d1d9', fontSize: '0.7rem' }}
                  />
                  <Chip
                    label={`EMA ${snap.ema9 > snap.ema21 ? '↑' : '↓'}`}
                    size="small"
                    sx={{ bgcolor: '#21262d', color: '#c9d1d9', fontSize: '0.7rem' }}
                  />
                  {snap.adx != null && (
                    <Chip
                      label={`ADX ${snap.adx.toFixed(0)} ${snap.adx >= 25 ? '🔥' : '〰'}`}
                      size="small"
                      sx={{
                        bgcolor: snap.adx >= 25 ? '#1a3a2a' : '#21262d',
                        color: snap.adx >= 25 ? COLORS.long : '#8b949e',
                        fontSize: '0.7rem',
                      }}
                    />
                  )}
                  {snap.volumeRatio != null && (
                    <Chip
                      label={`Hacim ${snap.volumeRatio.toFixed(1)}×`}
                      size="small"
                      sx={{
                        bgcolor: snap.volumeRatio >= 1.5 ? '#2a1a3a' : '#21262d',
                        color: snap.volumeRatio >= 1.5 ? '#b39ddb' : '#8b949e',
                        fontSize: '0.7rem',
                      }}
                    />
                  )}
                  {snap.supportLevel != null && signal.direction === 'long' && (
                    <Chip
                      label={`Destek ${snap.supportLevel.toFixed(2)}`}
                      size="small"
                      sx={{ bgcolor: '#1a2a1a', color: COLORS.long, fontSize: '0.7rem' }}
                    />
                  )}
                  {snap.resistanceLevel != null && signal.direction === 'short' && (
                    <Chip
                      label={`Direnç ${snap.resistanceLevel.toFixed(2)}`}
                      size="small"
                      sx={{ bgcolor: '#2a1a1a', color: COLORS.short, fontSize: '0.7rem' }}
                    />
                  )}
                </Box>
              )}
            </Box>

            {/* Back button — altta sabit */}
            <Box sx={{ flexShrink: 0 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setFlipped(false)}
                sx={{
                  borderColor: '#30363d',
                  color: '#8b949e',
                  fontSize: '0.75rem',
                  '&:hover': { borderColor: '#58a6ff', color: '#58a6ff' },
                }}
              >
                ← Geri
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>
    </>
  );
}
