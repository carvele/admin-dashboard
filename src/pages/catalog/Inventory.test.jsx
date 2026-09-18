import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

jest.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: [], count: 0 }),
    })),
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(() => ({ unsubscribe: jest.fn() })),
    })),
    rpc: jest.fn(),
  },
}));

jest.mock('../../components/inventory/AdminInventoryPanel', () => {
  const MockAdminInventoryPanel = () => <div data-testid="mock-admin-inventory-panel" />;
  MockAdminInventoryPanel.displayName = 'MockAdminInventoryPanel';
  return MockAdminInventoryPanel;
});

import Inventory from './Inventory';
import { adjustInventoryOnHand } from '../../services/productService';
import { getInventorySummary } from '../../services/inventoryService';

const mockInventoryData = [
  {
    id: 'inv-1',
    docId: 'inv-1',
    productDocId: 'prod-1',
    item: 'Leather Belt',
    category: 'Accessories',
    size: 'S',
    color: 'Black',
    sku: 'JZ-LB-S-BLK',
    variantSku: 'JZ-LB-S-BLK',
    total: 10,
    reserved: 2,
    available: 8,
    deleted: false,
  },
  {
    id: 'inv-2',
    docId: 'inv-2',
    productDocId: 'prod-1',
    item: 'Leather Belt',
    category: 'Accessories',
    size: 'S',
    color: 'Brown',
    sku: 'JZ-LB-S-BRN',
    variantSku: 'JZ-LB-S-BRN',
    total: 8,
    reserved: 0,
    available: 8,
    deleted: false,
  },
  {
    id: 'inv-3',
    docId: 'inv-3',
    productDocId: 'prod-2',
    item: 'Cotton Pajama Set',
    category: 'Loungewear',
    size: 'M',
    color: 'Blue',
    sku: 'SEED-B0000007-M-BLU',
    variantSku: 'SEED-B0000007-M-BLU',
    total: 0,
    reserved: 0,
    available: 0,
    deleted: false,
  },
];

const mockProducts = [
  { id: 'prod-1', docId: 'prod-1', name: 'Leather Belt', price: 1200, category: 'Accessories' },
  { id: 'prod-2', docId: 'prod-2', name: 'Cotton Pajama Set', price: 2500, category: 'Loungewear' },
];

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'u-1', name: 'Admin User', role: 'owner' },
    isAdminUnlocked: true,
  }),
}));

jest.mock('../../utils/permissions', () => ({
  can: () => true,
}));

jest.mock('../../services/productService', () => ({
  subscribeToInventory: (callback) => {
    callback(mockInventoryData);
    return jest.fn();
  },
  subscribeToProducts: (callback) => {
    callback(mockProducts);
    return jest.fn();
  },
  subscribeToCategories: (callback) => {
    callback([
      { id: 'cat-1', name: 'Accessories', subcategories: [] },
      { id: 'cat-2', name: 'Loungewear', subcategories: [] },
    ]);
    return jest.fn();
  },
  adjustInventoryOnHand: jest.fn(() => Promise.resolve()),
  archiveInventoryItem: jest.fn(() => Promise.resolve()),
  restoreInventoryItem: jest.fn(() => Promise.resolve()),
  getInventory: jest.fn(() => Promise.resolve(mockInventoryData)),
  getProducts: jest.fn(() => Promise.resolve(mockProducts)),
  updateProduct: jest.fn(() => Promise.resolve()),
  recalculateAllInventoryStock: jest.fn(() => Promise.resolve()),
  recordBoutiqueSale: jest.fn(() => Promise.resolve()),
  searchInventoryPage: jest.fn((term) => {
    const lower = (term || '').toLowerCase();
    const items = mockInventoryData.filter((i) =>
      (i.item || '').toLowerCase().includes(lower) ||
      (i.sku || '').toLowerCase().includes(lower) ||
      (i.variantSku || '').toLowerCase().includes(lower) ||
      (i.id || '').toLowerCase().includes(lower)
    );
    return Promise.resolve({ items, totalCount: items.length });
  }),
}));

