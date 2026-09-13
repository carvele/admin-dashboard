import { render, screen, fireEvent } from '@testing-library/react';
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
    const alertsChip = screen.getByRole('button', { name: /Stock Alerts/i });
    fireEvent.click(alertsChip);

    // Only Cotton Pajama Set has available=0 (stock alert)
    expect(screen.getByText('SEED-B0000007-M-BLU')).toBeInTheDocument();
    expect(screen.queryByText('JZ-LB-S-BLK')).not.toBeInTheDocument();
    expect(screen.queryByText('JZ-LB-S-BRN')).not.toBeInTheDocument();

    // Click All Variants to reset
    const allChip = screen.getByRole('button', { name: /All Variants/i });
    fireEvent.click(allChip);
    expect(screen.getByText('JZ-LB-S-BLK')).toBeInTheDocument();
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
});
