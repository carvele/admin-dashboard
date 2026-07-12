/**
 * Unit tests for inventory stock calculation functions
 * Tests all boundary conditions per inventory-domain.instructions.md
 */

import {
  calculateStockStatus,
  calculateCurrentStock,
  calculateStockPercentage,
} from './calculateStock';
import { StockStatus, StockMovement } from '../types/inventory';

describe('calculateStockStatus', () => {
  describe('boundary conditions', () => {
    it('should return NO_STOCK at 0%', () => {
      expect(calculateStockStatus(0, 10)).toBe(StockStatus.NO_STOCK);
    });

    it('should return CRITICAL at 1%', () => {
      expect(calculateStockStatus(0.1, 10)).toBe(StockStatus.CRITICAL);
    });

    it('should return CRITICAL at 25%', () => {
      expect(calculateStockStatus(2.5, 10)).toBe(StockStatus.CRITICAL);
    });

    it('should return VERY_LOW at 26%', () => {
      expect(calculateStockStatus(2.6, 10)).toBe(StockStatus.VERY_LOW);
    });

    it('should return VERY_LOW at 50%', () => {
      expect(calculateStockStatus(5, 10)).toBe(StockStatus.VERY_LOW);
    });

    it('should return LOW at 51%', () => {
      expect(calculateStockStatus(5.1, 10)).toBe(StockStatus.LOW);
    });

    it('should return LOW at 75%', () => {
      expect(calculateStockStatus(7.5, 10)).toBe(StockStatus.LOW);
    });

    it('should return HEALTHY at 76%', () => {
      expect(calculateStockStatus(7.6, 10)).toBe(StockStatus.HEALTHY);
    });

    it('should return HEALTHY at 199%', () => {
      expect(calculateStockStatus(19.9, 10)).toBe(StockStatus.HEALTHY);
    });

    it('should return OVERSTOCK at 200%', () => {
      expect(calculateStockStatus(20, 10)).toBe(StockStatus.OVERSTOCK);
    });

    it('should return OVERSTOCK at >200%', () => {
      expect(calculateStockStatus(30, 10)).toBe(StockStatus.OVERSTOCK);
    });
  });

  describe('edge cases', () => {
    it('should handle stockBaseline of 0', () => {
      expect(calculateStockStatus(10, 0)).toBe(StockStatus.NO_STOCK);
    });

    it('should handle negative stockBaseline', () => {
      expect(calculateStockStatus(10, -1)).toBe(StockStatus.NO_STOCK);
    });

    it('should handle very large stock values', () => {
      expect(calculateStockStatus(1000000, 10)).toBe(StockStatus.OVERSTOCK);
    });

    it('should handle decimal values correctly', () => {
      // 15.75 / 30 = 52.5%
      expect(calculateStockStatus(15.75, 30)).toBe(StockStatus.LOW);
    });
  });

  describe('different baseline values', () => {
    it('should calculate correctly with baseline 5', () => {
      // 1.3 / 5 = 26%
      expect(calculateStockStatus(1.3, 5)).toBe(StockStatus.VERY_LOW);
    });

    it('should calculate correctly with baseline 100', () => {
      // 76 / 100 = 76%
      expect(calculateStockStatus(76, 100)).toBe(StockStatus.HEALTHY);
    });

    it('should calculate correctly with baseline 1', () => {
      // 2 / 1 = 200%
      expect(calculateStockStatus(2, 1)).toBe(StockStatus.OVERSTOCK);
    });
  });
});

