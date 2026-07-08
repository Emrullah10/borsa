import { useEffect, useState, useCallback, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { useStore } from '@store/useStore.js';
import { fetchSignals, connectSignalWS } from '@api/signalApi.js';
import { fetchPrice } from '@api/marketApi.js';
import SignalCard from './SignalCard.jsx';
import SignalFilters from './SignalFilters.jsx';

const FRESH_WINDOW_MS = 15 * 60 * 1000; // 15 dakika
const PRICE_POLL_MS = 2000; // merkezi fiyat yenileme aralığı

function sortSignals(list, sortBy, missedIds) {
  const arr = [...list];
  if (sortBy === 'confidence') {
    arr.sort((a, b) => b.confluenceScore - a.confluenceScore);
  } else if (sortBy === 'rr') {
    arr.sort((a, b) => b.rrRatio - a.rrRatio);
  } else {
    arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  // "missed" olanları sona taşı
  arr.sort((a, b) => {
    const aMissed = missedIds.has(a.id) ? 1 : 0;
    const bMissed = missedIds.has(b.id) ? 1 : 0;
    return aMissed - bMissed;
  });
  return arr;
}

export default function SignalGrid() {
  const signals = useStore((s) => s.signals);
  const setSignals = useStore((s) => s.setSignals);
  const prependSignal = useStore((s) => s.prependSignal);
  const setPrice = useStore((s) => s.setPrice);
  const missedIds = useStore((s) => s.missedIds);
  const [newIds, setNewIds] = useState(new Set());

  // Filtre + sıralama state'i
  const [sortBy, setSortBy] = useState('confidence');
  const [direction, setDirection] = useState('all');
  const [minConfidence, setMinConfidence] = useState(0);
  const [minRR, setMinRR] = useState(0);
  const [search, setSearch] = useState('');

  const onNewSignal = useCallback(
    (signal) => {
      prependSignal(signal);
      setNewIds((prev) => new Set([...prev, signal.id]));
      setTimeout(() => {
        setNewIds((prev) => {
          const next = new Set(prev);
          next.delete(signal.id);
          return next;
        });
      }, 800);
    },
    [prependSignal],
  );

  useEffect(() => {
    fetchSignals(50).then((data) => setSignals(data));
    const ws = connectSignalWS(onNewSignal);
    return () => ws.close();
  }, [setSignals, onNewSignal]);

  // Merkezi fiyat poller — görünen sinyallerin sembollerini 2sn'de bir paralel çek
  // SignalCard kendi request atmaz, store'dan okur
  useEffect(() => {
    let active = true;
    const poll = async () => {
      const syms = [...new Set(signals.map((s) => s.symbol))];
      if (!syms.length) return;
      const results = await Promise.all(syms.map((sym) => fetchPrice(sym).then((p) => [sym, p])));
      if (!active) return;
      for (const [sym, p] of results) {
        if (p != null) setPrice(sym, p);
      }
    };
    poll();
    const t = setInterval(poll, PRICE_POLL_MS);
    return () => { active = false; clearInterval(t); };
  }, [signals, setPrice]);

  const freshSignals = useMemo(
    () =>
      signals.filter(
        (s) => Date.now() - new Date(s.createdAt) < FRESH_WINDOW_MS,
      ),
    [signals],
  );

  const visibleSignals = useMemo(() => {
    const q = search.trim().toUpperCase();
    const filtered = freshSignals.filter((s) => {
      if (direction !== 'all' && s.direction !== direction) return false;
      if (s.confluenceScore * 100 < minConfidence) return false;
      if (s.rrRatio < minRR) return false;
      if (q && !s.symbol.toUpperCase().includes(q)) return false;
      return true;
    });
    return sortSignals(filtered, sortBy, missedIds);
  }, [freshSignals, direction, minConfidence, minRR, search, sortBy, missedIds]);

  const filters = (
    <SignalFilters
      sortBy={sortBy}
      onSortChange={setSortBy}
      direction={direction}
      onDirectionChange={setDirection}
      minConfidence={minConfidence}
      onMinConfidenceChange={setMinConfidence}
      minRR={minRR}
      onMinRRChange={setMinRR}
      search={search}
      onSearchChange={setSearch}
    />
  );

  // Hiç taze sinyal yokken filtre çubuğunu gizle, sade mesaj göster
  if (freshSignals.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        <Typography color="#8b949e">
          Henüz taze sinyal yok — sinyaller üretilince burada görünecek
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {filters}
      {visibleSignals.length === 0 ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
          }}
        >
          <Typography color="#8b949e">
            Filtreye uyan sinyal yok
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 2,
            p: 2,
            alignContent: 'start',
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {visibleSignals.map((sig) => (
            <SignalCard key={sig.id} signal={sig} isNew={newIds.has(sig.id)} />
          ))}
        </Box>
      )}
    </Box>
  );
}
