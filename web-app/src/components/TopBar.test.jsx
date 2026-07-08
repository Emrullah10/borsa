import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TopBar from './TopBar.jsx';
import { useStore } from '../store/useStore.js';

vi.mock('../api/marketApi.js', () => ({ fetchPrice: vi.fn().mockResolvedValue(null) }));
vi.mock('../api/serviceApi.js', () => ({ checkServices: vi.fn().mockResolvedValue({ signalEngine: false, marketData: false }) }));
vi.mock('../api/regimeApi.js', () => ({ fetchRegime: vi.fn().mockResolvedValue(null) }));

beforeEach(() => {
  useStore.setState({ prices: { BTCUSDT: 78420, ETHUSDT: 3115 }, services: { signalEngine: true, marketData: false }, regime: null });
});

describe('TopBar', () => {
  it('BTC ve ETH fiyatlarını gösterir', () => {
    render(<TopBar />);
    expect(screen.getByText(/78420/)).toBeInTheDocument();
    expect(screen.getByText(/3115/)).toBeInTheDocument();
  });

  it('servis durumunu gösterir', () => {
    render(<TopBar />);
    expect(screen.getByText(/signal-engine/i)).toBeInTheDocument();
    expect(screen.getByText(/market-data/i)).toBeInTheDocument();
  });

  it('regime=bull iken Piyasa: YUKARI chip gösterir', () => {
    useStore.setState({ regime: 'bull' });
    render(<TopBar />);
    expect(screen.getByText(/YUKARI/i)).toBeInTheDocument();
  });

  it('regime=bear iken Piyasa: AŞAĞI chip gösterir', () => {
    useStore.setState({ regime: 'bear' });
    render(<TopBar />);
    expect(screen.getByText(/AŞAĞI/i)).toBeInTheDocument();
  });

  it('regime=null iken piyasa chip göstermez', () => {
    useStore.setState({ regime: null });
    render(<TopBar />);
    expect(screen.queryByText(/Piyasa/i)).not.toBeInTheDocument();
  });

  it('hamburger butonunu tıklanınca toggleDrawer çağrılır', async () => {
    const user = userEvent.setup();
    const toggleDrawerMock = vi.fn();
    useStore.setState({ toggleDrawer: toggleDrawerMock });

    render(<TopBar />);
    const hamburgerButton = screen.getByRole('button');
    await user.click(hamburgerButton);

    expect(toggleDrawerMock).toHaveBeenCalledTimes(1);
  });
});
