import ReactECharts from 'echarts-for-react';
import { Box } from '@mui/material';
import { COLORS } from '@styles/theme.js';

export function buildSignalChartOption(candles, signal) {
  const times = candles.map((c) =>
    new Date(c.ts ?? c.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  );
  const ohlc = candles.map((c) => [c.open, c.close, c.low, c.high]);
  const vol = candles.map((c) => c.volume);
  const { entryPrice, stopPrice, targetPrice } = signal ?? {};

  return {
    backgroundColor: 'transparent',
    grid: [
      { left: 60, right: 16, top: 16, height: '62%' },
      { left: 60, right: 16, top: '80%', height: '14%' },
    ],
    xAxis: [
      { type: 'category', data: times, gridIndex: 0, axisLabel: { color: '#8b949e', fontSize: 10 } },
      { type: 'category', data: times, gridIndex: 1, axisLabel: { show: false } },
    ],
    yAxis: [
      { scale: true, gridIndex: 0, axisLabel: { color: '#8b949e', fontSize: 10 }, splitLine: { lineStyle: { color: '#21262d' } } },
      { gridIndex: 1, axisLabel: { show: false }, splitLine: { show: false } },
    ],
    series: [
      {
        type: 'candlestick',
        data: ohlc,
        xAxisIndex: 0,
        yAxisIndex: 0,
        itemStyle: {
          color: COLORS.long, color0: COLORS.short,
          borderColor: COLORS.long, borderColor0: COLORS.short,
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { position: 'insideEndTop', fontSize: 10 },
          lineStyle: { type: 'dashed', width: 1 },
          data: [
            { yAxis: entryPrice, lineStyle: { color: '#c9d1d9' }, label: { formatter: `Giriş ${entryPrice}` } },
            { yAxis: stopPrice, lineStyle: { color: COLORS.short }, label: { formatter: `Stop ${stopPrice}`, color: COLORS.short } },
            { yAxis: targetPrice, lineStyle: { color: COLORS.long }, label: { formatter: `Hedef ${targetPrice}`, color: COLORS.long } },
          ],
        },
      },
      { type: 'bar', data: vol, xAxisIndex: 1, yAxisIndex: 1, itemStyle: { color: '#444c56' } },
    ],
  };
}

export default function SignalChart({ candles, signal }) {
  if (!candles?.length) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>
        Grafik yükleniyor...
      </Box>
    );
  }
  return (
    <Box sx={{ height: '100%', minHeight: 280 }}>
      <ReactECharts option={buildSignalChartOption(candles, signal)} style={{ height: '100%' }} />
    </Box>
  );
}
