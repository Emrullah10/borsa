import { Box, Typography } from '@mui/material';
import { COLORS } from '../theme.js';

function Metric({ label, value, color }) {
  return (
    <Box sx={{ flex: 1, bgcolor: '#161b22', borderRadius: 1, p: 1, textAlign: 'center' }}>
      <Typography variant="caption" sx={{ color: '#8b949e', display: 'block', textTransform: 'uppercase' }}>{label}</Typography>
      <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: color ?? COLORS.text }}>{value}</Typography>
    </Box>
  );
}

export default function MetricRow({ entryPrice, stopPrice, targetPrice, rrRatio }) {
  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Metric label="Giriş" value={entryPrice} />
      <Metric label="Stop" value={stopPrice} color={COLORS.short} />
      <Metric label="Hedef" value={targetPrice} color={COLORS.long} />
      <Metric label="R:R" value={rrRatio} />
    </Box>
  );
}
