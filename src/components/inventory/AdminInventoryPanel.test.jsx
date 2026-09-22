import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminInventoryPanel from './AdminInventoryPanel';
import '@testing-library/jest-dom';

jest.mock('../../services/inventoryService', () => ({
  getColorList: jest.fn(() => Promise.resolve([{ id: 'c1', name: 'Ivory' }])),
  getPatternList: jest.fn(() => Promise.resolve([{ id: 'p1', name: 'Solid' }])),
  addColor: jest.fn(),
  addPattern: jest.fn(),
  updateColor: jest.fn(),
  updatePattern: jest.fn(),
  deleteColor: jest.fn(),
  deletePattern: jest.fn(),
  updateStockBaseline: jest.fn(),
}));

jest.mock('../../services/productService', () => ({
  getCategories: jest.fn(() => Promise.resolve([
    { id: 'cat1', name: 'Gowns', subcategories: [{ id: 'sub1', name: 'Ball Gowns' }] },
  ])),
  addCategoryAdmin: jest.fn(),
  deleteCategoryAdmin: jest.fn(),
  renameCategoryAdmin: jest.fn(),
  updateCategory: jest.fn(),
}));

jest.mock('../../lib/storage', () => ({
  uploadToCloudinary: jest.fn(),
}));

const products = [{ id: 'prod-1', name: 'Ivory Gown', stockbaseline: 10 }];

const renderPanel = () =>
  render(
    <AdminInventoryPanel
      products={products}
      onClose={() => {}}
      onProductUpdated={() => {}}
    />,
  );

describe('AdminInventoryPanel', () => {
  it('groups controls into the three titled sections', async () => {
    renderPanel();

    expect(await screen.findByRole('heading', { name: 'Stock Baseline Settings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Master Attributes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Taxonomy' })).toBeInTheDocument();
  });

  it('keeps every form control labelled', async () => {
    renderPanel();

    expect(await screen.findByLabelText('Select Product')).toBeInTheDocument();
    expect(screen.getByLabelText('Baseline Quantity')).toBeInTheDocument();
    expect(screen.getByLabelText('New color')).toBeInTheDocument();
    expect(screen.getByLabelText('New pattern')).toBeInTheDocument();
    expect(screen.getByLabelText('New top-level category name')).toBeInTheDocument();
    expect(screen.getByLabelText('Select parent category')).toBeInTheDocument();
  });

  it('renders the loaded lookup lists', async () => {
    renderPanel();

    await waitFor(() => expect(screen.getByDisplayValue('Ivory')).toBeInTheDocument());
    expect(screen.getByDisplayValue('Solid')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Gowns')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ball Gowns')).toBeInTheDocument();
  });

  it('gives each delete action a distinguishable accessible name', async () => {
    renderPanel();

    expect(await screen.findByRole('button', { name: 'Delete color Ivory' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete pattern Solid' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete category Gowns' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete sub-category Ball Gowns' })).toBeInTheDocument();
  });

  it('nests subcategories under a parent group label', async () => {
    renderPanel();

    await screen.findByDisplayValue('Ball Gowns');
    const groupLabel = screen.getByText('Gowns', { selector: '.aip-group-label' });
    expect(groupLabel).toBeInTheDocument();
  });

  it('labels the category image upload control for screen readers', async () => {
    renderPanel();
    expect(await screen.findByText('Upload image for Gowns')).toBeInTheDocument();
  });

  it('populates the baseline field when a product is chosen via searchable combobox', async () => {
    renderPanel();

    const searchInput = await screen.findByLabelText('Select Product');
    expect(searchInput).toBeInTheDocument();

    // Focus / type in search combobox to open listbox
    fireEvent.focus(searchInput);

    const option = await screen.findByRole('option', { name: /Ivory Gown/i });
    expect(option).toBeInTheDocument();

    // Select the product
    fireEvent.click(option);

    // Verify baseline field is populated with 10
    const baselineInput = screen.getByLabelText('Baseline Quantity');
    expect(baselineInput.value).toBe('10');

    // Verify selected indicator is shown
    expect(screen.getByText(/Selected:/i)).toBeInTheDocument();
  });

  it('filters products by name or style code in combobox', async () => {
    const multiProducts = [
      { id: 'p1', name: 'Silk Blouse', style_code: 'TOP-101', stockbaseline: 5 },
      { id: 'p2', name: 'Linen Trousers', style_code: 'BOT-202', stockbaseline: 0 },
    ];

    render(
      <AdminInventoryPanel
        products={multiProducts}
        onClose={() => {}}
        onProductUpdated={() => {}}
      />
    );

    const searchInput = await screen.findByLabelText('Select Product');
    fireEvent.change(searchInput, { target: { value: 'BOT-202' } });

    expect(screen.getByRole('option', { name: /Linen Trousers/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Silk Blouse/i })).not.toBeInTheDocument();

    // Select product with 0 baseline to verify 0 is preserved cleanly
    fireEvent.click(screen.getByRole('option', { name: /Linen Trousers/i }));
    const baselineInput = screen.getByLabelText('Baseline Quantity');
    expect(baselineInput.value).toBe('0');
  });

  it('provides a parent category filter for subcategories', async () => {
    renderPanel();

    await screen.findByDisplayValue('Ball Gowns');
    const filterSelect = screen.getByLabelText('Filter sub-categories by parent category');
    expect(filterSelect).toBeInTheDocument();
  });
});
