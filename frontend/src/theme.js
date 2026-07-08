import { createTheme } from '@mui/material/styles';

export const COLORS = {
  bg:    '#0d1117',
  panel: '#161b22',
  long:  '#26a69a',
  short: '#ef5350',
  text:  '#c9d1d9',
};

export const theme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: COLORS.bg, paper: COLORS.panel },
    text: { primary: COLORS.text },
    success: { main: COLORS.long },
    error: { main: COLORS.short },
  },
});
