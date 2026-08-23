import { getStockHealth } from '../utils/stockStatus';

describe('Inventory Service & Stock Status Logic', () => {
  test('evaluates no-stock health when total capacity is 0', () => {
    const health = getStockHealth(0, 0, 0);
    expect(health.tier).toBe('no-stock');
    expect(health.label).toBe('No Stock');
  });

  test('evaluates healthy stock when available units is high', () => {
    const health = getStockHealth(10, 10, 0);
    expect(health.tier).toBe('healthy');
    expect(health.label).toBe('In Stock');
  });

  test('escalates stock status when demand pressure is high', () => {
    // 60% available + 40% reserved → demand pressure shifts tier lower
    const health = getStockHealth(6, 10, 4);
    expect(health.tier).not.toBe('healthy');
  });
});
