import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import AppDrawer from './AppDrawer.jsx';
import * as useStoreModule from '@store/useStore.js';

vi.mock('../store/useStore.js', () => ({
  useStore: vi.fn(),
}));

function mockStore(overrides = {}) {
  const state = {
    drawerOpen: true,
    toggleDrawer: vi.fn(),
    activePage: 'signals',
    setActivePage: vi.fn(),
    ...overrides,
  };
  useStoreModule.useStore.mockImplementation((selector) => selector(state));
  return state;
}

describe('AppDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render drawer content when drawerOpen is false', () => {
    mockStore({ drawerOpen: false });
    render(<AppDrawer />);
    expect(screen.queryByText('Sinyaller')).not.toBeInTheDocument();
    expect(screen.queryByText('Scalp Asistanı')).not.toBeInTheDocument();
  });

  it('should render drawer content when drawerOpen is true', () => {
    mockStore();
    render(<AppDrawer />);
    expect(screen.getByText('Scalp Asistanı')).toBeInTheDocument();
    expect(screen.getByText('Sinyaller')).toBeInTheDocument();
    expect(screen.getByText('İstatistikler')).toBeInTheDocument();
    expect(screen.getByText('Ayarlar')).toBeInTheDocument();
    expect(screen.getByText('v0.1 · Faz 1')).toBeInTheDocument();
  });

  it('should call toggleDrawer when close button is clicked', () => {
    const state = mockStore();
    render(<AppDrawer />);
    const closeButton = screen.getByTestId('CloseIcon').closest('button');
    fireEvent.click(closeButton);
    expect(state.toggleDrawer).toHaveBeenCalled();
  });

  it('should call setActivePage("signals") when Sinyaller is clicked', () => {
    const state = mockStore();
    render(<AppDrawer />);
    const sinyallerItem = screen.getByText('Sinyaller').closest('[role="button"]');
    fireEvent.click(sinyallerItem);
    expect(state.setActivePage).toHaveBeenCalledWith('signals');
  });

  it('should call setActivePage("stats") when İstatistikler is clicked', () => {
    const state = mockStore();
    render(<AppDrawer />);
    const statsItem = screen.getByText('İstatistikler').closest('[role="button"]');
    fireEvent.click(statsItem);
    expect(state.setActivePage).toHaveBeenCalledWith('stats');
  });

  it('should mark Sinyaller as selected when activePage is signals', () => {
    mockStore({ activePage: 'signals' });
    render(<AppDrawer />);
    const sinyallerItem = screen.getByText('Sinyaller').closest('[role="button"]');
    expect(sinyallerItem).toHaveClass('Mui-selected');
  });

  it('should mark İstatistikler as selected when activePage is stats', () => {
    mockStore({ activePage: 'stats' });
    render(<AppDrawer />);
    const statsItem = screen.getByText('İstatistikler').closest('[role="button"]');
    expect(statsItem).toHaveClass('Mui-selected');
  });
});
