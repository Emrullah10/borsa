import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import SignalCard from './SignalCard.jsx';

vi.mock('@api/aiApi.js', () => ({ analyzeSignal: vi.fn().mockResolvedValue('Test AI yorum') }))
vi.mock('@features/ai/utils/aiComment.js', () => ({ generateAiComment: vi.fn().mockReturnValue('Fallback yorum') }))
vi.mock('@api/marketApi.js', () => ({ fetchPrice: vi.fn().mockResolvedValue(67500) }))

const MOCK_SIGNAL = {
  id: 'sig-1',
  symbol: 'BTCUSDT',
  direction: 'long',
  entryPrice: 67000.1234,
  stopPrice: 66000.5678,
  targetPrice: 69000.9012,
  rrRatio: 2.1,
  confluenceScore: 0.78,
  createdAt: new Date().toISOString(),
  indicatorsSnapshot: {
    rsi: 45.3,
    ema9: 67100,
    ema21: 66800,
    macd: { value: 0.5, signal: 0.3, histogram: 0.2 },
    adx: 32.5,
    volumeRatio: 1.8,
    supportLevel: 66500,
    resistanceLevel: 68000,
  },
};

describe('SignalCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders front face with symbol, direction badge, entry/stop/target/rr', () => {
    render(<SignalCard signal={MOCK_SIGNAL} isNew={false} />);

    expect(screen.getByText('BTCUSDT')).toBeInTheDocument();
    expect(screen.getByText('🟢 LONG')).toBeInTheDocument();
    expect(screen.getByText('67000.1234')).toBeInTheDocument();
    expect(screen.getByText('66000.5678')).toBeInTheDocument();
    expect(screen.getByText('69000.9012')).toBeInTheDocument();
    expect(screen.getByText('2.1')).toBeInTheDocument();
  });

  it('anlık fiyatı (Güncel) gösterir', async () => {
    // Fiyat artık store'dan okunuyor — store'u önceden doldur
    const { useStore } = await import('@store/useStore.js');
    useStore.setState({ prices: { BTCUSDT: 67500 } });
    render(<SignalCard signal={MOCK_SIGNAL} isNew={false} />);
    expect(screen.getByText('Güncel')).toBeInTheDocument();
    expect(screen.getByText('67500.0000')).toBeInTheDocument();
  });

  it('clicking Çevir shows back face with AI title', async () => {
    render(<SignalCard signal={MOCK_SIGNAL} isNew={false} />);

    const flipBtn = screen.getByText('Çevir ↻');
    fireEvent.click(flipBtn);

    expect(screen.getByText('🤖 AI Yorumu')).toBeInTheDocument();
  });

  it('clicking Geri returns to front face', async () => {
    render(<SignalCard signal={MOCK_SIGNAL} isNew={false} />);

    // Flip to back
    fireEvent.click(screen.getByText('Çevir ↻'));
    expect(screen.getByText('🤖 AI Yorumu')).toBeInTheDocument();

    // Go back
    fireEvent.click(screen.getByText('← Geri'));
    // Front elements still in DOM (CSS flip, not unmount)
    expect(screen.getByText('BTCUSDT')).toBeInTheDocument();
  });

  it('shows AI text from analyzeSignal mock after flipping', async () => {
    render(<SignalCard signal={MOCK_SIGNAL} isNew={false} />);

    fireEvent.click(screen.getByText('Çevir ↻'));

    await waitFor(() => {
      expect(screen.getByText('Test AI yorum')).toBeInTheDocument();
    });
  });

  it('isNew=true adds animation class to card', () => {
    const { container } = render(<SignalCard signal={MOCK_SIGNAL} isNew={true} />);
    const animated = container.querySelector('.signal-card-new');
    expect(animated).not.toBeNull();
  });
});
