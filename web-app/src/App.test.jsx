import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App.jsx';
import { useStore } from './store/useStore.js';

vi.mock('./api/marketApi.js', () => ({ fetchPrice: vi.fn().mockResolvedValue(null), fetchCandles: vi.fn().mockResolvedValue([]) }));
vi.mock('./api/signalApi.js', () => ({ fetchSignals: vi.fn().mockResolvedValue([]), connectSignalWS: vi.fn(() => ({ close: vi.fn() })) }));
vi.mock('./api/serviceApi.js', () => ({ checkServices: vi.fn().mockResolvedValue({ signalEngine: false, marketData: false }) }));
vi.mock('./api/carryApi.js', () => ({
  fetchCarrySummary: vi.fn().mockResolvedValue({ mode: 'paper', capitalUsd: 1000, equityUsd: 1000, realizedUsd: 0, unrealizedUsd: 0, fundingTotalUsd: 0, open: [], closed: [], rules: { lookbackDays: 14, slots: 5, entryApr: 0.15, exitApr: 0.05 } }),
  fetchCarryOpportunities: vi.fn().mockResolvedValue([]),
  fetchCarryRiskEvents: vi.fn().mockResolvedValue([]),
}));

beforeEach(() => useStore.setState({ signals: [], selectedSignal: null, prices: { BTCUSDT: null, ETHUSDT: null }, services: { signalEngine: false, marketData: false }, drawerOpen: false, toggleDrawer: () => {}, activePage: 'signals' }));

describe('App', () => {
  it('TopBar ve AppDrawer ve SignalGrid render eder', () => {
    render(<App />);
    expect(screen.getByText(/Scalp Asistanı/)).toBeInTheDocument();
    // SignalGrid renders "Henüz sinyal yok" when no signals
    expect(screen.getByText(/Henüz sinyal yok/)).toBeInTheDocument();
  });

  it('varsayılan sayfa Funding Taşıma: kâğıt modu ve boş defter mesajı görünür', async () => {
    useStore.setState({ activePage: 'carry' });
    render(<App />);
    expect(await screen.findByText('Funding Taşıma')).toBeInTheDocument();
    expect(screen.getByText(/KÂĞIT ÜSTÜ/)).toBeInTheDocument();
    expect(screen.getByText(/eşiği geçen coin yok/)).toBeInTheDocument();
  });
});