jest.mock('../../services/variantService', () => ({
  updateVariantHexColor: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../services/stockNotifyService', () => ({
  getWaitlistDemand: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../services/inventoryService', () => ({
  getPaginatedInventory: jest.fn((_page = 0, _pageSize = 50, filters = {}) => {
    let items = [...mockInventoryData];
    if (filters.searchTerm) {
      const lower = filters.searchTerm.toLowerCase();
      items = items.filter((i) =>
        (i.item || '').toLowerCase().includes(lower) ||
        (i.sku || '').toLowerCase().includes(lower) ||
        (i.variantSku || '').toLowerCase().includes(lower) ||
        (i.id || '').toLowerCase().includes(lower)
      );
    }
    if (filters.stockQuickFilter === 'alerts') {
      items = items.filter((i) => (i.available ?? 0) <= 0);
    } else if (filters.stockQuickFilter === 'reserved') {
      items = items.filter((i) => (i.reserved ?? 0) > 0);
    }
    return Promise.resolve({
      data: items,
      count: items.length,
    });
  }),
  getColorList: jest.fn(() => Promise.resolve([])),
  getPatternList: jest.fn(() => Promise.resolve([])),
  getActiveInventoryProductDocIds: jest.fn(() =>
    Promise.resolve(new Set(mockInventoryData.map((i) => i.productDocId).filter(Boolean)))
  ),
  getInventorySummary: jest.fn(() => {
    const items = mockInventoryData.filter((i) => !i.deleted);
    return Promise.resolve({
      totalVariants: items.length,
      totalStock: items.reduce((sum, i) => sum + (i.total || 0), 0),
      totalReserved: items.reduce((sum, i) => sum + (i.reserved || 0), 0),
      lowStockCount: items.filter((i) => (i.available ?? 0) <= 0).length,
      stockBreakdown: { healthy: 2, low: 0, veryLow: 0, critical: 0, noStock: 1, fullyReserved: 0, alerts: 1 },
      reservedCount: items.filter((i) => (i.reserved || 0) > 0).length,
      activeProductDocIds: new Set(items.map((i) => i.productDocId).filter(Boolean)),
    });
  }),
}));

jest.mock('../../services/staffService', () => ({
  logAction: jest.fn(() => Promise.resolve()),
}));

const renderInventory = () =>
  render(
    <MemoryRouter>
      <Inventory />
    </MemoryRouter>
  );

