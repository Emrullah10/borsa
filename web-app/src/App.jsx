import { Box } from '@mui/material';
import TopBar from '@layouts/TopBar.jsx';
import AppDrawer from '@layouts/AppDrawer.jsx';
import SignalGrid from '@features/signals/components/SignalGrid.jsx';
import StatsPage from '@pages/StatsPage.jsx';
import CarryPage from '@pages/CarryPage.jsx';
import { useStore } from './store/useStore.js';

export default function App() {
  const activePage = useStore((s) => s.activePage);
  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: '#0d1117' }}>
      <TopBar />
      <AppDrawer />
      <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
        {activePage === 'carry' && <CarryPage />}
        {activePage === 'stats' && <StatsPage />}
        {activePage === 'signals' && <SignalGrid />}
      </Box>
    </Box>
  );
}