describe('calculateCurrentStock', () => {
  it('always equals the sum of all movement deltas for one product', () => {
    const movements = [
      { productId: 'prod1', delta: 12 },
      { productId: 'prod1', delta: -4 },
      { productId: 'prod1', delta: 7 },
    ] as StockMovement[];

    expect(calculateCurrentStock(movements))
      .toBe(movements.reduce((sum, movement) => sum + movement.delta, 0));
  });
  it('should return 0 for empty movements array', () => {
    expect(calculateCurrentStock([])).toBe(0);
  });

  it('should sum positive deltas', () => {
    const movements: StockMovement[] = [
      {
        id: 'm1',
        productId: 'prod1',
        previousStock: 0,
        newStock: 10,
        delta: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        changeType: 'restock',
      },
      {
        id: 'm2',
        productId: 'prod1',
        previousStock: 10,
        newStock: 15,
        delta: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        changeType: 'restock',
      },
    ];
    expect(calculateCurrentStock(movements)).toBe(15);
  });

  it('should handle negative deltas (stock decreases)', () => {
    const movements: StockMovement[] = [
      {
        id: 'm3',
        productId: 'prod1',
        previousStock: 0,
        newStock: 10,
        delta: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        changeType: 'correction',
      },
      {
        id: 'm4',
        productId: 'prod1',
        previousStock: 10,
        newStock: 5,
        delta: -5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        changeType: 'manual_adjustment',
      },
    ];
    expect(calculateCurrentStock(movements)).toBe(5);
  });

  it('should handle mixed positive and negative deltas', () => {
    const movements: StockMovement[] = [
      {
        id: 'm5',
        productId: 'prod1',
        previousStock: 0,
        newStock: 20,
        delta: 20,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        changeType: 'restock',
      },
      {
        id: 'm6',
        productId: 'prod1',
        previousStock: 20,
        newStock: 18,
        delta: -2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        changeType: 'manual_adjustment',
      },
      {
        id: 'm7',
        productId: 'prod1',
        previousStock: 18,
        newStock: 25,
        delta: 7,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        changeType: 'restock',
      },
    ];
    expect(calculateCurrentStock(movements)).toBe(25);
  });

  it('should result in negative stock if corrected (represents audit issue)', () => {
    const movements: StockMovement[] = [
      {
        id: 'm8',
        productId: 'prod1',
        previousStock: 0,
        newStock: 10,
        delta: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        changeType: 'correction',
      },
      {
        id: 'm9',
        productId: 'prod1',
        previousStock: 10,
        newStock: 0,
        delta: -10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        changeType: 'manual_adjustment',
      },
      {
        id: 'm10',
        productId: 'prod1',
        previousStock: 0,
        newStock: -5,
        delta: -5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        changeType: 'correction',
        note: 'Audit correction',
      },
    ];
    expect(calculateCurrentStock(movements)).toBe(-5);
  });

  it('should handle movement order (only sums deltas, not order-dependent)', () => {
    const movements1: StockMovement[] = [
      {
        id: 'm11',
        productId: 'prod1',
        previousStock: 0,
        newStock: 10,
        delta: 10,
        createdAt: new Date(100).toISOString(),
        updatedAt: new Date(100).toISOString(),
        changeType: 'correction',
      },
      {
        id: 'm12',
        productId: 'prod1',
        previousStock: 10,
        newStock: 15,
        delta: 5,
        createdAt: new Date(200).toISOString(),
        updatedAt: new Date(200).toISOString(),
        changeType: 'restock',
      },
    ];

    // Same movements in different order (though UI should sort by timestamp)
    const movements2: StockMovement[] = [
      {
        id: 'm13',
        productId: 'prod1',
        previousStock: 10,
        newStock: 15,
        delta: 5,
        createdAt: new Date(200).toISOString(),
        updatedAt: new Date(200).toISOString(),
        changeType: 'restock',
      },
      {
        id: 'm14',
        productId: 'prod1',
        previousStock: 0,
        newStock: 10,
        delta: 10,
        createdAt: new Date(100).toISOString(),
        updatedAt: new Date(100).toISOString(),
        changeType: 'correction',
      },
    ];

    expect(calculateCurrentStock(movements1)).toBe(15);
    expect(calculateCurrentStock(movements2)).toBe(15);
  });
});

