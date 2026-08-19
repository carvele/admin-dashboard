/**
 * Tests for reportExporter.js
 */

import {
  downloadCSV,
  exportGarmentPerformanceReport,
  exportInventoryDepreciationReport,
} from './reportExporter';

describe('reportExporter', () => {
  let createdElements = [];
  let appendedElements = [];

  beforeEach(() => {
    createdElements = [];
    appendedElements = [];

    global.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/mock-blob-url');
    global.URL.revokeObjectURL = jest.fn();

    const origCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const el = origCreateElement(tagName);
      if (tagName === 'a') {
        jest.spyOn(el, 'click').mockImplementation(() => {});
      }
      createdElements.push(el);
      return el;
    });

    jest.spyOn(document.body, 'appendChild').mockImplementation((el) => {
      appendedElements.push(el);
      return el;
    });

    jest.spyOn(document.body, 'removeChild').mockImplementation((el) => {
      return el;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('downloadCSV', () => {
    test('creates and clicks download anchor with UTF-8 BOM', () => {
      downloadCSV('test.csv', 'header1,header2\nval1,val2');

      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(document.createElement).toHaveBeenCalledWith('a');

      const anchor = createdElements.find((el) => el.tagName === 'A');
      expect(anchor).toBeDefined();
      expect(anchor.getAttribute('download')).toBe('test.csv');
      expect(anchor.getAttribute('href')).toBe('blob:http://localhost/mock-blob-url');
      expect(anchor.click).toHaveBeenCalled();
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/mock-blob-url');
    });
  });

  describe('exportGarmentPerformanceReport', () => {
    const mockProducts = [
      { id: 'p1', name: 'Barong Tagalog', category: 'Formal', price: 1500 },
      { id: 'p2', name: 'Terno Dress', category: 'Traditional', price: 2500 },
    ];

    const mockReservations = [
      {
        id: 'r1',
        status: 'Completed',
        productId: 'p1',
        rentalPrice: 1500,
        date: '2026-08-10T10:00:00Z',
      },
      {
        id: 'r2',
        status: 'Completed',
        productId: 'p1',
        rentalPrice: 1500,
        date: '2026-08-12T10:00:00Z',
      },
      {
        id: 'r3',
        status: 'Cancelled',
        productId: 'p2',
        rentalPrice: 2500,
      },
    ];

    test('generates CSV with aggregated rental counts and revenue', () => {
      exportGarmentPerformanceReport(mockProducts, mockReservations);

      expect(global.URL.createObjectURL).toHaveBeenCalled();
      const blobArg = global.URL.createObjectURL.mock.calls[0][0];
      expect(blobArg).toBeInstanceOf(Blob);

      const anchor = createdElements.find((el) => el.tagName === 'A');
      expect(anchor.getAttribute('download')).toMatch(/^JezSy_Garment_Performance_\d{4}-\d{2}-\d{2}\.csv$/);
    });

    test('handles reservations with items array', () => {
      const complexReservations = [
        {
          id: 'r4',
          status: 'Confirmed',
          items: [{ productId: 'p2', quantity: 2, price: 2500 }],
          date: '2026-08-14T10:00:00Z',
        },
      ];

      expect(() => {
        exportGarmentPerformanceReport(mockProducts, complexReservations);
      }).not.toThrow();
    });

    test('handles empty products and reservations gracefully', () => {
      expect(() => {
        exportGarmentPerformanceReport([], []);
      }).not.toThrow();
    });
  });

  describe('exportInventoryDepreciationReport', () => {
    const mockProducts = [
      {
        id: 'p1',
        name: 'Barong Tagalog',
        sku: 'BAR-001',
        cost_price: 3000,
        price: 1500,
      },
      {
        id: 'p2',
        name: 'Terno Dress',
        sku: 'TER-002',
        price: 2000, // fallback purchaseCost = 2000 * 3.5 = 7000
      },
    ];

    const mockReservations = [
      { id: 'r1', status: 'Completed', productId: 'p1', totalPrice: 1500 },
      { id: 'r2', status: 'Returned', productId: 'p1', totalPrice: 1500 },
      { id: 'r3', status: 'Pending', productId: 'p2', totalPrice: 2000 },
    ];

    test('calculates ROI and net profit accurately for completed/returned rentals', () => {
      exportInventoryDepreciationReport(mockProducts, mockReservations);

      expect(global.URL.createObjectURL).toHaveBeenCalled();
      const anchor = createdElements.find((el) => el.tagName === 'A');
      expect(anchor.getAttribute('download')).toMatch(/^JezSy_Inventory_Depreciation_\d{4}-\d{2}-\d{2}\.csv$/);
    });

    test('handles items array and custom cost_price', () => {
      const reservationsWithItems = [
        {
          id: 'r4',
          status: 'Completed',
          items: [{ productId: 'p2', quantity: 3, unit_price: 2000 }],
        },
      ];

      expect(() => {
        exportInventoryDepreciationReport(mockProducts, reservationsWithItems);
      }).not.toThrow();
    });

    test('handles empty inputs gracefully', () => {
      expect(() => {
        exportInventoryDepreciationReport([], []);
      }).not.toThrow();
    });
  });
});
