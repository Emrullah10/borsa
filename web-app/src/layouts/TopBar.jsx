import { useEffect } from 'react';
import { Box, Typography, Chip, IconButton } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { useStore } from '@store/useStore.js';
import { fetchPrice } from '@api/marketApi.js';
import { checkServices } from '@api/serviceApi.js';
import { fetchRegime } from '@api/regimeApi.js';
import { COLORS } from '@styles/theme.js';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT'];

const REGIME_CONFIG = {
  bull:    { label: '🟢 Piyasa: YUKARI', color: '#1a3a2a', textColor: '#4caf50' },
  bear:    { label: '🔴 Piyasa: AŞAĞI',  color: '#3a1a1a', textColor: '#f44336' },
  neutral: { label: '⚪ Piyasa: YATAY',  color: '#21262d', textColor: '#8b949e' },
};

export default function TopBar() {
  const prices = useStore((s) => s.prices);
  const services = useStore((s) => s.services);
  const regime = useStore((s) => s.regime);
  const setPrice = useStore((s) => s.setPrice);
  const setServices = useStore((s) => s.setServices);
  const setRegime = useStore((s) => s.setRegime);
  const toggleDrawer = useStore((s) => s.toggleDrawer);

  useEffect(() => {
    const poll = async () => {
      for (const sym of SYMBOLS) {
        const p = await fetchPrice(sym);
        if (p != null) setPrice(sym, p);
      }
    };
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [setPrice]);

  useEffect(() => {
    const poll = async () => setServices(await checkServices());
    poll();
    const t = setInterval(poll, 10000);
    return () => clearInterval(t);
  }, [setServices]);

  useEffect(() => {
    const poll = async () => {
      const data = await fetchRegime();
      if (data?.regime) setRegime(data.regime);
    };
    poll();
    const t = setInterval(poll, 10000);
    return () => clearInterval(t);
  }, [setRegime]);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, px: 2, py: 1, bgcolor: COLORS.panel, borderBottom: '1px solid #21262d', flexShrink: 0 }}>
      <IconButton onClick={toggleDrawer} sx={{ color: COLORS.text, mr: 1 }}>
        <MenuIcon />
      </IconButton>
      <Typography variant="h6" sx={{ color: COLORS.text, fontWeight: 700 }}>Scalp Asistanı</Typography>
      {SYMBOLS.map((sym) => (
        <Typography key={sym} sx={{ fontFamily: 'monospace' }}>
          {sym}: <strong style={{ color: COLORS.text }}>{prices[sym] ?? '—'}</strong>
        </Typography>
      ))}
      <Box sx={{ flexGrow: 1 }} />
      {regime && (() => {
        const cfg = REGIME_CONFIG[regime] ?? REGIME_CONFIG.neutral;
        return (
          <Chip
            size="small"
            label={cfg.label}
            sx={{ bgcolor: cfg.color, color: cfg.textColor, fontWeight: 700, fontSize: '0.75rem' }}
          />
        );
      })()}
      <Chip size="small" label="signal-engine" color={services.signalEngine ? 'success' : 'error'} />
      <Chip size="small" label="market-data" color={services.marketData ? 'success' : 'error'} />
    </Box>
  );
}