describe('calculateStockPercentage', () => {
  it('should return 0 for zero stock', () => {
    expect(calculateStockPercentage(0, 10)).toBe(0);
  });

  it('should return 50 for 50%', () => {
    expect(calculateStockPercentage(5, 10)).toBe(50);
  });

  it('should return 100 for 100%', () => {
    expect(calculateStockPercentage(10, 10)).toBe(100);
  });

  it('should return 200 for 200%', () => {
    expect(calculateStockPercentage(20, 10)).toBe(200);
  });

  it('should round to nearest integer', () => {
    // 7 / 10 = 70%
    expect(calculateStockPercentage(7, 10)).toBe(70);
    // 7.3 / 10 = 73%
    expect(calculateStockPercentage(7.3, 10)).toBe(73);
    // 7.4 / 10 = 74%
    expect(calculateStockPercentage(7.4, 10)).toBe(74);
  });

  it('should handle stockBaseline of 0', () => {
    expect(calculateStockPercentage(10, 0)).toBe(0);
  });
});

/**
 * Integration tests: verifying stock-status and current-stock work together
 */
describe('Integration: calculateCurrentStock + calculateStockStatus', () => {
  it('should compute correct status from movements', () => {
    const movements: StockMovement[] = [
      {
        id: 'm15',
        productId: 'prod1',
        previousStock: 0,
        newStock: 100,
        delta: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        changeType: 'correction',
      },
    ];
    const currentStock = calculateCurrentStock(movements);
    const stockBaseline = 50;
    const status = calculateStockStatus(currentStock, stockBaseline);

    expect(currentStock).toBe(100);
    expect(status).toBe(StockStatus.OVERSTOCK); // 200%
  });

  it('should reflect decreasing status as stock depletes', () => {
    const movements: StockMovement[] = [
      {
        id: 'm16',
        productId: 'prod1',
        previousStock: 0,
        newStock: 100,
        delta: 100,
        createdAt: new Date(1000).toISOString(),
        updatedAt: new Date(1000).toISOString(),
        changeType: 'restock',
      },
      {
        id: 'm17',
        productId: 'prod1',
        previousStock: 100,
        newStock: 80,
        delta: -20,
        createdAt: new Date(2000).toISOString(),
        updatedAt: new Date(2000).toISOString(),
        changeType: 'manual_adjustment',
      },
      {
        id: 'm18',
        productId: 'prod1',
        previousStock: 80,
        newStock: 30,
        delta: -50,
        createdAt: new Date(3000).toISOString(),
        updatedAt: new Date(3000).toISOString(),
        changeType: 'manual_adjustment',
      },
    ];
    const stockBaseline = 100;

    // 30 / 100 = 30% → VERY_LOW (26–50%)
    let currentStock = calculateCurrentStock(movements);
    expect(currentStock).toBe(30);
    expect(calculateStockStatus(currentStock, stockBaseline)).toBe(StockStatus.VERY_LOW);

    // If we had one more correction removing almost all
    const moreMovements: StockMovement[] = [
      ...movements,
      {
        id: 'm19',
        productId: 'prod1',
        previousStock: 30,
        newStock: 5,
        delta: -25,
        createdAt: new Date(4000).toISOString(),
        updatedAt: new Date(4000).toISOString(),
        changeType: 'manual_adjustment',
      },
    ];

    // 5 / 100 = 5% → CRITICAL (1–25%)
    currentStock = calculateCurrentStock(moreMovements);
    expect(currentStock).toBe(5);
    expect(calculateStockStatus(currentStock, stockBaseline)).toBe(StockStatus.CRITICAL);

    // Final correction removing all
    const finalMovements: StockMovement[] = [
      ...moreMovements,
      {
        id: 'm20',
        productId: 'prod1',
        previousStock: 5,
        newStock: 0,
        delta: -5,
        createdAt: new Date(5000).toISOString(),
        updatedAt: new Date(5000).toISOString(),
        changeType: 'manual_adjustment',
      },
    ];

    currentStock = calculateCurrentStock(finalMovements);
    expect(currentStock).toBe(0);
    expect(calculateStockStatus(currentStock, stockBaseline)).toBe(StockStatus.NO_STOCK);
  });
});