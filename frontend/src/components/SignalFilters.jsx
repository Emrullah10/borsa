import {
  Box,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  MenuItem,
  Slider,
  Typography,
  InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { COLORS } from '../theme.js';

export const SORT_OPTIONS = [
  { value: 'confidence', label: 'Güven' },
  { value: 'newest', label: 'En yeni' },
  { value: 'rr', label: 'R/R' },
];

export default function SignalFilters({
  sortBy,
  onSortChange,
  direction,
  onDirectionChange,
  minConfidence,
  onMinConfidenceChange,
  minRR,
  onMinRRChange,
  search,
  onSearchChange,
}) {
  const fieldSx = {
    '& .MuiOutlinedInput-root': {
      color: '#e6edf3',
      fontSize: '0.85rem',
      '& fieldset': { borderColor: '#30363d' },
      '&:hover fieldset': { borderColor: '#58a6ff' },
    },
    '& .MuiInputLabel-root': { color: '#8b949e', fontSize: '0.85rem' },
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 2,
        px: 2,
        py: 1.5,
        borderBottom: '1px solid #21262d',
        background: COLORS.panel,
      }}
    >
      {/* Sembol arama */}
      <TextField
        size="small"
        placeholder="Sembol ara..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        sx={{ ...fieldSx, width: 180 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ color: '#8b949e', fontSize: '1.1rem' }} />
            </InputAdornment>
          ),
        }}
      />

      {/* Sıralama */}
      <TextField
        select
        size="small"
        label="Sırala"
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value)}
        sx={{ ...fieldSx, width: 140 }}
      >
        {SORT_OPTIONS.map((o) => (
          <MenuItem key={o.value} value={o.value}>
            {o.label}
          </MenuItem>
        ))}
      </TextField>

      {/* Yön filtresi */}
      <ToggleButtonGroup
        size="small"
        exclusive
        value={direction}
        onChange={(_e, val) => val && onDirectionChange(val)}
        sx={{
          '& .MuiToggleButton-root': {
            color: '#8b949e',
            borderColor: '#30363d',
            fontSize: '0.75rem',
            textTransform: 'none',
            px: 1.5,
          },
          '& .Mui-selected': {
            color: '#e6edf3 !important',
            bgcolor: '#21262d !important',
          },
        }}
      >
        <ToggleButton value="all">Hepsi</ToggleButton>
        <ToggleButton value="long">🟢 Long</ToggleButton>
        <ToggleButton value="short">🔴 Short</ToggleButton>
      </ToggleButtonGroup>

      {/* Minimum güven */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 200 }}>
        <Typography sx={{ color: '#8b949e', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
          Min güven: %{minConfidence}
        </Typography>
        <Slider
          size="small"
          value={minConfidence}
          onChange={(_e, val) => onMinConfidenceChange(val)}
          min={0}
          max={100}
          step={5}
          sx={{ color: COLORS.long, width: 100 }}
        />
      </Box>

      {/* Minimum R/R */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 180 }}>
        <Typography sx={{ color: '#8b949e', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
          Min R/R: {minRR.toFixed(1)}
        </Typography>
        <Slider
          size="small"
          value={minRR}
          onChange={(_e, val) => onMinRRChange(val)}
          min={0}
          max={5}
          step={0.5}
          sx={{ color: '#58a6ff', width: 100 }}
        />
      </Box>
    </Box>
  );
}
