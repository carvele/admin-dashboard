import { formatCurrency, formatRelativeTime } from './helpers';

describe('Analytics & Helper Data Processing', () => {
  test('formats PHP currency amounts cleanly', () => {
    expect(formatCurrency(1500)).toBe('₱1,500');
    expect(formatCurrency(0)).toBe('₱0');
    expect(formatCurrency(null)).toBe('₱0');
  });

  test('formats relative time thresholds accurately', () => {
    const tenSecAgo = new Date(Date.now() - 10 * 1000).toISOString();
    expect(formatRelativeTime(tenSecAgo)).toBe('Just now');

    const invalidDate = formatRelativeTime(null);
    expect(invalidDate).toBe('Never');
  });
});
