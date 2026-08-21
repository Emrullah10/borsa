import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App.jsx';
import { useStore } from './store/useStore.js';

vi.mock('./api/marketApi.js', () => ({ fetchPrice: vi.fn().mockResolvedValue(null), fetchCandles: vi.fn().mockResolvedValue([]) }));
vi.mock('./api/signalApi.js', () => ({ fetchSignals: vi.fn().mockResolvedValue([]), connectSignalWS: vi.fn(() => ({ close: vi.fn() })) }));
vi.mock('./api/serviceApi.js', () => ({ checkServices: vi.fn().mockResolvedValue({ signalEngine: false, marketData: false }) }));

beforeEach(() => useStore.setState({ signals: [], selectedSignal: null, prices: { BTCUSDT: null, ETHUSDT: null }, services: { signalEngine: false, marketData: false }, drawerOpen: false, toggleDrawer: () => {} }));

describe('App', () => {
  it('TopBar ve AppDrawer ve SignalGrid render eder', () => {
    render(<App />);
    expect(screen.getByText(/Scalp Asistanı/)).toBeInTheDocument();
    // SignalGrid renders "Henüz sinyal yok" when no signals
    expect(screen.getByText(/Henüz sinyal yok/)).toBeInTheDocument();
  });
});
