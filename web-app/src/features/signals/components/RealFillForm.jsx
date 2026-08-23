import { useState } from 'react';
import { Box, Typography, TextField, Button } from '@mui/material';
import { submitRealFill, calcSlippageDiff } from '@api/realFillApi.js';
import { COLORS } from '@styles/theme.js';

/**
 * Gerçek dolum kaydı formu (Faz 1 — kayma doğrulaması).
 *
 * NEDEN: Ölçülen edge'in ~%80'i giriş kaymasında kayboluyor. Model girişi
 * "sonraki mumun açılışı ± %0.03" varsayıyor; bu varsayımın doğru olup
 * olmadığını ancak gerçek dolumlarla karşılaştırarak bilebiliriz.
 */
export default function RealFillForm({ signal }) {
  const { outcomeId, direction, simEntryPrice, realEntryPrice, realExitPrice } = signal;
  const [entry, setEntry] = useState('');
  const [exit, setExit] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [saved, setSaved] = useState(
    realEntryPrice != null ? { realEntryPrice, realExitPrice } : null,
  );

  // Bu sinyalin henüz sonuç kaydı oluşmamış (çok yeni) — form gönderilemez
  if (!outcomeId) {
    return (
      <Typography sx={{ color: '#6e7681', fontSize: '0.72rem', fontStyle: 'italic' }}>
        Sonuç kaydı henüz oluşmadı, birazdan girebilirsiniz.
      </Typography>
    );
  }

  const diff = calcSlippageDiff({
    direction,
    simEntryPrice,
    realEntryPrice: saved?.realEntryPrice,
  });

  async function handleSave() {
    setBusy(true);
    setMsg(null);
    const res = await submitRealFill(outcomeId, { realEntryPrice: entry, realExitPrice: exit });
    setBusy(false);
    if (res.ok) {
      const e = parseFloat(entry);
      const x = parseFloat(exit);
      setSaved({
        realEntryPrice: Number.isFinite(e) ? e : saved?.realEntryPrice ?? null,
        realExitPrice: Number.isFinite(x) ? x : saved?.realExitPrice ?? null,
      });
      setEntry('');
      setExit('');
      setMsg({ ok: true, text: 'Kaydedildi ✓' });
    } else {
      setMsg({ ok: false, text: res.error });
    }
  }

  return (
    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid #21262d' }}>
      <Typography sx={{ fontWeight: 700, color: '#e6edf3', fontSize: '0.8rem', mb: 0.5 }}>
        📝 Gerçek işlem fiyatın
      </Typography>
      <Typography sx={{ color: '#8b949e', fontSize: '0.68rem', mb: 1 }}>
        Bu sinyalden işlem açtıysan gerçekte hangi fiyattan girdiğini yaz — botun
        tahminini bununla karşılaştırıp ne kadar saptığını ölçüyoruz.
      </Typography>

      {saved?.realEntryPrice != null && (
        <Box sx={{ mb: 1, px: 1, py: 0.75, bgcolor: '#0d1117', borderRadius: '6px', border: '1px solid #21262d' }}>
          <Typography sx={{ fontSize: '0.7rem', color: '#8b949e' }}>
            Kayıtlı giriş: <b style={{ color: '#e6edf3' }}>{saved.realEntryPrice}</b>
            {saved.realExitPrice != null && <> · çıkış: <b style={{ color: '#e6edf3' }}>{saved.realExitPrice}</b></>}
          </Typography>
          {diff != null && (
            <Typography sx={{ fontSize: '0.7rem', color: diff > 0 ? COLORS.short : COLORS.long, mt: 0.25 }}>
              {diff > 0
                ? `Bot tahmininden %${diff.toFixed(3)} kötü doldu (aleyhine kayma)`
                : `Bot tahmininden %${Math.abs(diff).toFixed(3)} iyi doldu (lehine)`}
            </Typography>
          )}
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          size="small" placeholder="Giriş fiyatı" value={entry}
          onChange={(e) => setEntry(e.target.value)}
          inputProps={{ inputMode: 'decimal' }}
          sx={fieldSx}
        />
        <TextField
          size="small" placeholder="Çıkış (varsa)" value={exit}
          onChange={(e) => setExit(e.target.value)}
          inputProps={{ inputMode: 'decimal' }}
          sx={fieldSx}
        />
      </Box>

      <Button
        size="small" variant="outlined" disabled={busy || (!entry && !exit)}
        onClick={handleSave}
        sx={{
          mt: 1, fontSize: '0.7rem', textTransform: 'none',
          color: COLORS.long, borderColor: '#21262d',
          '&:hover': { borderColor: COLORS.long },
        }}
      >
        {busy ? 'Kaydediliyor…' : 'Kaydet'}
      </Button>

      {msg && (
        <Typography sx={{ fontSize: '0.7rem', mt: 0.75, color: msg.ok ? COLORS.long : COLORS.short }}>
          {msg.text}
        </Typography>
      )}
    </Box>
  );
}

const fieldSx = {
  flex: 1,
  '& .MuiOutlinedInput-root': {
    color: '#e6edf3',
    fontSize: '0.78rem',
    bgcolor: '#0d1117',
    '& fieldset': { borderColor: '#21262d' },
    '&:hover fieldset': { borderColor: '#30363d' },
  },
};
