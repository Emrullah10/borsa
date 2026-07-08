import { Box } from '@mui/material';
import TopBar from './components/TopBar.jsx';
import AppDrawer from './components/AppDrawer.jsx';
import SignalGrid from './components/SignalGrid.jsx';
import StatsPage from './components/StatsPage.jsx';
import { useStore } from './store/useStore.js';

export default function App() {
  const activePage = useStore((s) => s.activePage);
  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: '#0d1117' }}>
      <TopBar />
      <AppDrawer />
      <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
        {activePage === 'stats' ? <StatsPage /> : <SignalGrid />}
      </Box>
    </Box>
  );
}
