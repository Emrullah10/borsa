import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App.jsx';
import { fetchCarrySummary, fetchCarryOpportunities, fetchCarryRiskEvents } from './api/carryApi.js';

vi.mock('./api/carryApi.js', () => ({
  fetchCarrySummary: vi.fn(),
  fetchCarryOpportunities: vi.fn(),
  fetchCarryRiskEvents: vi.fn(),
}));

const RULES = { lookbackDays: 14, slots: 5, entryApr: 0.15, exitApr: 0.05 };
const summary = (over = {}) => ({
  mode: 'paper', capitalUsd: 1000, equityUsd: 1000, realizedUsd: 0, unrealizedUsd: 0, fundingTotalUsd: 0,
  open: [], closed: [], rules: RULES, ...over,
});

beforeEach(() => {
  fetchCarrySummary.mockResolvedValue(summary());
  fetchCarryOpportunities.mockResolvedValue([]);
  fetchCarryRiskEvents.mockResolvedValue([]);
});

describe('App', () => {
  it('Funding Taşıma sayfası: kâğıt modu ve boş defter mesajı görünür', async () => {
    render(<App />);
    expect(await screen.findByText('Funding Taşıma')).toBeInTheDocument();
    expect(screen.getByText(/KÂĞIT ÜSTÜ/)).toBeInTheDocument();
    expect(screen.getByText(/eşiği geçen coin yok/)).toBeInTheDocument();
  });

  it('açık pozisyon ve eşiği geçen fırsat tabloda görünür', async () => {
    fetchCarrySummary.mockResolvedValue(summary({
      equityUsd: 1003.5, fundingTotalUsd: 4.2,
      open: [{ symbol: 'JCTUSDT', qty: 4511, notionalUsd: 180, daysOpen: 3.2, entryApr: 0.182,
        pnl: { fundingUsd: 4.2, netUsd: 3.5 } }],
    }));
    fetchCarryOpportunities.mockResolvedValue([
      { symbol: 'JCTUSDT', apr: 0.182, currentRate: 0.0001, intervalHours: 8, spotVolume: 2.5e6 },
      { symbol: 'BTCUSDT', apr: 0.071, currentRate: 0.00005, intervalHours: 8, spotVolume: 900e6 },
    ]);
    render(<App />);
    expect(await screen.findByText('4511 JCT spot al + short')).toBeInTheDocument();
    expect(screen.getByText('elde')).toBeInTheDocument();
    expect(screen.getByText('eşik altı')).toBeInTheDocument();
    expect(screen.getByText('1/5')).toBeInTheDocument();
  });

  it('servise ulaşılamazsa hata mesajı gösterir', async () => {
    fetchCarrySummary.mockResolvedValue(null);
    render(<App />);
    expect(await screen.findByText(/Taşıma servisine ulaşılamıyor/)).toBeInTheDocument();
  });
});
