import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RealFillForm from './RealFillForm.jsx';

const base = {
  outcomeId: 'oc-1',
  direction: 'long',
  simEntryPrice: 100,
  realEntryPrice: null,
  realExitPrice: null,
};

describe('RealFillForm', () => {
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('outcomeId yoksa form yerine bilgi mesajı gösterir', () => {
    render(<RealFillForm signal={{ ...base, outcomeId: null }} />);
    expect(screen.getByText(/Sonuç kaydı henüz oluşmadı/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Giriş fiyatı/i)).not.toBeInTheDocument();
  });

  it('form alanlarını gösterir', () => {
    render(<RealFillForm signal={base} />);
    expect(screen.getByPlaceholderText(/Giriş fiyatı/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Çıkış/i)).toBeInTheDocument();
  });

  it('her iki alan boşken Kaydet devre dışı', () => {
    render(<RealFillForm signal={base} />);
    expect(screen.getByRole('button', { name: /Kaydet/i })).toBeDisabled();
  });

  it('fiyat girilince kaydeder ve onay gösterir', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<RealFillForm signal={base} />);

    fireEvent.change(screen.getByPlaceholderText(/Giriş fiyatı/i), { target: { value: '100.5' } });
    fireEvent.click(screen.getByRole('button', { name: /Kaydet/i }));

    await waitFor(() => expect(screen.getByText(/Kaydedildi/i)).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it('kayıtlı dolum varsa kayma farkını gösterir', () => {
    render(<RealFillForm signal={{ ...base, realEntryPrice: 100.5 }} />);
    // long, sim=100 real=100.5 → %0.5 aleyhe
    expect(screen.getByText(/aleyhine kayma/i)).toBeInTheDocument();
  });

  it('hata durumunda mesaj gösterir', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'patladı' }) });
    render(<RealFillForm signal={base} />);

    fireEvent.change(screen.getByPlaceholderText(/Giriş fiyatı/i), { target: { value: '100.5' } });
    fireEvent.click(screen.getByRole('button', { name: /Kaydet/i }));

    await waitFor(() => expect(screen.getByText(/patladı/i)).toBeInTheDocument());
  });
});