describe('Inventory Modernized Grid', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn(() => Promise.resolve()),
      },
    });
  });

  it('renders one discrete row per variant instead of stacked color pills', async () => {
    renderInventory();

    // Verify both Leather Belt colors (Black and Brown) appear on their own rows
    expect(await screen.findByText('JZ-LB-S-BLK')).toBeInTheDocument();
    expect(screen.getByText('JZ-LB-S-BRN')).toBeInTheDocument();

    // Both should have their own color labels in the table
    const blackSpans = screen.getAllByText('Black');
    expect(blackSpans.length).toBeGreaterThan(0);
    const brownSpans = screen.getAllByText('Brown');
    expect(brownSpans.length).toBeGreaterThan(0);

    // There should be NO stacked "All 10" or "All 12" pills inside table cells
    expect(screen.queryByText('All 10')).not.toBeInTheDocument();
    expect(screen.queryByText('All 12')).not.toBeInTheDocument();
  });

  it('copies SKU to clipboard when the SKU code or copy button is clicked', async () => {
    renderInventory();

    const skuButton = await screen.findByText('JZ-LB-S-BLK');
    fireEvent.click(skuButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('JZ-LB-S-BLK');
  });

  it('opens Restock modal targeting the exact clicked variant', async () => {
    renderInventory();

    const restockBrownBtn = await screen.findByLabelText('Restock Leather Belt (S, Brown)');
    fireEvent.click(restockBrownBtn);

    // Modal should be open and pre-populated specifically with Brown
    expect(screen.getByRole('heading', { name: 'Restock Variant' })).toBeInTheDocument();
    expect(screen.getAllByText('JZ-LB-S-BRN').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText('Quantity to Add')).toBeInTheDocument();

    // Close modal
    fireEvent.click(screen.getByLabelText('Close dialog'));
    expect(screen.queryByRole('heading', { name: 'Restock Variant' })).not.toBeInTheDocument();
  });

  it('opens Boutique POS Sale modal targeting the exact clicked variant with protected reserved units', async () => {
    renderInventory();

    // Black belt has total=10, reserved=2, available=8
    const sellBlackBtn = await screen.findByLabelText('Record Sale for Leather Belt (S, Black)');
    fireEvent.click(sellBlackBtn);

    expect(screen.getByRole('heading', { name: 'Record In-Store Sale' })).toBeInTheDocument();
    expect(screen.getByText('Available Stock:')).toBeInTheDocument();
    expect(screen.getByText('8 units')).toBeInTheDocument();
    expect(screen.getByText('Reserved for Orders (Protected):')).toBeInTheDocument();
    expect(screen.getByText('2 units')).toBeInTheDocument();

    // Close modal
    fireEvent.click(screen.getByLabelText('Close dialog'));
  });

  it('filters variants when Stock Alerts quick filter chip is selected', async () => {
    renderInventory();

    // Initially all 3 variants are visible
    expect(await screen.findByText('JZ-LB-S-BLK')).toBeInTheDocument();
    expect(screen.getByText('JZ-LB-S-BRN')).toBeInTheDocument();
    expect(screen.getByText('SEED-B0000007-M-BLU')).toBeInTheDocument();

    // Click Stock Alerts chip button
    const alertsChip = document.querySelector('.quick-filter-chip.alert-chip');
    fireEvent.click(alertsChip);

    // Only Cotton Pajama Set has available=0 (stock alert)
    expect(await screen.findByText('SEED-B0000007-M-BLU')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('JZ-LB-S-BLK')).not.toBeInTheDocument();
      expect(screen.queryByText('JZ-LB-S-BRN')).not.toBeInTheDocument();
    });

    // Click All Variants to reset
    const allChip = document.querySelector('.quick-filter-chip:not(.alert-chip):not(.reserved-chip)');
    fireEvent.click(allChip);
    expect(await screen.findByText('JZ-LB-S-BLK')).toBeInTheDocument();
  });

  it('filters variants when summary stat cards are clicked', async () => {
    renderInventory();

    expect(await screen.findByText('JZ-LB-S-BLK')).toBeInTheDocument();

    // Click Stock Alerts stat card
    const stockAlertsCard = screen.getByLabelText('Filter by stock alerts');
    fireEvent.click(stockAlertsCard);

    // Only Cotton Pajama Set has available=0 (stock alert)
    expect(await screen.findByText('SEED-B0000007-M-BLU')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('JZ-LB-S-BLK')).not.toBeInTheDocument();
      expect(screen.queryByText('JZ-LB-S-BRN')).not.toBeInTheDocument();
    });

    // Click Total Active Variants stat card to reset
    const variantsCard = screen.getByLabelText('Show all variants');
    fireEvent.click(variantsCard);
    expect(await screen.findByText('JZ-LB-S-BLK')).toBeInTheDocument();
  });

  it('houses AR Color and Publish actions inside the More Options dropdown menu rather than raw row icons', async () => {
    renderInventory();

    // In the row, there should be NO raw Palette buttons visible by default
    const moreButtons = await screen.findAllByLabelText('More actions');
    expect(moreButtons.length).toBe(3);

    // Open More menu on first row
    fireEvent.click(moreButtons[0]);

    // Menu options appear
    expect(screen.getByText('Configure AR Color')).toBeInTheDocument();
    expect(screen.getByText('Publish to Mobile App')).toBeInTheDocument();
    expect(screen.getByText('Archive Variant')).toBeInTheDocument();
  });

  it('finds variant when searching by fallback record ID', async () => {
    renderInventory();

    const searchInput = screen.getByLabelText('Search variant SKU, product name, or color');
    fireEvent.change(searchInput, { target: { value: 'inv-1' } });

    // Should find Leather Belt Black (id: inv-1)
    expect(await screen.findByText('JZ-LB-S-BLK')).toBeInTheDocument();
    expect(screen.queryByText('JZ-LB-S-BRN')).not.toBeInTheDocument();
  });
  it('allows switching to Remove Stock mode and submitting reduction with negative delta and audit reason', async () => {
    renderInventory();

    const restockBrownBtn = await screen.findByLabelText('Restock Leather Belt (S, Brown)');
    fireEvent.click(restockBrownBtn);

    // Default mode is Add Stock
    expect(screen.getByRole('heading', { name: 'Restock Variant' })).toBeInTheDocument();

    // Click Remove Stock (Write-Off) tab
    const removeTab = screen.getByRole('tab', { name: /Remove Stock/i });
    fireEvent.click(removeTab);

    // Modal updates to reduction mode
    expect(screen.getByRole('heading', { name: 'Reduce Stock (Write-Off)' })).toBeInTheDocument();
    const qtyInput = screen.getByLabelText('Quantity to Remove');
    expect(qtyInput).toBeInTheDocument();

    // Enter quantity and select reason
    fireEvent.change(qtyInput, { target: { value: '2' } });
    const reasonSelect = screen.getByLabelText('Reason for Reduction');
    fireEvent.change(reasonSelect, { target: { value: 'Damaged / Defective Garment' } });

    // Submit reduction
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Reduction' }));
    });

    expect(adjustInventoryOnHand).toHaveBeenCalledWith(
      'inv-2',
      -2,
      'Damaged / Defective Garment'
    );
  });

  it('blocks stock reduction if quantity exceeds available units', async () => {
    renderInventory();

    // Black belt has available = 8 (total: 10, reserved: 2)
    const restockBlackBtn = await screen.findByLabelText('Restock Leather Belt (S, Black)');
    fireEvent.click(restockBlackBtn);

    // Switch to Remove Stock
    fireEvent.click(screen.getByRole('tab', { name: /Remove Stock/i }));
    const qtyInput = screen.getByLabelText('Quantity to Remove');

    // Attempt to remove 9 units (which exceeds available 8)
    fireEvent.change(qtyInput, { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Reduction' }));

    // adjustInventoryOnHand must NOT have been called with negative delta
    expect(adjustInventoryOnHand).not.toHaveBeenCalled();
  });

  it('opens Write-Off mode directly from the row more actions menu', async () => {
    renderInventory();

    // Open More Options on first row
    const moreBtn = (await screen.findAllByTitle('More actions'))[0];
    fireEvent.click(moreBtn);

    const writeOffBtn = await screen.findByText('Reduce / Write-Off Stock');
    fireEvent.click(writeOffBtn);

    // Directly in Reduce mode
    expect(screen.getByRole('heading', { name: 'Reduce Stock (Write-Off)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity to Remove')).toBeInTheDocument();
  });

  it('does not display missing inventory warning when all catalog products have inventory', async () => {
    renderInventory();
    expect(await screen.findByText('JZ-LB-S-BLK')).toBeInTheDocument();
    expect(screen.queryByText(/Catalog products missing inventory rows/i)).not.toBeInTheDocument();
  });

  it('displays missing inventory warning only when a catalog product truly lacks inventory rows', async () => {
    getInventorySummary.mockResolvedValueOnce({
      totalVariants: 1,
      totalStock: 10,
      totalReserved: 0,
      lowStockCount: 0,
      stockBreakdown: { healthy: 1, low: 0, veryLow: 0, critical: 0, noStock: 0, fullyReserved: 0, alerts: 0 },
      reservedCount: 0,
      activeProductDocIds: new Set(['prod-1']),
    });

    renderInventory();
    expect(await screen.findByText(/Catalog products missing inventory rows \(1\):/i)).toBeInTheDocument();
    expect(screen.getAllByText('Cotton Pajama Set').length).toBeGreaterThanOrEqual(1);
  });

  it('displays catalog-wide summary metrics independently of paginated page slice', async () => {
    getInventorySummary.mockResolvedValueOnce({
      totalVariants: 661,
      totalStock: 3309,
      totalReserved: 4,
      lowStockCount: 7,
      stockBreakdown: { healthy: 654, low: 0, veryLow: 0, critical: 0, noStock: 7, fullyReserved: 0, alerts: 7 },
      reservedCount: 4,
      activeProductDocIds: new Set(['prod-1', 'prod-2']),
    });

    renderInventory();
    expect(await screen.findByText('661')).toBeInTheDocument();
    expect(screen.getByText('3,309')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});
