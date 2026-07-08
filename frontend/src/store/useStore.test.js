import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './useStore.js';

const reset = () => useStore.setState({
  signals: [], selectedSignal: null,
  prices: { BTCUSDT: null, ETHUSDT: null },
  services: { signalEngine: false, marketData: false },
  drawerOpen: false,
});

describe('useStore', () => {
  beforeEach(reset);

  it('setSignals: signals dizisini set eder', () => {
    useStore.getState().setSignals([{ id: 1 }, { id: 2 }]);
    expect(useStore.getState().signals).toHaveLength(2);
  });

  it('prependSignal: başa ekler, 20 sınırı aşmaz', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: i }));
    useStore.getState().setSignals(many);
    useStore.getState().prependSignal({ id: 99 });
    const s = useStore.getState().signals;
    expect(s[0].id).toBe(99);
    expect(s).toHaveLength(20);
  });

  it('selectSignal: selectedSignal günceller', () => {
    const sig = { id: 5, symbol: 'BTCUSDT' };
    useStore.getState().selectSignal(sig);
    expect(useStore.getState().selectedSignal).toEqual(sig);
  });

  it('setPrice: prices günceller', () => {
    useStore.getState().setPrice('BTCUSDT', 78420);
    expect(useStore.getState().prices.BTCUSDT).toBe(78420);
  });

  it('drawerOpen: başlangıçta false olmalı', () => {
    expect(useStore.getState().drawerOpen).toBe(false);
  });

  it('toggleDrawer: drawerOpen false→true', () => {
    useStore.getState().toggleDrawer();
    expect(useStore.getState().drawerOpen).toBe(true);
  });

  it('toggleDrawer: drawerOpen true→false', () => {
    useStore.getState().toggleDrawer();
    useStore.getState().toggleDrawer();
    expect(useStore.getState().drawerOpen).toBe(false);
  });
});
