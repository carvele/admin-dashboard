import { getStockHealth, getStockPriority, isStockAlert, getStockBreakdown } from './stockStatus';

describe('Stock Status Utility Logic', () => {
  const TOTAL_CAPACITY = 10;

  describe('Integer Range Tier Mapping (reserved = 0)', () => {
    test('Healthy / In Stock tier (8-10 units)', () => {
      [8, 9, 10].forEach((available) => {
        const health = getStockHealth(available, TOTAL_CAPACITY, 0);
        expect(health.tier).toBe('healthy');
        expect(health.label).toBe('In Stock');
        expect(health.percent).toBe(available * 10);
      });
    });

    test('Low Stock tier (6-7 units)', () => {
      [6, 7].forEach((available) => {
        const health = getStockHealth(available, TOTAL_CAPACITY, 0);
        expect(health.tier).toBe('low');
        expect(health.label).toBe('Low Stock');
        expect(health.percent).toBe(available * 10);
      });
    });

    test('Very Low tier (4-5 units)', () => {
      [4, 5].forEach((available) => {
        const health = getStockHealth(available, TOTAL_CAPACITY, 0);
        expect(health.tier).toBe('very-low');
        expect(health.label).toBe('Very Low');
        expect(health.percent).toBe(available * 10);
      });
    });

    test('Critical Stock tier (1-3 units)', () => {
      [1, 2, 3].forEach((available) => {
        const health = getStockHealth(available, TOTAL_CAPACITY, 0);
        expect(health.tier).toBe('critical');
        expect(health.label).toBe('Critical Stock');
        expect(health.percent).toBe(available * 10);
      });
    });

    test('Out of Stock tier (0 units available, 0 reserved)', () => {
      const health = getStockHealth(0, TOTAL_CAPACITY, 0);
      expect(health.tier).toBe('no-stock');
      expect(health.label).toBe('Out of Stock');
      expect(health.percent).toBe(0);
    });

    test('Fully Reserved tier (0 units available, >0 reserved)', () => {
      const health = getStockHealth(0, TOTAL_CAPACITY, 5);
      expect(health.tier).toBe('fully-reserved');
      expect(health.label).toBe('Fully Reserved');
      expect(health.percent).toBe(0);
    });
  });

  describe('Demand-Adjusted Scoring / Escalation', () => {
    test('Reserved stock escalates tier due to demand pressure', () => {
      const normalHealth = getStockHealth(6, TOTAL_CAPACITY, 0);
      expect(normalHealth.tier).toBe('low');

      const pressuredHealth = getStockHealth(6, TOTAL_CAPACITY, 4);
      expect(pressuredHealth.tier).toBe('very-low');
    });

    test('Zero available with active reservations is Fully Reserved', () => {
      const health = getStockHealth(0, TOTAL_CAPACITY, 5);
      expect(health.tier).toBe('fully-reserved');
    });
  });

  describe('Priority and Alert Helpers', () => {
    test('getStockPriority returns correct priority (5 = best, 1 = worst)', () => {
      expect(getStockPriority(10, TOTAL_CAPACITY, 0)).toBe(5); // healthy
      expect(getStockPriority(6, TOTAL_CAPACITY, 0)).toBe(4);  // low
      expect(getStockPriority(4, TOTAL_CAPACITY, 0)).toBe(3);  // very-low
      expect(getStockPriority(2, TOTAL_CAPACITY, 0)).toBe(2);  // critical
      expect(getStockPriority(0, TOTAL_CAPACITY, 0)).toBe(1);  // no-stock
    });

    test('isStockAlert identifies alerting tiers (very-low, critical, no-stock, fully-reserved)', () => {
      expect(isStockAlert(8, TOTAL_CAPACITY, 0)).toBe(false);
      expect(isStockAlert(6, TOTAL_CAPACITY, 0)).toBe(false);
      expect(isStockAlert(5, TOTAL_CAPACITY, 0)).toBe(true);
      expect(isStockAlert(2, TOTAL_CAPACITY, 0)).toBe(true);
      expect(isStockAlert(0, TOTAL_CAPACITY, 0)).toBe(true);
      expect(isStockAlert(0, TOTAL_CAPACITY, 5)).toBe(true);
    });
  });

  describe('getStockBreakdown helper', () => {
    test('correctly tallies tiers and alerts count', () => {
      const items = [
        { available: 10, total: 10, reserved: 0 }, // healthy
        { available: 9, total: 10, reserved: 0 },  // healthy
        { available: 6, total: 10, reserved: 0 },  // low
        { available: 4, total: 10, reserved: 0 },  // very-low
        { available: 0, total: 10, reserved: 0 },  // no-stock
        { available: 0, total: 10, reserved: 5 },  // fully-reserved
      ];
      const breakdown = getStockBreakdown(items);
      expect(breakdown.healthy).toBe(2);
      expect(breakdown.low).toBe(1);
      expect(breakdown.veryLow).toBe(1);
      expect(breakdown.critical).toBe(0);
      expect(breakdown.noStock).toBe(1);
      expect(breakdown.fullyReserved).toBe(1);
      expect(breakdown.alerts).toBe(3); // veryLow (1) + noStock (1) + fullyReserved (1)
    });
  });
});
});
