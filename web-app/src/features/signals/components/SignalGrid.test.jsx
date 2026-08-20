import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import SignalGrid from './SignalGrid.jsx';

vi.mock('@api/signalApi.js', () => ({
  fetchSignals: vi.fn().mockResolvedValue([]),
  connectSignalWS: vi.fn().mockReturnValue({ close: vi.fn() }),
}));

vi.mock('./SignalCard.jsx', () => ({
  default: ({ signal, onFlipChange }) => (
    <div data-testid="signal-card">
      {signal.symbol}
      <button onClick={() => onFlipChange?.(true)}>flip-{signal.symbol}</button>
      <button onClick={() => onFlipChange?.(false)}>unflip-{signal.symbol}</button>
    </div>
  ),
}));

const mkSignal = (over) => ({
  symbol: 'BTCUSDT',
  direction: 'long',
  confluenceScore: 0.8,
  rrRatio: 1.5,
  createdAt: new Date().toISOString(),
  ...over,
});

// Reset store between tests
import { useStore } from '@store/useStore.js';
import { fetchSignals, connectSignalWS } from '@api/signalApi.js';

beforeEach(() => {
  useStore.setState({ signals: [] });
  vi.clearAllMocks();
  fetchSignals.mockResolvedValue([]);
  connectSignalWS.mockReturnValue({ close: vi.fn() });
});

describe('SignalGrid', () => {
  it('fetchSignals çağrılır (mount sonrası)', async () => {
    render(<SignalGrid />);
    await waitFor(() => expect(fetchSignals).toHaveBeenCalledWith(50));
  });

  it('taze sinyal varsa kart render edilir', async () => {
    const fresh = [
      { id: '1', symbol: 'BTCUSDT', createdAt: new Date().toISOString() },
      { id: '2', symbol: 'ETHUSDT', createdAt: new Date().toISOString() },
    ];
    fetchSignals.mockResolvedValue(fresh);

    render(<SignalGrid />);

    await waitFor(() => {
      const cards = screen.getAllByTestId('signal-card');
      expect(cards).toHaveLength(2);
      expect(cards[0]).toHaveTextContent('BTCUSDT');
      expect(cards[1]).toHaveTextContent('ETHUSDT');
    });
  });

  it('90 dakikadan eski sinyal render EDİLMEZ', async () => {
    const oldSignal = {
      id: '99',
      symbol: 'OLDUSDT',
      createdAt: new Date(Date.now() - 100 * 60 * 1000).toISOString(),
    };
    const freshSignal = {
      id: '1',
      symbol: 'BTCUSDT',
      createdAt: new Date().toISOString(),
    };
    fetchSignals.mockResolvedValue([oldSignal, freshSignal]);

    render(<SignalGrid />);

    await waitFor(() => {
      const cards = screen.getAllByTestId('signal-card');
      expect(cards).toHaveLength(1);
      expect(cards[0]).toHaveTextContent('BTCUSDT');
    });
    expect(screen.queryByText('OLDUSDT')).toBeNull();
  });

  it('boş durum mesajı gösterilir (sinyal yokken)', async () => {
    fetchSignals.mockResolvedValue([]);
    render(<SignalGrid />);

    await waitFor(() => {
      expect(
        screen.getByText(/Henüz taze sinyal yok/),
      ).toBeInTheDocument();
    });
  });

  it('güvene göre sıralı render edilir (varsayılan)', async () => {
    fetchSignals.mockResolvedValue([
      mkSignal({ id: 'a', symbol: 'LOWUSDT', confluenceScore: 0.6 }),
      mkSignal({ id: 'b', symbol: 'HIGHUSDT', confluenceScore: 0.9 }),
    ]);
    render(<SignalGrid />);

    await waitFor(() => {
      const cards = screen.getAllByTestId('signal-card');
      expect(cards[0]).toHaveTextContent('HIGHUSDT');
      expect(cards[1]).toHaveTextContent('LOWUSDT');
    });
  });

  it('yön filtresi (short) sadece short sinyalleri gösterir', async () => {
    fetchSignals.mockResolvedValue([
      mkSignal({ id: 'a', symbol: 'LONGUSDT', direction: 'long' }),
      mkSignal({ id: 'b', symbol: 'SHORTUSDT', direction: 'short' }),
    ]);
    render(<SignalGrid />);
    await waitFor(() => expect(screen.getAllByTestId('signal-card')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: /Short/ }));

    await waitFor(() => {
      const cards = screen.getAllByTestId('signal-card');
      expect(cards).toHaveLength(1);
      expect(cards[0]).toHaveTextContent('SHORTUSDT');
    });
  });

  it('bir kart çevriliyken yeni sinyal gelse bile mevcut kartların sırası değişmez', async () => {
    fetchSignals.mockResolvedValue([
      mkSignal({ id: 'a', symbol: 'LOWUSDT', confluenceScore: 0.6 }),
      mkSignal({ id: 'b', symbol: 'HIGHUSDT', confluenceScore: 0.9 }),
    ]);
    render(<SignalGrid />);

    await waitFor(() => {
      const cards = screen.getAllByTestId('signal-card');
      expect(cards[0]).toHaveTextContent('HIGHUSDT');
      expect(cards[1]).toHaveTextContent('LOWUSDT');
    });

    // LOWUSDT kartını çevir
    fireEvent.click(screen.getByRole('button', { name: 'flip-LOWUSDT' }));

    // Daha yüksek skorlu yeni bir sinyal gelsin — normalde sıralamayı değiştirirdi
    useStore.setState((state) => ({
      signals: [
        mkSignal({ id: 'c', symbol: 'NEWUSDT', confluenceScore: 0.99 }),
        ...state.signals,
      ],
    }));

    await waitFor(() => {
      const cards = screen.getAllByTestId('signal-card');
      expect(cards).toHaveLength(3);
      // Mevcut iki kartın göreli sırası (HIGH önce LOW) korunmalı;
      // yeni kart sona eklenir, aralarına girmemeli.
      expect(cards[0]).toHaveTextContent('HIGHUSDT');
      expect(cards[1]).toHaveTextContent('LOWUSDT');
      expect(cards[2]).toHaveTextContent('NEWUSDT');
    });

    // Kartı geri çevirince normal sıralama devam eder
    fireEvent.click(screen.getByRole('button', { name: 'unflip-LOWUSDT' }));
    await waitFor(() => {
      const cards = screen.getAllByTestId('signal-card');
      expect(cards[0]).toHaveTextContent('NEWUSDT');
    });
  });

  it('sembol aramasıyla filtrelenir', async () => {
    fetchSignals.mockResolvedValue([
      mkSignal({ id: 'a', symbol: 'BTCUSDT' }),
      mkSignal({ id: 'b', symbol: 'ETHUSDT' }),
    ]);
    render(<SignalGrid />);
    await waitFor(() => expect(screen.getAllByTestId('signal-card')).toHaveLength(2));

    fireEvent.change(screen.getByPlaceholderText('Sembol ara...'), {
      target: { value: 'eth' },
    });

    await waitFor(() => {
      const cards = screen.getAllByTestId('signal-card');
      expect(cards).toHaveLength(1);
      expect(cards[0]).toHaveTextContent('ETHUSDT');
    });
  });
});
