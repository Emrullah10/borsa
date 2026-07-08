import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MetricRow from './MetricRow.jsx';

describe('MetricRow', () => {
  it('giriş, stop, hedef ve RR gösterir', () => {
    render(<MetricRow entryPrice={78420} stopPrice={78180} targetPrice={78780} rrRatio={1.5} />);
    expect(screen.getByText('78420')).toBeInTheDocument();
    expect(screen.getByText('78180')).toBeInTheDocument();
    expect(screen.getByText('78780')).toBeInTheDocument();
    expect(screen.getByText('1.5')).toBeInTheDocument();
  });
});
