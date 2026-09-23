import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Customers from './Customers';
import { getCustomers, getPaginatedCustomers } from '../../services/customerService';

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'staff-1', role: 'staff' } }),
}));

jest.mock('../../hooks/usePresence', () => ({
  usePresence: () => ({}),
}));

jest.mock('../../services/staffService', () => ({
  logAction: jest.fn(),
}));

jest.mock('../../lib/supabaseService', () => ({
  getLogsForTarget: jest.fn().mockResolvedValue([]),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('../../services/customerService', () => ({
  updateCustomerDetails: jest.fn(),
  setCustomerBlockState: jest.fn(),
  setCustomerArchiveState: jest.fn(),
  sendNotification: jest.fn(),
  getCustomers: jest.fn(),
  getPaginatedCustomers: jest.fn(),
  getCustomerMeasurements: jest.fn(),
  getCustomerStatsBatch: jest.fn().mockResolvedValue({}),
  getCustomerWishlistStats: jest.fn().mockResolvedValue({}),
  ENGAGEMENT_FORMULA: 'recency + frequency + wardrobe',
}));

const MOCK_CUSTOMERS = [
  { id: 'c-1', docId: 'c-1', name: 'Alice One', email: 'alice@example.com', createdAt: '2026-09-06T00:00:00Z' },
  { id: 'c-2', docId: 'c-2', name: 'Bob Two', email: 'bob@example.com', createdAt: '2026-09-05T00:00:00Z' },
  { id: 'c-3', docId: 'c-3', name: 'Cara Three', email: 'cara@example.com', createdAt: '2026-09-04T00:00:00Z' },
  { id: 'c-4', docId: 'c-4', name: 'Dan Four', email: 'dan@example.com', createdAt: '2026-09-03T00:00:00Z' },
  { id: 'c-5', docId: 'c-5', name: 'Eve Five', email: 'eve@example.com', createdAt: '2026-09-02T00:00:00Z' },
  { id: 'c-6', docId: 'c-6', name: 'Finn Six', email: 'finn@example.com', createdAt: '2026-09-01T00:00:00Z' },
];

const renderPage = () =>
  render(
    <MemoryRouter>
      <Customers />
    </MemoryRouter>,
  );

describe('Customers catalog-style pagination', () => {
  beforeEach(() => {
    getCustomers.mockReset();
    getCustomers.mockResolvedValue(MOCK_CUSTOMERS);
    getPaginatedCustomers.mockReset();
    getPaginatedCustomers.mockResolvedValue({ data: MOCK_CUSTOMERS, hasMore: false, nextPage: 1, total: 6 });
  });

  test('mount fetches customers and renders catalog-style range bar', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Alice One')).toBeInTheDocument());

    // By default 10 per page, all 6 customers fit on page 1
    expect(screen.getByText(/Showing/)).toBeInTheDocument();
    expect(screen.getByText('Alice One')).toBeInTheDocument();
    expect(screen.getByText('Finn Six')).toBeInTheDocument();
  });

  test('display page size dropdown and pagination pill navigation work as in catalog', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Alice One')).toBeInTheDocument());

    // Select 10 per page by default, change to 10 or test with filtered subset
    const displaySelect = screen.getByLabelText('Customers per page');
    expect(displaySelect).toBeInTheDocument();
    expect(displaySelect).toHaveValue('10');

    // Change to 'all'
    fireEvent.change(displaySelect, { target: { value: 'all' } });
    expect(displaySelect).toHaveValue('all');
    expect(screen.getByText('Alice One')).toBeInTheDocument();
    expect(screen.getByText('Finn Six')).toBeInTheDocument();
  });

  test('multi-page pill and arrow navigation switches pages correctly', async () => {
    const manyCustomers = Array.from({ length: 25 }, (_, i) => ({
      id: `c-${i + 1}`,
      docId: `c-${i + 1}`,
      name: `Customer ${String(i + 1).padStart(2, '0')}`,
      email: `cust${i + 1}@example.com`,
      createdAt: new Date(2026, 8, 25 - i).toISOString(),
    }));
    getCustomers.mockResolvedValueOnce(manyCustomers);

    renderPage();
    await waitFor(() => expect(screen.getByText('Customer 01')).toBeInTheDocument());

    // Page 1: shows 1-10
    const range = screen.getByText((_, el) => el?.classList?.contains('pagination-range'));
    expect(range).toHaveTextContent('Showing 1–10 of 25 customers');
    expect(screen.getByText('Customer 10')).toBeInTheDocument();
    expect(screen.queryByText('Customer 11')).not.toBeInTheDocument();

    // Click pill 2
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(range).toHaveTextContent('Showing 11–20 of 25 customers');
    expect(screen.getByText('Customer 11')).toBeInTheDocument();
    expect(screen.queryByText('Customer 01')).not.toBeInTheDocument();

    // Click Next page arrow
    fireEvent.click(screen.getByLabelText('Next page'));
    expect(range).toHaveTextContent('Showing 21–25 of 25 customers');
    expect(screen.getByText('Customer 25')).toBeInTheDocument();

    // Next page arrow is now disabled on last page
    expect(screen.getByLabelText('Next page')).toBeDisabled();

    // Click Previous page arrow
    fireEvent.click(screen.getByLabelText('Previous page'));
    expect(range).toHaveTextContent('Showing 11–20 of 25 customers');
  });
});

