import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AiComment from './AiComment.jsx';

describe('AiComment', () => {
  it('AI yorum metnini gösterir', () => {
    render(<AiComment text="RSI dönüşü + EMA kesim. Güçlü long." />);
    expect(screen.getByText(/RSI dönüşü/)).toBeInTheDocument();
  });
});
