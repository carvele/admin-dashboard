import { render, screen, waitFor, within } from '@testing-library/react';
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

  it('populates the baseline field when a product is chosen', async () => {
    renderPanel();

    const select = await screen.findByLabelText('Select Product');
    expect(within(select).getByRole('option', { name: 'Ivory Gown' })).toBeInTheDocument();
  });
});
