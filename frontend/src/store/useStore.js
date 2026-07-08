import { create } from 'zustand';

export const useStore = create((set) => ({
  signals: [],
  selectedSignal: null,
  prices: { BTCUSDT: null, ETHUSDT: null },
  services: { signalEngine: false, marketData: false },
  drawerOpen: false,
  regime: null, // 'bull' | 'bear' | 'neutral' | null
  activePage: 'signals', // 'signals' | 'stats'
  missedIds: new Set(), // "giriş kaçtı" olan sinyal id'leri

  setSignals: (signals) => set({ signals }),
  prependSignal: (signal) =>
    set((s) => ({ signals: [signal, ...s.signals].slice(0, 20) })),
  selectSignal: (signal) => set({ selectedSignal: signal }),
  setPrice: (symbol, price) =>
    set((s) => ({ prices: { ...s.prices, [symbol]: price } })),
  setServices: (services) => set({ services }),
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  setRegime: (regime) => set({ regime }),
  setActivePage: (activePage) => set({ activePage, drawerOpen: false }),
  markMissed: (id) =>
    set((s) => {
      if (s.missedIds.has(id)) return s;
      const next = new Set(s.missedIds);
      next.add(id);
      return { missedIds: next };
    }),
}));
