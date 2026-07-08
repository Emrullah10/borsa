import {
  Drawer,
  Box,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import HomeIcon from '@mui/icons-material/Home';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import SettingsIcon from '@mui/icons-material/Settings';
import { useStore } from '../store/useStore.js';

export default function AppDrawer() {
  const drawerOpen = useStore((s) => s.drawerOpen);
  const toggleDrawer = useStore((s) => s.toggleDrawer);
  const activePage = useStore((s) => s.activePage);
  const setActivePage = useStore((s) => s.setActivePage);

  return (
    <Drawer
      variant="temporary"
      anchor="left"
      open={drawerOpen}
      onClose={toggleDrawer}
      sx={{
        '& .MuiDrawer-paper': {
          width: 240,
          bgcolor: '#161b22',
          borderRight: '1px solid #21262d',
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            px: 2,
            py: 1.5,
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Scalp Asistanı
          </Typography>
          <IconButton size="small" onClick={toggleDrawer}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <Divider sx={{ borderColor: '#21262d' }} />

        {/* Navigation List */}
        <List sx={{ px: 0 }}>
          <ListItem
            button
            selected={activePage === 'signals'}
            onClick={() => setActivePage('signals')}
            sx={{
              cursor: 'pointer',
              '&.Mui-selected': { bgcolor: '#21262d' },
              '&.Mui-selected:hover': { bgcolor: '#21262d' },
            }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>
              <HomeIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="Sinyaller"
              primaryTypographyProps={{ variant: 'body2' }}
            />
          </ListItem>

          <ListItem
            button
            selected={activePage === 'stats'}
            onClick={() => setActivePage('stats')}
            sx={{
              cursor: 'pointer',
              '&.Mui-selected': { bgcolor: '#21262d' },
              '&.Mui-selected:hover': { bgcolor: '#21262d' },
            }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>
              <AnalyticsIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="İstatistikler"
              primaryTypographyProps={{ variant: 'body2' }}
            />
          </ListItem>

          <ListItem
            disabled
            sx={{ opacity: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>
              <SettingsIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="Ayarlar"
              primaryTypographyProps={{ variant: 'body2' }}
            />
          </ListItem>
        </List>

        {/* Spacer */}
        <Box sx={{ flexGrow: 1 }} />

        {/* Footer */}
        <Typography
          variant="caption"
          sx={{
            color: '#8b949e',
            px: 2,
            pb: 2,
            textAlign: 'center',
            display: 'block',
          }}
        >
          v0.1 · Faz 1
        </Typography>
      </Box>
    </Drawer>
  );
}
