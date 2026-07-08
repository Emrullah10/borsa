import { Box, Typography } from '@mui/material';

export default function AiComment({ text }) {
  return (
    <Box sx={{ borderLeft: '3px solid #58a6ff', bgcolor: '#161b22', borderRadius: 1, p: 1.5, my: 1 }}>
      <Typography variant="caption" sx={{ color: '#8b949e', textTransform: 'uppercase', display: 'block', mb: 0.5 }}>
        🤖 AI Analiz
      </Typography>
      <Typography variant="body2" sx={{ color: '#c9d1d9', fontStyle: 'italic', lineHeight: 1.6 }}>
        {text}
      </Typography>
    </Box>
  );
}
